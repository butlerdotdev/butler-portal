/*
 * Copyright 2026 The Butler Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
	ComponentType,
	createElement,
	ReactNode,
	useEffect,
	useState,
} from 'react';
import { loadRemoteModule } from './mfRuntime';
import { DynamicRootContext } from './DynamicRootContext';
import {
	DynamicRoute,
	DynamicMenuItem,
	DynamicRootContextValue,
	EMPTY_DYNAMIC_ROOT_CONTEXT,
	Remote,
} from './types';

// The runtime contract each dynamic frontend plugin exports from its
// PluginRoot module. RHDH-compatible shape: a plugin's exposed
// PluginRoot ships a dynamicPluginsExports object listing the routes
// and menu items it contributes. Each route's importName is the name
// of a sibling module the same plugin exposes; the host loads it via
// the Module Federation runtime and renders it at the declared path.
//
// This shape matches the dynamic-plugin schema RHDH and the broader
// Backstage dynamic-plugin ecosystem use. A plugin authored for RHDH
// works on Butler Portal because the runtime contract is the same.
// Butler-specific fields land additively in the future if we need
// them, never breaking compatibility with RHDH-shaped plugins.
export type DynamicPluginsExports = {
	dynamicRoutes?: DynamicPluginRouteEntry[];
	menuItems?: DynamicPluginMenuItemEntry[];
};

export type DynamicPluginRouteEntry = {
	/** URL path where the route mounts under the host app. */
	path: string;
	/**
	 * Name of the exposed module that exports the page component. The
	 * host loads it through Module Federation: getModule(packageName,
	 * importName).
	 */
	importName: string;
	/**
	 * Optional menu item to render in the sidebar. When present, the
	 * sidebar renders text + icon linking to `path`.
	 */
	menuItem?: {
		text: string;
		/**
		 * Optional importName for the icon component (sibling exposed
		 * module returning a React component used as the SidebarItem icon).
		 * Omit for the default Extension icon.
		 */
		iconImportName?: string;
	};
};

export type DynamicPluginMenuItemEntry = {
	key: string;
	text: string;
	to: string;
	iconImportName?: string;
	priority?: number;
};

