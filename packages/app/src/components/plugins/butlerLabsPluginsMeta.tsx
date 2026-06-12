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

import { IconComponent } from '@backstage/core-plugin-api';
import CloudIcon from '@material-ui/icons/Cloud';
import StorageIcon from '@material-ui/icons/Storage';
import TimelineIcon from '@material-ui/icons/Timeline';
import ViewQuiltIcon from '@material-ui/icons/ViewQuilt';

// Single source of truth for the four Butler-Labs-branded plugins. The
// sidebar (Root.tsx) and the per-plugin not-enabled page (PluginNotEnabledPage)
// both consume this so the label, route, config key, icon, and copy never
// drift between the two surfaces. The role and origin strings match the
// butlerlabs.dev product copy so the not-enabled page reads like the rest
// of the brand surface.

// Stable string union for every Butler-Labs-branded plugin's config flag.
// Single source of truth for the union: App.tsx, the submenu, the
// route-element switcher, and the tests all import this type.
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
   * When set, enabling this plugin is not enough on its own: the dependency's
   * backend feature must also be loaded or every /api/<dep>/* call returns
   * 404 and the page silently fails. The route-element switcher checks
   * this and renders the dependency-missing variant of PluginNotEnabledPage
   * when the dependency is off. Undefined means no Butler Labs runtime
   * dependency (the plugin is self-contained at the backend layer).
   */
  dependsOn?: ButlerLabsConfigKey;
};

export const BUTLER_LABS_PLUGINS: ButlerLabsPluginMeta[] = [
  {
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
  {
    configKey: 'workspaces',
    brandName: 'Chambers',
    role: "The Chamberlain's Domain",
    origin:
      "The chamberlain managed the lord's private chambers. Personal rooms prepared and equipped for each resident. Each chamber is a private, fully equipped space prepared to its occupant's specifications. Git repos cloned, dotfiles installed, SSH keys injected, editor configs ready. Prepared upon request and ready when you arrive.",
    mascotPath: '/mascots/chambers.webp',
    routePath: 'workspaces',
    shortDescription: 'Developer workspace provisioning and access.',
    icon: ViewQuiltIcon,
    // Chambers is a frontend plugin that proxies every backend call through
    // butler-backend (butlerApiRef). With Butler off, butler-backend never
    // loads, /api/butler/* routes are 404, and every Chambers page silently
    // breaks. The route-element switcher surfaces this as a deliberate
    // "Chambers requires Butler" page instead of letting the UI fail open.
    dependsOn: 'butler',
  },
  {
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
  {
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
];

// Config key for whether a Butler Labs plugin is enabled in this deployment.
// The same string appears in app-config.yaml, the Helm values block, and the
// backend gate (butlerLabsPluginGates.ts).
export const pluginEnabledConfigKey = (
  meta: ButlerLabsPluginMeta,
): string => `plugins.${meta.configKey}.enabled`;
