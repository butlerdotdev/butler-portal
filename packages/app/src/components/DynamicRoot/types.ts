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

// Shape of a runtime-loaded dynamic plugin route. Mirrors the RHDH
// dynamic-plugins.yaml `dynamicRoutes[]` schema (path + importName +
// optional menuItem) but normalized to the React-element form the host's
// FlatRoutes consumes.
//
// The `element` is the React node rendered when the URL matches `path`.
// extractDynamicConfig builds this by resolving the Scalprum-loaded
// federated module's named export and wrapping it for the host.
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

// Shape of a runtime-loaded dynamic plugin menu item (sidebar entry).
// Mirrors RHDH's `menuItem:` block on a dynamic route.
export type DynamicMenuItem = {
  /** Stable key for React reconciliation. */
  key: string;
  /** Visible text in the sidebar. */
  text: string;
  /**
   * Icon node. Customer plugins ship icons via the `appIcons:` block in
   * their dynamic-plugins.yaml; extractDynamicConfig resolves the
   * `importName` into a React node here.
   */
  icon?: ReactNode;
  /** URL the sidebar item links to. */
  to: string;
  /**
   * Render order. Lower = earlier in the list. RHDH convention is 0 for
   * top-level items, 100s for less-prominent items. When unset, items
   * render in load order (which is itself the order they appear in
   * dynamic-plugins.yaml).
   */
  priority?: number;
};

// Context value the host's FlatRoutes and Sidebar consume to render
// dynamic plugin additions alongside the static hardcoded JSX. When no
// dynamic plugins are loaded -- the chart 0.5.0 default and the state
// every existing Butler Labs deployment is in -- both arrays are empty,
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

// Shape of the plugin manifest the ScalprumRoot fetches at boot. Maps
// plugin scalprum.name -> the runtime location of its federated remote
// (manifestLocation as per RHDH). Empty manifest = no plugins to load.
export type PluginManifest = {
  plugins: Record<
    string,
    {
      manifestLocation: string;
    }
  >;
};

export const EMPTY_PLUGIN_MANIFEST: PluginManifest = { plugins: {} };
