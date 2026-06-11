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

// Each spec lists the backend module specifiers that should be loaded when
// the named flag is true. registry contributes both its main backend plugin
// and the catalog entity-provider module under one flag (the catalog module
// has no value without the main plugin and a separate flag invites a
// misconfiguration where catalog ingestion runs against an absent registry).
//
// Keep the workspaces plugin out of this list: it is frontend-only and gated
// at the React layer in packages/app.
export type ButlerLabsPluginSpec = {
  flag: string;
  modules: string[];
};

const ALL_SPECS: ButlerLabsPluginSpec[] = [
  {
    flag: 'plugins.butler.enabled',
    modules: ['@internal/plugin-butler-backend'],
  },
  {
    flag: 'plugins.registry.enabled',
    modules: [
      '@internal/plugin-registry-backend',
      '@internal/plugin-registry-backend/catalog',
    ],
  },
  {
    flag: 'plugins.pipeline.enabled',
    modules: ['@internal/plugin-pipeline-backend'],
  },
];

// Returns the specs whose flag is true. Default for an absent flag is false
// so external customer deployments fail safe: nothing under the Butler Labs
// banner ships unless the deployment opted in.
export function selectEnabledButlerLabsPlugins(
  config: Config,
): ButlerLabsPluginSpec[] {
  return ALL_SPECS.filter(
    spec => config.getOptionalBoolean(spec.flag) ?? false,
  );
}
