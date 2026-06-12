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

import { configApiRef } from '@backstage/core-plugin-api';
import {
  MockConfigApi,
  TestApiProvider,
  renderInTestApp,
} from '@backstage/test-utils';
import { within } from '@testing-library/react';
import { BUTLER_LABS_PLUGINS } from './components/plugins/butlerLabsPluginsMeta';
import { ButlerLabsRouteElement } from './components/plugins/ButlerLabsRouteElement';

// These tests exercise the REAL ButlerLabsRouteElement (the same module
// App.tsx mounts as the element of each /<plugin>/* route), not a hand-
// rolled stand-in. The route is always mounted; the element rendered
// depends on the flag and on the plugin's runtime dependency (Chambers ->
// Butler). A disabled flag renders the branded PluginNotEnabledPage instead
// of the real plugin page, never Backstage's generic NotFound. An enabled
// flag whose dependency is off renders the dependency-missing variant of
// PluginNotEnabledPage instead of letting the plugin silently 404 on its
// backend calls. The backend gate stays genuinely off either way -- see
// butlerLabsPluginGates.test.ts.

type Flags = {
  butler: boolean;
  workspaces: boolean;
  registry: boolean;
  pipeline: boolean;
};

// Stand-in for the real plugin's routable extension. The route-element
// switcher does not know what its children are; it only chooses between
// "render the children" and "render the not-enabled / dependency-missing
// page." Substituting the real ButlerPage / WorkspacesPluginPage / etc.
// would pull in API factories the test harness does not provide; using a
// data-testid placeholder pins the same code path without the dep cost.
const RealPlaceholder = ({ pluginKey }: { pluginKey: string }) => (
  <div data-testid={`real-${pluginKey}-page`}>real {pluginKey} page</div>
);

const GatedRoutes = () => (
  <>
    {BUTLER_LABS_PLUGINS.map(meta => (
      <div key={meta.configKey} data-testid={`route-${meta.configKey}`}>
        <ButlerLabsRouteElement configKey={meta.configKey}>
          <RealPlaceholder pluginKey={meta.configKey} />
        </ButlerLabsRouteElement>
      </div>
    ))}
  </>
);

const renderWithFlags = async (flags: Partial<Flags>) => {
  const config = new MockConfigApi({
    plugins: {
      butler: { enabled: !!flags.butler },
      workspaces: { enabled: !!flags.workspaces },
      registry: { enabled: !!flags.registry },
      pipeline: { enabled: !!flags.pipeline },
    },
  });
  return renderInTestApp(
    <TestApiProvider apis={[[configApiRef, config]]}>
      <GatedRoutes />
    </TestApiProvider>,
  );
};

