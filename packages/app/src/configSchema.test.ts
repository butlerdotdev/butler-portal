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

// This test reads source files (config.d.ts, package.json) at test time
// to verify the schema-visibility annotations the frontend bundle relies
// on. fs and path are jest-time only -- the test file does not ship to
// the browser. The Backstage no-restricted-imports lint rule guards
// against accidental Node.js use in the frontend bundle, which is not
// the situation here.
/* eslint-disable no-restricted-imports */
import * as fs from 'fs';
import * as path from 'path';
/* eslint-enable no-restricted-imports */

// Regression net for the configSchema visibility annotation. The four
// plugins.<name>.enabled keys are declared in packages/app/config.d.ts
// and consumed by Backstage's config-bundle pipeline at build time: keys
// not annotated `@visibility frontend` are stripped from the bundle
// delivered to the browser, and the frontend then reads them as
// undefined regardless of what app-config.yaml or APP_CONFIG_*
// environment variables say.
//
// The 3-pass review's first latent bug was exactly this: ship the
// configSchema declaration but forget the @visibility annotation, and
// every external customer deployment renders all four Butler Labs items
// as disabled regardless of the chart values. MockConfigApi bypasses
// the schema-visibility pipeline entirely, so neither AppRoutes nor
// AppDiscovery catches a regression that removes the annotation.
//
// This test does the cheapest thing that pins the contract: parse
// config.d.ts as text and assert each plugins.<key> sub-block has the
// `@visibility frontend` annotation in its preceding JSDoc. A regression
// that strips the annotation (whether accidental or via a refactor that
// migrates to a different schema mechanism) fails here, before the
// bundle ever ships.

const CONFIG_D_TS_PATH = path.resolve(__dirname, '..', 'config.d.ts');

describe('packages/app/config.d.ts schema visibility annotations', () => {
  const contents = fs.readFileSync(CONFIG_D_TS_PATH, 'utf8');

  it.each([
    ['butler'],
    ['workspaces'],
    ['registry'],
    ['pipeline'],
  ])(
    'plugins.%s.enabled is annotated @visibility frontend (so the frontend bundle receives it; without this the bug ships and every plugin reads as disabled)',
    pluginKey => {
      // Find the per-plugin sub-block. Each looks like:
      //   <pluginKey>?: {
      //     /**
      //      * ...
      //      * @visibility frontend
      //      */
      //     enabled?: boolean;
      //   };
      // Scope the search to the bytes between the plugin's opening line
      // and the next `};` so a stray @visibility on an unrelated key
      // does not satisfy a different plugin's assertion.
      const openIdx = contents.indexOf(`${pluginKey}?: {`);
      expect(openIdx).toBeGreaterThan(-1);
      const closeIdx = contents.indexOf('};', openIdx);
      expect(closeIdx).toBeGreaterThan(openIdx);
      const block = contents.slice(openIdx, closeIdx);
      expect(block).toMatch(/@visibility\s+frontend/);
      // The annotation must accompany the `enabled?:` field, not some
      // other (currently absent) field.
      expect(block).toMatch(/enabled\?\s*:\s*boolean/);
    },
  );

  it('packages/app/package.json points configSchema at config.d.ts (without this the schema file is dead even when annotated correctly)', () => {
    const pkgPath = path.resolve(__dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    expect(pkg.configSchema).toBe('config.d.ts');
  });
});
