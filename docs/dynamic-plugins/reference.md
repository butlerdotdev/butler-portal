---
sidebar_position: 7
sidebar_label: Reference
---

# Dynamic plugin runtime contract

The contract Butler Portal commits to for dynamic plugins. Every page
in this section consumes this one. If the contract changes, this page
changes; nothing else.

The portal version this describes: chart 0.5.2 / appVersion 0.5.1.

## Frontend plugin loader

The portal serves a JSON document at
`GET /.backstage/dynamic-features/remotes`. Shape:

```ts
type Remote = {
  packageName: string;
  remoteInfo: { name: string; entry: string };
  exposedModules: string[];
};
type RemotesResponse = Remote[];
```

`entry` is the full URL to the plugin's `mf-manifest.json`, served by
the portal's app-backend from
`/.backstage/dynamic-features/remotes/<packageName>/mf-manifest.json`.

When `dynamicPlugins.rootDirectory` is unset in `app-config`, the
endpoint returns the SPA fallback HTML (the feature loader is not
registered). When set and empty, returns `[]`. When set and
populated, returns one `Remote` entry per loaded plugin.

The portal's frontend (`packages/app/src/components/DynamicRoot/`)
fetches this document at boot, initializes
`@module-federation/runtime` with the remote list and the host's
shared singletons, and loads each remote's package root (the `.`
expose) at boot.

### Host shared singletons

`@module-federation/runtime` initializes with this shared table.
Plugins declare these in their `mf-manifest.json` shared block and
use the host's instance instead of bundling their own:

| Package | Version (host) | Why shared |
|---|---|---|
| `react` | 18.x | React context (theme, router, identity) must be a singleton across host and plugins. |
| `react-dom` | 18.x | Pairs with react; bundling two React DOMs corrupts the reconciler. |
| `react-router-dom` | 6.x | The portal's route tree is shared; a plugin with its own router cannot mount into it. |
| `@material-ui/core/styles` | 4.12.x | The styling primitives every Backstage MUI v4 plugin uses. |
| `@material-ui/styles` | 4.11.x | The underlying JSS engine. Both `@material-ui/core/styles` AND `@material-ui/styles` must be shared singletons; declaring only the public one and forgetting the engine throws `TypeError: theme.spacing is not a function` at first render. |

Adding a package to the table is a portal-side change in
`packages/app/src/components/DynamicRoot/mfRuntime.ts`. The change is
visible to adopters because their plugins start being able to declare
that package as shared. Removing a package is a breaking change for
existing plugins that depended on it.

### Module Federation manifest the portal reads

The portal's runtime reads:

* `metaData.remoteEntry.name` -- the `remoteEntry.js` filename.
* `metaData.globalName` -- the global the entry attaches to `window`.
* `metaData.publicPath` -- typically `auto`.
* `exposes[].path` -- the portal looks for `.` (root expose; rhdh-cli
  bundles all named exports under it).
* `shared[]` -- declared singletons. The runtime matches against the
  host table above.

rhdh-cli's `plugin export` produces this shape automatically; you do
not author the manifest by hand.

## dynamicPluginsExports schema

The portal loads the package root and reads:

```ts
type DynamicPluginsExports = {
  dynamicRoutes?: DynamicPluginRouteEntry[];
  menuItems?: DynamicPluginMenuItemEntry[];
};

type DynamicPluginRouteEntry = {
  path: string;            // e.g. "/my-plugin"
  importName: string;      // e.g. "MyPage" -- resolved against package root
  menuItem?: {
    text: string;
    iconImportName?: string;  // sibling export returning a React component
  };
};

type DynamicPluginMenuItemEntry = {
  key: string;
  text: string;
  to: string;
  iconImportName?: string;
  priority?: number;
};
```

The loader resolves each `importName` against the package root's
named exports. For an entry `{ importName: 'MyPage' }`, the loader
reads `pluginModule.MyPage` (or `pluginModule.default.MyPage`) and
mounts it at the declared `path`. The plugin's `src/index.ts` must
re-export everything `dynamicPluginsExports` references:

```ts
export { dynamicPluginsExports } from './dynamic/PluginRoot';
export { MyPage } from './components/MyPage';
```

Failure modes:

* Missing `dynamicPluginsExports` named export -> plugin skipped with
  a console warning. The portal still boots.
* `importName` does not resolve to a React component -> route
  skipped. Other routes from the same plugin still mount.
* The federation runtime cannot load the remote (network, integrity,
  bundle error) -> plugin skipped. Other plugins still load.

The runtime fail-open behavior is deliberate: one broken plugin must
not whitescreen the portal. The boot-test's NEGATIVE case asserts
this.

## Backend plugin loader

The portal's `@backstage/backend-dynamic-feature-service` loader
scans `dynamicPlugins.rootDirectory` at boot. For each package whose
`package.json` declares `backstage.role: backend-plugin`, the loader:

1. Reads `main` from the package.json (the CJS entry).
2. Resolves the module via `require()` with the portal's
   `node_modules` on `NODE_PATH`.
3. Looks for a default export that is a `createBackendPlugin` result.
4. Calls `backend.add(plugin)` with that result.
5. The plugin's `init` registers its routes via `httpRouter.use()`.

Routes mount at `/api/<pluginId>`. The frontend's `discoveryApi`
returns the same URL prefix.

### NODE_PATH requirement

