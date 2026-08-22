# Butler frontend plugin

`@internal/plugin-butler` is the Backstage frontend for Butler, the Kubernetes-as-a-Service platform. It renders the team dashboard, tenant cluster list and detail pages (overview, nodes, addons, GitOps, certificates, events, terminal), cluster creation, team membership and settings, and the platform admin views (management cluster, providers, identity providers, users, settings).

All data comes from butler-server through the `@internal/plugin-butler-backend` proxy. The frontend never talks to butler-server directly: `ButlerApiClient` calls the backend plugin via the Backstage discovery and fetch APIs, and the backend attaches the service account credentials and the caller's identity.

## Configuration

These keys live under `butler:` in `app-config.yaml` and are read by the backend plugin.

| Key | Purpose |
| --- | --- |
| `butler.baseUrl` | URL of butler-server. Defaults to `http://localhost:8080` in development through `BUTLER_SERVER_URL`. |
| `butler.auth.username` | Service account user the backend authenticates to butler-server with. No default; empty values and the literal `admin` are rejected at startup. |
| `butler.auth.password` | Service account password. |
| `butler.signing.kid` | Key id for portal-minted JWT proofs. Optional; when unset the legacy bearer plus `X-Butler-User-Email` carrier is used. |
| `butler.signing.keyPath` | Path to the PEM signing key. Both signing fields must be set and the file must exist for the signer to be enabled. |
| `butler.identity.emailDomain` | Domain appended to Backstage user refs that carry no email, so butler-server can map the caller to a Butler user. |
| `butler.authorization.allowUnmappedRoutes` | When true, backend routes that have no Backstage permission mapping are allowed through instead of being denied. Intended for development only. |

The identity and authorization keys are consumed by the backend plugin's identity bridge. If your backend checkout does not read them yet they are ignored.

## Running against a local butler-server

1. Start butler-server from the butler repository, pointed at a management cluster kubeconfig:

   ```sh
   go run ./cmd/server -dev -kubeconfig ~/.kube/butler-mgmt.yaml
   ```

   The server listens on `:8080`, which matches the `butler.baseUrl` default.

2. Provide service account credentials through the environment or an `app-config.local.yaml` override:

   ```sh
   export BUTLER_SERVICE_ACCOUNT_USER=portal
   export BUTLER_SERVICE_ACCOUNT_PASSWORD=...
   ```

3. Start the full portal from the repository root:

   ```sh
   yarn start
   ```

   The plugin is mounted at `/butler`.

## Running the fixture dev app

The plugin ships a standalone dev harness under `dev/` that does not need butler-server or the backend plugin. It registers `MockButlerApi`, an in-memory implementation of `ButlerApi` backed by the fixtures in `src/api/fixtures/clusters.ts`, plus a permission API that allows everything.

```sh
yarn workspace @internal/plugin-butler start
```

Open the URL the CLI prints and navigate to `/butler`. The fixture set covers one team with clusters in every lifecycle phase:

- `pending-alpha`: Pending, no status yet
- `provisioning-bravo`: Provisioning, 1 of 3 workers ready, `WorkersReady` condition `WorkersProvisioning`
- `installing-charlie`: Installing, addons partially installed
- `ready-delta`: Ready, GitOps enabled, workspaces enabled
- `degraded-echo`: Ready with a `Ready` condition reason `ReconcileDegraded`
- `scaling-foxtrot`: Ready with more ready workers than desired (scale-down in progress)
- `failed-golf`: Failed, failure message on the `Ready` condition
- `deleting-hotel`: Deleting

Mutations change the in-memory state so the UI sees realistic transitions. Scaling a cluster advances one ready worker per subsequent read until it converges, deleting a cluster shows Deleting once and then removes it, certificate rotation reports in progress and then completed on the next poll, and addon installs converge on the next list. Methods the UI does not use throw `not implemented in MockButlerApi: <name>` so gaps are visible.

`MockButlerApi` also takes options for tests:

```ts
new MockButlerApi({
  failures: { getCluster: new Error('boom') },
  latencyMs: 200,
});
```

## Tests

Run the plugin's tests from the repository root:

```sh
CI=true yarn workspace @internal/plugin-butler test
```

`src/api/MockButlerApi.test.ts` covers the fixture shapes and the mock's lifecycle behaviour. `src/components/clusters/ClusterDetailPage.test.tsx` renders the detail page through `renderInTestApp` with `MockButlerApi` and asserts the Ready, degraded, Failed and error states. Type checking for the whole repository is `yarn tsc`, and the plugin builds with `yarn workspace @internal/plugin-butler build`.
