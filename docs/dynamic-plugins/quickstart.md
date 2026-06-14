---
sidebar_position: 1
sidebar_label: Quickstart
---

# Dynamic plugin quickstart

Build a frontend plugin, publish it as an OCI artifact, install it on a
running Butler Portal, and see it render at its declared URL. No fork
of the portal, no rebuild of the portal image, no portal restart needed
after the install runs.

This is the open-product capability the portal exists to provide:
operators decide what plugins their portal serves. The defaults are
hygiene (the portal ships with nothing customer-specific enabled).
Adding a plugin is a chart-values change against a portal you do not
own the source of.

The mechanism: each plugin is a
[Module Federation v2](https://module-federation.io/) remote. The
portal's runtime, `@module-federation/runtime`, loads the remote's
manifest at boot, resolves its dynamic routes, and mounts each route's
React component at the URL the plugin declared. Some Backstage
ecosystems use `@scalprum/react-core` for this step; Butler Portal
does not (the Backstage CLI host bundle is not Module-Federation-built,
which Scalprum requires). The plugin-side contract is the same RHDH
dynamic-plugin schema either way -- a plugin that builds for Red Hat
Developer Hub builds for Butler Portal.

## What you need

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20 or 22 | The portal currently runs Node 22; the plugin export ships under either. |
| `oras` | 1.2+ | Pushes the built plugin as an OCI artifact. `brew install oras` or [download from the release page](https://github.com/oras-project/oras/releases). |
| Container registry credentials | -- | A registry your portal's installer can pull from. GitHub Container Registry (`ghcr.io`), AWS ECR, Quay, and Harbor all work. |
| A Butler Portal you can update | 0.5.1+ | Earlier portal versions do not run the dynamic-plugin runtime. |

The portal itself is whatever your operator runs; for this quickstart
your laptop is fine for build + publish, and any 0.5.1+ portal can
install what you publish.

## Step 0: build OUTSIDE any monorepo

This is the most common adopter snag. The Backstage CLI's `package
export` walks up the directory tree looking for a Yarn workspace root.
If it finds one (your team's monorepo, our portal's own
`butler-portal/` checkout, an unrelated Yarn project several
directories up), it tries to resolve your plugin against THAT
workspace's `package.json` graph and fails with errors like:

```
Error: Package not found
    at PackageGraph.collectPackageNames
```

The plugin export works only against a standalone directory. Clone or
scaffold your plugin somewhere that has no `package.json` between your
plugin's root and `/`. For development on a workstation:

```bash
mkdir -p ~/butler-portal-plugins
cd ~/butler-portal-plugins
```

For CI: run the build in a fresh checkout step, not nested in an
existing monorepo's job working directory.

This is not a portal restriction; it is how the underlying
`@red-hat-developer-hub/cli` (the tool that performs the export)
resolves packages. We surface it here because you will hit it on the
first build if you skip it.

## Step 1: scaffold from the canonical example

The portal repo ships a working example at
[`butler-portal/examples/dynamic-plugin-hello`](https://github.com/butlerdotdev/butler-portal/tree/main/examples/dynamic-plugin-hello).
The example is the CI-tested starter -- it builds in the portal's
release pipeline against every portal release, so if it builds for
you, you are not chasing a stale snippet.

Copy the example into your standalone directory:

```bash
git clone --depth=1 https://github.com/butlerdotdev/butler-portal.git /tmp/butler-portal-source
cp -R /tmp/butler-portal-source/examples/dynamic-plugin-hello/. ~/butler-portal-plugins/hello/
cd ~/butler-portal-plugins/hello
```

What the example contains:

```
hello/
  package.json              backstage.role: frontend-plugin; scalprum block;
                            deps for react/react-dom/react-router-dom/MUI v4/jest
  src/
    index.ts                re-exports dynamicPluginsExports and HelloPage
    plugin.ts               createPlugin + createRoutableExtension (Backstage idioms)
    routes.ts               rootRouteRef
    dynamic/PluginRoot.tsx  declares dynamicPluginsExports.dynamicRoutes
    components/HelloPage.tsx  the page the route mounts (renders the marker text)
```

The `src/index.ts` shape matters. The portal's runtime loads the
plugin's package root (a single Module Federation "expose" produced by
`rhdh-cli`) and reads named exports off it: `dynamicPluginsExports`
gives the route list, and each route's `importName` (`"HelloPage"`)
resolves against the same module's exports. `index.ts` must re-export
both.

## Step 2: install build dependencies

```bash
npm install --legacy-peer-deps
```

`--legacy-peer-deps` accepts the MUI v4 / React 18 peer warnings the
Backstage CLI tooling produces; they are advisory in this context.
Yarn works too if you prefer.

## Step 3: build the dynamic plugin

The example's `package.json` declares an `export-dynamic` script that
delegates to `rhdh-cli` (the Red Hat Developer Hub plugin CLI; the
same tool RHDH dynamic plugins use):

```bash
npm run export-dynamic
```

You should see output that ends with paths under `dist-dynamic/` and a
`mf-manifest.json` summary. If you do not, fix the build errors first;
nothing downstream works without a valid manifest.

Butler Labs also publishes `@butlerlabs/portal-plugin-cli`, a thin
wrapper that forwards every command verbatim to a pinned rhdh-cli
version. The wrapper exists so a future portal-specific behavior has
a stable command name without breaking adopter scripts. Either tool
produces the same artifact; pick by preference. To use the wrapper:

```bash
npm install --save-dev @butlerlabs/portal-plugin-cli
npx butler-portal-plugin plugin export --clean
```

## Step 4: pack and publish

The portal's installer accepts OCI artifacts (`oci://...`) and plain
HTTPS tarballs (`https://...`). OCI is the recommended distribution
channel: registries provide auth, immutability, and audit out of the
box.

Pack `dist-dynamic/` inside a `package/` directory so the installer's
`tar --strip-components=1` finds the content where it expects:

```bash
PACK_DIR=$(mktemp -d)
mkdir -p "$PACK_DIR/stage/package"
cp -R dist-dynamic/. "$PACK_DIR/stage/package/"
tar -czf "$PACK_DIR/package.tgz" -C "$PACK_DIR/stage" package
```

Compute the SRI integrity the portal will check on every install. The
`base64 -w0` flag disables line wrapping; Linux's `base64` wraps at
76 chars by default, and a multi-line integrity string corrupts the
chart values:

```bash
HEX=$(shasum -a 512 "$PACK_DIR/package.tgz" | awk '{print $1}')
B64=$(printf '%s' "$HEX" | xxd -r -p | base64 -w0 2>/dev/null || \
      printf '%s' "$HEX" | xxd -r -p | base64 | tr -d '\n')
INTEGRITY="sha512-$B64"
echo "$INTEGRITY"
```

Save that value. The portal rejects any install whose computed
integrity does not match.

Push to a registry you control. For ghcr.io:

```bash
echo "$GITHUB_PAT" | oras login ghcr.io -u "$GITHUB_USER" --password-stdin
cd "$PACK_DIR"
oras push ghcr.io/your-org/your-portal-plugins/hello-dynamic:0.1.0 \
  package.tgz:application/gzip
```

The push prints a digest. Together with the integrity value from the
previous step, that is everything the portal needs to install your
plugin.

## Step 5: install on a portal

The portal's Helm chart (`butler-portal` 0.5.1+) takes a list of plugin
references in `dynamicPlugins.plugins[]`. Each entry has a package URI
and an integrity string. Update your portal's values:

```yaml
dynamicPlugins:
  enabled: true
  plugins:
    - package: oci://ghcr.io/your-org/your-portal-plugins/hello-dynamic:0.1.0
      integrity: sha512-<your value from step 4>
```

The installer runs as an initContainer on the portal pod. It pulls each
referenced plugin, verifies the SRI, drops the unpacked content into a
shared volume, and exits. If any plugin fails its integrity check, the
default chart values (`continueOnError: false`) abort the pod start so
a bad plugin does not silently disappear from the running portal.

Helm upgrade the portal with the new values. The chart's pod-template
hash changes when the dynamicPlugins values change, which Kubernetes
treats as a rollout. The new pod runs the installer initContainer
first, then starts the runtime with the populated volume mounted:

```bash
helm upgrade butler-portal oci://ghcr.io/butlerdotdev/charts/butler-portal \
  --version 0.5.1 \
  -f your-values.yaml \
  -n butler-portal
```

If your portal is managed by Flux, commit the values change to the
HelmRelease and let Flux reconcile.

## Step 6: see it render

The example's PluginRoot declares its route at `/hello-dynamic-plugin`.
Open the portal in a browser, sign in if your portal requires it (the
dynamic route inherits the same auth gate every other portal route
uses), and navigate to that path. You should see:

```
Hello from the Butler Portal dynamic-plugins runtime
```

That string is emitted by the example's `HelloPage` component. Seeing
it confirms that the install chain held:

* The installer pulled and verified the plugin tarball.
* The runtime read the manifest at portal boot.
* The federation runtime fetched the plugin's bundle.
* The plugin's `dynamicPluginsExports` declared the route.
* The route mounted at the declared URL.
* The React component rendered.

If you see "404 Page Not Found" instead, the runtime did not register
the route. Check `dynamicPlugins.enabled: true` in your values, check
the portal pod logs for an "Exposed dynamic frontend plugin" line, and
re-confirm the integrity matches. If the pod is in
`Init:CrashLoopBackOff`, the installer rejected your plugin -- look at
the init container logs (`kubectl logs <pod> -c install-dynamic-plugins`)
for the rejection reason.

## Talking to a backend

Most real plugins need to call a backend for something. The dynamic-
plugin runtime supports three patterns; pick whichever fits the
service you are calling.

**1. The Backstage proxy** -- the lowest-friction pattern. The portal's
operator pre-configures a proxy target in app-config:

```yaml
proxy:
  endpoints:
    /my-service:
      target: https://my-service.internal.example.com
      allowedHeaders: [Authorization]
```

Your plugin's frontend calls it through Backstage's `fetchApi` or
`discoveryApi`:

```ts
const baseUrl = await discoveryApi.getBaseUrl('proxy');
const response = await fetchApi.fetch(`${baseUrl}/my-service/things`);
```

The proxy target lives in the operator's app-config, not in your
plugin. Communicate the target to whoever runs the portal.

**2. A bundled backend dynamic plugin** -- when your plugin needs its
own backend (routes, scheduled tasks, database access, secrets the
portal already has). Ship a sibling package with `backstage.role:
backend-plugin` and reference it in `dynamicPlugins.plugins[]` next
to your frontend plugin. The portal's
[`@backstage/backend-dynamic-feature-service`](https://www.npmjs.com/package/@backstage/backend-dynamic-feature-service)
loader scans the same root directory and registers the backend's
routes against the portal's `httpRouter` service.
[`examples/dynamic-plugin-hello-backend`](https://github.com/butlerdotdev/butler-portal/tree/main/examples/dynamic-plugin-hello-backend)
is the CI-tested starter for this pattern. The release-boot-test
workflow exercises a backend plugin's `/ping` route against the
released portal image on every release, so the loader path is verified
end-to-end.

The frontend reaches the bundled backend through `discoveryApi`:

```ts
const baseUrl = await discoveryApi.getBaseUrl('my-plugin');
// -> http://<portal>/api/my-plugin -- the same URL the portal serves
//    for any built-in backend plugin, just registered at boot instead
//    of compile time
```

**3. Direct calls to external services** -- when the plugin reaches a
URL the portal pod can already resolve (your API gateway, a SaaS, an
internal service). The plugin's frontend `fetch`es directly. CSP and
CORS apply the same way they would for any browser-side fetch from
the portal origin; if the target needs CORS adjustments, that lives
in the target's response headers, not in the portal config.

Each pattern has a deeper page covering auth, error handling,
versioning, and the operator-side configuration: see
[Talking to a backend](./backend-wiring.md).

## What to expect when you replace HelloPage

The example is intentionally minimal. As you grow it into a real
plugin, two adopter-reality details are worth knowing in advance.

### Host singletons

Your plugin's `mf-manifest.json` declares which packages it expects the
portal to provide as shared singletons. The portal currently provides:

| Package | Version |
|---|---|
| `react` | 18.x |
| `react-dom` | 18.x |
| `react-router-dom` | 6.x |
| `@material-ui/core/styles` | 4.12.x |
| `@material-ui/styles` | 4.11.x |

If your plugin uses any of these, `rhdh-cli plugin export` declares
them as singletons in your manifest automatically and the portal's
runtime hands you its instance at load time. Plugins that hard-code
their own React instance will see "two Reacts" errors at first render.

### The Material UI v4 styles-split gotcha

Material UI v4 splits its styling primitives across two packages:

* `@material-ui/core/styles` -- the public API (`makeStyles`,
  `withStyles`, `useTheme`).
* `@material-ui/styles` -- the underlying JSS engine.

If your plugin uses MUI v4 (the Backstage default at the moment) AND
your manifest declares only `@material-ui/core/styles` as a shared
singleton without `@material-ui/styles`, the plugin's first render
throws `TypeError: theme.spacing is not a function`. The public API
finds the host's instance; the underlying engine does not, and the two
get out of sync. `rhdh-cli` declares both correctly when MUI v4 is a
direct dependency, but a manually-edited manifest can drop one.

The example's manifest includes both. If you start from the example
and add MUI imports, the build keeps both. If you start from scratch,
check both are present before you debug.

## What's next

* [Plugin authoring](./authoring.md): the full `dynamicPluginsExports`
  schema (dynamic routes, menu items, icons, API factories, route
  refs, permissions).
* [Publishing](./publishing.md): registries, signing, integrity,
  versioning conventions, registry auth for the portal installer.
* [Chart configuration](./chart-config.md): per-plugin enable flags,
  allowedSources for security, continueOnError tradeoffs, install
  audit.
* [Reference: dynamic plugin contract](./reference.md): the runtime
  contract the portal commits to (the host singletons, the
  `dynamicPluginsExports` shape, the manifest fields the portal
  reads).
* [Reference: example plugin](./example.md): a walkthrough of the
  CI-tested example, what each file does, why each line is there.

## Why a wrapper CLI

The plugin scaffold and the docs reference one stable command name --
`butler-portal-plugin` -- regardless of which underlying tool performs
the build. The wrapper at `@butlerlabs/portal-plugin-cli` is a thin
forward to `@red-hat-developer-hub/cli`. The dependency is honest and
declared in the wrapper's package.json; you can inspect the rhdh-cli
version any wrapper release pins. If a future Butler Portal contract
diverges from rhdh-cli, the wrapper is the seam where that lands
without breaking adopter scripts.
