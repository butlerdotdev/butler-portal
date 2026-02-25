# Butler Portal

Internal developer portal powered by [Backstage](https://backstage.io/), providing a unified interface for Butler Labs' software catalog, documentation, and developer tools.

## Features

- **Software Catalog** — Browse all Butler components, systems, APIs, and infrastructure resources
- **TechDocs** — Rendered documentation from across the Butler ecosystem
- **Scaffolder** — Templates for creating new projects and components
- **Kubernetes** — Cluster status and workload visibility
- **Search** — Full-text search across catalog entities and documentation

## Architecture

Butler Portal extends Backstage with custom plugins:

- **butler-backend** — Integrates with Butler Server for cluster management
- **registry-backend** — IaC module registry (Terraform, Helm, OCI)
- **pipeline-backend** — Observability pipeline management with Vector

See the [Architecture Decision Records](architecture/) for detailed design decisions.
