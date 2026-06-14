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
import { getModule } from '@scalprum/core';
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
						// Each plugin's exposed PluginRoot declares the
						// extensions the plugin contributes. The Module
						// Federation manifest's exposed module list (verified
						// at backend manifest validation) must include
						// "./PluginRoot" for a frontend plugin; getModule
						// loads it through the federation runtime that
						// ScalprumProvider initialized above.
						const pluginRoot = await getModule<{
							default?: DynamicPluginsExports;
							dynamicPluginsExports?: DynamicPluginsExports;
						}>(remote.packageName, './PluginRoot');

						const exportsBlock: DynamicPluginsExports | undefined =
							pluginRoot.dynamicPluginsExports ??
							pluginRoot.default;
						if (!exportsBlock) {
							console.warn(
								`[ButlerPortal] dynamic plugin "${remote.packageName}" PluginRoot is missing dynamicPluginsExports; skipping`,
							);
							return;
						}

						for (const entry of exportsBlock.dynamicRoutes ?? []) {
							try {
								const pageModule = await getModule<{
									default?: ComponentType;
									[k: string]: ComponentType | undefined;
								}>(remote.packageName, `./${entry.importName}`);
								const PageComponent: ComponentType | undefined =
									pageModule.default ??
									pageModule[entry.importName];
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
										try {
											const iconModule = await getModule<{
												default?: ComponentType;
												[k: string]: ComponentType | undefined;
											}>(
												remote.packageName,
												`./${entry.menuItem.iconImportName}`,
											);
											const IconComponent: ComponentType | undefined =
												iconModule.default ??
												iconModule[entry.menuItem.iconImportName];
											if (IconComponent) {
												icon = createElement(IconComponent);
											}
										} catch (iconError) {
											console.warn(
												`[ButlerPortal] icon load failed for ${remote.packageName} ${entry.menuItem.iconImportName}: ${iconError}`,
											);
										}
									}
									allMenuItems.push({
										key: `${remote.packageName}:${entry.path}`,
										text: entry.menuItem.text,
										to: entry.path,
										icon,
									});
								}
							} catch (routeError) {
								console.warn(
									`[ButlerPortal] dynamic plugin "${remote.packageName}" route ${entry.path} importName=${entry.importName} failed to load: ${routeError}`,
								);
							}
						}

						for (const item of exportsBlock.menuItems ?? []) {
							let icon: ReactNode | undefined;
							if (item.iconImportName) {
								try {
									const iconModule = await getModule<{
										default?: ComponentType;
										[k: string]: ComponentType | undefined;
									}>(remote.packageName, `./${item.iconImportName}`);
									const IconComponent: ComponentType | undefined =
										iconModule.default ??
										iconModule[item.iconImportName];
									if (IconComponent) {
										icon = createElement(IconComponent);
									}
								} catch {
									// fall through, no icon
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