The chart sets `NODE_PATH=/app/node_modules` on the main container
when `dynamicPlugins.enabled=true`. Without this, the backend's
plugin scanner crashes at boot with "Dynamic plugins under
'/dynamic-plugins-root' cannot access backstage modules in
'/app/node_modules'." This is gated on the dynamicPlugins flag so the
disabled-state pod env stays byte-identical to chart 0.4.0 (the
zero-roll-on-bump guarantee).

### What the backend loader does NOT do

* Does not validate the plugin's behavior. A backend plugin that
  registers a route at `/admin` with `addAuthPolicy({ allow:
  'unauthenticated' })` opens that surface; the portal trusts the
  installed plugin set the operator chose.
* Does not isolate plugins from each other. A plugin's logger, config
  reader, and lifecycle hooks come from the same `coreServices`
  registry every built-in plugin uses.
* Does not version-check plugins against the host. A plugin built
  against a Backstage version incompatible with the host fails at
  load time with a module resolution error.

## Installer contract

`butler-portal-plugin-installer` (image
`ghcr.io/butlerdotdev/butler-portal-plugin-installer:0.1.0`) is a Go
binary that runs once as an initContainer. It reads
`/etc/butler-portal/dynamic-plugins.yaml` (the chart's ConfigMap),
iterates `plugins[]`, and for each entry:

1. Validates the source URI against `allowedSources` (when set).
2. Pulls the artifact (`oci://` via oras, `https://` via curl+tar).
3. Computes the sha512 of the downloaded tarball.
4. Compares against the declared `integrity` (mandatory, no fallback).
5. Extracts to `/dynamic-plugins-root/<package-name>-dynamic/`.
6. Emits a structured log line: `event=plugin_installed | rejected |
   skipped`.

Mandatory sha512 means a plugin entry without `integrity` is
rejected. There is no `integrity: any` escape.

`continueOnError: false` (the chart default) aborts the pod on the
first rejected plugin. `continueOnError: true` lets the pod start
with the rejected plugin missing -- useful for graceful degradation
in known-flaky source environments, dangerous for security-critical
plugins.

`allowedSources` is a list of URI prefixes the installer accepts.
When set, an entry whose `package:` does not match any prefix is
rejected even if its integrity is correct. When unset, the installer
warns at startup (`startup_permissive_mode`) but accepts all sources.

The installer writes to `/dynamic-plugins-root` and the chart mounts
the volume at that path. Chart 0.5.0-0.5.1 mounted at a different
path and CrashLoopBackOff'd on first install attempt; chart 0.5.2
corrects this and a unittest pins the path.

## The HelmRelease values schema

```yaml
dynamicPlugins:
  enabled: false                # default off; chart 0.5.0+ byte-identical to 0.4.0 disabled
  rootDirectory: ""             # ignored; the chart hardcodes /dynamic-plugins-root
  allowedSources: []            # empty = permissive (warned); set to whitelist sources
  installer:
    image: ghcr.io/butlerdotdev/butler-portal-plugin-installer
    tag: "0.1.0"
    pullPolicy: IfNotPresent
    continueOnError: false      # fail-closed on integrity mismatch
  plugins: []                   # the plugin list, see below
```

A plugin entry:

```yaml
- package: oci://ghcr.io/your-org/your-plugin:0.1.0
  integrity: sha512-<base64-of-sha512>
```

Fields:

* `package` (required): `oci://...` or `https://...`. No other
  schemes.
* `integrity` (required): SRI-format sha512 (`sha512-<base64>`).
  Other algorithms are not accepted.

## Versioning

The chart and the image version separately:

* Portal image (`ghcr.io/butlerdotdev/butler-portal:<tag>`): the
  Backstage app + the dynamic-plugin runtime. Backstage version bumps
  go here.
* Chart (`oci://ghcr.io/butlerdotdev/charts/butler-portal:<version>`):
  the deployment shape. Path corrections, env var additions, RBAC
  changes go here.
* Installer (`butler-portal-plugin-installer:<tag>`): the OCI/HTTPS
  pull, integrity verification, allowedSources enforcement. Pinned
  by chart values, not the chart version.

Chart 0.5.2 currently bundles appVersion 0.5.1 and installer 0.1.0.

## Failure modes you might hit

| Symptom | Likely cause |
|---|---|
| `mkdir: cannot create directory /dynamic-plugins-root: Permission denied` in init container logs | Chart older than 0.5.2 with `dynamicPlugins.enabled=true`. Upgrade to chart 0.5.2+. |
| Init container `event=plugin_rejected reason=integrity_mismatch` | The artifact at the source URI has different bytes than the integrity value. Re-publish or recompute integrity. |
| Init container `event=plugin_rejected reason=oci_pull_failed` | Source URI not reachable (registry private + installer has no auth, or 404). |
| Backend main container crashes at boot with "cannot access backstage modules" | `NODE_PATH` not set. Chart 0.5.1+ sets this when `dynamicPlugins.enabled=true`. |
| Frontend route returns 404 at the declared path | `dynamicPluginsExports.dynamicRoutes` did not include the path, or the federation runtime failed to load the remote. Check portal pod logs for "Exposed dynamic frontend plugin" and the browser console for module-federation errors. |
| `TypeError: theme.spacing is not a function` in browser | Plugin's MUI v4 manifest declares only `@material-ui/core/styles` as shared without `@material-ui/styles`. Both must be shared. |
| `Cannot convert undefined or null to object` in browser, no SignInPage | A plugin's bundle expects webpack Module Federation host runtime (e.g., wraps in `ScalprumProvider`). Butler Portal uses `@module-federation/runtime` directly; the plugin must not depend on host-side webpack MF. |
