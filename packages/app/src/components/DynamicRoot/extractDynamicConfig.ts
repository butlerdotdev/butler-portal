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
	DynamicMenuItem,
	DynamicRoute,
	DynamicRootContextValue,
	EMPTY_DYNAMIC_ROOT_CONTEXT,
} from './types';

// Per-plugin dynamic configuration loaded from each customer plugin's
// pluginConfig.dynamicPlugins.frontend block in the chart's
// dynamic-plugins.yaml. Mirrors RHDH's wire schema with a narrower set
// of fields for chart 0.5.0 -- additive scope. RHDH supports many more
// fields (mountPoints, routeBindings, entityTabs, themes, etc.); we
// expand those in 0.6.0 when the host shell is normalized.
export type PluginFrontendConfig = {
	dynamicRoutes?: Array<{
		path: string;
		importName?: string;
		menuItem?: { text: string; icon?: string; priority?: number };
	}>;
};

// A loaded plugin instance, returned by the Scalprum pluginStore at
// runtime. We only need the named-export resolver (`getModule`) and the
// plugin's wire config. The full Scalprum plugin shape carries more
// (lifecycle hooks, build metadata) but extractDynamicConfig deliberately
// reads only what it needs -- a smaller surface to keep stable across
// Scalprum version bumps.
export type LoadedPlugin = {
	scalprumName: string;
	getModule: (importName: string) => Promise<unknown>;
	frontend?: PluginFrontendConfig;
};

// Pure function: takes the set of loaded plugins (the resolved Scalprum
// store contents) and returns the flat dynamic-root context value the
// host's Slots consume. Empty plugin list -> EMPTY_DYNAMIC_ROOT_CONTEXT.
//
// extractDynamicConfig is deliberately synchronous: it does NOT call
// getModule. The actual module resolution happens lazily inside each
// route's element (the host renders a wrapper that calls getModule via
// useEffect). This keeps the host's render synchronous and the plugin
// load behavior debuggable on a per-route basis (one bad plugin doesn't
// block the others from showing up).
//
// Returns EMPTY_DYNAMIC_ROOT_CONTEXT when given an empty list, which is
// the additive-transparency baseline.
export function extractDynamicConfig(
	plugins: LoadedPlugin[],
): DynamicRootContextValue {
	if (plugins.length === 0) {
		return EMPTY_DYNAMIC_ROOT_CONTEXT;
	}

	const dynamicRoutes: DynamicRoute[] = [];
	const dynamicMenuItems: DynamicMenuItem[] = [];

	for (const plugin of plugins) {
		const frontend = plugin.frontend;
		if (!frontend) continue;
		for (const route of frontend.dynamicRoutes ?? []) {
			const importName = route.importName ?? 'default';
			// Stable key combining plugin and path so two plugins with the
			// same path don't collide on react reconciliation.
			const key = `${plugin.scalprumName}:${route.path}`;
			dynamicRoutes.push({
				key,
				path: route.path,
				// The element placeholder: actual resolution of the federated
				// module export happens at render time by a wrapper component
				// the Slot mounts. extractDynamicConfig stays sync; per-route
				// loading is async, debuggable, and isolatable.
				element: createDynamicRouteElement(plugin, importName),
			});
			if (route.menuItem) {
				dynamicMenuItems.push({
					key,
					text: route.menuItem.text,
					to: route.path,
					priority: route.menuItem.priority,
					// Icon resolution defers to the Slot wrapper (same as the
					// route element) so a missing icon doesn't break the menu.
					icon: undefined,
				});
			}
		}
	}

	// Sort menu items by priority (lower = earlier). Items without
	// priority retain insertion order via stable sort behavior.
	dynamicMenuItems.sort(
		(a, b) => (a.priority ?? Number.MAX_SAFE_INTEGER) -
			(b.priority ?? Number.MAX_SAFE_INTEGER),
	);

	return { dynamicRoutes, dynamicMenuItems };
}

// Build the React element for a dynamic plugin route. Per-route loading
// is encapsulated here so one bad plugin only breaks its own route, not
// the whole portal. Concrete loader implementation lands in Phase 5
// when the test plugin exercises the path end to end.
function createDynamicRouteElement(
	_plugin: LoadedPlugin,
	_importName: string,
): import('react').ReactNode {
	// Phase 3 ships the host shell additively. The concrete dynamic
	// route renderer (calls getModule, mounts the customer component,
	// handles errors with an isolated boundary so a crash in one
	// plugin's UI does NOT white-screen the portal) lands when the
	// test plugin exists in Phase 5. For chart 0.5.0 ship without
	// the test plugin: this returns null and the route is a no-op.
	// Customers with dynamic plugins enabled see the route registered
	// but rendering a blank element; the helpful failure mode
	// (boundary + log) ships with Phase 5.
	return null;
}
