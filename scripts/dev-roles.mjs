// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * Local role review launcher.
 *
 * Opens one window per canonical identity against the portal that is
 * already running, so the whole product can be reviewed through every
 * authorization perspective at the same time.
 *
 * Each window is its own browser profile with its own cookie jar, so the
 * five sessions never share an identity. Each carries the dev identity
 * cookie the butler backend reads, and every request it makes is
 * authorized by butler-server for that user. Nothing here decides what a
 * role may do.
 *
 *   node scripts/dev-roles.mjs                 open the five windows
 *   node scripts/dev-roles.mjs /butler/admin   open them on one route
 *
 * Once open, type a route and press enter to drive all five to it,
 * "shot" to capture them, "q" to quit.
 */
import { chromium } from 'playwright';
import { createInterface } from 'node:readline';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const APP = process.env.BUTLER_APP_URL ?? 'http://localhost:3000';
// The identity list comes from the backend directly; the app port serves
// the SPA and would answer this with HTML.
const API = process.env.BUTLER_API_URL ?? 'http://localhost:7007';
const PROFILES =
  process.env.BUTLER_ROLE_PROFILES ?? join(tmpdir(), 'butler-role-review');
const SHOTS = process.env.BUTLER_ROLE_SHOTS ?? 'screenshots/role-review';

// Window tiling for a laptop display. Five windows, top row of three.
const W = 900;
const H = 820;
const LAYOUT = [
  { x: 0, y: 0 },
  { x: W, y: 0 },
  { x: W * 2, y: 0 },
  { x: 0, y: H },
  { x: W, y: H },
];

async function loadIdentities() {
  const res = await fetch(`${API}/api/butler/_dev/identities`);
  if (!res.ok) {
    throw new Error(
      `The portal at ${APP} is not serving the role harness (${res.status}). ` +
        'Start it with `yarn dev:roles:server`, which layers app-config.roles.yaml.',
    );
  }
  const body = await res.json();
  if (!body.identities?.length)
    throw new Error('No dev identities configured.');
  return body.identities;
}

async function main() {
  const startRoute = process.argv[2] ?? '/butler';
  const identities = await loadIdentities();

  const sessions = [];
  for (const [i, identity] of identities.entries()) {
    const pos = LAYOUT[i] ?? { x: 0, y: 0 };
    const context = await chromium.launchPersistentContext(
      join(PROFILES, identity.key),
      {
        headless: false,
        viewport: null,
        args: [
          `--window-size=${W},${H}`,
          `--window-position=${pos.x},${pos.y}`,
          `--window-name=${identity.label}`,
        ],
      },
    );
    // Seed the identity before the first load so the session cannot race
    // its own cookie and resolve as the guest identity instead.
    await context.addCookies([
      {
        name: 'butler-dev-identity',
        value: identity.key,
        domain: 'localhost',
        path: '/',
      },
    ]);
    const page = context.pages()[0] ?? (await context.newPage());
    // Binding through the backend sets the cookie for this profile only.
    await page.goto(
      `${API}/api/butler/_dev/act-as/${identity.key}?to=${encodeURIComponent(
        startRoute,
      )}`,
      { waitUntil: 'domcontentloaded' },
    );
    sessions.push({ identity, context, page });
  }

  const label = s => s.identity.label ?? s.identity.key;
  process.stdout.write('\nButler Role Review\n\n');
  for (const s of sessions) {
    process.stdout.write(
      `  ${label(s).padEnd(16)} ${s.identity.email.padEnd(
        38,
      )} ${API}/api/butler/_dev/act-as/${s.identity.key}\n`,
    );
  }
  process.stdout.write(
    `\n  All five act against the same portal and the same data.\n` +
      `  butler-server authorizes each one for real.\n\n` +
      `  Type a route (for example /butler/admin/clusters) to drive all five.\n` +
      `  "shot" captures them, "q" quits.\n\n`,
  );

  const goAll = async route => {
    const path = route.startsWith('/') ? route : `/${route}`;
    await Promise.all(
      sessions.map(s =>
        s.page
          .goto(`${APP}${path}`, { waitUntil: 'domcontentloaded' })
          .catch(err =>
            process.stdout.write(`  ${label(s)}: ${err.message}\n`),
          ),
      ),
    );
    process.stdout.write(`  all five -> ${path}\n`);
  };

  const shotAll = async () => {
    mkdirSync(SHOTS, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    for (const s of sessions) {
      const file = join(SHOTS, `${stamp}-${s.identity.key}.png`);
      await s.page.screenshot({ path: file, fullPage: true });
      process.stdout.write(`  ${file}\n`);
    }
  };

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
    await Promise.all(sessions.map(s => s.context.close().catch(() => {})));
    process.exit(0);
  });
}

main().catch(err => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
