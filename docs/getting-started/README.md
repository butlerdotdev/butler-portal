---
sidebar_position: 3
sidebar_label: Getting Started
---

# Getting Started

This guide walks you through installing Butler Portal locally and connecting it to a Butler management cluster.

## Prerequisites

Before you begin, ensure you have the following installed and configured:

| Requirement | Version | Purpose |
|---|---|---|
| Node.js | 20+ | JavaScript runtime |
| Yarn | 4 | Package manager |
| PostgreSQL | 14+ | Backend storage for Keeper plugin |
| kubectl | Latest | Kubernetes cluster access |
| Access to a Butler management cluster | -- | Source of Kubernetes resources managed through the Butler API |

Your `kubectl` context must be configured to reach the management cluster. Verify connectivity:

```bash
kubectl cluster-info
```

## Installation

### Step 1: Clone the repository

```bash
git clone https://github.com/butlerdotdev/butler-portal.git
cd butler-portal
```

### Step 2: Install dependencies

```bash
yarn install
```

### Step 3: Configure the application

Copy the example configuration and edit it for your environment:

```bash
cp app-config.yaml app-config.local.yaml
```

Open `app-config.local.yaml` and set the following values:

```yaml
app:
  title: Butler Portal
  baseUrl: http://localhost:3000

backend:
  baseUrl: http://localhost:7007

  database:
    client: pg
    connection:
      host: localhost
      port: 5432
      user: butler
      password: ${POSTGRES_PASSWORD}

kubernetes:
  clusterLocatorMethods:
    - type: config
      clusters:
        - name: butler-mgmt
          url: ${BUTLER_CLUSTER_URL}
          authProvider: serviceAccount
          serviceAccountToken: ${BUTLER_SA_TOKEN}
```

Replace the environment variables with values for your environment, or export them before starting the dev server:

```bash
export POSTGRES_PASSWORD=your-db-password
export BUTLER_CLUSTER_URL=https://your-cluster-api:6443
export BUTLER_SA_TOKEN=your-service-account-token
```

:::tip
You can retrieve your cluster URL and service account token from the management cluster kubeconfig. See [Kubernetes documentation](https://kubernetes.io/docs/tasks/access-application-cluster/access-cluster/) for details on creating service accounts with appropriate RBAC.
:::

### Step 4: Start the development server

```bash
yarn dev
```

This starts the Backstage frontend on port 3000 and the backend on port 7007.

### Step 5: Open the Portal

Navigate to [http://localhost:3000](http://localhost:3000) in your browser. You see the Butler Portal homepage with the plugin catalog.

## Verify the Setup

Confirm that the Portal connects to your Butler management cluster:

1. Open the Butler Portal at `http://localhost:3000`.
2. Navigate to the **Chambers** plugin in the sidebar.
3. Verify that workspaces from your management cluster appear in the list.

If the connection fails, check the backend logs in your terminal for errors related to Kubernetes authentication or network connectivity.

## Next Steps

- [Enable Your First Plugin](./first-plugin.md) to configure Chambers for workspace management.
- Explore the [Plugins overview](../plugins/) to learn about Keeper, Herald, and other available plugins.
- Review the [Architecture](../architecture/) section to understand how Butler Portal connects to the Butler ecosystem.
