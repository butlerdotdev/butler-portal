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

const APP = process.env.BUTLER_APP_URL ?? 'http://localhost:3000';
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
];

async function main() {
  const only = process.argv[2];
  const routes = only ? [['route', only]] : ROUTES;

  const res = await fetch(`${APP}/api/butler/_dev/identities`);
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
      const page = await context.newPage();
      await page.goto(
        `${APP}/api/butler/_dev/act-as/${identity.key}?to=/butler`,
        {
          waitUntil: 'domcontentloaded',
        },
      );
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
  process.stdout.write(
    `\n  ${summary.length} screenshots, summary in ${join(
      OUT,
      'role-matrix.json',
    )}\n`,
  );
}

main().catch(err => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