// DynamicPluginsLoader runs inside ScalprumProvider and is responsible
// for loading every configured remote's PluginRoot module, reading its
// dynamicPluginsExports declaration, resolving each importName into a
// React component via the Scalprum runtime, and surfacing the result
// to App.tsx via DynamicRootContext.
//
// The loading is asynchronous and progressive: each remote's modules
// load in parallel; the context updates as each plugin resolves. The
// host's App.tsx already handles re-render via the standard context
// subscription, so a plugin appearing 200ms after first paint shows up
// without page reload.
//
// Failure isolation: if a remote's PluginRoot fails to load or its
// dynamicPluginsExports is malformed, that remote's contribution is
// skipped (logged to the console). The other remotes load normally,
// and the host renders without that plugin's pages. The 0.5.1 boot-test
// asserts this negative path -- a broken remote does not whitescreen.
//
// The PluginRoot module name convention is "./PluginRoot" matching the
// RHDH schema. Customer plugin packages built with the Butler CLI
// wrapper (which delegates to @red-hat-developer-hub/cli) expose
// PluginRoot by default; the convention is documented in the adopter
// docs as a stable contract.
export const DynamicPluginsLoader = ({
	remotes,
	children,
}: {
	remotes: Remote[];
	children: ReactNode;
}) => {
	const [value, setValue] = useState<DynamicRootContextValue>(
		EMPTY_DYNAMIC_ROOT_CONTEXT,
	);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			const allRoutes: DynamicRoute[] = [];
			const allMenuItems: DynamicMenuItem[] = [];

			await Promise.all(
				remotes.map(async remote => {
					try {
						// rhdh-cli's dynamic export bundles the whole plugin
						// as a single Module Federation remote with `.` as
						// the only exposed module. Load it once and read
						// dynamicPluginsExports + each named import off the
						// resulting module object.
						// eslint-disable-next-line no-console
						console.info(
							`[ButlerPortal] loading "${remote.packageName}" remote=${remote.remoteInfo.name} entry=${remote.remoteInfo.entry}`,
						);
						const pluginModule = await loadRemoteModule<{
							default?: { dynamicPluginsExports?: DynamicPluginsExports };
							dynamicPluginsExports?: DynamicPluginsExports;
							PluginRoot?: { dynamicPluginsExports?: DynamicPluginsExports };
							[k: string]: unknown;
						}>(remote.packageName, '.');

						if (!pluginModule) {
							console.warn(
								`[ButlerPortal] dynamic plugin "${remote.packageName}" failed to load; skipping`,
							);
							return;
						}
						// eslint-disable-next-line no-console
						console.info(
							`[ButlerPortal] "${remote.packageName}" module keys: ${Object.keys(pluginModule).join(', ')}`,
						);

						const exportsBlock: DynamicPluginsExports | undefined =
							pluginModule.dynamicPluginsExports ??
							pluginModule.PluginRoot?.dynamicPluginsExports ??
							pluginModule.default?.dynamicPluginsExports;
						if (!exportsBlock) {
							console.warn(
								`[ButlerPortal] dynamic plugin "${remote.packageName}" is missing dynamicPluginsExports; skipping`,
							);
							return;
						}

						const lookupComponent = (
							importName: string,
						): ComponentType | undefined => {
							const direct = pluginModule[importName] as
								| ComponentType
								| { default?: ComponentType }
								| undefined;
							if (typeof direct === 'function') return direct;
							if (
								direct &&
								typeof (direct as { default?: ComponentType }).default ===
									'function'
							) {
								return (direct as { default: ComponentType }).default;
							}
							return undefined;
						};

						for (const entry of exportsBlock.dynamicRoutes ?? []) {
							const PageComponent = lookupComponent(entry.importName);
							if (!PageComponent) {
								console.warn(
									`[ButlerPortal] dynamic plugin "${remote.packageName}" route ${entry.path} importName=${entry.importName} did not export a component; skipping`,
								);
								continue;
							}
							allRoutes.push({
								path: entry.path,
								element: createElement(PageComponent),
								key: `${remote.packageName}:${entry.path}`,
							});

							if (entry.menuItem) {
								let icon: ReactNode | undefined;
								if (entry.menuItem.iconImportName) {
									const IconComponent = lookupComponent(
										entry.menuItem.iconImportName,
									);
									if (IconComponent) {
										icon = createElement(IconComponent);
									}
								}
								allMenuItems.push({
									key: `${remote.packageName}:${entry.path}`,
									text: entry.menuItem.text,
									to: entry.path,
									icon,
								});
							}
						}

						for (const item of exportsBlock.menuItems ?? []) {
							let icon: ReactNode | undefined;
							if (item.iconImportName) {
								const IconComponent = lookupComponent(item.iconImportName);
								if (IconComponent) {
									icon = createElement(IconComponent);
								}
							}
							allMenuItems.push({
								key: item.key,
								text: item.text,
								to: item.to,
								icon,
								priority: item.priority,
							});
						}
					} catch (pluginError) {
						// A whole plugin failing to load is isolated: log it
						// and continue with the others. This is the negative-
						// path the 0.5.1 boot-test asserts (no whitescreen
						// on a broken remote).
						console.warn(
							`[ButlerPortal] dynamic plugin "${remote.packageName}" failed to load: ${pluginError}`,
						);
					}
				}),
			);

			if (cancelled) {
				return;
			}

			allMenuItems.sort(
				(a, b) => (a.priority ?? 100) - (b.priority ?? 100),
			);

			setValue({
				dynamicRoutes: allRoutes,
				dynamicMenuItems: allMenuItems,
			});
		})();

		return () => {
			cancelled = true;
		};
	}, [remotes]);

	return (
		<DynamicRootContext.Provider value={value}>
			{children}
		</DynamicRootContext.Provider>
	);
};
