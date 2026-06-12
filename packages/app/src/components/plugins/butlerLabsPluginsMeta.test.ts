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

import { MockConfigApi } from '@backstage/test-utils';
import {
  BUTLER_LABS_PLUGINS,
  ButlerLabsConfigKey,
  PLUGIN_META_BY_KEY,
  getButlerLabsPluginRuntimeState,
  getPluginMeta,
  isPluginEnabled,
  pluginEnabledConfigKey,
} from './butlerLabsPluginsMeta';

// These tests pin the union <-> Record invariant that lets ButlerLabsRouteElement
// and the surfaces drop the .find(...)! patterns: every value in
// ButlerLabsConfigKey MUST have an entry in PLUGIN_META_BY_KEY, and
// BUTLER_LABS_PLUGINS is exactly the values of that record. The helper
// behavior (isPluginEnabled and getButlerLabsPluginRuntimeState) is the
// single source of truth consumed by App.tsx, Root.tsx, and HomeNavigation-
// Cards.tsx; a regression here ripples through all three surfaces.

const ALL_KEYS: ButlerLabsConfigKey[] = [
  'butler',
  'workspaces',
  'registry',
  'pipeline',
];

describe('butlerLabsPluginsMeta union <-> Record invariant', () => {
  it('PLUGIN_META_BY_KEY has exactly the configKeys in the ButlerLabsConfigKey union', () => {
    expect(Object.keys(PLUGIN_META_BY_KEY).sort()).toEqual(
      ALL_KEYS.slice().sort(),
    );
  });

  it('every PLUGIN_META_BY_KEY entry round-trips its configKey', () => {
    for (const key of ALL_KEYS) {
      expect(PLUGIN_META_BY_KEY[key].configKey).toBe(key);
    }
  });

  it('BUTLER_LABS_PLUGINS is exactly Object.values(PLUGIN_META_BY_KEY)', () => {
    expect(BUTLER_LABS_PLUGINS).toEqual(Object.values(PLUGIN_META_BY_KEY));
  });

  it('getPluginMeta returns the same object as PLUGIN_META_BY_KEY (no copy)', () => {
    for (const key of ALL_KEYS) {
      expect(getPluginMeta(key)).toBe(PLUGIN_META_BY_KEY[key]);
    }
  });

  it('Chambers (workspaces) is the only plugin with a dependsOn, and it points at Butler', () => {
    // The dependency model has a single edge today (Chambers -> Butler).
    // If a future plugin gains a dependsOn, that wiring needs explicit
    // review against the surface helpers and the route element; this test
    // notices the change at the data-model layer.
    const withDeps = BUTLER_LABS_PLUGINS.filter(p => p.dependsOn);
    expect(withDeps).toHaveLength(1);
    expect(withDeps[0].configKey).toBe('workspaces');
    expect(withDeps[0].dependsOn).toBe('butler');
  });
});

describe('isPluginEnabled', () => {
  it('returns false when the flag is unset (default-off, external customer fail-safe)', () => {
    const config = new MockConfigApi({});
    for (const key of ALL_KEYS) {
      expect(isPluginEnabled(config, getPluginMeta(key))).toBe(false);
    }
  });

  it('returns true when the flag is explicitly true', () => {
    const config = new MockConfigApi({
      plugins: { butler: { enabled: true } },
    });
    expect(isPluginEnabled(config, getPluginMeta('butler'))).toBe(true);
    // Other flags stay off.
    expect(isPluginEnabled(config, getPluginMeta('workspaces'))).toBe(false);
  });

  it('does NOT consider dependsOn (raw flag check only -- callers use getButlerLabsPluginRuntimeState for the dep-aware path)', () => {
    const config = new MockConfigApi({
      plugins: { workspaces: { enabled: true }, butler: { enabled: false } },
    });
    expect(isPluginEnabled(config, getPluginMeta('workspaces'))).toBe(true);
  });
});

describe('getButlerLabsPluginRuntimeState', () => {
  it('returns enabled=false with no missingDependency when the plugin flag is off', () => {
    const config = new MockConfigApi({});
    for (const key of ALL_KEYS) {
      const state = getButlerLabsPluginRuntimeState(
        config,
        getPluginMeta(key),
      );
      expect(state.enabled).toBe(false);
      expect(state.missingDependency).toBeUndefined();
    }
  });

  it('returns enabled=true for self-contained plugins when their own flag is on (Butler, Keeper, Herald have no dependsOn)', () => {
    const config = new MockConfigApi({
      plugins: {
        butler: { enabled: true },
        registry: { enabled: true },
        pipeline: { enabled: true },
      },
    });
    for (const key of ['butler', 'registry', 'pipeline'] as const) {
      const state = getButlerLabsPluginRuntimeState(
        config,
        getPluginMeta(key),
      );
      expect(state.enabled).toBe(true);
      expect(state.missingDependency).toBeUndefined();
    }
  });

  it('returns enabled=false with missingDependency=Butler when Chambers is on but Butler is off (the Chambers-runtime-broken case)', () => {
    const config = new MockConfigApi({
      plugins: { workspaces: { enabled: true }, butler: { enabled: false } },
    });
    const state = getButlerLabsPluginRuntimeState(
      config,
      getPluginMeta('workspaces'),
    );
    expect(state.enabled).toBe(false);
    expect(state.missingDependency?.configKey).toBe('butler');
  });

  it('returns enabled=true when Chambers AND Butler are both on (Butler Labs internal deployment baseline)', () => {
    const config = new MockConfigApi({
      plugins: { workspaces: { enabled: true }, butler: { enabled: true } },
    });
    const state = getButlerLabsPluginRuntimeState(
      config,
      getPluginMeta('workspaces'),
    );
    expect(state.enabled).toBe(true);
    expect(state.missingDependency).toBeUndefined();
  });

  it('does NOT trigger missingDependency when meta has no dependsOn even if other flags are off', () => {
    // Butler has no dependsOn; even with everything else off, Butler with
    // its own flag on is fully enabled. Regression net against accidentally
    // wiring a dependency check onto every plugin.
    const config = new MockConfigApi({
      plugins: { butler: { enabled: true } },
    });
    const state = getButlerLabsPluginRuntimeState(
      config,
      getPluginMeta('butler'),
    );
    expect(state.enabled).toBe(true);
    expect(state.missingDependency).toBeUndefined();
  });
});

describe('pluginEnabledConfigKey', () => {
  it('renders the same plugins.<name>.enabled string the chart, app-config, and backend gate use', () => {
    for (const key of ALL_KEYS) {
      expect(pluginEnabledConfigKey(getPluginMeta(key))).toBe(
        `plugins.${key}.enabled`,
      );
    }
  });
});
