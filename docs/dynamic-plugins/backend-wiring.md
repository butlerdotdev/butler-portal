---
sidebar_position: 2
sidebar_label: Talking to a backend
---

# Talking to a backend

Most real plugins call a backend for something. The quickstart's
"Ping the bundled backend" round-trip is one of three patterns the
runtime supports. Pick by what kind of service you are calling.

## 1. The Backstage proxy

Use when: the service already exists outside the portal and you do
not want to ship a sibling backend plugin. The proxy lives in the
portal's `app-config` under `proxy.endpoints`; the operator decides
what targets are reachable.

The operator configures the target:

```yaml
proxy:
  endpoints:
    /my-service:
      target: https://my-service.internal.example.com
      allowedHeaders: [Authorization]
      credentials: dangerously-allow-unauthenticated
```

Your plugin calls it through Backstage's standard APIs:

```ts
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';

const discovery = useApi(discoveryApiRef);
const fetchApi = useApi(fetchApiRef);

const baseUrl = await discovery.getBaseUrl('proxy');
const res = await fetchApi.fetch(`${baseUrl}/my-service/things`);
const data = await res.json();
```

What lives where:

* The target URL is in `app-config`, operator-owned. Your plugin does
  not hardcode it.
* CORS handling is on the target service, not the portal -- the proxy
  is server-side.
* Auth headers the operator allows in `allowedHeaders` pass through.
  Headers outside the allow list are stripped.

The pattern's footprint on the plugin is small (one fetch call) and
on the chart is zero (no new plugin to install). Communicate the
expected `app-config` shape to whoever runs the portal in your
plugin's README.

## 2. A bundled backend dynamic plugin

Use when: your plugin needs its own routes, scheduled tasks, database
access, secrets the portal already has, or any server-side logic that
should live alongside the frontend rather than as a separate service.

Ship a sibling package with `backstage.role: backend-plugin`. The
portal's `@backstage/backend-dynamic-feature-service` loader scans
the same `dynamicPlugins.rootDirectory` the frontend uses and
registers the plugin's HTTP routes against the portal's
`httpRouter` service. The plugin's routes mount at
`/api/<pluginId>` -- the same URL convention any built-in Backstage
backend plugin uses.

The minimal backend plugin shape:

```ts
import { createBackendPlugin, coreServices } from '@backstage/backend-plugin-api';
import { Router } from 'express';

export const myPlugin = createBackendPlugin({
  pluginId: 'my-plugin',
  register(env) {
    env.registerInit({
      deps: {
        httpRouter: coreServices.httpRouter,
        logger: coreServices.logger,
      },
      async init({ httpRouter, logger }) {
        const router = Router();
        router.get('/things', (_req, res) => {
          res.json({ things: [] });
        });
        httpRouter.use(router);
        logger.info('my-plugin registered');
      },
    });
  },
});

export default myPlugin;
```

`package.json` declares the role and the bundled entry:

```json
{
  "backstage": {
    "role": "backend-plugin",
    "pluginId": "my-plugin"
  },
  "main": "dist/index.cjs.js"
}
```

Build with `yarn export-dynamic` (the backend export path requires
yarn for the lockfile-based dependency hoisting rhdh-cli does;
`npm run export-dynamic` works for frontends but not backends).

The frontend reaches the bundled backend through `discoveryApi`:

```ts
const baseUrl = await discovery.getBaseUrl('my-plugin');
const res = await fetchApi.fetch(`${baseUrl}/things`);
```

`discoveryApi.getBaseUrl('my-plugin')` returns
`https://<portal>/api/my-plugin` -- the same URL the portal would
serve for a built-in backend plugin called `my-plugin`, just
registered at boot from a dynamic load instead of compiled in.

The
[`hello-dynamic-backend`](https://github.com/butlerdotdev/butler-portal/tree/main/examples/dynamic-plugin-hello-backend)
example is the CI-tested starter for this pattern. Its `/ping` route
is what the live butler-portal-live showcase's "Ping the bundled
backend" button hits.

### Auth on bundled backend routes

The frontend reaches your backend through the portal's authenticated
session. Routes inherit Butler Portal's default-deny auth: a request
with no valid session returns 401.

If your plugin needs an unauthenticated route (a health check, a
public-by-design ping), declare it explicitly:

```ts
httpRouter.use(router);
httpRouter.addAuthPolicy({
  path: '/ping',
  allow: 'unauthenticated',
});
```

The example plugin uses this for the showcase round-trip. Do not copy
this for routes that touch real data; the default-deny is the right
default for plugins beyond the test fixture.

### Configuration

Your backend reads `app-config` through `coreServices.rootConfig`:

```ts
deps: {
  httpRouter: coreServices.httpRouter,
  config: coreServices.rootConfig,
},
async init({ httpRouter, config }) {
  const apiKey = config.getString('myPlugin.apiKey');
  // ...
}
```

The operator sets values under your plugin's namespace in
`app-config`. Document the schema your plugin reads.

## 3. Direct calls to external services

Use when: the service is reachable from the browser and you do not
want the portal to mediate.

```ts
const res = await fetch('https://my-saas.example.com/api/things', {
  headers: { Authorization: `Bearer ${process.env.MY_TOKEN}` },
});
```

What this means:

* CSP and CORS on the target service are your responsibility, not the
  portal's.
* Authentication is target-specific. If the target is your company's
  API gateway, you have whatever auth contract that gateway exposes.
* No operator cooperation. The plugin loads, the call hits the
  internet, the response renders.

This pattern's footprint on the chart is zero, but the trade-off is
you do not get Backstage's identity context. If the call needs to
know who the portal user is, prefer pattern 1 (the proxy can attach
the session identity) or pattern 2 (your bundled backend has
`coreServices.userInfo` and can resolve the session user).

## Picking between them

| You want... | Use... |
|---|---|
| A simple HTTP call to an existing service | Pattern 1 (proxy) |
| Routes, scheduled tasks, server-side state, secrets | Pattern 2 (bundled backend) |
| The Backstage user identity attached to your requests | Pattern 1 or 2 |
| A SaaS / internal service the browser can reach with no portal cooperation | Pattern 3 (direct) |
| To avoid any operator-side configuration | Pattern 3 |

The patterns compose. A real plugin might use pattern 2 for its own
routes and pattern 1 for talking to an external service the operator
proxies.
