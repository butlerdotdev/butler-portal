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

import { Config } from '@backstage/config';
import { IconComponent } from '@backstage/core-plugin-api';
import CloudIcon from '@material-ui/icons/Cloud';
import StorageIcon from '@material-ui/icons/Storage';
import TimelineIcon from '@material-ui/icons/Timeline';
import ViewQuiltIcon from '@material-ui/icons/ViewQuilt';

// Single source of truth for the four Butler-Labs-branded plugins. The
// sidebar (Root.tsx), the homepage cards (HomeNavigationCards.tsx), the
// per-plugin not-enabled page (PluginNotEnabledPage), and the route-
// element switcher (ButlerLabsRouteElement) all consume this so the
// label, route, config key, icon, copy, and runtime dependency model
// never drift between surfaces. The role and origin strings match the
// butlerlabs.dev product copy so the not-enabled page reads like the
// rest of the brand surface.

// Stable string union for every Butler-Labs-branded plugin's config flag.
// Single source of truth for the union: App.tsx, the submenu, the
// route-element switcher, and the tests all import this type. Pair this
// with PLUGIN_META_BY_KEY below so TypeScript enforces that every value
// in the union has an entry in the metadata table.
export type ButlerLabsConfigKey =
  | 'butler'
  | 'workspaces'
  | 'registry'
  | 'pipeline';

export type ButlerLabsPluginMeta = {
  /** Stable key matching the config flag and the backend gate. */
  configKey: ButlerLabsConfigKey;
  /** Sidebar display name (the brand: Butler / Chambers / Keeper / Herald). */
  brandName: string;
  /** Themed role from butlerlabs.dev: 'The Head Butler', etc. */
  role: string;
  /** Long-form origin and product description from butlerlabs.dev. */
  origin: string;
  /** Mascot illustration shown as the page hero on PluginNotEnabledPage. */
  mascotPath: string;
  /** Mounted path (e.g. 'butler' for /butler/*). No leading slash. */
  routePath: string;
  /** One-line description shown in the sidebar tooltip. */
  shortDescription: string;
  /** Icon for the sidebar item and the small inline icon. */
  icon: IconComponent;
  /**
   * Another Butler Labs plugin whose backend this plugin proxies through.
   * When set, enabling this plugin is not enough on its own: the
   * dependency's backend feature must also be loaded or every
   * /api/<dep>/* call returns 404 and the page silently fails. The
   * route-element switcher and the surface (homepage + sidebar) check
   * this and render the disabled treatment when the dependency is off.
   * Undefined means no Butler Labs runtime dependency (the plugin is
   * self-contained at the backend layer).
   */
  dependsOn?: ButlerLabsConfigKey;
};

// Plugin metadata, keyed by configKey. Typed as Record<...> so adding a
// value to ButlerLabsConfigKey without a matching entry here is a
// compile error -- the type system enforces the union <-> table
// invariant that hand-rolled .find(...)! lookups used to lose.
export const PLUGIN_META_BY_KEY: Record<
  ButlerLabsConfigKey,
  ButlerLabsPluginMeta
> = {
  butler: {
    configKey: 'butler',
    brandName: 'Butler',
    role: 'The Head Butler',
    origin:
      'The head butler orchestrates the entire estate. Butler is the top-level platform. It provisions and manages Kubernetes clusters across any infrastructure provider. Everything flows through Butler.',
    mascotPath: '/mascots/butler.webp',
    routePath: 'butler',
    shortDescription: 'Cluster and platform management for butler-server.',
    icon: CloudIcon,
  },
  workspaces: {
    configKey: 'workspaces',
    brandName: 'Chambers',
    role: "The Chamberlain's Domain",
    origin:
      "The chamberlain managed the lord's private chambers. Personal rooms prepared and equipped for each resident. Each chamber is a private, fully equipped space prepared to its occupant's specifications. Git repos cloned, dotfiles installed, SSH keys injected, editor configs ready. Prepared upon request and ready when you arrive.",
    mascotPath: '/mascots/chambers.webp',
    routePath: 'workspaces',
    shortDescription: 'Developer workspace provisioning and access.',
    icon: ViewQuiltIcon,
    // Chambers is a frontend plugin that proxies every backend call
    // through butler-backend (butlerApiRef). With Butler off, butler-
    // backend never loads, /api/butler/* routes are 404, and every
    // Chambers page silently breaks. The route-element switcher AND the
    // surfaces (sidebar + homepage card) treat this as a disabled state
    // so the operator sees the misconfiguration before clicking through.
    dependsOn: 'butler',
  },
  registry: {
    configKey: 'registry',
    brandName: 'Keeper',
    role: 'The Keeper of the Wardrobe',
    origin:
      "The Keeper of the Wardrobe was one of the most powerful household officers. Chief executive overseeing the secure storage of treasures, archives, and armaments, with full inventory governance and financial accountability. Keeper is the IaC registry, governance, and execution platform. It stores infrastructure modules with versioning, manages approval workflows, enforces OPA policies, tracks costs, runs security scans, and executes plan/apply runs. It doesn't just store things. It governs and runs them.",
    mascotPath: '/mascots/keeper.webp',
    routePath: 'registry',
    shortDescription: 'IaC registry, governance, and execution.',
    icon: StorageIcon,
  },
  pipeline: {
    configKey: 'pipeline',
    brandName: 'Herald',
    role: 'The Estate Herald',
    origin:
      'The herald carried news and announcements across the estate. Ensured information reached the right people at the right time, traveling circuits to distant outposts. Herald routes telemetry signals (logs, metrics, traces) from sources to destinations, managing distributed Vector agents across the fleet. Like a herald traveling circuits, it ensures signals reach their intended audience reliably.',
    mascotPath: '/mascots/herald.webp',
    routePath: 'pipeline',
    shortDescription: 'Telemetry routing at fleet scale.',
    icon: TimelineIcon,
  },
};

