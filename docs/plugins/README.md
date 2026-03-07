---
sidebar_position: 4
sidebar_label: Plugins
---

# Plugins

Butler Portal extends Backstage with purpose-built plugins for platform engineering. Each plugin addresses a distinct concern and operates as a frontend UI extension within the Backstage app shell, with optional backend services for data storage and external integrations.

Plugins follow a "household staff" naming convention. They are developed as packages within the Butler Portal monorepo. A plugin can consist of up to three parts: a frontend package, a backend package, and a common package for shared types. Not every plugin requires all three. Chambers, for example, is frontend-only and uses the Butler backend for Kubernetes API access.

## Plugin Catalog

| Plugin | Package(s) | Description | Status |
|--------|------------|-------------|--------|
| [**Butler**](../overview/concepts#butler-plugin) | `butler`, `butler-backend` | Kubernetes cluster management, terminal access, and addon management. Mirrors Butler Console functionality with Portal-specific integrations. | Beta |
| [**Chambers**](./chambers/) | `workspaces` | Private developer workspaces with SSH access, editor deep links (VS Code, JetBrains), and dotfiles synchronization. Provisions ephemeral environments on Butler tenant clusters. | Beta |
| [**Keeper**](./keeper/) | `registry`, `registry-backend`, `registry-common` | Infrastructure artifact registry for Terraform modules, Helm charts, and OPA policies. Provides versioned storage, approval workflows, and dependency tracking backed by PostgreSQL. | Beta |
| [**Herald**](./herald/) | `pipeline`, `pipeline-backend`, `pipeline-common` | Telemetry pipeline builder for log, metric, and trace routing. Generates Vector configurations with a visual source/transform/sink editor. | Beta |
| [**Alfred**](./alfred/) | -- | Infrastructure knowledge platform. Indexes documentation, runbooks, and incident history to surface contextual answers. | Coming Soon |
| [**Jeeves**](./jeeves/) | -- | Configuration drift detection and automated remediation. Declares desired state, monitors live infrastructure, and applies corrections when drift is detected. | Coming Soon |

## See Also

- [Architecture](../architecture/) for how plugins integrate with the Backstage runtime
- [Architecture: Plugin System](../architecture/plugin-system.md) for technical details on plugin structure and communication
- [Contributing](../contributing/) for how to develop and test plugins locally
