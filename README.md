# Butler Portal

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Backstage](https://img.shields.io/badge/Backstage-v1.45.0-9cf)](https://backstage.io)

[Butler Labs](https://butlerlabs.dev)' Internal Developer Platform, built on [Backstage](https://backstage.io).

Butler Portal gives dev teams self-service access to infrastructure, service catalogs, golden paths, and documentation. The [Butler](https://github.com/butlerdotdev/butler) plugin is the first integration, adding Kubernetes-as-a-Service from the Butler control plane. More plugins are coming to fill out the rest of the platform engineering stack.

## Features

### Butler Plugin

- Team-scoped cluster management (create, scale, delete)
- Addon catalog with install/upgrade/remove
- Infrastructure providers (Harvester, Nutanix, Proxmox)
- FluxCD GitOps workflows for clusters and addons
- Certificate monitoring and rotation
- In-browser cluster terminal over WebSocket
- OIDC/SSO identity provider management
- Admin views for management cluster, users, and settings

### Platform

- Google OIDC auth with Butler identity resolution
- Software catalog for service ownership and APIs
- TechDocs
- Scaffolder templates for new services and infrastructure

## Architecture

```
packages/
  app/                    # Backstage frontend
  backend/                # Backstage backend

plugins/
  butler/                 # Frontend: UI components, API client, routing
  butler-backend/         # Backend: BFF proxy to butler-server
```

The backend plugin authenticates to [butler-server](https://github.com/butlerdotdev/butler-server) with a service account and maps Backstage users to Butler teams and permissions. The browser never talks to butler-server directly.

## Prerequisites

- Node.js 20+
- Yarn 4+
- A running [butler-server](https://github.com/butlerdotdev/butler-server) instance

## Getting Started

```sh
yarn install
yarn start
```

Starts the frontend (port 3000) and backend (port 7007).

### Configuration

Copy `app-config.local.yaml.example` to `app-config.local.yaml`:

```yaml
butler:
  baseUrl: http://localhost:8080
  auth:
    username: ${BUTLER_SERVICE_ACCOUNT_USER}
    password: ${BUTLER_SERVICE_ACCOUNT_PASSWORD}
```

For Google SSO, set `AUTH_GOOGLE_CLIENT_ID` and `AUTH_GOOGLE_CLIENT_SECRET`.

## Development

```sh
yarn start        # dev server with hot reload
yarn tsc          # type check
yarn build:all    # production build
```

## Related Projects

| Project | Description |
|---|---|
| [butler-server](https://github.com/butlerdotdev/butler-server) | API server for the console and portal |
| [butler-console](https://github.com/butlerdotdev/butler-console) | Operator-facing management console |
| [butler-controller](https://github.com/butlerdotdev/butler-controller) | Reconciliation controllers for Butler CRDs |
| [butler-api](https://github.com/butlerdotdev/butler-api) | CRD type definitions |
| [steward](https://github.com/butlerdotdev/steward) | Hosted control plane manager for Kubernetes |
| [butler-charts](https://github.com/butlerdotdev/butler-charts) | Helm charts for Butler components |

## License

Apache 2.0. See [LICENSE](LICENSE).
