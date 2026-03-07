---
sidebar_position: 1
---

# Butler Portal

Backstage-based Internal Developer Platform with purpose-built plugins for platform engineering.

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://github.com/butlerdotdev/butler-portal/blob/main/LICENSE)

## Overview

Butler Portal is an Internal Developer Platform (IDP) built on [Backstage](https://backstage.io). It provides a unified interface for platform engineering teams to manage developer environments, infrastructure artifacts, and observability pipelines. Portal extends Backstage with a set of purpose-built plugins that integrate with the broader Butler ecosystem.

While Butler handles Kubernetes cluster provisioning and lifecycle, Portal focuses on the developer experience layer above it. Teams use Portal to provision workspaces, publish and consume infrastructure modules, and configure telemetry routing. Portal runs as a standalone Backstage application and connects to Butler management clusters, Git providers, and artifact registries.

The plugin architecture follows a "household staff" naming convention. Each plugin addresses a distinct platform engineering concern and operates as both a frontend UI extension and a backend service within the Backstage runtime.

## Key Features

- **Developer Workspaces**: Private, ephemeral development environments with SSH access, editor deep links (VS Code, JetBrains), and dotfiles synchronization
- **Infrastructure Registry**: Versioned artifact catalog for Terraform modules, Helm charts, and OPA policies with approval workflows and dependency tracking
- **Telemetry Pipelines**: Visual pipeline builder for log, metric, and trace routing powered by Vector, with source/transform/sink configuration
- **Service Catalog Integration**: Backstage catalog entities enriched with Butler-specific metadata (cluster ownership, addon inventory, provider mappings)
- **Scaffolder Templates**: Backstage scaffolder actions for provisioning Butler resources (clusters, addons, workspaces) through self-service templates

## Plugins

| Plugin | Code Name | Description | Status |
|--------|-----------|-------------|--------|
| **Chambers** | `workspaces` | Private dev environments with SSH access, editor deep links, and dotfiles | Beta |
| **Keeper** | `registry` | IaC artifact registry for Terraform modules, Helm charts, and OPA policies | Beta |
| **Herald** | `pipeline` | Telemetry routing via Vector for logs, metrics, and traces | Beta |
| **Alfred** | — | Infrastructure knowledge platform. Indexes docs, runbooks, and incident history. | Coming Soon |
| **Jeeves** | — | Configuration drift detection and automated remediation | Coming Soon |

## Repository

| | |
|---|---|
| Source | [github.com/butlerdotdev/butler-portal](https://github.com/butlerdotdev/butler-portal) |
| Framework | Backstage v1.45.0 |
| Runtime | Node 20+, Yarn 4 |
| License | Apache 2.0 |

## Get Started

- [Overview and Concepts](./overview/) for understanding Portal architecture and terminology
- [Plugins](./plugins/) for detailed documentation on each plugin
- [Getting Started](./getting-started/) for installation and initial configuration
