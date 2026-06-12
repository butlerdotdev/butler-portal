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
import { act } from '@testing-library/react';
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

  it('renders Chambers as disabled on the homepage when workspaces is on but Butler is off (surface consistency with the sidebar and the not-enabled page)', async () => {
    // The dependency model: Chambers needs Butler's backend at runtime.
    // The route element renders the "Chambers requires Butler" page on
    // click; the sidebar item is greyed. The homepage card must match or
    // the user sees an enabled card that lands on a disabled page, which
    // is the surface drift the runtime-state helper exists to prevent.
    const r = await renderCards({ workspaces: true });
    expect(r.queryByTestId('homepage-card-workspaces')).toBeNull();
    const dependencyBlocked = r.queryByTestId(
      'homepage-card-workspaces-disabled',
    );
    expect(dependencyBlocked).not.toBeNull();
    expect(dependencyBlocked?.getAttribute('aria-disabled')).toBe('true');
    // Sanity: the unrelated plugins follow their own flags. Butler's flag
    // is false here so it is also disabled, but that is not the dep case.
    expect(r.queryByTestId('homepage-card-butler-disabled')).not.toBeNull();
  });

  it('renders Chambers as enabled when both workspaces and butler are on (Butler Labs deployment baseline)', async () => {
    const r = await renderCards({ workspaces: true, butler: true });
    expect(r.queryByTestId('homepage-card-workspaces')).not.toBeNull();
    expect(r.queryByTestId('homepage-card-workspaces-disabled')).toBeNull();
    expect(r.queryByTestId('homepage-card-butler')).not.toBeNull();
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

  // a11y: keyboard reachability + focus-triggered tooltip + describedby

  it('keeps disabled cards in the natural tab order (keyboard-reachable)', async () => {
    const r = await renderCards({});
    for (const meta of BUTLER_LABS_PLUGINS) {
      const card = r.queryByTestId(
        `homepage-card-${meta.configKey}-disabled`,
      ) as HTMLElement | null;
      // The card is a real <a href> so it sits in the native tab order even
      // with aria-disabled="true" (unlike the disabled attribute on form
      // controls which removes focusability).
      act(() => {
        card?.focus();
      });
      expect(document.activeElement).toBe(card);
    }
  });

  it('surfaces the brand name and the themed Origin lore on each disabled card (config-key call-to-action lives on PluginNotEnabledPage, covered by AppRoutes.test.tsx)', async () => {
    // The card hover-tooltip was intentionally removed: the disabled state
    // now reads through the visual treatment (greyed wrapper, mascot
    // watermark, brand-tinted glow) and the inline Origin badge whose
    // tooltip carries the themed role. The config-key copy moved to
    // PluginNotEnabledPage, which the click lands on, so this test pins the
    // homepage surface and leaves the operator call-to-action to the
    // not-enabled page tests.
    const r = await renderCards({});
    const card = r.queryByTestId('homepage-card-registry-disabled') as HTMLElement | null;
    expect(card?.tagName).toBe('A');
    // Brand name on the card itself.
    expect(r.container.innerHTML).toMatch(/Keeper/);
    // Origin badge wired up with the themed hint as a MUI Tooltip title.
    // MUI v4 renders string titles to the HTML title attribute on the
    // cloned child, so the lore appears in container.innerHTML even when
    // the tooltip popper is not open.
    const originBadge = r.container.querySelector(
      '[aria-label="Keeper origin"]',
    );
    expect(originBadge).not.toBeNull();
    expect(r.container.innerHTML).toMatch(/Keeper of the Wardrobe/);
  });
});
