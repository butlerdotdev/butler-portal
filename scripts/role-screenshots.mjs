// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * Captures every canonical identity on every reviewed route, in both
 * themes, so a change can be inspected through all five authorization
 * perspectives at once.
 *
 * Output: screenshots/<role>/<theme>-<route>.png
 *
 *   node scripts/role-screenshots.mjs
 *   node scripts/role-screenshots.mjs /butler/admin/clusters
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DEV_IDENTITY_HEADER = 'x-butler-dev-identity';

const APP = process.env.BUTLER_APP_URL ?? 'http://localhost:3000';
// The identity list comes from the backend directly; the app port serves
// the SPA and would answer this with HTML.
const API = process.env.BUTLER_API_URL ?? 'http://localhost:7007';
const OUT = process.env.BUTLER_ROLE_SHOTS ?? 'screenshots';
const WIDTH = Number(process.env.BUTLER_ROLE_WIDTH ?? 1280);
const TEAM = process.env.BUTLER_ROLE_TEAM ?? 'platform-engineering';
const CLUSTER = process.env.BUTLER_ROLE_CLUSTER ?? 'e2e-talos';

const ROUTES = [
  ['overview', '/butler'],
  ['teams', '/butler/admin/teams'],
  ['team-detail', `/butler/admin/teams/${TEAM}`],
  ['admin-clusters', '/butler/admin/clusters'],
  ['team-dashboard', `/butler/t/${TEAM}`],
  ['team-clusters', `/butler/t/${TEAM}/clusters`],
  ['cluster-detail', `/butler/t/${TEAM}/clusters/${TEAM}/${CLUSTER}`],
  ['create-cluster', `/butler/t/${TEAM}/clusters/new`],
  ['members', `/butler/t/${TEAM}/members`],
  ['users', '/butler/admin/users'],
  ['admin-networks', '/butler/admin/networks'],
];

/**
 * Backstage guest sign-in. The card has to be gone before anything is
 * captured, otherwise the run quietly produces a directory of sign-in
 * pages. Clicking once and hoping is what made earlier runs unreliable,
 * so this confirms the card is dismissed before returning.
 */
async function signIn(page) {
  for (let attempt = 0; attempt < 6; attempt++) {
    await page.goto(`${APP}/`, { waitUntil: 'networkidle' }).catch(() => {});
    const guest = page.getByRole('button', { name: /^enter$/i });
    if ((await guest.count()) === 0) return true;
    await guest
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(1200);
    await page.waitForLoadState('networkidle').catch(() => {});
    if ((await page.getByRole('button', { name: /^enter$/i }).count()) === 0) {
      return true;
    }
  }
  return false;
}

async function main() {
  const only = process.argv[2];
  const routes = only ? [['route', only]] : ROUTES;

  const res = await fetch(`${API}/api/butler/_dev/identities`);
  if (!res.ok) {
    throw new Error(
      `The portal at ${APP} is not serving the role harness (${res.status}). ` +
        'Start it with `yarn dev:roles:server`.',
    );
  }
  const { identities } = await res.json();

  const browser = await chromium.launch();
  const summary = [];
  for (const identity of identities) {
    for (const theme of ['light', 'dark']) {
      // A context per identity and theme keeps the cookie jars apart.
      const context = await browser.newContext({
        viewport: { width: WIDTH, height: 900 },
        colorScheme: theme,
      });
      // Seed the identity before any page loads. Relying only on the act-as
      // redirect leaves a race: the first /_identity call can go out before
      // the cookie is readable, and the session then resolves as the guest
      // identity for the rest of its life.
      await context.addCookies([
        {
          name: 'butler-dev-identity',
          value: identity.key,
          domain: 'localhost',
          path: '/',
        },
      ]);
      const page = await context.newPage();
      // Every identity the app puts on a butler request. A capture that
      // did not send the identity under review is not evidence about it,
      // so the run reports that rather than presenting the screenshot.
      const claimed = new Set();
      page.on('request', r => {
        if (!r.url().includes('/api/butler/')) return;
        const header = r.headers()[DEV_IDENTITY_HEADER];
        if (header) claimed.add(header);
      });
      // A Backstage session first, then the identity this session reviews.
      // Without the sign-in every capture is just the sign-in card.
      const signedIn = await signIn(page);
      await page.goto(
        `${API}/api/butler/_dev/act-as/${identity.key}?to=/butler`,
        {
          waitUntil: 'domcontentloaded',
        },
      );
      // The theme belongs to the app origin, not the backend's.
      await page.goto(`${APP}/butler`, { waitUntil: 'domcontentloaded' });
      await signIn(page);
      await page.evaluate(t => localStorage.setItem('theme', t), theme);
      const dir = join(OUT, identity.key);
      mkdirSync(dir, { recursive: true });
      for (const [name, path] of routes) {
        await page
          .goto(`${APP}${path}`, { waitUntil: 'networkidle' })
          .catch(() => {});
        await page.waitForTimeout(2200);
        const file = join(dir, `${theme}-${name}.png`);
        await page.screenshot({ path: file, fullPage: true });
        const heading = (await page.locator('h1').allInnerTexts()).join(' / ');
        const denied = await page
          .getByText(/access denied|not found|forbidden/i)
          .count();
        summary.push({
          role: identity.key,
          theme,
          route: name,
          path: new URL(page.url()).pathname,
          heading: heading.slice(0, 60),
          denied: denied > 0,
          signedIn,
          sentIdentity: [...claimed].join(',') || 'none',
          verified: signedIn && claimed.size === 1 && claimed.has(identity.key),
        });
      }
      await context.close();
    }
    process.stdout.write(`  captured ${identity.key}\n`);
  }
  await browser.close();
  mkdirSync(OUT, { recursive: true });
  writeFileSync(
    join(OUT, 'role-matrix.json'),
    JSON.stringify(summary, null, 1),
  );
  const unverified = summary.filter(row => !row.verified);
  process.stdout.write(
    `\n  ${summary.length} screenshots, summary in ${join(
      OUT,
      'role-matrix.json',
    )}\n`,
  );
  if (unverified.length) {
    process.stdout.write(
      `  ${unverified.length} capture(s) did not send the identity under ` +
        'review and should not be read as evidence about that role\n',
    );
  }
}

main().catch(err => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
