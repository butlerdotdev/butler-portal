---
sidebar_position: 6
sidebar_label: Example walkthrough
---

# Example walkthrough

Line-by-line read of the canonical example pair that the live
butler-portal-live portal ships as its dynamic-plugin showcase. The
pair lives at
[`examples/dynamic-plugin-hello`](https://github.com/butlerdotdev/butler-portal/tree/main/examples/dynamic-plugin-hello)
(frontend) and
[`examples/dynamic-plugin-hello-backend`](https://github.com/butlerdotdev/butler-portal/tree/main/examples/dynamic-plugin-hello-backend)
(backend).

What you see at
[portal.butlerlabs.dev/hello-dynamic-plugin](https://portal.butlerlabs.dev/hello-dynamic-plugin)
is built from these two directories, by the same `npm run
export-dynamic` + `oras push` flow the [quickstart](./quickstart.md)
walks through, pulled and verified by the same chart-installer combo
[chart-config](./chart-config.md) covers. Reading this page after a
live look at the showcase makes every file map to something you
already saw working.

The pair is CI-tested on every PR that touches it (or the portal-
side surface it depends on) by the
[example-build-test workflow](https://github.com/butlerdotdev/butler-portal/blob/main/.github/workflows/example-build-test.yaml).
The starters cannot rot silently.

## Frontend layout

```
examples/dynamic-plugin-hello/
  package.json                          # plugin metadata + deps + scripts
  tsconfig.json                         # extends @backstage/cli config
  .gitignore                            # node_modules, dist, dist-dynamic
  src/
    index.ts                            # re-exports the runtime contract
    plugin.ts                           # createPlugin + createRoutableExtension
    routes.ts                           # rootRouteRef
    dynamic/PluginRoot.tsx              # dynamicPluginsExports declaration
    components/HelloPage.tsx            # the rendered page (the showcase card)
```

### package.json

```json
{
  "name": "butler-hello-dynamic-plugin",
  "version": "0.1.0",
  "main": "src/index.ts",
  "backstage": {
    "role": "frontend-plugin",
    "pluginId": "hello-dynamic-plugin"
  },
  "scripts": {
    "build": "backstage-cli package build",
    "export-dynamic": "rhdh-cli plugin export --clean"
  },
  "dependencies": {
    "@backstage/core-components": "^0.16.2",
    "@backstage/core-plugin-api": "^1.10.2",
    "@backstage/theme": "^0.6.3",
    "@material-ui/core": "^4.12.4",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.30.1"
  },
  "devDependencies": {
    "@backstage/cli": "0.36.0",
    "@red-hat-developer-hub/cli": "^1.11.1",
    "@types/react": "^18.2.0",
    "jest": "^29.0.0"
  },
  "scalprum": {
    "name": "butler-hello-dynamic-plugin",
    "exposedModules": {
      "PluginRoot": "./src/dynamic/PluginRoot.tsx",
      "HelloPage": "./src/components/HelloPage.tsx"
    }
  }
}
```

Three blocks beyond the obvious:

* `backstage.role: frontend-plugin` -- the Backstage CLI build
  recipe.
* `scalprum.exposedModules` -- rhdh-cli reads this for the federation
  expose graph. The build collapses everything under the `.` expose
  but uses these as the source files.
* `dependencies` includes the universal dynamic-plugin set: React 18,
  react-router-dom 6, Material UI v4 core, plus the three
  `@backstage/*` packages every frontend plugin needs. Jest is in
  devDeps for completeness even though this example has no tests.

### src/index.ts

```ts
export { helloDynamicPlugin, HelloDynamicPluginPage } from './plugin';
export { dynamicPluginsExports } from './dynamic/PluginRoot';
export { HelloPage } from './components/HelloPage';
```

The portal's loader reads the package root (the `.` expose) and
expects:

* `dynamicPluginsExports` -- the route declaration.
* `HelloPage` -- the named component the route's `importName`
  references.

The other two exports (`helloDynamicPlugin`, `HelloDynamicPluginPage`)
exist so the same package can be consumed as a static Backstage
plugin if you also published to NPM. Re-exporting them here is
zero-cost.

### src/dynamic/PluginRoot.tsx

```tsx
export const dynamicPluginsExports = {
  dynamicRoutes: [
    {
      path: '/hello-dynamic-plugin',
      importName: 'HelloPage',
      menuItem: { text: 'Hello (Dynamic)' },
    },
  ],
};
```

One route: `/hello-dynamic-plugin` mounts the `HelloPage` component
the portal loads off the package root. The `menuItem` adds a
sidebar entry under the Butler Labs group.

### src/components/HelloPage.tsx

The showcase card. Notable bits:

* MUI v4 Card layout with chips, source URI, and the marker text
  inside a styled Box.
* `data-testid="hello-dynamic-plugin-marker"` on the marker Box
  for the [Playwright marker assertion](https://github.com/butlerdotdev/butler-portal/blob/main/scripts/phase-5-boot-test/playwright/dynamic-plugin-marker.spec.ts).
* `useState`/`useCallback` for the ping round-trip; the response
  renders as pretty-printed JSON.
* Plain `fetch('/api/hello-dynamic-backend/ping', { credentials:
  'include' })` -- no Backstage discoveryApi. The browser hits the
  same origin the portal serves from, so the relative URL resolves
  to the backend dynamic plugin's mount point.
* `PLUGIN_METADATA` hardcoded at the top of the file. Hardcoding the
  source URI as part of the plugin's own contract makes the page
  self-describing -- the visitor sees where the artifact came from
  without reading the chart values.

The whole file is ~150 lines and stays in plain React + MUI v4
idioms. Nothing federation-specific or dynamic-plugin-specific
appears in the JSX; the component does not know it was loaded
dynamically.

## Backend layout

```
examples/dynamic-plugin-hello-backend/
  package.json                          # role: backend-plugin
  tsconfig.json
  .gitignore
  src/
    index.ts                            # default-exports the plugin
    plugin.ts                           # createBackendPlugin + httpRouter registration
```

### package.json

```json
{
  "name": "butler-hello-dynamic-backend",
  "version": "0.1.0",
  "main": "dist/index.cjs.js",
  "backstage": {
    "role": "backend-plugin",
    "pluginId": "hello-dynamic-backend"
  },
  "scripts": {
    "build": "backstage-cli package build",
    "export-dynamic": "rhdh-cli plugin export --clean"
  },
  "dependencies": {
    "@backstage/backend-plugin-api": "^1.6.0",
    "@backstage/errors": "^1.2.7",
    "express": "^4.21.2"
  },
  "devDependencies": {
    "@backstage/cli": "0.36.0",
    "@red-hat-developer-hub/cli": "^1.11.1",
    "@types/express": "^4.17.21",
    "jest": "^29.0.0"
  }
}
```

Differences from the frontend:

* `backstage.role: backend-plugin`.
* `main: dist/index.cjs.js` -- the CJS entry the portal's backend
  loader reads.
* Dependencies are server-side: `@backstage/backend-plugin-api`,
  `express`. No React.
* No `scalprum` block (backend plugins do not federate).

### src/plugin.ts

```ts
export const helloDynamicBackendPlugin = createBackendPlugin({
  pluginId: 'hello-dynamic-backend',
  register(env) {
    env.registerInit({
      deps: {
        httpRouter: coreServices.httpRouter,
        logger: coreServices.logger,
      },
      async init({ httpRouter, logger }) {
        const router = Router();
        router.get('/ping', (_req, res) => {
          res.json({
            ok: true,
            marker:
              'Hello from the Butler Portal dynamic-plugins runtime (backend)',
            pluginName: PLUGIN_NAME,
            pluginVersion: PLUGIN_VERSION,
            backendStartedAt: BACKEND_STARTED_AT,
            receivedAt: new Date().toISOString(),
            podHostname: os.hostname(),
            nodeVersion: process.version,
          });
        });

        httpRouter.use(router);
        httpRouter.addAuthPolicy({
          path: '/ping',
          allow: 'unauthenticated',
        });
      },
    });
  },
});
```

Notable bits:

* `pluginId: 'hello-dynamic-backend'` -- the portal mounts this
  plugin's router at `/api/hello-dynamic-backend`, so the route
  the frontend hits is `/api/hello-dynamic-backend/ping`.
* The response includes the marker string the release-boot-test
  asserts substring of.
* `addAuthPolicy({ path: '/ping', allow: 'unauthenticated' })` --
  intentional for the showcase. Production plugins should not copy
  this for routes that touch data.
* Pod hostname + node version + plugin version in the response --
  the visible payload reinforces that this is a real backend in a
  real pod, not a hardcoded fake.

### src/index.ts

```ts
import { helloDynamicBackendPlugin } from './plugin';

export { helloDynamicBackendPlugin };
export default helloDynamicBackendPlugin;
```

The portal's backend loader reads the default export and calls
`backend.add(plugin)` with it.

## Building both

The frontend builds with npm, the backend with yarn (rhdh-cli's
backend export reads `yarn.lock` for the dep closure).

```bash
# Frontend, out-of-tree (monorepo isolation):
cp -R examples/dynamic-plugin-hello/. /tmp/build-fe/
cd /tmp/build-fe
npm install --legacy-peer-deps
npm run export-dynamic

# Backend, out-of-tree:
cp -R examples/dynamic-plugin-hello-backend/. /tmp/build-be/
cd /tmp/build-be
yarn install
npx tsc
yarn export-dynamic
```

Each produces a `dist-dynamic/` directory the
[publishing flow](./publishing.md) packages, integrity-computes, and
pushes.

## How the live portal got these

The Butler Labs production butler-portal-live HelmRelease references
both artifacts in `dynamicPlugins.plugins[]`:

```yaml
dynamicPlugins:
  enabled: true
  allowedSources:
    - oci://ghcr.io/butlerdotdev/butler-portal-test-fixture
  plugins:
    - package: oci://ghcr.io/butlerdotdev/butler-portal-test-fixture:hello-dynamic-0.5.1
      integrity: sha512-bdd/gEtWJpDnCbf86jAZoYYuKnj87CAychME0aBNjISRiPN4Vg31AoyERe7b7QvDiTiwm94U1TTYhD5iu/KTZA==
    - package: oci://ghcr.io/butlerdotdev/butler-portal-test-fixture:hello-dynamic-backend-0.5.1
      integrity: sha512-+jHUltsqu4RVZzK1S934ozBvQhlTQjqdVUUfaaKWGF28WeL/A1k61Zn74pDHqlczV9WgPBolk9SoIl5hBUEnjA==
```

The source package is public, the portal's installer pulls
anonymously, the sha512 verifies on every install. On every chart
release, the
[release-boot-test workflow](https://github.com/butlerdotdev/butler-portal/blob/main/.github/workflows/release-boot-test.yaml)
re-asserts both halves against the released amd64 portal image
before any production cutover.

## Copy this for your own plugin

The whole pair is ~300 lines of source plus the build/publish
plumbing. Start by copying both directories outside any Yarn
workspace (the
[monorepo isolation step zero](./quickstart.md) in the quickstart).
Rename the package, change the pluginId, replace the page content
and the route, and you have your own dynamic plugin in the same
shape as the live showcase.
