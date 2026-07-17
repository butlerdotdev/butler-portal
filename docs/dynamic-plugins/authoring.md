---
sidebar_position: 3
sidebar_label: Authoring
---

# Plugin authoring

How to grow a copy of the example into a real plugin. The
[quickstart](./quickstart.md) walks you to a working hello render;
this page covers the surface beyond that.

The contract this page describes lives in
[Reference](./reference.md). Read that page when a specific field or
type is unclear; this page covers usage.

## Frontend plugin structure

The example layout, annotated:

```
my-plugin/
  package.json                         # backstage.role + deps + scalprum block + scripts
  src/
    index.ts                           # re-exports dynamicPluginsExports + named components
    plugin.ts                          # createPlugin + createRoutableExtension
    routes.ts                          # rootRouteRef + sub-route refs
    dynamic/PluginRoot.tsx             # declares dynamicPluginsExports.dynamicRoutes
    components/
      MyPage.tsx                       # the routed page (the one Sentry of your UI)
      MyOtherPage.tsx                  # subsequent pages, each at its own route
```

### package.json

Three blocks matter beyond the obvious:

```json
{
  "backstage": {
    "role": "frontend-plugin",
    "pluginId": "my-plugin"
  },
  "scalprum": {
    "name": "my-plugin",
    "exposedModules": {
      "PluginRoot": "./src/dynamic/PluginRoot.tsx"
    }
  },
  "scripts": {
    "build": "backstage-cli package build",
    "export-dynamic": "rhdh-cli plugin export --clean"
  }
}
```

`backstage.role` tells the Backstage CLI how to build the package.
`scalprum.exposedModules` is the rhdh-cli hint for which file to use
as the federation expose source (the build collapses all named
exports into the `.` expose, but rhdh-cli reads this block to know
where to start). `pluginId` is the URL prefix discoveryApi resolves
for routes the plugin registers.

