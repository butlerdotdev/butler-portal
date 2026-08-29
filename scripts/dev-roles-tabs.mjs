// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * Local role review in a single browser window, one tab per identity.
 *
 * Tabs share a cookie jar, so the identity cannot travel in a cookie here.
 * Each tab claims its own identity from `?devRole=` and keeps it in
 * sessionStorage, which is per tab, so five tabs of one window review five
 * different roles against the same portal and the same data.
 *
 * As with the separate-window launcher, this only stands in for the
 * Backstage sign-in step: butler-server still authorizes every request for
 * the user the tab acts as.
 *
 *   node scripts/dev-roles-tabs.mjs                 open the tabs on /butler
 *   node scripts/dev-roles-tabs.mjs /butler/admin   open them on one route
 */
import { chromium } from 'playwright';
import { createInterface } from 'node:readline';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const APP = process.env.BUTLER_APP_URL ?? 'http://localhost:3000';
const API = process.env.BUTLER_API_URL ?? 'http://localhost:7007';
const PROFILE =
  process.env.BUTLER_ROLE_PROFILE ?? join(tmpdir(), 'butler-role-review-tabs');
const SHOTS = process.env.BUTLER_ROLE_SHOTS ?? 'screenshots/role-review';

async function main() {
  const startRoute = process.argv[2] ?? '/butler';
  const res = await fetch(`${API}/api/butler/_dev/identities`);
  if (!res.ok) {
    throw new Error(
      `The portal at ${API} is not serving the role harness (${res.status}). ` +
        'Start it with `yarn dev:roles:server`.',
    );
  }
  const { identities } = await res.json();

  const context = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    viewport: null,
    args: ['--window-size=1600,1000', '--window-position=0,0'],
  });

  // One Backstage sign-in for the window; the tabs differ by identity, not
  // by session.
  const first = context.pages()[0] ?? (await context.newPage());
  await first.goto(`${APP}/`, { waitUntil: 'networkidle' }).catch(() => {});
  const guest = first.getByRole('button', { name: /enter/i });
  if (await guest.count()) {
    await guest.first().click();
    await first.waitForLoadState('networkidle').catch(() => {});
  }

  const url = (key, route) =>
    `${APP}${route}${route.includes('?') ? '&' : '?'}devRole=${key}`;

  const tabs = [];
  for (const [i, identity] of identities.entries()) {
    const page = i === 0 ? first : await context.newPage();
    await page
      .goto(url(identity.key, startRoute), { waitUntil: 'domcontentloaded' })
      .catch(() => {});
    tabs.push({ identity, page });
  }
  await tabs[0].page.bringToFront();

  process.stdout.write('\nButler Role Review, one window\n\n');
  for (const [i, t] of tabs.entries()) {
    process.stdout.write(
      `  tab ${i + 1}  ${(t.identity.label ?? t.identity.key).padEnd(16)} ${
        t.identity.email
      }\n`,
    );
  }
  process.stdout.write(
    '\n  Every tab is the same portal and the same data.\n' +
      '  butler-server authorizes each tab for the user it acts as.\n\n',
  );

  const goAll = async route => {
    const path = route.startsWith('/') ? route : `/${route}`;
    await Promise.all(
      tabs.map(t =>
        t.page
          .goto(url(t.identity.key, path), { waitUntil: 'domcontentloaded' })
          .catch(err =>
            process.stdout.write(`  ${t.identity.key}: ${err.message}\n`),
          ),
      ),
    );
    process.stdout.write(`  all five -> ${path}\n`);
  };

  const shotAll = async () => {
    mkdirSync(SHOTS, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    for (const t of tabs) {
      const file = join(SHOTS, `${stamp}-${t.identity.key}.png`);
      await t.page.screenshot({ path: file, fullPage: true });
      process.stdout.write(`  ${file}\n`);
    }
  };

  if (!process.stdin.isTTY) {
    process.stdout.write(
      '  Not attached to a terminal, so the tabs stay open and the route\n' +
        '  prompt is unavailable. Switch tabs in the browser, or run\n' +
        '  `yarn dev:roles:tabs` from a terminal. Ctrl-C to close.\n\n',
    );
    await new Promise(() => {});
    return;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.setPrompt('roles> ');
  rl.prompt();
  rl.on('line', async line => {
    const input = line.trim();
    if (input === 'q' || input === 'quit' || input === 'exit') {
      rl.close();
      return;
    }
    if (input === 'shot') await shotAll();
    else if (input) await goAll(input);
    rl.prompt();
  });
  rl.on('close', async () => {
    await context.close().catch(() => {});
    process.exit(0);
  });
}

main().catch(err => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
