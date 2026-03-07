---
sidebar_position: 4
sidebar_label: Plugins
---

# Plugins

Butler Portal extends Backstage with purpose-built plugins for platform engineering. Each plugin addresses a distinct concern and operates as both a frontend UI extension and a backend service within the Backstage runtime.

Plugins follow a "household staff" naming convention. They are developed as packages within the Butler Portal monorepo and are composed of up to three parts: a frontend package (`-frontend`), a backend package (`-backend`), and a common package (`-common`) for shared types and utilities. The frontend provides React components mounted in the Backstage app shell. The backend provides Express routers registered with the Backstage backend, handling API calls, database access, and external service integration.

## Plugin Catalog

| Plugin | Description | Status |
|--------|-------------|--------|
| [**Chambers**](./chambers/) | Private developer workspaces with SSH access, editor deep links (VS Code, JetBrains), and dotfiles synchronization. Provisions ephemeral environments on Butler tenant clusters. | Beta |
| [**Keeper**](./keeper/) | Infrastructure artifact registry for Terraform modules, Helm charts, and OPA policies. Provides versioned storage, approval workflows, and dependency tracking backed by PostgreSQL. | Beta |
| [**Herald**](./herald/) | Telemetry pipeline builder for log, metric, and trace routing. Generates Vector configurations with a visual source/transform/sink editor. | Beta |
| [**Alfred**](./alfred/) | Infrastructure knowledge platform. Indexes documentation, runbooks, and incident history to surface contextual answers. | Coming Soon |
| [**Jeeves**](./jeeves/) | Configuration drift detection and automated remediation. Declares desired state, monitors live infrastructure, and applies corrections when drift is detected. | Coming Soon |

## See Also

- [Architecture](../architecture/) for how plugins integrate with the Backstage runtime
- [Architecture: Plugin System](../architecture/plugin-system.md) for technical details on plugin structure and communication
- [Contributing](../contributing/) for how to develop and test plugins locally
