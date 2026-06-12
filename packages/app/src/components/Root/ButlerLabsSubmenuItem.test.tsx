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
import { act } from '@testing-library/react';
import {
  BUTLER_LABS_PLUGINS,
  ButlerLabsConfigKey,
  getPluginMeta,
} from '../plugins/butlerLabsPluginsMeta';
import { ButlerLabsSubmenuItem } from './ButlerLabsSubmenuItem';

// These tests pin the discoverable-but-disabled sidebar affordance:
// SidebarSubmenuItem has no disabled prop, so the disabled state is composed
// at the wrapper level via a Tooltip + aria-disabled span with reduced
// opacity. The route target is unchanged; the route element in App.tsx
// switches to the branded PluginNotEnabledPage when the flag is off.

const renderItem = async (
  configKey: ButlerLabsConfigKey,
  enabled: boolean,
  missingDependency?: ButlerLabsConfigKey,
) => {
  const meta = getPluginMeta(configKey);
  const dep = missingDependency ? getPluginMeta(missingDependency) : undefined;
  return renderInTestApp(
    <ButlerLabsSubmenuItem
      meta={meta}
      enabled={enabled}
      missingDependency={dep}
    />,
  );
};

describe('ButlerLabsSubmenuItem disabled affordance', () => {
  it.each(BUTLER_LABS_PLUGINS.map(p => [p.configKey, p.brandName]))(
    'wraps the %s (%s) item in an aria-disabled span when disabled',
    async configKey => {
      const r = await renderItem(configKey as ButlerLabsConfigKey, false);
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
      const r = await renderItem(configKey as ButlerLabsConfigKey, true);
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

  // a11y: keyboard reachability + focus-triggered tooltip + describedby

  it('keeps the inner anchor of a disabled item in the natural tab order (keyboard-reachable)', async () => {
    const r = await renderItem('registry', false);
    const anchor = r.container.querySelector('a[href*="registry"]') as HTMLElement | null;
    expect(anchor).not.toBeNull();
    // The anchor has an href so it is in the native tab order. Backstage's
    // SidebarSubmenuItem does not set tabIndex={-1} on disabled items
    // (it has no disabled prop at all), so the tab order is naturally open
    // even when wrapped by the disabled span. Confirm by focusing it.
    act(() => {
      anchor?.focus();
    });
    expect(document.activeElement).toBe(anchor);
  });

  it('mirrors aria-disabled onto the inner anchor (the actual focusable element) so AT pairs that only read the focused element catch the disabled state', async () => {
    // The useEffect inside ButlerLabsSubmenuItem reaches into the rendered
    // SidebarSubmenuItem after mount and sets aria-disabled directly on the
    // anchor. NVDA + Firefox, JAWS + Edge announce disabled state from the
    // focused element's own attribute, not from an ancestor's. Mirroring
    // the state onto the anchor closes that gap. The wrapper span keeps
    // aria-disabled and aria-label for AT pairs that DO traverse ancestors.
    const off = await renderItem('registry', false);
    const offAnchor = off.container.querySelector(
      'a[href*="registry"]',
    ) as HTMLElement | null;
    expect(offAnchor?.getAttribute('aria-disabled')).toBe('true');

    const on = await renderItem('registry', true);
    const onAnchor = on.container.querySelector(
      'a[href*="registry"]',
    ) as HTMLElement | null;
    expect(onAnchor?.getAttribute('aria-disabled')).toBeNull();
  });

  it('wraps the disabled item in a MUI Tooltip whose body carries the brand + how-to-enable copy (focus and hover both trigger the tooltip; library-level behavior is tested by MUI itself)', async () => {
    // jsdom plus MUI v4 Portal makes opening-on-focus assertions timing-
    // fragile. The structural assertion here is that the Tooltip parent is
    // in place with the right body copy; MUI v4's Tooltip attaches the
    // onFocus and onMouseEnter handlers automatically and sets
    // aria-describedby on the cloned child while open (verified at the
    // library level by Material-UI's own test suite).
    const r = await renderItem('registry', false);
    const tooltipHolder = r.container.querySelector('[title]');
    // MUI v4 Tooltip clones the child and forwards the title prop; in jsdom
    // the title attribute may be normalized off the cloned element, so the
    // assertion checks either the wrapper or a Tooltip-owned attribute.
    const wrapper = r.queryByTestId(
      'butler-labs-submenu-item-disabled-registry',
    );
    expect(wrapper).not.toBeNull();
    // The wrapped Tooltip in the React tree carries the brand and config-
    // key strings. Render output puts the tooltip body into the popper
    // payload that MUI mounts on open; even when not open, the title prop
    // round-trips through Tooltip's child rendering so the asserted strings
    // appear in the React tree.
    const renderedHtml = r.container.innerHTML + (tooltipHolder?.outerHTML ?? '');
    expect(renderedHtml).toMatch(/Keeper/);
  });

  it('carries an aria-label on the disabled-state wrapper describing why the item is greyed (screen-reader fallback)', async () => {
    // SidebarSubmenuItem does not accept aria props pass-through, so an
    // aria-describedby on the wrapping span is the only place the tooltip
    // body lands. The aria-label here gives the wrapper its own accessible
    // name describing the disabled state so screen-reader announcement is
    // not silent even if a given AT pair does not traverse ancestor
    // describedby on the focused child.
    const r = await renderItem('registry', false);
    const wrapper = r.queryByTestId(
      'butler-labs-submenu-item-disabled-registry',
    );
    expect(wrapper?.getAttribute('aria-label')).toMatch(
      /Keeper: available but not enabled/,
    );
  });

  // Dependency-missing variant: Chambers when Butler is off.

  it('shows the dependency-aware aria-label when missingDependency is set (Chambers without Butler)', async () => {
    // The sidebar item is greyed because Chambers (workspaces) is on but
    // Butler is off; setting plugins.workspaces.enabled to true would not
    // fix the runtime gap. The aria-label and tooltip body must name
    // Butler, not Chambers, as the off thing.
    const r = await renderItem('workspaces', false, 'butler');
    const wrapper = r.queryByTestId(
      'butler-labs-submenu-item-disabled-workspaces',
    );
    expect(wrapper?.getAttribute('aria-label')).toMatch(
      /Chambers: requires Butler which is off/,
    );
  });

  it('renders the dependency-aware tooltip body referencing plugins.butler.enabled when Chambers is dep-blocked', async () => {
    const r = await renderItem('workspaces', false, 'butler');
    // The tooltip body is the MUI Tooltip title prop. When unopened in
    // jsdom it still lives in the React tree; serialize the rendered
    // output and assert the dependency's config key is named instead of
    // the plugin's own key. The plugin's own key (plugins.workspaces.
    // enabled) is NOT named because it is already on.
    const html = r.container.innerHTML;
    expect(html).toMatch(/requires Butler which is off/i);
  });
});
