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
import { BUTLER_LABS_PLUGINS } from '../plugins/butlerLabsPluginsMeta';
import { HomeNavigationCards } from './HomeNavigationCards';

// These tests pin the HomePage navigation-card gating. The four Butler Labs
// cards are always rendered; the disabled-state wrapper (greyed + tooltip)
// is conditioned on plugins.<name>.enabled. The card's href always points at
// the plugin's route so a click lands on PluginNotEnabledPage in App.tsx,
// not a dead URL. Stays separate from HomePage so the test does not have to
// mock Search/Catalog/Home plugin APIs.

const renderCards = async (flags: {
  butler?: boolean;
  workspaces?: boolean;
  registry?: boolean;
  pipeline?: boolean;
}) => {
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
      <HomeNavigationCards />
    </TestApiProvider>,
  );
};

describe('HomeNavigationCards Butler Labs gates', () => {
  it('renders every Butler Labs card with the disabled wrapper when all flags are off (external customer default)', async () => {
    const r = await renderCards({});
    for (const meta of BUTLER_LABS_PLUGINS) {
      const card = r.queryByTestId(`homepage-card-${meta.configKey}-disabled`);
      expect(card).not.toBeNull();
      expect(card?.getAttribute('aria-disabled')).toBe('true');
      // The card href still points at the plugin's route so a click lands
      // on PluginNotEnabledPage (App.tsx) rather than going nowhere.
      expect(card?.getAttribute('href')).toBe(`/${meta.routePath}`);
    }
  });

  it('renders the enabled card without the -disabled suffix and the others with it', async () => {
    const r = await renderCards({ butler: true });
    const enabled = r.queryByTestId('homepage-card-butler');
    expect(enabled).not.toBeNull();
    expect(enabled?.getAttribute('aria-disabled')).toBeNull();
    expect(r.queryByTestId('homepage-card-butler-disabled')).toBeNull();
    for (const other of ['workspaces', 'registry', 'pipeline']) {
      expect(r.queryByTestId(`homepage-card-${other}-disabled`)).not.toBeNull();
      expect(r.queryByTestId(`homepage-card-${other}`)).toBeNull();
    }
  });

  it('renders every card as enabled (no -disabled suffix) when every flag is on (Butler Labs deployment)', async () => {
    const r = await renderCards({
      butler: true,
      workspaces: true,
      registry: true,
      pipeline: true,
    });
    for (const meta of BUTLER_LABS_PLUGINS) {
      expect(r.queryByTestId(`homepage-card-${meta.configKey}`)).not.toBeNull();
      expect(
        r.queryByTestId(`homepage-card-${meta.configKey}-disabled`),
      ).toBeNull();
    }
  });
});
