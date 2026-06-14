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

import { ReactNode } from 'react';

// Shape of a runtime-loaded dynamic plugin route, populated from
// `core.dynamic-route` extensions registered by loaded federated
// remotes. extractDynamicConfig turns each LoadedExtension into one of
// these by resolving the extension's importName against the host's
// useModule call.
export type DynamicRoute = {
	/** URL path under the host (e.g. "/tempo"). No leading wildcard. */
	path: string;
	/** The React node the host renders when this route is matched. */
	element: ReactNode;
	/**
	 * Stable key for React reconciliation. Defaults to path. Customer
	 * plugins can override if two routes happen to share a path prefix.
	 */
	key?: string;
};

// Shape of a runtime-loaded dynamic plugin menu item (sidebar entry),
// populated from `core.dynamic-menu-item` extensions registered by
// loaded federated remotes.
export type DynamicMenuItem = {
	/** Stable key for React reconciliation. */
	key: string;
	/** Visible text in the sidebar. */
	text: string;
	/**
	 * Icon node. Customer plugins ship icons via their `appIcons`
	 * extensions; extractDynamicConfig resolves the importName into a
	 * React node here.
	 */
	icon?: ReactNode;
	/** URL the sidebar item links to. */
	to: string;
	/**
	 * Render order. Lower = earlier in the list. RHDH convention is 0 for
	 * top-level items, 100s for less-prominent items. When unset, items
	 * render in load order.
	 */
	priority?: number;
};

// Context value the host's FlatRoutes and Sidebar consume to render
// dynamic plugin additions alongside the static hardcoded JSX. When no
// dynamic plugins are loaded (the chart 0.5.0 default and the state
// every existing Butler Labs deployment is in) both arrays are empty,
// the Slot components produce no JSX, and the host renders identically
// to chart 0.4.0.
//
// This is the additive transparency contract enforced at runtime: a
// non-empty dynamicRoutes / dynamicMenuItems is the ONLY thing that
// changes the rendered tree. When you see drift in a snapshot, the
// regression is in the loader chain, not the Slot components.
export interface DynamicRootContextValue {
	dynamicRoutes: DynamicRoute[];
	dynamicMenuItems: DynamicMenuItem[];
}

// The empty default. Reading the context with no Provider above gives
// you this. It's the "no dynamic plugins" baseline.
export const EMPTY_DYNAMIC_ROOT_CONTEXT: DynamicRootContextValue = {
	dynamicRoutes: [],
	dynamicMenuItems: [],
};

// The real shape served by Backstage's @backstage/backend-dynamic-feature-service
// at GET /.backstage/dynamic-features/remotes. One entry per loaded
// frontend plugin's Module Federation remote. Verified against the
// package's OpenAPI spec at
// node_modules/@backstage/backend-dynamic-feature-service/dist/schema/openapi/generated/router.cjs.js
// (the `Remote` schema definition).
//
// The previous 0.5.0 PluginManifest type (a wrapper object with a
// plugins keyed map) was wrong -- it did not match anything the
// backend served. 0.5.0 shipped with the wrong type, the wrong URL,
// and a stub render path. See
// notes/butler-portal-dynamic-plugins-verification-gap-empty-vs-broken.md
// for the lesson.
export type Remote = {
	/** npm package name of the plugin (e.g. "butler.test-dynamic") */
	packageName: string;
	remoteInfo: {
		/** Module Federation remote name (from the plugin's mf-manifest.json) */
		name: string;
		/**
		 * Full URL to the Module Federation manifest or entry script,
		 * served by the backend's static file handler at
		 * /.backstage/dynamic-features/remotes/<packageName>/*.
		 */
		entry: string;
	};
	/** Module names the federation remote exposes (e.g. "./PluginRoot") */
	exposedModules: string[];
};

/** The /remotes endpoint response shape. */
export type RemotesResponse = Remote[];

/** Empty default for the remotes list. */
export const EMPTY_REMOTES: RemotesResponse = [];
