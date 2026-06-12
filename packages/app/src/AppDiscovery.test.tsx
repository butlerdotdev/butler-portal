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

import { Route } from 'react-router-dom';
import {
  configApiRef,
  createPlugin,
  createRoutableExtension,
  createRouteRef,
} from '@backstage/core-plugin-api';
import { FlatRoutes } from '@backstage/core-app-api';
import {
  MockConfigApi,
  TestApiProvider,
  renderInTestApp,
} from '@backstage/test-utils';
import { ButlerLabsRouteElement } from './components/plugins/ButlerLabsRouteElement';

// Regression net over the Backstage plugin-discovery walker as it runs
// through ButlerLabsRouteElement. This is the layer the per-component unit
// tests bypass (MockConfigApi + TestApiProvider construct subtrees directly
// and never invoke @backstage/core-app-api's traverseElementTree pass).
//
// The bug this file pins: passing a routable extension via a custom-
// component prop other than `children` or `element` makes it invisible to
// the walker. RoutableExtensionWrapper throws at render time:
//
//   "Routable extension component with mount point routeRef was not
//   discovered in the app element tree. Routable extension components may
//   not be rendered by other components and must be directly available as
//   an element within the App provider component."
//
// The fix: ButlerLabsRouteElement accepts the real plugin page via
// `children`, which the walker recurses into. The test below proves that
// path works against a minimal routable extension that has no API factory
// dependencies of its own. If a future refactor of
// ButlerLabsRouteElement reverts to an enabledElement-style prop, the
// extension's routeRef goes unindexed and the test fails with the same
// "was not discovered" error the bug originally produced.

const probeRouteRef = createRouteRef({ id: 'butler-labs-route-element-probe' });

const probePlugin = createPlugin({
  id: 'butler-labs-route-element-probe',
  routes: { root: probeRouteRef },
});

// Minimal routable extension wired up the same way a real Butler Labs
// plugin page is (createPlugin -> createRoutableExtension -> bound to a
// routeRef). The component renders a single div; the routable-extension
// machinery around it is what the walker must discover.
const ProbeRoutableExtension = probePlugin.provide(
  createRoutableExtension({
    name: 'ProbeRoutableExtension',
    component: () =>
      Promise.resolve(() => (
        <div data-testid="probe-routable-extension-rendered">probe</div>
      )),
    mountPoint: probeRouteRef,
  }),
);

const renderProbeUnderGate = async (butler: boolean, workspaces: boolean) => {
  const config = new MockConfigApi({
    plugins: {
      butler: { enabled: butler },
      workspaces: { enabled: workspaces },
      registry: { enabled: false },
      pipeline: { enabled: false },
    },
  });

  // The render tree mirrors App.tsx's shape: FlatRoutes > Route > Butler-
  // LabsRouteElement > routable-extension-as-children. The Route's
  // `path="/probe/*"` element-prop wiring is what assigns the routable
  // extension's mountPoint to a real path so its RoutableExtensionWrapper
  // can render. mountedRoutes is INTENTIONALLY NOT used: passing the
  // routeRef in mountedRoutes papers over the discovery walker entirely
  // (the test would pass even when the walker missed the extension),
  // defeating the regression net. Without mountedRoutes the walker IS
  // the only source of truth for whether ProbeRoutableExtension is
  // discoverable -- mirroring the production createApp pipeline.
  //
  // Mutation-checked: changing ButlerLabsRouteElement to accept the
  // routable extension via an `enabledElement` prop instead of
  // `children` and updating this call site to match makes the walker
  // miss the extension and produces the exact original
  //   "Routable extension component with mount point routeRef
  //    {type=absolute,id=butler-labs-route-element-probe} was not
  //    discovered in the app element tree"
  // error at render time. The current shape passes; the bug shape
  // fails. That is the contract this file pins.
  return renderInTestApp(
    <TestApiProvider apis={[[configApiRef, config]]}>
      <FlatRoutes>
        <Route
          path="/probe/*"
          element={
            <ButlerLabsRouteElement configKey="workspaces">
              <ProbeRoutableExtension />
            </ButlerLabsRouteElement>
          }
        />
      </FlatRoutes>
    </TestApiProvider>,
    { routeEntries: ['/probe'] },
  );
};

describe('createApp discovery walker over ButlerLabsRouteElement (regression for "was not discovered" crash)', () => {
  it('discovers a routable extension wrapped via children and renders it when the gate passes', async () => {
    // Chambers (workspaces=true) with Butler (butler=true) on -> the gate
    // renders children. The probe extension must be discoverable via the
    // walker's children-recursion for this to mount without throwing the
    // discovery error. If ButlerLabsRouteElement is later refactored to
    // pass children via an arbitrary prop (the original bug), the walker
    // skips them and this assertion fails.
    const r = await renderProbeUnderGate(true, true);
    expect(
      r.queryByTestId('probe-routable-extension-rendered'),
    ).not.toBeNull();
  });

  it('renders PluginNotEnabledPage when the gate fails, without ever mounting the routable extension (the extension is still discoverable; it is just not the rendered branch)', async () => {
    // Chambers depends on Butler. workspaces=true, butler=false ->
    // dependency-missing variant. The probe extension is in the tree
    // (children of ButlerLabsRouteElement, walker still recurses) but the
    // gate never reaches the children-render branch. The branded page
    // mounts instead; the probe does not render.
    const r = await renderProbeUnderGate(false, true);
    expect(r.queryByTestId('probe-routable-extension-rendered')).toBeNull();
    // The dependency-missing status text confirms the right branch
    // rendered (not the generic disabled-state branch).
    const status = r.queryByTestId('plugin-not-enabled-status');
    expect(status?.textContent).toMatch(/requires Butler/i);
  });
});
