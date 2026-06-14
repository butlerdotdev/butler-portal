/*
 * Copyright 2026 The Butler Authors.
 * Apache 2.0 license.
 */

import { expect, test, Page } from '@playwright/test';

// 0.5.1 GATE: the load-bearing assertion. The runtime boot-test in
// run-051-boot-test.sh proves the BACKEND scanner registers and serves
// the test plugin's Remote entry through /.backstage/dynamic-features/
// remotes. That alone is not enough -- the 0.5.0 stub returned the
// expected JSON shape from a hardcoded fallback. This spec proves the
// FRONTEND bridge: ScalprumRoot fetches /remotes, mfRuntime initializes
// @module-federation/runtime with the remote and the host shared
// modules, DynamicPluginsLoader calls loadRemote() and reads
// dynamicPluginsExports, mounts the route, the component renders.
//
// If the marker is visible at /hello-dynamic-plugin, every link in the
// chain held:
//   1. ScalprumRoot fetched /.backstage/dynamic-features/remotes
//   2. The Remote[] response parsed and shaped correctly
//   3. initializeMfRuntime registered the remote and shared singletons
//   4. @module-federation/runtime downloaded the remote's
//      mf-manifest.json and the federated chunks from
//      /.backstage/dynamic-features/remotes/<pkg>/...
//   5. DynamicPluginsLoader loaded `.` (the package root expose) and
//      read dynamicPluginsExports.dynamicRoutes
//   6. For each dynamicRoute it resolved the importName off the same
//      module and built the React element
//   7. Wrote the element + route metadata into DynamicRootContext
//   8. DataDrivenFlatRoutes mounted <Route path="/hello-dynamic-plugin">
//      sourced the element from context and rendered HelloPage
//   9. HelloPage rendered the marker div with the literal text
//
// Failure mode the gate prevents: 0.5.0 shipped a stub that hardcoded
// "RDS dynamic frontend remotes will be supported in 0.5.1+" and
// returned an empty Remote[] for any input. The static Butler Labs
// plugins kept working because they are mounted by createApp at build
// time, not through the dynamic bridge. No frontend assertion existed,
// so the stub passed CI. The marker visibility check at the configured
// route catches this exact regression class.

const MARKER_TEXT =
  process.env.DYNAMIC_PLUGIN_MARKER ??
  'Hello from the Butler Portal dynamic-plugins runtime';
const MARKER_ROUTE = process.env.DYNAMIC_PLUGIN_ROUTE ?? '/hello-dynamic-plugin';

async function signInAsGuest(page: Page) {
  await page.goto('/');
  const guestSection = page.locator('li').filter({ hasText: /^Guest/ });
  const guestEnter = guestSection.getByRole('button', { name: /^Enter$/i });
  await guestEnter.waitFor({ state: 'visible', timeout: 30_000 });
  await guestEnter.click();
  await guestSection.waitFor({ state: 'detached', timeout: 15_000 });
}

test.describe('0.5.1 dynamic-plugins runtime marker', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', err => {
      console.error('page error:', err);
    });
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('ButlerPortal') || msg.type() === 'error' || msg.type() === 'warning') {
        console.log(`[browser ${msg.type()}]`, text);
      }
    });
    await signInAsGuest(page);
  });

  test('marker is visible at the configured dynamic route', async ({ page }) => {
    await page.goto(MARKER_ROUTE);
    await page.waitForLoadState('networkidle');

    // URL did not silently redirect away from the dynamic route.
    await expect(page).toHaveURL(new RegExp(`${MARKER_ROUTE}(/|$)`));

    // Not the sign-in fallback (which would let the marker check pass
    // vacuously on an unauthenticated render).
    const signInGuestTile = page.locator('li').filter({ hasText: /^Guest/ });
    await expect(signInGuestTile).toHaveCount(0);

    // THE GATE: the marker emitted by HelloPage is visible on the page.
    // Anchor on the data-testid so this does not match the Backstage
    // chrome (banners, tooltips, the NotFound fallback would not have
    // this element).
    const marker = page.getByTestId('hello-dynamic-plugin-marker');
    await expect(marker).toBeVisible({ timeout: 30_000 });
    await expect(marker).toHaveText(MARKER_TEXT);

    // Backstage's NotFound fallback contains "404" text and would not
    // render the testid above; we still assert it is absent to make a
    // regression to the 404-route surface obvious in test output.
    const notFound = page.getByText(/404|Page not found/i);
    await expect(notFound).toHaveCount(0);

    // The 0.5.0 stub marker (if it ever resurfaces) must not appear.
    const stubMarker = page.getByText(
      /dynamic frontend remotes will be supported in 0\.5\.1/i,
    );
    await expect(stubMarker).toHaveCount(0);
  });
});
