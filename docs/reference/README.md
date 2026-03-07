---
sidebar_position: 6
sidebar_label: Reference
---

# Configuration Reference

Butler Portal uses Backstage's layered configuration system. Configuration is defined in YAML files and loaded at startup. You can override settings per environment using multiple config files.

## Configuration Files

| File | Purpose | Committed to Git |
|------|---------|-----------------|
| `app-config.yaml` | Base configuration shared across all environments | Yes |
| `app-config.local.yaml` | Local development overrides (secrets, endpoints) | No (gitignored) |
| `app-config.production.yaml` | Production-specific settings | Depends on deployment method |

Backstage merges configuration files in order. Values in later files override earlier ones. Load additional config files with the `--config` flag:

```bash
yarn dev --config app-config.yaml --config app-config.local.yaml
```

## App Configuration

Top-level application settings:

```yaml
app:
  title: Butler Portal
  baseUrl: http://localhost:3000
```

| Field | Description | Default |
|-------|-------------|---------|
| `app.title` | Application title shown in the browser tab and navbar | `Backstage` |
| `app.baseUrl` | Public URL of the frontend application | `http://localhost:3000` |

## Backend Configuration

Settings for the Backstage backend process:

```yaml
backend:
  baseUrl: http://localhost:7007
  listen:
    port: 7007
  cors:
    origin: http://localhost:3000
    methods: [GET, HEAD, PATCH, POST, PUT, DELETE]
    credentials: true
```

| Field | Description | Default |
|-------|-------------|---------|
| `backend.baseUrl` | Public URL of the backend API | `http://localhost:7007` |
| `backend.listen.port` | Port the backend listens on | `7007` |
| `backend.cors.origin` | Allowed CORS origin (set to frontend URL) | `http://localhost:3000` |

## Database Configuration

PostgreSQL connection settings used by the Backstage catalog and the Keeper plugin:

```yaml
backend:
  database:
    client: pg
    connection:
      host: localhost
      port: 5432
      user: butler
      password: ${POSTGRES_PASSWORD}
```

| Field | Description | Default |
|-------|-------------|---------|
| `backend.database.client` | Database driver. Use `pg` for PostgreSQL, `better-sqlite3` for SQLite (dev only). | `better-sqlite3` |
| `backend.database.connection.host` | PostgreSQL server hostname | `localhost` |
| `backend.database.connection.port` | PostgreSQL server port | `5432` |
| `backend.database.connection.user` | Database username | — |
| `backend.database.connection.password` | Database password. Supports `${ENV_VAR}` substitution. | — |

:::tip
For local development without PostgreSQL, you can use SQLite by setting `client: better-sqlite3`. Keeper features that require PostgreSQL (such as full-text search) are unavailable in SQLite mode.
:::

## Butler Cluster Connection

Portal connects to the Butler management cluster using the Backstage Kubernetes plugin:

```yaml
kubernetes:
  clusterLocatorMethods:
    - type: config
      clusters:
        - name: butler-mgmt
          url: https://10.40.0.100:6443
          authProvider: serviceAccount
          serviceAccountToken: ${BUTLER_SA_TOKEN}
          skipTLSVerify: false
          caData: ${BUTLER_CA_DATA}
```

| Field | Description | Required |
|-------|-------------|----------|
| `clusters[].name` | Display name for the cluster | Yes |
| `clusters[].url` | Kubernetes API server URL | Yes |
| `clusters[].authProvider` | Authentication method. Use `serviceAccount` for token-based auth. | Yes |
| `clusters[].serviceAccountToken` | Bearer token for the service account | Yes (for `serviceAccount` auth) |
| `clusters[].skipTLSVerify` | Skip TLS certificate verification | No (default `false`) |
| `clusters[].caData` | Base64-encoded CA certificate for the cluster | No |

The service account needs RBAC permissions to read and manage Butler CRDs. At minimum, it requires `get`, `list`, `watch`, `create`, `update`, and `delete` on `workspaces`, `tenantclusters`, `teams`, and related resources in the `butler.butlerlabs.dev` API group.

## Authentication and Authorization

### Guest Access (Development)

For local development, you can enable guest access:

```yaml
auth:
  providers:
    guest:
      dangerouslyAllowOutsideDevelopment: false
```

### GitHub Authentication

```yaml
auth:
  providers:
    github:
      development:
        clientId: ${GITHUB_CLIENT_ID}
        clientSecret: ${GITHUB_CLIENT_SECRET}
```

### OIDC Authentication

For production deployments with an external identity provider:

```yaml
auth:
  providers:
    oidc:
      development:
        metadataUrl: https://your-idp.example.com/.well-known/openid-configuration
        clientId: ${OIDC_CLIENT_ID}
        clientSecret: ${OIDC_CLIENT_SECRET}
        prompt: auto
```

## Plugin Configuration

### Chambers (Workspaces)

```yaml
chambers:
  defaultCluster: butler-mgmt
  defaultNamespace: default
  sshGateway:
    host: ssh.butlerlabs.dev
    port: 2222
  editors:
    - name: VS Code
      urlTemplate: "vscode://vscode-remote/ssh-remote+{sshEndpoint}/{workDir}"
    - name: JetBrains Gateway
      urlTemplate: "jetbrains-gateway://connect#host={sshHost}&port={sshPort}&path={workDir}"
```

| Field | Description | Default |
|-------|-------------|---------|
| `chambers.defaultCluster` | Kubernetes cluster for workspace provisioning | — |
| `chambers.defaultNamespace` | Default namespace for new workspaces | `default` |
| `chambers.sshGateway.host` | SSH gateway hostname for workspace access | — |
| `chambers.sshGateway.port` | SSH gateway port | `22` |
| `chambers.editors` | List of editor integrations with URL templates | `[]` |

### Keeper (Registry)

```yaml
keeper:
  storage:
    type: database
  approval:
    requiredReviewers: 1
    autoApprovePatches: true
```

| Field | Description | Default |
|-------|-------------|---------|
| `keeper.storage.type` | Artifact storage backend. `database` stores in PostgreSQL. | `database` |
| `keeper.approval.requiredReviewers` | Number of approvals required to publish an artifact version | `1` |
| `keeper.approval.autoApprovePatches` | Automatically approve patch version bumps | `false` |

### Herald (Pipeline)

```yaml
herald:
  vector:
    configDir: /etc/vector
    defaultSources:
      - kubernetes_logs
    defaultSinks:
      - console
```

| Field | Description | Default |
|-------|-------------|---------|
| `herald.vector.configDir` | Directory where generated Vector configs are written | `/etc/vector` |
| `herald.vector.defaultSources` | Default Vector sources for new pipelines | `[]` |
| `herald.vector.defaultSinks` | Default Vector sinks for new pipelines | `[]` |

## Environment Variable Substitution

Backstage supports `${ENV_VAR}` syntax in YAML config files. At startup, these references are replaced with the corresponding environment variable values. This is the recommended way to inject secrets:

```bash
export POSTGRES_PASSWORD=my-secret-password
export BUTLER_SA_TOKEN=eyJhbGci...
yarn dev
```

If a referenced environment variable is not set, the application fails to start with a configuration error.

## See Also

- [Getting Started](../getting-started/) for initial setup and configuration
- [Architecture](../architecture/) for how configuration flows through the system
- [Backstage Configuration Documentation](https://backstage.io/docs/conf/) for the full Backstage configuration reference
