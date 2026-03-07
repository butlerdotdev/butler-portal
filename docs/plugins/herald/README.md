---
sidebar_position: 1
sidebar_label: Overview
---

# Herald

Herald is Butler Portal's telemetry routing plugin. It provides a visual pipeline builder for configuring how observability data (logs, metrics, and traces) flows through your infrastructure. Herald uses [Vector](https://vector.dev) as its data processing engine and integrates with Butler-managed clusters for deployment.

## Key Features

- **Visual pipeline builder**: Drag-and-drop interface for constructing data routing pipelines as directed acyclic graphs (DAGs)
- **Vector-native configuration**: Pipelines compile directly to Vector YAML configuration with full access to Vector's component library
- **VRL support**: Write and validate Vector Remap Language (VRL) expressions for data transformation with syntax highlighting and inline error reporting
- **Pipeline validation**: Validate pipeline structure and VRL programs against the Vector binary before deployment
- **Pipeline preview**: Send sample events through your pipeline and inspect the output at each stage
- **Fleet management**: Register Vector agents, organize them into groups with label selectors, and deploy pipelines to targeted agents
- **Version history**: Every pipeline save creates a new version with diff comparison and rollback support
- **Import and export**: Import existing Vector configurations (YAML or TOML) into the visual builder, or export pipelines as Vector YAML

## Architecture

Herald follows a three-layer architecture from UI to deployment.

```
Portal UI (pipeline plugin)
       |
       |  REST API
       v
Backstage Backend (pipeline-backend plugin)
       |
       |  Vector binary (validate, VRL execute)
       |  SQLite database (pipelines, versions, fleet)
       v
Fleet Agents (Vector instances on clusters)
       |
       |  Poll for config updates (~15s)
       |  Validate locally, apply or reject
       v
Data Pipeline Running on Target Clusters
```

### Plugin Packages

Herald consists of three Backstage plugin packages.

| Package | Purpose |
|---------|---------|
| `pipeline` | Frontend plugin. React Flow canvas, component library, CodeMirror VRL editor, fleet management UI. |
| `pipeline-backend` | Backend plugin. REST API, DAG-to-Vector compiler, VRL executor (wraps Vector binary), SQLite persistence, fleet token auth. |
| `pipeline-common` | Shared types. Permission definitions and role resolution used by both frontend and backend. |

### How It Works

1. You build a pipeline in the visual editor by dragging sources, transforms, and sinks onto the canvas and connecting them.
2. As you add and connect components, Herald compiles the DAG into Vector YAML configuration in real time. You can toggle between the visual view and the generated YAML at any time.
3. When you save, Herald creates a versioned snapshot of the pipeline DAG and its compiled Vector configuration.
4. You validate the pipeline, which runs the compiled configuration through the Vector binary on the backend to check for structural and VRL errors.
5. You deploy the pipeline to one or more fleet agents. Each agent receives the new configuration, validates it locally with its own Vector binary, and applies it if valid.

### Integration with Vector

Herald does not replace Vector. It provides a visual interface for authoring Vector configurations. The compiled output is standard Vector YAML that you could also write by hand or manage with any other tool. The backend uses the Vector binary for two operations:

- **Config validation**: `vector validate` checks the compiled pipeline for structural correctness
- **VRL execution**: `vector vrl` runs VRL programs against sample events for previewing transform behavior

Fleet agents are Vector instances running on your clusters. They poll the Herald backend for configuration updates and apply them locally.

## See Also

- [Concepts](./concepts.md) for definitions of pipelines, sources, transforms, sinks, and other Herald terminology
- [Usage Guide](./usage.md) for step-by-step instructions on building and deploying pipelines
- [Vector documentation](https://vector.dev/docs/) for the full Vector component and VRL reference
