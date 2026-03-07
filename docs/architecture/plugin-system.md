---
sidebar_position: 2
sidebar_label: Plugin System
---

# Plugin System

Butler Portal plugins follow the standard Backstage plugin architecture. Each plugin is composed of up to three packages that work together: a frontend, a backend, and a common package for shared types.

## Plugin Package Structure

Plugins vary in composition. Some have frontend, backend, and common packages. Others are frontend-only and rely on shared backends for data access.

```
plugins/
  butler/                  # Cluster management frontend
  butler-backend/          # K8s proxy, WebSocket terminal, cluster API
  workspaces/              # Chambers frontend (frontend-only, uses butler-backend)
  registry/                # Keeper frontend
  registry-backend/        # Keeper API and PostgreSQL storage
  registry-common/         # Keeper shared types and permissions
  pipeline/                # Herald frontend (React Flow, CodeMirror)
  pipeline-backend/        # Herald API and Vector execution
  pipeline-common/         # Herald shared types and permissions
```

Not every plugin needs all three packages. Chambers (`workspaces`) is a frontend-only plugin that communicates with the management cluster through the Butler backend. Keeper and Herald each have their own backends and common packages because they manage independent data stores and permissions.

## Frontend Plugins

Frontend plugins are React components that mount into the Backstage app shell. Each frontend plugin exports a plugin object and one or more routable extensions.

### Registration

Frontend plugins register with the Backstage app in `packages/app/src/App.tsx`:

```typescript
import { ButlerPage } from '@internal/plugin-butler';

// In the app routes:
<Route path="/butler" element={<ButlerPage />} />
```

The plugin object created via `createPlugin()` declares the plugin's ID, API references, and any dependencies on other plugins.

### API Communication

Frontend plugins communicate with their backends through the Backstage proxy or by using API refs. There are two patterns:

**Proxy pattern**: The frontend calls the Backstage backend proxy, which forwards requests to the plugin backend. This is the simpler approach and works well when the backend is colocated with the Backstage backend.

```typescript
// Frontend API client using the proxy
const response = await fetch(`${baseUrl}/api/proxy/butler/clusters`);
```

**API ref pattern**: The frontend declares an API ref and provides a client implementation. The Backstage API system handles dependency injection and discovery.

```typescript
import { createApiRef } from '@backstage/core-plugin-api';

export const butlerApiRef = createApiRef<ButlerApi>({
  id: 'plugin.butler',
});
```

## Backend Plugins

Backend plugins are Express routers that register with the Backstage backend. They handle HTTP requests, interact with databases, and call external services.

### Registration

Backend plugins register with the Backstage backend in `packages/backend/src/index.ts`:

```typescript
import { butlerPlugin } from '@internal/plugin-butler-backend';

// In the backend builder:
backend.add(butlerPlugin);
```

### Router Structure

Each backend plugin exports a router factory that receives Backstage backend services (logger, database, config, permissions):

```typescript
import { createRouter } from './router';

export const butlerPlugin = createBackendPlugin({
  pluginId: 'butler',
  register(env) {
    env.registerInit({
      deps: {
        httpRouter: coreServices.httpRouter,
        logger: coreServices.logger,
        config: coreServices.rootConfig,
      },
      async init({ httpRouter, logger, config }) {
        httpRouter.use(
          await createRouter({ logger, config }),
        );
      },
    });
  },
});
```

### External Service Communication

Backend plugins communicate with the Butler management cluster through the Backstage Kubernetes plugin. This provides authenticated access to the Kubernetes API server and Butler CRDs:

```typescript
import { KubernetesClientProvider } from '@backstage/plugin-kubernetes-node';

// Use the Kubernetes client to list Workspace resources
const client = await kubernetesClientProvider.getClient(clusterName);
const workspaces = await client.listNamespacedCustomObject(
  'butler.butlerlabs.dev',
  'v1alpha1',
  namespace,
  'workspaces',
);
```

## Common Packages

Common packages contain shared TypeScript types, constants, and utility functions used by both the frontend and backend packages of a plugin. They have no runtime dependencies on Backstage APIs.

```typescript
// registry-common/src/types.ts
export interface Artifact {
  id: string;
  name: string;
  type: ArtifactType;
  version: string;
  status: ArtifactStatus;
}

export type ArtifactType =
  | 'terraform-module'
  | 'helm-chart'
  | 'opa-policy';
```

Both the frontend and backend import from the common package:

```typescript
import { Artifact, ArtifactType } from '@internal/plugin-registry-common';
```

## Plugin Discovery

Backstage uses a static plugin discovery model. Plugins are installed as npm packages and explicitly registered in the app and backend entry points. There is no dynamic plugin loading at runtime.

To add a new plugin to the Portal:

1. Create the plugin packages under `plugins/` in the monorepo.
2. Add the frontend plugin to `packages/app/src/App.tsx`.
3. Add the backend plugin to `packages/backend/src/index.ts`.
4. Add navigation entries to `packages/app/src/components/Root/Root.tsx`.

## See Also

- [Architecture Overview](../architecture/) for the high-level system diagram
- [Contributing](../contributing/) for step-by-step plugin development instructions
- [Reference](../reference/) for plugin configuration options
