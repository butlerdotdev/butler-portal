---
sidebar_position: 7
sidebar_label: Contributing
---

# Contributing

This guide covers the development setup for Butler Portal and the patterns used when creating or modifying plugins.

## Prerequisites

| Requirement | Version | Purpose |
|---|---|---|
| Node.js | 20+ | JavaScript runtime |
| Yarn | 4 | Package manager (Yarn Berry with PnP) |
| PostgreSQL | 14+ | Backend storage for Keeper plugin and Backstage catalog |
| Docker | Latest (optional) | Running PostgreSQL locally via container |
| Git | Latest | Source control |

## Clone and Install

```bash
git clone https://github.com/butlerdotdev/butler-portal.git
cd butler-portal
yarn install
```

Yarn 4 is configured in the repository via `.yarnrc.yml` and the `corepack` field in `package.json`. If you have corepack enabled, the correct Yarn version activates automatically:

```bash
corepack enable
```

## Database Setup

The Backstage backend and Keeper plugin require PostgreSQL. You can run PostgreSQL locally or in a container.

### Option A: Docker

```bash
docker run -d \
  --name butler-portal-pg \
  -e POSTGRES_USER=butler \
  -e POSTGRES_PASSWORD=butler \
  -e POSTGRES_DB=butler_portal \
  -p 5432:5432 \
  postgres:16-alpine
```

### Option B: Local PostgreSQL

Create a database and user:

```bash
createuser butler
createdb -O butler butler_portal
```

### Configure the Connection

Create a local config file that is gitignored:

```bash
cp app-config.yaml app-config.local.yaml
```

Set the database connection in `app-config.local.yaml`:

```yaml
backend:
  database:
    client: pg
    connection:
      host: localhost
      port: 5432
      user: butler
      password: butler
```

For development without PostgreSQL, you can use SQLite:

```yaml
backend:
  database:
    client: better-sqlite3
    connection: ':memory:'
```

:::warning
SQLite mode does not support Keeper's full-text search or concurrent access. Use PostgreSQL for testing Keeper features.
:::

## Development Server

Start the frontend and backend together:

```bash
yarn dev
```

This runs two processes:

- **Frontend**: Backstage app on `http://localhost:3000` with hot module replacement
- **Backend**: Backstage backend on `http://localhost:7007` with automatic restart on changes

To run them separately:

```bash
# Terminal 1: Backend only
yarn start-backend

# Terminal 2: Frontend only
yarn start
```

## Project Structure

```
butler-portal/
  packages/
    app/                    # Backstage frontend application
      src/
        App.tsx             # Route and plugin registration
        components/
          Root/Root.tsx     # Sidebar navigation
    backend/                # Backstage backend application
      src/
        index.ts            # Backend plugin registration
  plugins/
    butler/                 # Butler cluster management frontend
    butler-backend/         # Butler K8s proxy and WebSocket terminal
    workspaces/             # Chambers workspace management frontend
    registry/               # Keeper artifact registry frontend
    registry-backend/       # Keeper API and PostgreSQL storage
    registry-common/        # Keeper shared types and permissions
    pipeline/               # Herald pipeline builder frontend
    pipeline-backend/       # Herald API and Vector execution
    pipeline-common/        # Herald shared types and permissions
  app-config.yaml           # Base configuration
  package.json              # Root workspace config
  tsconfig.json             # TypeScript config
```

The monorepo is organized as a Yarn workspace. The `packages/` directory contains the Backstage app shell (frontend and backend). The `plugins/` directory contains all Butler-specific plugins, each as a separate workspace package.

## Plugin Development

### Creating a New Plugin

Use the Backstage CLI to scaffold a new plugin:

```bash
# Create a frontend plugin
yarn new --select plugin

# Create a backend plugin
yarn new --select backend-plugin
```

Follow the prompts to name your plugin. The CLI generates the package structure, registers it in the workspace, and creates boilerplate files.

After scaffolding, register the plugin in the app:

1. **Frontend**: Add the plugin page to `packages/app/src/App.tsx`:

    ```typescript
    import { MyPluginPage } from '@internal/plugin-my-plugin';

    // In the FlatRoutes:
    <Route path="/my-plugin" element={<MyPluginPage />} />
    ```

2. **Backend**: Add the plugin to `packages/backend/src/index.ts`:

    ```typescript
    import { myPlugin } from '@internal/plugin-my-plugin-backend';

    backend.add(myPlugin);
    ```

3. **Navigation**: Add a sidebar entry in `packages/app/src/components/Root/Root.tsx`:

    ```typescript
    <SidebarItem icon={ExtensionIcon} to="my-plugin" text="My Plugin" />
    ```

### Testing

Run tests for a specific plugin:

```bash
yarn workspace @internal/plugin-workspaces test
```

Run all tests across the monorepo:

```bash
yarn test:all
```

Run tests in watch mode during development:

```bash
yarn workspace @internal/plugin-workspaces test --watch
```

### Building

Build all packages:

```bash
yarn build:all
```

Build a specific plugin:

```bash
yarn workspace @internal/plugin-workspaces build
```

### Type Checking

Run TypeScript type checking across the entire monorepo:

```bash
yarn tsc
```

### Linting

```bash
yarn lint:all
```

## Development Patterns

### API Client Pattern

Frontend plugins define an API ref and client class for backend communication:

```typescript
// my-plugin-frontend/src/api/MyPluginClient.ts
import { createApiRef, DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';

export const myPluginApiRef = createApiRef<MyPluginApi>({
  id: 'plugin.my-plugin',
});

export class MyPluginClient implements MyPluginApi {
  constructor(
    private readonly discoveryApi: DiscoveryApi,
    private readonly fetchApi: FetchApi,
  ) {}

  async getItems(): Promise<Item[]> {
    const baseUrl = await this.discoveryApi.getBaseUrl('my-plugin');
    const response = await this.fetchApi.fetch(`${baseUrl}/items`);
    return response.json();
  }
}
```

### Backend Router Pattern

Backend plugins expose an Express router:

```typescript
// my-plugin-backend/src/router.ts
import { Router } from 'express';

export async function createRouter(options: RouterOptions): Promise<Router> {
  const { logger, config } = options;
  const router = Router();

  router.get('/items', async (req, res) => {
    // Handle request
    res.json({ items: [] });
  });

  return router;
}
```

### Shared Types

Define interfaces in the common package and import them from both frontend and backend:

```typescript
// my-plugin-common/src/types.ts
export interface Item {
  id: string;
  name: string;
  status: 'active' | 'inactive';
}
```

## See Also

- [Architecture: Plugin System](../architecture/plugin-system.md) for how plugins integrate with Backstage
- [Reference](../reference/) for configuration options
- [Backstage Plugin Development Documentation](https://backstage.io/docs/plugins/) for the upstream Backstage plugin guide
