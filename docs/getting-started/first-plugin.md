---
sidebar_position: 2
sidebar_label: Enable Your First Plugin
---

# Enable Your First Plugin

Butler Portal ships with several plugins that extend the platform with specific capabilities. This guide walks you through enabling **Chambers**, the workspace management plugin, as your first plugin configuration.

Chambers is the simplest plugin to set up because it requires no additional backend dependencies beyond the Kubernetes connection you configured during [installation](./README.md).

## What Chambers Does

Chambers provides a UI for managing Butler Workspaces. It connects to the Butler API on your management cluster and allows you to:

- List all workspaces across teams
- View workspace details, status, and resource usage
- Create and delete workspaces through the Portal interface

Workspaces map to the `Workspace` CRD in the Butler API (`butler.butlerlabs.dev/v1alpha1`).

## Configure Chambers

Add the Chambers plugin configuration to your `app-config.local.yaml`:

```yaml
chambers:
  enabled: true
  kubernetes:
    clusterName: butler-mgmt
```

The `clusterName` value must match the cluster name defined in your `kubernetes.clusterLocatorMethods` configuration from the [Getting Started](./README.md) guide.

### Full configuration reference

| Field | Type | Required | Description |
|---|---|---|---|
| `chambers.enabled` | boolean | Yes | Enables the Chambers plugin |
| `chambers.kubernetes.clusterName` | string | Yes | Name of the Butler management cluster to connect to |

## Restart the Dev Server

After updating the configuration, restart the development server to pick up the changes:

```bash
yarn dev
```

## Verify in the UI

Once the server starts, open [http://localhost:3000](http://localhost:3000) and look for **Chambers** in the left sidebar navigation.

When you select Chambers, you see the workspace list view. This view displays all workspaces that exist on your connected Butler management cluster. If no workspaces exist yet, the page displays an empty state with a prompt to create one.

The workspace detail view shows:

- **Status** -- current phase (Pending, Active, Terminating)
- **Team** -- the owning team
- **Resources** -- allocated CPU, memory, and storage
- **Age** -- time since creation

## Enabling Other Plugins

Butler Portal includes additional plugins beyond Chambers. Each plugin has its own configuration section in `app-config.local.yaml` and may require additional backend dependencies.

### Keeper

Keeper is the IaC artifact registry. It stores and indexes Terraform modules, Helm charts, and other infrastructure-as-code artifacts. Keeper requires PostgreSQL for its backend metadata store.

```yaml
keeper:
  enabled: true
  database:
    client: pg
    connection:
      host: localhost
      port: 5432
      user: butler
      password: ${POSTGRES_PASSWORD}
      database: keeper
```

See the [Keeper plugin documentation](../plugins/keeper/) for the full setup guide.

### Herald

Herald manages telemetry pipeline configurations. It provides a UI for defining log, metric, and trace collection pipelines that deploy to tenant clusters as addons.

```yaml
herald:
  enabled: true
  kubernetes:
    clusterName: butler-mgmt
```

See the [Herald plugin documentation](../plugins/herald/) for the full setup guide.

## Troubleshooting

### Chambers does not appear in the sidebar

**Cause:** The plugin is not enabled in the configuration.

**Fix:** Verify that `chambers.enabled` is set to `true` in `app-config.local.yaml` and restart the dev server.

### Workspace list is empty or shows an error

**Cause:** The Portal cannot reach the Butler management cluster, or the service account lacks permission to list Workspace resources.

**Diagnosis:**

Check the backend logs for Kubernetes API errors. Common issues include:

- Expired or invalid service account token
- Missing RBAC permissions for the `workspaces` resource in the `butler.butlerlabs.dev` API group
- Network connectivity between the Portal backend and the cluster API server

**Fix:** Verify your kubeconfig and service account permissions:

```bash
kubectl auth can-i list workspaces.butler.butlerlabs.dev --as=system:serviceaccount:butler-system:butler-portal
```

## Next Steps

- Explore the [Keeper plugin](../plugins/keeper/) to set up the IaC artifact registry.
- Explore the [Herald plugin](../plugins/herald/) to configure telemetry pipelines.
- Review the full [Plugin reference](../reference/) for configuration options across all plugins.
