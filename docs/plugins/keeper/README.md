---
sidebar_position: 1
sidebar_label: Overview
---

# Keeper

Keeper is Butler Portal's infrastructure-as-code (IaC) artifact registry plugin. It provides a centralized catalog where platform teams publish, version, and manage infrastructure components such as Terraform modules, Helm charts, OPA policies, and Backstage templates.

Keeper gives teams a single place to discover approved infrastructure building blocks, enforce promotion workflows before artifacts reach production, and track version history with changelogs. It integrates with Butler's Team CRD for access control and with the Backstage catalog for service-level visibility into infrastructure dependencies.

The plugin code name is `registry`. It consists of three packages: `registry` (frontend), `registry-backend` (API server with PostgreSQL storage), and `registry-common` (shared TypeScript types).

## Key Features

- **Versioned artifact catalog.** Every artifact follows semantic versioning. Published versions are immutable, ensuring reproducible infrastructure.
- **Approval workflows.** Artifacts progress through Draft, Review, Approved, and Published states before teams can consume them. Reviewers and approvers are tracked per version.
- **Team-scoped access control.** Artifacts belong to Butler teams. Team membership and roles (admin, operator, viewer) determine who can publish, review, and consume artifacts.
- **Search and discovery.** The registry UI supports full-text search with filtering by artifact type, owning team, and approval status.
- **Version comparison.** Compare any two versions of an artifact side by side, with highlighted differences in configuration and metadata.
- **Changelog tracking.** Each version carries a changelog entry describing what changed, enabling teams to evaluate upgrades before adopting them.

## Supported Artifact Types

| Type | Description | Typical Consumer |
|------|-------------|------------------|
| **Terraform Module** | Reusable infrastructure module (VPC, database, IAM, etc.) | Terraform configurations via `module` source |
| **Helm Chart** | Packaged Kubernetes application or component | Helm installs, Flux HelmReleases, Butler TenantAddons |
| **OPA Policy** | Open Policy Agent policy bundle for admission control or authorization | OPA Gatekeeper, Conftest, CI policy checks |
| **Backstage Template** | Scaffolder template for self-service resource creation | Backstage scaffolder UI and API |

## Integration with Backstage Catalog

Keeper registers published artifacts as entities in the Backstage software catalog. Each artifact appears as a catalog entity with:

- **Metadata** including the artifact name, description, owning team, and current published version
- **Relations** linking the artifact to the team entity and any consuming services
- **Annotations** pointing to the artifact's registry page for detailed version history

This integration lets developers discover infrastructure components through the same catalog they use for services and APIs.

## Integration with Butler Teams

Keeper relies on Butler's `Team` CRD for ownership and access control. When a team is created in Butler, Keeper recognizes it as a valid scope for artifact publishing. Team roles map to registry permissions:

| Team Role | Registry Permissions |
|-----------|---------------------|
| **Admin** | Publish, review, approve, delete artifacts. Manage team registry settings. |
| **Operator** | Publish new artifacts and versions. Submit for review. |
| **Viewer** | Browse and consume published artifacts. |

Artifacts published by a team are visible to all Portal users for discovery, but only team members with the appropriate role can modify or promote them.

## Architecture

Keeper follows the standard Butler Portal plugin architecture with three packages:

```
butler-portal/
  plugins/
    registry/              # Frontend (React)
    registry-backend/      # Backend (Express, PostgreSQL)
    registry-common/       # Shared types
```

The backend stores artifact metadata, version records, and approval history in PostgreSQL. Schema migrations run automatically on startup. The frontend communicates with the backend through Backstage's proxy, and all requests are authenticated through Portal's session middleware.

## See Also

- [Concepts](./concepts.md) for detailed definitions of artifacts, versions, and approval workflows
- [Usage Guide](./usage.md) for step-by-step instructions on publishing and consuming artifacts
- [Butler Portal Overview](/butler-portal/intro) for the broader Portal platform context
