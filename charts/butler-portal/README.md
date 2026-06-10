# butler-portal Helm chart

Deploys [Butler Portal](https://github.com/butlerdotdev/butler-portal), a Backstage-based internal developer platform that ships the Butler plugin.

## Prerequisites

- Kubernetes 1.27+
- Helm 3.14+
- An installation of the [CloudNativePG](https://cloudnative-pg.io/) operator in the cluster (the chart provisions a `Cluster` resource by default; set `postgresql.enabled=false` to bring your own database)
- A Secret in the release namespace containing the butler-server service-account credentials. See below.

## Create the service-account Secret (required)

The chart fails to render unless `butlerAuth.existingSecret` points at a Secret in the release namespace with the keys `username` and `password`. Create it first:

```bash
kubectl create secret generic butler-server-auth \
  --namespace butler-portal \
  --from-literal=username='<service-account-username>' \
  --from-literal=password='<service-account-password>'
```

The keys can be customized via `butlerAuth.usernameKey` and `butlerAuth.passwordKey` if your existing Secret uses different field names.

## Install

```bash
helm install butler-portal oci://ghcr.io/butlerdotdev/charts/butler-portal \
  --version 0.2.0 \
  --namespace butler-portal \
  --create-namespace \
  --set butlerAuth.existingSecret=butler-server-auth
```

## Configuration

| Key | Default | Description |
|---|---|---|
| `butlerAuth.existingSecret` | `""` | **Required.** Name of an existing Secret in the release namespace holding the butler-server service-account credentials. Chart render fails if this is unset. |
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
| `ingress.enabled` | `false` | Enable the chart-managed `Ingress` resource. |

For the full list, see [`values.yaml`](./values.yaml).

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

## See also

- [`values.yaml`](./values.yaml) for the full set of supported values
- [`templates/`](./templates/) for the rendered Kubernetes resources
- The [butler-portal repository](https://github.com/butlerdotdev/butler-portal) for the application source