The dependency list is the standard Backstage frontend plugin set
plus React 18, react-router-dom 6.x, Material UI v4 (both
`@material-ui/core` and let rhdh-cli pull `@material-ui/styles` as a
transitive). The
[example](https://github.com/butlerdotdev/butler-portal/tree/main/examples/dynamic-plugin-hello)
has the working dependency set; copy it.

### src/index.ts

The portal's loader reads the package root (the `.` expose). Your
`src/index.ts` is what ends up there. Re-export both the
`dynamicPluginsExports` declaration and every named component the
declaration references:

```ts
export { helloDynamicPlugin, HelloDynamicPluginPage } from './plugin';
export { dynamicPluginsExports } from './dynamic/PluginRoot';
export { MyPage } from './components/MyPage';
export { MyOtherPage } from './components/MyOtherPage';
```

If you forget to re-export `MyPage`, the portal's loader fails to
resolve the route's `importName` and the route mounts as the 404
fallback. The
[example-build-test workflow](https://github.com/butlerdotdev/butler-portal/blob/main/.github/workflows/example-build-test.yaml)
asserts the bundled output contains the named exports
`dynamicPluginsExports` and `HelloPage` for the canonical example;
the same shape applies to your plugin.

### src/plugin.ts

Standard Backstage plugin shape -- the only difference is that you
do not mount the page through the host app's static route table. The
dynamic-plugin runtime mounts it from `dynamicPluginsExports`
instead.

```ts
import {
  createPlugin,
  createRoutableExtension,
} from '@backstage/core-plugin-api';
import { rootRouteRef } from './routes';

export const myPlugin = createPlugin({
  id: 'my-plugin',
  routes: { root: rootRouteRef },
});

export const MyPageExtension = myPlugin.provide(
  createRoutableExtension({
    name: 'MyPageExtension',
    component: () => import('./components/MyPage').then(m => m.MyPage),
    mountPoint: rootRouteRef,
  }),
);
```

The example also re-exports the extension as
`HelloDynamicPluginPage`; the convention helps reuse the component as
a standalone Backstage page if you also publish to NPM as a static
plugin.

### src/dynamic/PluginRoot.tsx

The runtime contract:

```tsx
export const dynamicPluginsExports = {
  dynamicRoutes: [
    {
      path: '/my-plugin',
      importName: 'MyPage',
      menuItem: { text: 'My Plugin' },
    },
    {
      path: '/my-plugin/details',
      importName: 'MyOtherPage',
    },
  ],
  menuItems: [
    // optional: standalone sidebar items not tied to a route
    {
      key: 'my-plugin:docs',
      text: 'My Plugin Docs',
      to: 'https://docs.example.com',
      priority: 100,
    },
  ],
};
```

Every `importName` must match an export from your package root
(`src/index.ts`). `menuItem` on a route adds a sidebar entry under
the Butler Labs group pointing at that path. `menuItems` (the
top-level array) adds standalone sidebar entries that link elsewhere
-- internal routes, external docs, anything.

`priority` controls render order in the sidebar (lower first).

### src/components/MyPage.tsx

A standard Backstage page. The dynamic-plugin runtime gives you the
host's React, react-router-dom, Material UI v4, and Backstage core
APIs as shared singletons. Code that runs in a static Backstage
plugin runs in a dynamic plugin without change.

```tsx
import { Page, Header, Content } from '@backstage/core-components';
import { useApi, configApiRef } from '@backstage/core-plugin-api';

export const MyPage = () => {
  const config = useApi(configApiRef);
  const baseUrl = config.getString('app.baseUrl');
  return (
    <Page themeId="tool">
      <Header title="My Plugin" subtitle="Loaded dynamically" />
      <Content>
        <p>Hello from {baseUrl}.</p>
      </Content>
    </Page>
  );
};
```

The `data-testid` attribute the canonical example puts on the marker
text exists for the boot-test assertion. Your plugin does not need
one unless you wire your own browser tests.

## Backend plugin

When your plugin needs server-side logic, see
[Talking to a backend](./backend-wiring.md) for the three patterns.
For pattern 2 (bundled backend dynamic plugin), the shape is:

```
my-plugin-backend/
  package.json                  # backstage.role: backend-plugin
  tsconfig.json
  src/
    index.ts                    # default-exports the plugin
    plugin.ts                   # createBackendPlugin
```

`package.json` differs from the frontend:

```json
{
  "backstage": {
    "role": "backend-plugin",
    "pluginId": "my-plugin"
  },
  "main": "dist/index.cjs.js",
  "scripts": {
    "build": "backstage-cli package build",
    "clean": "backstage-cli package clean",
    "export-dynamic": "rhdh-cli plugin export --clean"
  },
  "dependencies": {
    "@backstage/backend-plugin-api": "^1.6.0",
    "express": "^4.21.2"
  },
  "devDependencies": {
    "@backstage/cli": "0.36.0",
    "@red-hat-developer-hub/cli": "^1.11.1",
    "@types/express": "^4.17.21"
  }
}
```

Backend dynamic plugins build with yarn, not npm. rhdh-cli's backend
code path reads `yarn.lock` to compute the production dependency
closure. `yarn install && npx tsc && yarn export-dynamic`.

The
[hello-dynamic-backend example](https://github.com/butlerdotdev/butler-portal/tree/main/examples/dynamic-plugin-hello-backend)
is the CI-tested starter for backend plugins.

## Reaching the catalog and other plugins

A dynamic plugin can call Backstage's existing APIs the same way a
static plugin would:

* `catalogApiRef` -- read catalog entities, refresh them, post new
  ones (subject to permissions).
* `permissionApiRef` -- check a permission for the current user.
* `identityApiRef` -- read the signed-in user.
* `discoveryApiRef` -- resolve the URL for any plugin's backend.
* `fetchApiRef` -- the auth-aware fetch.

```tsx
import { useApi, catalogApiRef } from '@backstage/plugin-catalog-react';

const catalog = useApi(catalogApiRef);
const entities = await catalog.getEntities({
  filter: { kind: 'Component' },
});
```

The host provides these as shared singletons via the API factories
configured in the portal. Your plugin lists the `catalogApiRef`
package (`@backstage/plugin-catalog-react`) as a dependency; rhdh-cli
bundles it. At runtime the host's instance wins (singleton
resolution).

## Permissions

Dynamic plugins participate in Backstage's permissions framework. A
backend dynamic plugin declares its own permissions:

```ts
import { createPermission } from '@backstage/plugin-permission-common';

export const myPluginRead = createPermission({
  name: 'my-plugin.read',
  attributes: { action: 'read' },
});
```

The frontend gates UI on the same permission:

```tsx
import { usePermission } from '@backstage/plugin-permission-react';

const { allowed } = usePermission({ permission: myPluginRead });
if (!allowed) return <div>Not authorized.</div>;
```

A plugin declares and enforces its own permissions by calling
`permissions.authorize()` at its backend route handlers. See
[plugin-authoring/authorization](../plugin-authoring/authorization.md)
for the direct-authorize pattern, adopter configuration, and a
minimal working example.

## Testing locally

Local development of a dynamic plugin does not require running the
portal. The plugin builds and exports the same way regardless of where
it lands.

```bash
yarn build              # or npm run build
yarn export-dynamic     # or npm run export-dynamic
```

For interactive development of a Backstage plugin, the standard
`yarn start` workflow in a Backstage app works (the plugin loads as
a static dep). The dynamic-plugin runtime is the deployment-time
layer; local dev does not need it.

To exercise the dynamic-plugin runtime locally, copy your built
`dist-dynamic/` into a portal's `dynamicPlugins.rootDirectory` and
restart the portal pod. The
[run-051-marker-test.sh](https://github.com/butlerdotdev/butler-portal/blob/main/scripts/phase-5-boot-test/run-051-marker-test.sh)
script in the portal repo does exactly this against a local portal
image.

## What rhdh-cli plugin export produces

Calling `npm run export-dynamic` (frontend) or `yarn export-dynamic`
(backend) produces a `dist-dynamic/` directory. Frontend output:

```
dist-dynamic/
  package.json                            # mirrored for the portal's loader
  dist/
    mf-manifest.json                      # Module Federation v2 manifest
    remoteEntry.js                        # the entry the portal loads
    static/*.chunk.js                     # federated chunks
    .config-schema.json                   # config schema for portal validation
```

Backend output:

```
dist-dynamic/
  package.json                            # peerDependencies set to host-provided
  node_modules/                           # private dep closure
  yarn.lock
  dist/
    index.cjs.js                          # CJS entry the loader requires
    plugin.cjs.js                         # the plugin module
    index.d.ts                            # types
    configSchema.json                     # config schema for portal validation
```

The portal's loader reads `dist/mf-manifest.json` (frontend) or
`dist/index.cjs.js` (backend). The
[Publishing](./publishing.md) page covers packaging this directory as
an OCI artifact and pushing it.