// Iterator form of the metadata table for the (rare) cases that want a
// stable order: sidebar layout, homepage card grid. The TS Object.values
// signature on a Record loses the value type, so re-typed as
// ReadonlyArray<ButlerLabsPluginMeta>.
export const BUTLER_LABS_PLUGINS: ReadonlyArray<ButlerLabsPluginMeta> =
  Object.values(PLUGIN_META_BY_KEY);

// Typed accessor for a single plugin's metadata. The union+Record pairing
// makes this total: PLUGIN_META_BY_KEY[key] is always defined, no
// runtime undefined case to handle.
export const getPluginMeta = (
  key: ButlerLabsConfigKey,
): ButlerLabsPluginMeta => PLUGIN_META_BY_KEY[key];

// Config key for whether a Butler Labs plugin is enabled in this deployment.
// The same string appears in app-config.yaml, the Helm values block, and the
// backend gate (butlerLabsPluginGates.ts).
export const pluginEnabledConfigKey = (
  meta: ButlerLabsPluginMeta,
): string => `plugins.${meta.configKey}.enabled`;

// Whether the plugin's own runtime flag is on. Does NOT consider
// dependencies; getButlerLabsPluginRuntimeState is the full check.
export const isPluginEnabled = (
  config: Pick<Config, 'getOptionalBoolean'>,
  meta: ButlerLabsPluginMeta,
): boolean =>
  config.getOptionalBoolean(pluginEnabledConfigKey(meta)) ?? false;

// Full runtime state for a Butler Labs plugin: enabled if and only if
// the plugin's flag is on AND, if it has a dependsOn, the dependency's
// flag is also on. When the dependency is the failing link,
// missingDependency carries the dependency's metadata so consumers
// (sidebar, homepage card, route-element switcher) can render the
// dependency-aware copy variant rather than the generic "off" treatment.
//
// Single source of truth for the runtime gate logic. Consumed by:
//   - ButlerLabsRouteElement.tsx (which page to render at the route)
//   - HomeNavigationCards.tsx (homepage card grey vs. live)
//   - Root.tsx -> ButlerLabsSubmenuItem (sidebar item grey vs. live)
// Keeping the three surfaces aligned on this helper means flipping a
// flag in app-config always moves all three together; a sidebar that
// reads as enabled while the homepage card is greyed (or vice versa)
// is the inconsistency this helper exists to prevent.
export type ButlerLabsPluginRuntimeState = {
  enabled: boolean;
  /**
   * Present only when meta.dependsOn is set, meta is on, and the
   * dependency is off. Names the off dependency so the surface can
   * render "<meta> requires <dep>" copy.
   */
  missingDependency?: ButlerLabsPluginMeta;
};

export const getButlerLabsPluginRuntimeState = (
  config: Pick<Config, 'getOptionalBoolean'>,
  meta: ButlerLabsPluginMeta,
): ButlerLabsPluginRuntimeState => {
  if (!isPluginEnabled(config, meta)) {
    return { enabled: false };
  }
  if (meta.dependsOn) {
    const depMeta = getPluginMeta(meta.dependsOn);
    if (!isPluginEnabled(config, depMeta)) {
      return { enabled: false, missingDependency: depMeta };
    }
  }
  return { enabled: true };
};
