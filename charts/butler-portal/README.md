# butler-portal Helm chart

Deploys [Butler Portal](https://github.com/butlerdotdev/butler-portal), a Backstage-based internal developer platform that ships the Butler plugin.

## Prerequisites

- Kubernetes 1.27+
- Helm 3.14+
- An installation of the [CloudNativePG](https://cloudnative-pg.io/) operator in the cluster (the chart provisions a `Cluster` resource by default; set `postgresql.enabled=false` to bring your own database)
- A Secret in the release namespace containing the butler-server service-account credentials, ONLY if you are enabling the Butler plugin (`plugins.butler.enabled=true`). External customers running the stock Backstage IDP do not need this.

## Create the service-account Secret (only when Butler is enabled)

When `plugins.butler.enabled=true`, the chart requires `butlerAuth.existingSecret` to point at a Secret in the release namespace with the keys `username` and `password`. Create it first:

```bash
kubectl create secret generic butler-server-auth \
  --namespace butler-portal \
  --from-literal=username='<service-account-username>' \
  --from-literal=password='<service-account-password>'
```

The keys can be customized via `butlerAuth.usernameKey` and `butlerAuth.passwordKey` if your existing Secret uses different field names.

When `plugins.butler.enabled=false` (the chart default), the Butler service-account env vars are not rendered into the Deployment and no Secret is required.

## Install

```bash
helm install butler-portal oci://ghcr.io/butlerdotdev/charts/butler-portal \
  --version 0.4.0 \
  --namespace butler-portal \
  --create-namespace
```

If you are enabling Butler, also pass `--set butlerAuth.existingSecret=butler-server-auth` and `--set plugins.butler.enabled=true`.

## Configuration

| Key | Default | Description |
|---|---|---|
| `butlerAuth.existingSecret` | `""` | **Required when `plugins.butler.enabled=true`.** Name of an existing Secret in the release namespace holding the butler-server service-account credentials. Chart render fails if Butler is enabled and this is unset. Not consulted when Butler is off. |
| `butlerAuth.usernameKey` | `username` | Key inside the Secret that holds the username. |
| `butlerAuth.passwordKey` | `password` | Key inside the Secret that holds the password. |
| `butlerSigning.existingSecret` | `""` | Optional. When set, names a Secret holding the Ed25519 private key the portal uses to mint signed identity proofs for butler-server (Stage 2 of the portal-JWT carrier work). When unset, the portal uses the legacy admin Bearer plus `X-Butler-User-Email` carrier (the pre-Stage-2 behavior). |
| `butlerSigning.keyKey` | `key` | Key inside the signing Secret that holds the PEM-encoded private key bytes. |
| `butlerSigning.kid` | `""` | Required when `butlerSigning.existingSecret` is set. The kid stamped in each minted proof's JWT header. Must match the kid under which butler-server has the corresponding public key registered (via `BUTLER_PORTAL_PUBKEY`). |
| `appConfig.baseUrl` | `http://localhost:7007` | Base URL the portal advertises for frontend + backend. |
| `image.repository` | `ghcr.io/butlerdotdev/butler-portal` | Container image. |
| `image.tag` | `""` | Image tag (defaults to chart `appVersion`). |
| `postgresql.enabled` | `true` | Provision a CNPG `Cluster` for the portal database. |
| `postgresql.instances` | `1` | Number of CNPG replicas. |
| `registry.baseUrl` | `""` | Base URL the registry plugin advertises. |
| `registry.github.secretName` | `""` | Secret holding a GitHub PAT for `repository_dispatch` and commit status. |
| `extraEnv` | `[]` | Free-form env entries appended to the portal container. `BUTLER_SERVICE_ACCOUNT_USER` and `BUTLER_SERVICE_ACCOUNT_PASSWORD` injected here are overridden by the chart-managed `secretKeyRef` (positioned last, last-wins). |
| `plugins.butler.enabled` | `false` | Enable the Butler plugin (Backstage frontend route + backend proxy to butler-server). Default off so external deployments fail safe. |
| `plugins.workspaces.enabled` | `false` | Enable the Workspaces / Chambers plugin (frontend only; proxies butler-server via the butler-backend plugin). Default off. Chambers depends on Butler at runtime; setting this without `plugins.butler.enabled=true` renders a branded "Chambers requires Butler" page on the Chambers route instead of letting the UI fail open. |
| `plugins.registry.enabled` | `false` | Enable the Registry / Keeper plugin (IaC artifact registry) and its catalog entity provider. Default off. The catalog entity provider piggy-backs on this flag; no separate value. |
| `plugins.pipeline.enabled` | `false` | Enable the Pipeline / Herald plugin (VRL DSL + fleet agents). Default off. |
| `ingress.enabled` | `false` | Enable the chart-managed `Ingress` resource. |

For the full list, see [`values.yaml`](./values.yaml).

## Plugin enablement

`butler-portal` ships four Butler-Labs-branded plugins, each gated by a
`plugins.<name>.enabled` value that defaults to `false`. The fail-safe default
means a customer who installs the chart without overrides gets the stock
Backstage IDP (catalog, scaffolder, TechDocs, search, kubernetes, notifications,
signals) with no Butler Labs surface.

The plugin-to-sidebar-name mapping:

| Values key | Sidebar name | Type |
|---|---|---|
| `plugins.butler.enabled` | Butler | Frontend route + backend proxy |
| `plugins.workspaces.enabled` | Chambers | Frontend only (proxies via butler-backend) |
| `plugins.registry.enabled` | Keeper | Frontend route + backend + catalog entity provider |
| `plugins.pipeline.enabled` | Herald | Frontend route + backend |

Enable plugins via values overrides:

```yaml
plugins:
  butler:
    enabled: true
  registry:
    enabled: true
```

### What "off" means per layer

The four flags are honored differently at the backend and frontend layers
because operators reach the two surfaces through different paths.

**Backend (genuinely off).** When a plugin's flag is `false`, the backend's
`createBackendFeatureLoader` never `yield`s the plugin module. The plugin's
`register()` never runs and the corresponding `/api/<plugin>/*` routes are
genuinely absent from the Express router. Requests against them return
plain `404 Not Found` (not `401`, not a sham success). For the Registry
plugin, the catalog entity provider also stays unregistered, so
`GET /api/catalog/entities?filter=kind=registry-module` returns `[]`.

**Frontend (discoverable but disabled).** When a flag is `false`, the
frontend route is still mounted, but the route element renders a branded
"available, not enabled for this deployment" page instead of the real
plugin shell. The sidebar item is still rendered in a greyed,
`aria-disabled` wrapper with a tooltip naming the exact
`plugins.<name>.enabled` key the operator needs to flip. The homepage card
for that plugin is rendered in the same greyed state. Clicking either
lands on the branded not-enabled page (never a 404 in the user's face).

This asymmetry is deliberate. The backend is the security and reachability
boundary, so off must mean off: an external customer cannot poke
unauthorized endpoints. The frontend is the discoverability surface, so
the disabled state advertises what Butler Labs offers and tells the
operator how to enable it.

Disabled plugin JS source is still bundled into the customer's image
(runtime gating, not build-time exclusion). The disabled code never
executes, but if intellectual-property exposure of the disabled plugins
is a concern, a future per-customer Dockerfile arg can exclude them at
build time. Not in scope for `0.4.0`.

### Chambers depends on Butler at runtime

Chambers (`plugins.workspaces.enabled`) is a frontend-only plugin that
proxies every backend call through the Butler backend
(`butlerApiRef` -> `/api/butler/*`). Enabling Chambers without Butler is a
genuinely broken state: every Chambers page would render, then silently
fail every API call against the 404'd `/api/butler/*` route.

The chart and frontend treat this as a configuration mistake. When
`plugins.workspaces.enabled=true` and `plugins.butler.enabled=false`, the
Chambers route renders a branded "Chambers requires Butler" variant of
the not-enabled page that names `plugins.butler.enabled` as the key to
flip. The real Chambers UI does not mount. Operators see the
misconfiguration the first time they click into the route, not as a
trickle of broken API toasts.

To run Chambers, set both:

```yaml
plugins:
  butler:
    enabled: true
  workspaces:
    enabled: true
```

### Registry flag also gates catalog ingestion

The `plugins.registry.enabled` flag gates the chart's registry-backend
catalog entity provider (a separate `backend.add` for the
`RegistryEntityProvider`). There is no independent flag for the catalog
module; turning registry off ensures no stale entity ingestion runs.

## Chart-image sequencing

The container image referenced by the chart (`image.repository:image.tag`)
defaults to `ghcr.io/butlerdotdev/butler-portal:<chart appVersion>`. For
the `0.4.0` chart, that is `ghcr.io/butlerdotdev/butler-portal:0.4.0`. The
chart cannot pull an image that has not been published. Two coordinated
releases govern this:

1. The `butler-portal-v0.4.0` git tag on the application repository
   triggers the image build and publish. CI tags the image as `0.4.0`.
2. The `butler-portal-v0.4.0` chart tag triggers the chart publish to
   `oci://ghcr.io/butlerdotdev/charts`.

If you `helm install --version 0.4.0` before the image is published, pods
sit in `ImagePullBackOff`. Either wait until the image is published or
pin an `image.tag` that already exists:

```yaml
image:
  tag: "0.3.1"  # or whatever image tag is currently published
```

The chart's behaviour does not depend on the image tag; the per-plugin
gates work against any image that ships the matching backend code. The
tag pin is purely about which application binary you want to run.

## Migrating from 0.3.x to 0.4.0

`0.4.0` introduces the per-plugin runtime gates documented in the previous
section. All four `plugins.<name>.enabled` values default to `false`. For
upgraders this is a behavior change: a deployment that previously ran every
plugin out of the box now serves the stock Backstage IDP shell with no
Butler Labs plugins until each one is explicitly opted into.

Two upgrade paths.

**Butler Labs internal deployment (or any deployment that ran every plugin
before).** Add a `plugins:` block to your values that enables all four:

```yaml
plugins:
  butler:
    enabled: true
  workspaces:
    enabled: true
  registry:
    enabled: true
  pipeline:
    enabled: true
butlerAuth:
  existingSecret: butler-server-auth
```

Then `helm upgrade butler-portal --version 0.4.0 --reuse-values -f values.yaml`.
Without this block, all four plugins go dark on the next reconcile.

**External customer running the stock IDP.** No values change needed beyond
the chart version bump. The fail-safe defaults match the intent.

Other notes:

- `butlerAuth.existingSecret` is no longer required for installs that leave
  `plugins.butler.enabled=false`. The chart-managed `BUTLER_SERVICE_ACCOUNT_*`
  env vars are only rendered when Butler is enabled.
- `appVersion` moves to `0.4.0` so the default image tag matches the chart.
  Pin `image.tag` if you need to override.
- A partial values override (only `plugins.butler.enabled` set, others
  unset) is safe: missing sub-flags fall back to `false` via
  `default false` in the template. Earlier WIP versions of this gate
  crashed the backend at startup with a `Failed to parse JSON-serialized
  config value` error when an unset sub-flag rendered as the empty string.

## Migrating from 0.1.x to 0.2.0

`0.2.0` removes the prior `admin/admin` default that the chart and app-config used when no credentials were supplied. This is a breaking change for installs that relied on the default.

To upgrade:

1. Create a Secret in the release namespace with the credentials your butler-server expects:

   ```bash
   kubectl create secret generic butler-server-auth \
     --namespace <release-namespace> \
     --from-literal=username='<existing-username>' \
     --from-literal=password='<existing-password>'
   ```

2. Add the new values to your release:

   ```yaml
   butlerAuth:
     existingSecret: butler-server-auth
   ```

3. Run `helm upgrade` with the new chart version:

   ```bash
   helm upgrade butler-portal oci://ghcr.io/butlerdotdev/charts/butler-portal \
     --version 0.2.0 \
     --reuse-values \
     --set butlerAuth.existingSecret=butler-server-auth
   ```

If the existing release was supplying the credentials through `extraEnv` entries named `BUTLER_SERVICE_ACCOUNT_USER` / `BUTLER_SERVICE_ACCOUNT_PASSWORD`, those entries are now redundant. The chart provides them natively via `butlerAuth.existingSecret`, and the chart-managed entries appear last in the container `env:` list so they win even if the `extraEnv` entries are left in place. Removing them is a cleanup, not a correctness fix.

## Opting out of credential validation (not recommended)

`0.2.1` added a runtime validation that rejected the literal `"admin"` as either the username or the password. `0.2.2` narrows the check to the password only: username `"admin"` is now accepted with any non-`"admin"` password, because butler-server's admin user is legitimately named `"admin"`. Only the password being the literal `"admin"` is the insecure-default condition this validation catches.

The opt-out exists for operators who run butler-portal in a closed network alongside a butler-server where the admin password literally is `"admin"` and rotation is operationally deferred. Setting the opt-out keeps the validation in place for everyone else (empty values still throw; non-`"admin"` passwords are unaffected).

To opt out, set `BUTLER_ALLOW_INSECURE_ADMIN_CREDENTIALS=true` on the portal pod, typically via the chart's `extraEnv`:

```yaml
extraEnv:
  - name: BUTLER_ALLOW_INSECURE_ADMIN_CREDENTIALS
    value: "true"
```

The portal logs a warning at init time when the opt-out is honored. The check is strict equality on the string `"true"`; values like `"TRUE"`, `"yes"`, `"1"`, or an unset variable do not disable the validation.

**Do NOT use this for any deployment where butler-server is reachable from networks outside your control.** Rotate the password and remove the opt-out as soon as the rotation completes.

## Monitoring

Starting in `0.2.3`, butler-portal exposes a dedicated unauthenticated health endpoint for operator-facing monitoring:

```
GET /api/butler/_health
```

Response shape:

```json
// 200 OK. butler plugin has a non-expired butler-server JWT.
{
  "status": "ok",
  "authenticated": true,
  "tokenExpiresAt": 1717862400
}

// 503 Service Unavailable. butler plugin is degraded.
{
  "status": "degraded",
  "authenticated": false,
  "lastError": "butler-server login failed: 401 Unauthorized - {\"error\":\"Invalid credentials\"}"
}
```

`tokenExpiresAt` is the Unix-seconds expiry of the current butler-server session token. `lastError` is the message from the most recent failed login attempt; it does not include credentials or tokens.

**Important monitoring note**: the structured `/api/butler/_health` response shape above is only available **after plugin init succeeds**. If butler plugin init fails at startup (misconfigured credentials, butler-server unreachable at boot, etc.), the router is never mounted and the `/api/butler/_health` route does not exist. In that state, requests to any butler path return Backstage's generic lifecycle 503 with a body like `{"error":{"name":"ServiceUnavailableError","message":"Service has not started up yet"}}`. Operators should monitor BOTH the structured `/api/butler/_health` endpoint AND watch for the generic `"Service has not started up yet"` response on any butler route, since the two signals correspond to different failure classes (runtime drift vs deploy-time misconfiguration).

The endpoint is intentionally NOT wired to the chart's readiness probe. The probe stays on the global `/healthcheck` path so a degraded butler plugin does not take down the IDP shell, catalog, or TechDocs. Operators wanting butler-specific alerting should configure their monitoring tools to poll `/api/butler/_health` independently.

### Example Prometheus blackbox exporter config

```yaml
- job_name: butler-portal-health
  metrics_path: /probe
  params:
    module: [http_2xx]
  static_configs:
    - targets:
        - https://portal.example.com/api/butler/_health
  relabel_configs:
    - source_labels: [__address__]
      target_label: __param_target
    - source_labels: [__param_target]
      target_label: instance
    - target_label: __address__
      replacement: blackbox-exporter:9115
```

A failed probe means the butler plugin is degraded; the rest of the portal may still be functional.

### Failure modes covered

| Failure mode | Caught? | Where the signal lands |
|---|---|---|
| Misconfigured credentials at deploy time (F1) | yes | Plugin init throws, butler routes return Backstage's generic lifecycle 503 with body `"Service has not started up yet"`. The structured `_health` route does not exist when init fails. |
| butler-server unreachable at portal startup (F2) | yes | Same path as F1. |
| Transient token refresh failure at runtime (F3) | minimal | `scheduleRefresh` retries ONCE after 30s. Further refresh failures are unhandled (single-shot retry, not indefinite). `_health` flips to 503 only after the held token's `exp` passes. Persistent runtime degradation is a known gap, tracked as followup. |
| Malformed JWT response from butler-server (F4) | yes | Covered by the same throw path as F1/F2 at init time, or surfaces via lastError on a refresh attempt. |
| Asymmetric session expiry (server invalidates before `exp`) (F5) | not covered | Surfaces as 401s mid-request through the proxy; separate concern. |

## Local development

Pin `helm-unittest` to the version in `.github/workflows/helm.yaml`
when running tests locally. The 1.x release is more permissive about
absent paths than 0.5.2 (the CI pin): a `notContains` assertion against
a path that does not exist in the rendered template passes silently on
1.x and errors with `unknown path` on 0.5.2. Tests that pass locally on
1.x can fail in CI on 0.5.2; the v0.5.0 review caught one example of
this pattern (`spec.template.spec.volumes` in the disabled-state
defense-in-depth suite). Run tests against the CI-pinned version to
keep local and CI in agreement:

```
helm plugin install https://github.com/helm-unittest/helm-unittest --version 0.5.2
helm unittest ./charts/butler-portal
```

## See also

- [`values.yaml`](./values.yaml) for the full set of supported values
- [`templates/`](./templates/) for the rendered Kubernetes resources
- The [butler-portal repository](https://github.com/butlerdotdev/butler-portal) for the application source
