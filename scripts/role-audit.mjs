// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * Walks every canonical identity over the reviewed routes and records what
 * the product actually does for that role: where the route lands, what the
 * page says, and which actions are offered.
 *
 * The result is the capability matrix, taken from the running product
 * rather than from intent.
 *
 *   node scripts/role-audit.mjs            table + screenshots/role-audit.json
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const APP = process.env.BUTLER_APP_URL ?? 'http://localhost:3000';
const API = process.env.BUTLER_API_URL ?? 'http://localhost:7007';
const OUT = process.env.BUTLER_ROLE_SHOTS ?? 'screenshots';
const TEAM = process.env.BUTLER_ROLE_TEAM ?? 'platform-engineering';
const CLUSTER = process.env.BUTLER_ROLE_CLUSTER ?? 'e2e-talos';

const ROUTES = [
  ['overview', '/butler'],
  ['admin-overview', '/butler/admin'],
  ['admin-clusters', '/butler/admin/clusters'],
  ['management', '/butler/admin/management'],
  ['teams', '/butler/admin/teams'],
  ['team-detail', `/butler/admin/teams/${TEAM}`],
  ['users', '/butler/admin/users'],
  ['providers', '/butler/admin/providers'],
  ['identity-providers', '/butler/admin/identity-providers'],
  ['platform-settings', '/butler/admin/settings'],
  ['team-dashboard', `/butler/t/${TEAM}`],
  ['team-clusters', `/butler/t/${TEAM}/clusters`],
  ['cluster-detail', `/butler/t/${TEAM}/clusters/${TEAM}/${CLUSTER}`],
  ['create-cluster', `/butler/t/${TEAM}/clusters/new`],
  ['members', `/butler/t/${TEAM}/members`],
  ['team-settings', `/butler/t/${TEAM}/settings`],
];

// Actions worth knowing about per surface.
const ACTIONS = [
  'Create Cluster',
  'Add Member',
  'Add User',
  'Add Provider',
  'Delete',
  'Delete Team',
  'Save Changes',
  'Add Team',
  'Create Team',
];

async function main() {
  const { identities } = await (
    await fetch(`${API}/api/butler/_dev/identities`)
  ).json();
  const browser = await chromium.launch();
  const rows = [];
  for (const identity of identities) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    await page.goto(`${APP}/`, { waitUntil: 'networkidle' });
    const guest = page.getByRole('button', { name: /enter/i });
    if (await guest.count()) {
      await guest.first().click();
      await page.waitForLoadState('networkidle');
    }
    await page.goto(
      `${API}/api/butler/_dev/act-as/${identity.key}?to=/butler`,
      {
        waitUntil: 'domcontentloaded',
      },
    );
    for (const [name, path] of ROUTES) {
      await page
        .goto(`${APP}${path}`, { waitUntil: 'networkidle' })
        .catch(() => {});
      // Identity resolves before the route guards decide, so wait for the
      // role banner the resolved session renders rather than a fixed pause.
      await page
        .getByText(
          /ADMIN MODE|SHADOW MODE|TEAM ADMIN|TEAM OPERATOR|TEAM VIEWER/,
        )
        .first()
        .waitFor({ timeout: 15000 })
        .catch(() => {});
      await page.waitForTimeout(2500);
      const landed = new URL(page.url()).pathname;
      const main = (
        await page
          .locator('main')
          .innerText()
          .catch(() => '')
      )
        .replace(/\s+/g, ' ')
        .trim();
      const heading = (
        await page
          .locator('h1')
          .allInnerTexts()
          .catch(() => [])
      )
        .join(' / ')
        .slice(0, 40);
      const actions = [];
      for (const action of ACTIONS) {
        const count = await page
          .getByRole('button', { name: new RegExp(`^${action}$`) })
          .count()
          .catch(() => 0);
        if (count) actions.push(action);
      }
      rows.push({
        role: identity.key,
        route: name,
        redirected: landed !== path,
        landed,
        heading,
        denied: /Access Denied/i.test(main),
        notFound: /Page not found/i.test(main),
        actions,
      });
    }
    await context.close();
    process.stdout.write(`  audited ${identity.key}\n`);
  }
  await browser.close();
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'role-audit.json'), JSON.stringify(rows, null, 1));

  const roles = identities.map(i => i.key);
  const width = 20;
  process.stdout.write(
    `\n${'route'.padEnd(width)}${roles
      .map(r => r.slice(0, 15).padEnd(17))
      .join('')}\n`,
  );
  for (const [name] of ROUTES) {
    const cells = roles.map(role => {
      const row = rows.find(r => r.role === role && r.route === name);
      if (!row) return '?'.padEnd(17);
      let cell;
      if (row.denied) cell = 'DENIED';
      else if (row.notFound) cell = 'NOT FOUND';
      else if (row.redirected) cell = 'REDIRECTED';
      else cell = row.actions.length ? `VIEW+${row.actions.length}` : 'VIEW';
      return cell.padEnd(17);
    });
    process.stdout.write(`${name.padEnd(width)}${cells.join('')}\n`);
  }
  process.stdout.write(`\n  detail in ${join(OUT, 'role-audit.json')}\n`);
}

main().catch(err => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
