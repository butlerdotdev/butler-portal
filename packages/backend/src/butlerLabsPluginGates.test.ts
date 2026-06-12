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

import { ConfigReader } from '@backstage/config';
import { selectEnabledButlerLabsPlugins } from './butlerLabsPluginGates';

// These tests pin the gate logic that decides which Butler-Labs-branded
// backend plugins are loaded by createBackendFeatureLoader. Genuine-off
// is the load-bearing property: when the flag is false (or absent), the
// module must not appear in the selected spec list, which is what stops
// register() from running and what makes the corresponding /api/* routes
// return 404 in production.

const config = (data: unknown) => new ConfigReader(data as object);

describe('selectEnabledButlerLabsPlugins', () => {
  it('returns nothing when every flag is absent (default-OFF fail-safe)', () => {
    expect(selectEnabledButlerLabsPlugins(config({}))).toEqual([]);
  });

  it('returns nothing when every flag is explicitly false', () => {
    expect(
      selectEnabledButlerLabsPlugins(
        config({
          plugins: {
            butler: { enabled: false },
            workspaces: { enabled: false },
            registry: { enabled: false },
            pipeline: { enabled: false },
          },
        }),
      ),
    ).toEqual([]);
  });

  it('selects only the butler-backend when plugins.butler.enabled is true', () => {
    const specs = selectEnabledButlerLabsPlugins(
      config({ plugins: { butler: { enabled: true } } }),
    );
    expect(specs).toHaveLength(1);
    expect(specs[0].flag).toBe('plugins.butler.enabled');
    expect(specs[0].modules).toEqual(['@internal/plugin-butler-backend']);
  });

  it('selects the registry-backend AND its catalog entity-provider module together when plugins.registry.enabled is true', () => {
    const specs = selectEnabledButlerLabsPlugins(
      config({ plugins: { registry: { enabled: true } } }),
    );
    expect(specs).toHaveLength(1);
    expect(specs[0].flag).toBe('plugins.registry.enabled');
    // The catalog module piggy-backs on the same flag. A separate flag
    // would invite a misconfiguration where catalog discovery runs against
    // an absent registry.
    expect(specs[0].modules).toEqual([
      '@internal/plugin-registry-backend',
      '@internal/plugin-registry-backend/catalog',
    ]);
  });

  it('selects only the pipeline-backend when plugins.pipeline.enabled is true', () => {
    const specs = selectEnabledButlerLabsPlugins(
      config({ plugins: { pipeline: { enabled: true } } }),
    );
    expect(specs).toHaveLength(1);
    expect(specs[0].flag).toBe('plugins.pipeline.enabled');
    expect(specs[0].modules).toEqual(['@internal/plugin-pipeline-backend']);
  });

  it('never selects a workspaces module (frontend-only; no backend gate)', () => {
    const allOn = selectEnabledButlerLabsPlugins(
      config({
        plugins: {
          butler: { enabled: true },
          workspaces: { enabled: true },
          registry: { enabled: true },
          pipeline: { enabled: true },
        },
      }),
    );
    const allModules = allOn.flatMap(s => s.modules);
    expect(allModules.some(m => m.includes('workspaces'))).toBe(false);
  });

  it('selects all three Butler-Labs backends in stable order when every flag is true', () => {
    const specs = selectEnabledButlerLabsPlugins(
      config({
        plugins: {
          butler: { enabled: true },
          workspaces: { enabled: true },
          registry: { enabled: true },
          pipeline: { enabled: true },
        },
      }),
    );
    expect(specs.map(s => s.flag)).toEqual([
      'plugins.butler.enabled',
      'plugins.registry.enabled',
      'plugins.pipeline.enabled',
    ]);
    expect(specs.flatMap(s => s.modules)).toEqual([
      '@internal/plugin-butler-backend',
      '@internal/plugin-registry-backend',
      '@internal/plugin-registry-backend/catalog',
      '@internal/plugin-pipeline-backend',
    ]);
  });

});