describe('ButlerLabsRouteElement (PluginNotEnabledPage vs real plugin page)', () => {
  it('renders the branded not-enabled page for all four routes when every flag is off (external customer default)', async () => {
    const r = await renderWithFlags({});
    for (const meta of BUTLER_LABS_PLUGINS) {
      expect(r.queryByTestId(`real-${meta.configKey}-page`)).toBeNull();
      // The branded page renders the plugin's themed role (e.g. "The Head
      // Butler"), the origin description from butlerlabs.dev, and the
      // mascot illustration -- all per-plugin pinned by the meta.
      expect(r.queryAllByText(meta.role).length).toBeGreaterThan(0);
      const mascot = r.container.querySelector(
        `img[src="${meta.mascotPath}"]`,
      );
      expect(mascot).not.toBeNull();
    }
  });

  it('renders the real page for an enabled plugin without runtime dependencies', async () => {
    // Butler has no dependsOn, so flipping butler=true is enough to render
    // its real page. Other three stay on their PluginNotEnabledPage.
    const r = await renderWithFlags({ butler: true });
    expect(r.queryByTestId('real-butler-page')).not.toBeNull();
    expect(r.queryAllByText('The Head Butler').length).toBe(0);
    for (const other of ['workspaces', 'registry', 'pipeline'] as const) {
      expect(r.queryByTestId(`real-${other}-page`)).toBeNull();
      const meta = BUTLER_LABS_PLUGINS.find(p => p.configKey === other)!;
      expect(r.queryAllByText(meta.role).length).toBeGreaterThan(0);
    }
  });

  it('renders only real pages when every flag is on (Butler Labs deployment)', async () => {
    const r = await renderWithFlags({
      butler: true,
      workspaces: true,
      registry: true,
      pipeline: true,
    });
    for (const meta of BUTLER_LABS_PLUGINS) {
      expect(r.queryByTestId(`real-${meta.configKey}-page`)).not.toBeNull();
      expect(r.queryAllByText(meta.role).length).toBe(0);
    }
  });

  it('points the not-enabled page at the correct config key for each plugin', async () => {
    // Disable all four and confirm the page tells the user exactly which key
    // to flip. The config-key copy is what the operator needs to enable the
    // plugin from the Helm values block. The Chip from Material-UI renders
    // the label inside a nested span, so the assertion is on the chip label
    // string anywhere in the rendered tree.
    const r = await renderWithFlags({});
    for (const meta of BUTLER_LABS_PLUGINS) {
      expect(
        r.queryAllByText(`plugins.${meta.configKey}.enabled`).length,
      ).toBeGreaterThan(0);
    }
  });

  // Chambers -> Butler runtime dependency

  it('renders the dependency-missing variant when Chambers is on but Butler is off (not the real page, not silent /api/butler/* 404s)', async () => {
    // workspaces=true, butler=false. The frontend cannot reach butler-
    // backend (backend feature loader did not load it) so Chambers' UI
    // would render and then silently fail every API call. The route-
    // element switcher catches this and renders PluginNotEnabledPage with
    // dependencyMeta pointing at Butler. The real Chambers page does NOT
    // mount.
    const r = await renderWithFlags({ workspaces: true });
    expect(r.queryByTestId('real-workspaces-page')).toBeNull();
    // Each route renders its own PluginNotEnabledPage in this harness;
    // scope to the workspaces route subtree to read the Chambers-specific
    // status message. The other three routes render the standard
    // "available, not enabled" page so their status elements are not the
    // ones under test here.
    const workspacesRoute = r.queryByTestId('route-workspaces') as HTMLElement;
    expect(workspacesRoute).not.toBeNull();
    const status = workspacesRoute.querySelector(
      '[data-testid="plugin-not-enabled-status"]',
    );
    expect(status?.textContent).toMatch(/requires Butler/i);
    expect(status?.textContent).toMatch(/which is off/i);
    // The enable-card on the workspaces route tells the operator to flip
    // plugins.butler.enabled, not plugins.workspaces.enabled (workspaces
    // is already on). The other three disabled-state pages mention their
    // own keys; scoping the query to the workspaces subtree via within()
    // confirms the dependency-aware copy lands on the right route. The
    // workspaces page does NOT mention plugins.workspaces.enabled
    // because that key is already true.
    const w = within(workspacesRoute);
    expect(w.queryAllByText('plugins.butler.enabled').length).toBeGreaterThan(
      0,
    );
    expect(w.queryAllByText('plugins.workspaces.enabled').length).toBe(0);
  });

  it('renders the real Chambers page when both workspaces and butler are on', async () => {
    const r = await renderWithFlags({ workspaces: true, butler: true });
    expect(r.queryByTestId('real-workspaces-page')).not.toBeNull();
    expect(r.queryByTestId('real-butler-page')).not.toBeNull();
  });

  it('does NOT trigger the dependency-missing variant for plugins without a dependsOn (Butler, Keeper, Herald are self-contained)', async () => {
    // Sanity check the gate logic: Butler / Keeper / Herald have no
    // dependsOn in butlerLabsPluginsMeta, so enabling them alone is enough
    // to render their real pages. Regression net against accidentally
    // wiring a dependency on every plugin.
    const r = await renderWithFlags({
      butler: true,
      registry: true,
      pipeline: true,
    });
    expect(r.queryByTestId('real-butler-page')).not.toBeNull();
    expect(r.queryByTestId('real-registry-page')).not.toBeNull();
    expect(r.queryByTestId('real-pipeline-page')).not.toBeNull();
  });
});
