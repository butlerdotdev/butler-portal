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
// drift between the two surfaces.
export type ButlerLabsPluginMeta = {
  /** Stable key matching the config flag and the backend gate. */
  configKey: 'butler' | 'workspaces' | 'registry' | 'pipeline';
  /** Sidebar display name (the brand: Butler / Chambers / Keeper / Herald). */
  brandName: string;
  /** Mounted path (e.g. 'butler' for /butler/*). No leading slash. */
  routePath: string;
  /** One-line description shown in the sidebar tooltip. */
  shortDescription: string;
  /** Longer copy rendered on the not-enabled page. */
  longDescription: string;
  /** Icon for the sidebar item and the not-enabled page header. */
  icon: IconComponent;
};

export const BUTLER_LABS_PLUGINS: ButlerLabsPluginMeta[] = [
  {
    configKey: 'butler',
    brandName: 'Butler',
    routePath: 'butler',
    shortDescription:
      'Cluster and platform management for butler-server.',
    longDescription:
      'Butler is the operator surface for the butler-server control plane: tenant cluster lifecycle, teams and RBAC, identity providers, infrastructure provider configs, network pools, audit, and observability. Without it enabled this portal cannot reach butler-server.',
    icon: CloudIcon,
  },
  {
    configKey: 'workspaces',
    brandName: 'Chambers',
    routePath: 'workspaces',
    shortDescription: 'Developer workspace provisioning and access.',
    longDescription:
      'Chambers provisions developer workspaces on tenant clusters: workspace templates, image catalog, SSH key sync, mirrord traffic mirroring, and in-browser terminals. Chambers proxies butler-server through the Butler plugin, so it also needs Butler enabled to function.',
    icon: ViewQuiltIcon,
  },
  {
    configKey: 'registry',
    brandName: 'Keeper',
    routePath: 'registry',
    shortDescription: 'IaC module and artifact registry.',
    longDescription:
      'Keeper is the artifact registry for Terraform modules, environments, and infrastructure deployments. It carries versioning, approval workflows, scan and governance, cloud-credential integrations, and a catalog entity provider that surfaces registry artifacts as Backstage entities.',
    icon: StorageIcon,
  },
  {
    configKey: 'pipeline',
    brandName: 'Herald',
    routePath: 'pipeline',
    shortDescription: 'Pipeline DSL and fleet agent management.',
    longDescription:
      'Herald is a DAG-based pipeline editor backed by the VRL language, with fleet agent registration, token management, and managed-config rollout. Herald owns its own fleet of agents that pull deployed pipelines on a schedule.',
    icon: TimelineIcon,
  },
];

// Config key for whether a Butler Labs plugin is enabled in this deployment.
// The same string appears in app-config.yaml, the Helm values block, and the
// backend gate (butlerLabsPluginGates.ts).
export const pluginEnabledConfigKey = (
  meta: ButlerLabsPluginMeta,
): string => `plugins.${meta.configKey}.enabled`;
