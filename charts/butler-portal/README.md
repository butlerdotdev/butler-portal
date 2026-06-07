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

`0.2.1` adds an opt-out for the runtime validation that rejects the literal `"admin"` username or password. The opt-out exists for operators who run butler-portal in a closed network alongside a butler-server that uses the built-in admin account, where rotating to a real service account is operationally deferred. Setting the opt-out keeps the validation in place for everyone else (empty values still throw; non-`"admin"` literals are unaffected).

To opt out, set `BUTLER_ALLOW_INSECURE_ADMIN_CREDENTIALS=true` on the portal pod, typically via the chart's `extraEnv`:

```yaml
extraEnv:
  - name: BUTLER_ALLOW_INSECURE_ADMIN_CREDENTIALS
    value: "true"
```

The portal logs a warning at init time when the opt-out is honored. The check is strict equality on the string `"true"`; values like `"TRUE"`, `"yes"`, `"1"`, or an unset variable do not disable the validation.

**Do NOT use this for any deployment where butler-server is reachable from networks outside your control.** Rotate the affected credential and remove the opt-out as soon as the rotation completes.

## See also

- [`values.yaml`](./values.yaml) for the full set of supported values
- [`templates/`](./templates/) for the rendered Kubernetes resources
- The [butler-portal repository](https://github.com/butlerdotdev/butler-portal) for the application source
