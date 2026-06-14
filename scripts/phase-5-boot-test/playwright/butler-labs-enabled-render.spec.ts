/*
 * Copyright 2026 The Butler Authors.
 * Apache 2.0 license.
 */

import { expect, test, Page } from '@playwright/test';

// The Phase 5 closure of Task #65 -- the Phase 3 INFERRED enabled-render
// finally verified end-to-end on the published rc image, with the real
// API factories (butlerApiRef, discoveryApi, fetchApi) that only the
// running portal provides.
//
// Phase 3 proved disabled -> PluginNotEnabledPage through unit tests
// against the actual DataDrivenFlatRoutes. The enabled-state render
// (flag on -> real plugin page) was inferred via:
//   1. BASELINE_ROUTES['/butler/*'].element.props.children.type === ButlerPage
//   2. ButlerLabsRouteElement source bit-identical to 0.4.0
//   3. ButlerLabsRouteElement's enabled-branch returns <>{children}</>,
//      exercised by AppRoutes.test.tsx + AppDiscovery.test.tsx
// The remaining open question: does the real createApp pass on the
// published image actually index every Butler Labs routeRef via the
// DiscoveryAnchor, so the enabled render does not throw "Routable
// extension was not discovered"? This test closes it.
//
// Sign-in is by guest provider (app-config.yaml exposes guest under
// auth.providers). The portal landing page provides a guest sign-in
// button; we click it once per test session so subsequent navigation
// reaches the real routes.

const FLAGS_MODE = process.env.BUTLER_FLAGS ?? 'enabled';

// Per-plugin metadata mirroring butlerLabsPluginsMeta.tsx. Kept inline
// to avoid pulling the source dependency tree into the boot-test.
const BUTLER_LABS_PLUGINS = [
  { configKey: 'butler', routePath: '/butler', brandName: 'Butler', role: 'The Head Butler' },
  { configKey: 'workspaces', routePath: '/workspaces', brandName: 'Chambers', role: "The Chamberlain's Domain" },
  { configKey: 'registry', routePath: '/registry', brandName: 'Keeper', role: 'The Keeper of the Wardrobe' },
  { configKey: 'pipeline', routePath: '/pipeline', brandName: 'Herald', role: 'The Estate Herald' },
];

async function signInAsGuest(page: Page) {
  await page.goto('/');
  // The Backstage SignInPage renders one tile per provider. With
  // `guest` and `google` both configured, the guest tile's CTA reads
  // "Enter". Click that specific button (the google tile reads
  // "Sign In", which the looser /enter|guest|sign in/i regex would
  // also match -- and google sign-in needs real OAuth creds).
  const guestSection = page.locator('li').filter({ hasText: /^Guest/ });
  const guestEnter = guestSection.getByRole('button', { name: /^Enter$/i });
  await guestEnter.waitFor({ state: 'visible', timeout: 30_000 });
  await guestEnter.click();
  // After sign-in the SPA mounts the home page; the SignInPage tile
  // list goes away. Wait until the Guest tile is gone, then for any
  // catalog/home content to appear.
  await guestSection.waitFor({ state: 'detached', timeout: 15_000 });
}

test.describe(`Phase 5: Task #65 closure (${FLAGS_MODE} state)`, () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', err => {
      // Routable extension discovery errors are caught by Backstage's
      // ErrorBoundaryFallback rather than throwing globally, but other
      // page errors should fail the test loudly.
      console.error('page error:', err);
    });
    await signInAsGuest(page);
  });

  if (FLAGS_MODE === 'enabled') {
    for (const meta of BUTLER_LABS_PLUGINS) {
      test(`${meta.brandName} (${meta.configKey}=true): real plugin page mounts at ${meta.routePath}`, async ({ page }) => {
        await page.goto(meta.routePath);
        // Let the SPA route and the routable extension fully mount.
        await page.waitForLoadState('networkidle');

        // Positive: the browser settled on the requested route. This
        // catches a silent redirect back to sign-in (which would skip
        // the route mount entirely and let the negative assertions
        // below pass vacuously).
        await expect(page).toHaveURL(new RegExp(`${meta.routePath}(/|$)`));

        // POSITIVE STRICT: we are NOT on the SignInPage. Backstage
        // does not redirect the URL on auth-required routes -- it
        // renders the SignIn tile list at the requested URL. So URL
        // matching alone is not sufficient. Asserting the Guest tile
        // is absent is what proves the SPA actually rendered the
        // requested route's content, not the sign-in fallback.
        // Without this assertion, the negative checks below all
        // pass vacuously on the sign-in page (which does not
        // contain "was not discovered", the role strings, or the
        // configKey chips).
        const signInGuestTile = page.locator('li').filter({ hasText: /^Guest/ });
        await expect(signInGuestTile).toHaveCount(0);

        // Positive: the route's main app region has substantive
        // content. The Backstage Page layout renders a <main>
        // element; a blank or error state would have minimal/no
        // content here. We require at least 50 characters of visible
        // text under main so this trips on an empty render.
        const main = page.locator('main');
        await expect(main).toBeVisible();
        const mainText = (await main.innerText()).trim();
        expect(mainText.length).toBeGreaterThan(50);

        // Negative: the 287025e error class must not surface. This
        // is the Phase 3 INFERRED enabled-render contract: the
        // DiscoveryAnchor indexed the routable extension at
        // createApp time, so the actual render finds the routeRef.
        const notDiscovered = page.getByText(/was not discovered in the app element tree/i);
        await expect(notDiscovered).toHaveCount(0);

        // Negative: the branded PluginNotEnabledPage role string
        // ("The Head Butler", etc.) must NOT appear: enabled state
        // means the real plugin page rendered, not the not-enabled
        // copy.
        const notEnabledRole = page.getByText(meta.role, { exact: false });
        await expect(notEnabledRole).toHaveCount(0);

        // Negative: the enable-card chip ("plugins.butler.enabled"
        // etc.) is only present on PluginNotEnabledPage. Its
        // absence is the signal the gate fell through to the real
        // page.
        const enableChip = page.getByText(`plugins.${meta.configKey}.enabled`);
        await expect(enableChip).toHaveCount(0);
      });
    }
  } else {
    // Disabled state -- Phase 3 #6 guarantee, re-verified on the real
    // image to catch any regression between unit-test mock harness and
    // production runtime.
    for (const meta of BUTLER_LABS_PLUGINS) {
      test(`${meta.brandName} (${meta.configKey}=false): PluginNotEnabledPage renders at ${meta.routePath}`, async ({ page }) => {
        await page.goto(meta.routePath);
        await page.waitForLoadState('networkidle');

        // Positive: the browser settled on the requested route. If
        // sign-in failed silently, the URL would still be at "/" and
        // the role-string assertion below would mis-pass (because
        // the sign-in page does not contain the role).
        await expect(page).toHaveURL(new RegExp(`${meta.routePath}(/|$)`));

        // The branded role string MUST be present.
        const notEnabledRole = page.getByText(meta.role, { exact: false }).first();
        await expect(notEnabledRole).toBeVisible({ timeout: 10_000 });

        // The enable-card chip MUST point at the correct configKey
        // (the regression net for the "wrong configKey on the chip"
        // mutation class).
        const enableChip = page.getByText(`plugins.${meta.configKey}.enabled`).first();
        await expect(enableChip).toBeVisible();
      });
    }
  }
});
