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

import { renderInTestApp } from '@backstage/test-utils';
import { BUTLER_LABS_PLUGINS } from '../plugins/butlerLabsPluginsMeta';
import { ButlerLabsSubmenuItem } from './ButlerLabsSubmenuItem';

// These tests pin the discoverable-but-disabled sidebar affordance:
// SidebarSubmenuItem has no disabled prop, so the disabled state is composed
// at the wrapper level via a Tooltip + aria-disabled span with reduced
// opacity. The route target is unchanged; the route element in App.tsx
// switches to the branded PluginNotEnabledPage when the flag is off.

const renderItem = async (
  configKey: 'butler' | 'workspaces' | 'registry' | 'pipeline',
  enabled: boolean,
) => {
  const meta = BUTLER_LABS_PLUGINS.find(p => p.configKey === configKey)!;
  return renderInTestApp(<ButlerLabsSubmenuItem meta={meta} enabled={enabled} />);
};

describe('ButlerLabsSubmenuItem disabled affordance', () => {
  it.each(BUTLER_LABS_PLUGINS.map(p => [p.configKey, p.brandName]))(
    'wraps the %s (%s) item in an aria-disabled span when disabled',
    async configKey => {
      const r = await renderItem(configKey as any, false);
      const wrapper = r.queryByTestId(
        `butler-labs-submenu-item-disabled-${configKey}`,
      );
      expect(wrapper).not.toBeNull();
      expect(wrapper?.getAttribute('aria-disabled')).toBe('true');
    },
  );

  it.each(BUTLER_LABS_PLUGINS.map(p => [p.configKey, p.brandName]))(
    'renders the %s (%s) item without the disabled wrapper when enabled',
    async configKey => {
      const r = await renderItem(configKey as any, true);
      expect(
        r.queryByTestId(`butler-labs-submenu-item-disabled-${configKey}`),
      ).toBeNull();
    },
  );

  it('keeps the disabled item routable to the same path as the enabled item (clicking lands on PluginNotEnabledPage, not a dead link)', async () => {
    // Both states render a SidebarSubmenuItem with the same to=<routePath>;
    // the disabled wrapper does not change navigation. This is the discover-
    // ability contract: a customer clicking a greyed item lands on the
    // branded not-enabled page rather than getting nowhere.
    const offRender = await renderItem('registry', false);
    const onRender = await renderItem('registry', true);
    const offLink = offRender.container.querySelector('a[href*="registry"]');
    const onLink = onRender.container.querySelector('a[href*="registry"]');
    expect(offLink?.getAttribute('href')).toBe(onLink?.getAttribute('href'));
  });
});
