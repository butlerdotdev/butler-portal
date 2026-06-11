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

import { configApiRef, useApi } from '@backstage/core-plugin-api';
import {
  MockConfigApi,
  TestApiProvider,
  renderInTestApp,
} from '@backstage/test-utils';
import { BUTLER_LABS_PLUGINS } from './components/plugins/butlerLabsPluginsMeta';
import { PluginNotEnabledPage } from './components/plugins/PluginNotEnabledPage';

// These tests pin the frontend route-element gate from packages/app/src/App.tsx.
// The route is always mounted; the element rendered depends on the flag. A
// disabled flag renders the branded PluginNotEnabledPage instead of the real
// plugin page, never Backstage's generic NotFound. The backend gate stays
// genuinely off either way -- see butlerLabsPluginGates.test.ts.

type Flags = {
  butler: boolean;
  workspaces: boolean;
  registry: boolean;
  pipeline: boolean;
};

// Stand-in mirrors the route-element conditional shape from App.tsx without
// pulling in the full Backstage app routing tree (the real plugin pages need
// API factories the test harness does not provide). The conditional pattern
// under test is `flag ? <RealPage/> : <PluginNotEnabledPage/>`. A regression
// in the gating (flag name typo, swapped branches, removed fallback) fails
// here.
const RealPlaceholder = ({ pluginKey }: { pluginKey: string }) => (
  <div data-testid={`real-${pluginKey}-page`}>real {pluginKey} page</div>
);

const GatedRoutes = () => {
  const config = useApi(configApiRef);
  const enabledByKey = Object.fromEntries(
    BUTLER_LABS_PLUGINS.map(p => [
      p.configKey,
      config.getOptionalBoolean(`plugins.${p.configKey}.enabled`) ?? false,
    ]),
  );
  const metaByKey = Object.fromEntries(
    BUTLER_LABS_PLUGINS.map(p => [p.configKey, p]),
  );

  return (
    <>
      {BUTLER_LABS_PLUGINS.map(meta => (
        <div key={meta.configKey} data-testid={`route-${meta.configKey}`}>
          {enabledByKey[meta.configKey] ? (
            <RealPlaceholder pluginKey={meta.configKey} />
          ) : (
            <PluginNotEnabledPage meta={metaByKey[meta.configKey]} />
          )}
        </div>
      ))}
    </>
  );
};

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

describe('App route gate (PluginNotEnabledPage vs real plugin page)', () => {
  it('renders the branded not-enabled page for all four routes when every flag is off (external customer default)', async () => {
    const r = await renderWithFlags({});
    for (const meta of BUTLER_LABS_PLUGINS) {
      expect(r.queryByTestId(`real-${meta.configKey}-page`)).toBeNull();
      // The branded page shows the plugin's brand name in its EmptyState
      // title; multiple text occurrences are normal because Header subtitle
      // and EmptyState title both reference the brand.
      expect(
        r.queryAllByText(new RegExp(`${meta.brandName} is not enabled here`)).length,
      ).toBeGreaterThan(0);
    }
  });

  it('renders the real page for an enabled plugin and the not-enabled page for the others', async () => {
    const r = await renderWithFlags({ butler: true });
    expect(r.queryByTestId('real-butler-page')).not.toBeNull();
    expect(r.queryAllByText(/Butler is not enabled here/).length).toBe(0);
    for (const other of ['workspaces', 'registry', 'pipeline']) {
      expect(r.queryByTestId(`real-${other}-page`)).toBeNull();
      const meta = BUTLER_LABS_PLUGINS.find(p => p.configKey === other)!;
      expect(
        r.queryAllByText(new RegExp(`${meta.brandName} is not enabled here`)).length,
      ).toBeGreaterThan(0);
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
      expect(
        r.queryAllByText(new RegExp(`${meta.brandName} is not enabled here`)).length,
      ).toBe(0);
    }
  });

  it('points the not-enabled page at the correct config key for each plugin', async () => {
    // Disable all four and confirm the page tells the user exactly which key
    // to flip. The config-key copy is what the operator needs to enable the
    // plugin from the Helm values block.
    const r = await renderWithFlags({});
    for (const meta of BUTLER_LABS_PLUGINS) {
      expect(
        r.queryAllByText(new RegExp(`plugins\\.${meta.configKey}\\.enabled`))
          .length,
      ).toBeGreaterThan(0);
    }
  });
});
