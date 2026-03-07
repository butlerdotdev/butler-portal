---
sidebar_position: 2
sidebar_label: Plugin System
---

# Plugin System

Butler Portal plugins follow the standard Backstage plugin architecture. Each plugin is composed of up to three packages that work together: a frontend, a backend, and a common package for shared types.

## Plugin Package Structure

A typical plugin consists of three packages within the monorepo:

```
plugins/
  chambers-frontend/       # React components, pages, routes
    src/
      plugin.ts            # Plugin registration and route bindings
      components/          # React components
      api/                 # API client for backend calls
    package.json
  chambers-backend/        # Express router, service logic
    src/
      plugin.ts            # Backend plugin registration
      router.ts            # Express route handlers
      service.ts           # Business logic and external calls
    package.json
  chambers-common/         # Shared types and utilities
    src/
      types.ts             # TypeScript interfaces shared across frontend and backend
    package.json
```

The `-common` package is optional. Use it when the frontend and backend share type definitions, constants, or validation logic.

## Frontend Plugins

Frontend plugins are React components that mount into the Backstage app shell. Each frontend plugin exports a plugin object and one or more routable extensions.

### Registration

Frontend plugins register with the Backstage app in `packages/app/src/App.tsx`:

```typescript
import { chambersPlugin, ChambersPage } from '@butlerlabs/plugin-chambers-frontend';

// In the app routes:
<Route path="/chambers" element={<ChambersPage />} />
```

The plugin object created via `createPlugin()` declares the plugin's ID, API references, and any dependencies on other plugins.

### API Communication

Frontend plugins communicate with their backends through the Backstage proxy or by using API refs. There are two patterns:

**Proxy pattern**: The frontend calls the Backstage backend proxy, which forwards requests to the plugin backend. This is the simpler approach and works well when the backend is colocated with the Backstage backend.

```typescript
// Frontend API client using the proxy
const response = await fetch(`${baseUrl}/api/proxy/chambers/workspaces`);
```

**API ref pattern**: The frontend declares an API ref and provides a client implementation. The Backstage API system handles dependency injection and discovery.

```typescript
import { createApiRef } from '@backstage/core-plugin-api';

export const chambersApiRef = createApiRef<ChambersApi>({
  id: 'plugin.chambers',
});
```

## Backend Plugins

Backend plugins are Express routers that register with the Backstage backend. They handle HTTP requests, interact with databases, and call external services.

### Registration

Backend plugins register with the Backstage backend in `packages/backend/src/index.ts`:

```typescript
import { chambersPlugin } from '@butlerlabs/plugin-chambers-backend';

// In the backend builder:
backend.add(chambersPlugin);
```

### Router Structure

Each backend plugin exports a router factory that receives Backstage backend services (logger, database, config, permissions):

```typescript
import { createRouter } from './router';

export const chambersPlugin = createBackendPlugin({
  pluginId: 'chambers',
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
// chambers-common/src/types.ts
export interface Workspace {
  name: string;
  namespace: string;
  status: WorkspacePhase;
  sshEndpoint?: string;
  editorUrl?: string;
}

export type WorkspacePhase =
  | 'Pending'
  | 'Running'
  | 'Stopped'
  | 'Failed';
```

Both the frontend and backend import from the common package:

```typescript
import { Workspace, WorkspacePhase } from '@butlerlabs/plugin-chambers-common';
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
