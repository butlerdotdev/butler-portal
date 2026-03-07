---
sidebar_position: 3
sidebar_label: Usage Guide
---

# Usage Guide

This guide walks you through building, validating, and deploying a telemetry pipeline with Herald.

## Prerequisites

Before you begin, ensure you have:

- Access to a Butler Portal instance with the Herald plugin installed
- Membership in at least one team (pipelines are team-scoped)
- At least one fleet agent registered and online (required for deployment, not for building)

## Creating a New Pipeline

1. Navigate to **Herald** in the Portal sidebar.
2. Click **Create Pipeline**.
3. Enter a name for your pipeline (for example, `nginx-access-logs`).
4. Optionally add a description.
5. Click **Create**. Herald opens the pipeline builder with an empty canvas.

You can also import an existing Vector configuration. Click the **Import** button in the toolbar, paste your Vector YAML or TOML configuration, and Herald parses it into a visual DAG on the canvas.

## Using the Visual Pipeline Builder

The pipeline builder has three main areas:

- **Component library** (left panel): Lists all available sources, transforms, and sinks organized by category. Use the search box to filter components by name or type.
- **Canvas** (center): The main workspace where you build your pipeline topology. Components appear as nodes, and connections appear as edges.
- **Component panel** (right panel, shown when a node is selected): Displays the configuration form for the selected component.

### Adding Components

Drag a component from the component library onto the canvas. Herald places a new node at the drop position with the component's default configuration. The node ID is generated from the Vector component type (for example, `kubernetes_logs` or `remap`). If a node with that ID already exists, Herald appends a numeric suffix (`remap_2`, `remap_3`, and so on).

You can also rename a component by selecting it and editing the **Component ID** field in the component panel. The ID must start with a letter and contain only letters, digits, and underscores. This ID becomes the key in the compiled Vector YAML.

### Connecting Components

To create a connection between two components:

1. Hover over the output port (right edge) of the source or upstream component. The port appears as a small circle.
2. Click and drag from the output port to the input port (left edge) of the downstream component.
3. Release to create the edge.

Connections establish the `inputs` relationship in the compiled Vector configuration. A transform or sink can have multiple inputs. Sources do not accept inputs.

To remove a connection, select the edge and press the **Delete** key.

### Removing Components

Select a node on the canvas and press the **Delete** key, or select the node and click **Remove Node** in the component panel. Removing a node also removes all edges connected to it.

## Configuring Sources

Select a source node on the canvas to open its configuration in the component panel. The available fields depend on the Vector source type. For example:

**Kubernetes Logs source:**

| Field | Description |
|-------|-------------|
| `extra_label_selector` | Kubernetes label selector to filter which pods to collect logs from |
| `extra_namespace_label_selector` | Namespace label selector to filter by namespace labels |
| `exclude_paths_glob_patterns` | Glob patterns for log file paths to exclude |

**Host Metrics source:**

| Field | Description |
|-------|-------------|
| `collectors` | List of metric collectors to enable (cpu, memory, disk, network, etc.) |
| `scrape_interval_secs` | How often to collect metrics (default: 15) |

**Syslog source:**

| Field | Description |
|-------|-------------|
| `address` | Listen address and port (for example, `0.0.0.0:514`) |
| `mode` | Protocol mode: `tcp` or `udp` |

Each source type has its own set of fields defined by Vector's component schema. Herald renders input fields based on the schema and applies type-appropriate validation.

## Configuring Transforms

Select a transform node on the canvas to configure it. The most commonly used transform is **Remap**, which uses VRL to process events.

### Writing VRL Expressions

When you add a remap transform, the component panel displays a VRL editor in the **VRL Source** field. Write your VRL program directly in this text area.

Example: Parse a JSON log message and add routing metadata.

```vrl
. = parse_json!(.message)
.butler.team = "platform-engineering"
.butler.pipeline = "nginx-access-logs"

if starts_with(.request_path, "/api/") {
  .stream = "api-logs"
} else {
  .stream = "web-logs"
}

# Remove fields that should not be indexed
del(.headers.authorization)
del(.headers.cookie)
```

Herald validates VRL syntax when you validate the pipeline. Syntax errors in VRL programs cause validation to fail with a descriptive error message.

### Configuring Filter Transforms

Filter transforms use a VRL condition to decide which events to keep. Only events where the condition evaluates to `true` pass through.

| Field | Description |
|-------|-------------|
| `condition` | VRL expression that returns a boolean. Events that evaluate to `true` are kept. |

Example condition to keep only error-level logs:

```vrl
.level == "error" || .level == "fatal"
```

### Configuring Aggregate Transforms

Aggregate transforms combine multiple metric events over a time window.

| Field | Description |
|-------|-------------|
| `interval_ms` | Aggregation window in milliseconds |
| `mode` | Aggregation mode: `auto` or `manual` |

### Configuring Route Transforms

Route transforms split a single input stream into multiple named outputs based on VRL conditions. Each output appears as a separate port on the node, and you can connect different downstream components to different outputs.

## Configuring Sinks

Select a sink node on the canvas to configure its destination. The available fields depend on the Vector sink type. For example:

**Elasticsearch sink:**

| Field | Description |
|-------|-------------|
| `endpoints` | List of Elasticsearch endpoints (for example, `["https://es.example.com:9200"]`) |
| `bulk.index` | Index name or pattern for ingested documents |
| `auth.strategy` | Authentication strategy: `basic`, `aws` |

**Loki sink:**

| Field | Description |
|-------|-------------|
| `endpoint` | Loki push API endpoint (for example, `http://loki:3100`) |
| `labels` | Key-value pairs to apply as Loki labels |

**Prometheus Remote Write sink:**

| Field | Description |
|-------|-------------|
| `endpoint` | Remote write endpoint URL |
| `default_namespace` | Namespace prefix for all metrics |

**AWS S3 sink:**

| Field | Description |
|-------|-------------|
| `bucket` | S3 bucket name |
| `region` | AWS region |
| `key_prefix` | Object key prefix for stored files |
| `encoding.codec` | Output encoding format: `json`, `text`, `ndjson` |

## Toggling Between Visual and YAML Views

Click the **Visual** / **YAML** toggle above the canvas to switch between the visual builder and the compiled Vector YAML. The YAML view updates in real time as you add, remove, or reconfigure components.

The YAML view is read-only. To make changes, switch back to the visual view. If you prefer to work with raw Vector YAML, you can export the configuration and manage it outside Herald.

## Validating a Pipeline

Before deploying, validate your pipeline to catch configuration errors.

1. Click the **Validate** button in the toolbar.
2. Herald checks the pipeline structure:
   - At least one source component exists
   - At least one sink component exists
   - All transforms and sinks have at least one input connection
3. If the pipeline has been saved, Herald also sends the compiled configuration to the backend, which runs `vector validate` against it. This catches VRL syntax errors, invalid field values, and unsupported component combinations.

Validation results appear as a notification:

- **Valid**: The pipeline structure and configuration are correct.
- **Valid with warnings**: The structure is correct but some aspects may need attention.
- **Validation failed**: One or more errors were found. The error message identifies the specific issue.

:::tip
Use the **Preview** feature to test your pipeline with sample events before deploying. Click **Preview**, provide sample JSON events, and Herald shows the output at each stage of the pipeline.
:::

## Previewing Pipeline Output

The preview feature lets you trace sample events through your pipeline to verify transform behavior before deployment.

1. Click the **Preview** button in the toolbar (available after saving the pipeline).
2. Enter sample events as JSON objects in the sample event editor. Each event should match the format your sources produce.
3. Click **Run Preview**. Herald processes the events through each pipeline stage and displays the results.

The preview shows:

- **Input events**: The events entering each node
- **Output events**: The events leaving each node after processing
- **Dropped events**: Events removed by filters or conditions
- **Errors**: Any processing errors that occurred at each stage

This is particularly useful for verifying VRL expressions in remap transforms.

## Deploying Pipelines

Once your pipeline is saved and validated, you can deploy it to fleet agents.

### Registering Fleet Agents

Before deploying, you need at least one Vector agent registered with Herald.

1. Navigate to the **Fleet** tab in Herald.
2. Go to **Tokens** and click **Create Token**. Give the token a name and optional expiration date. Copy the generated token value (it is shown only once).
3. Install the token on your Vector instance. The agent uses this token to authenticate when registering with Herald.
4. Once the agent starts, it appears in the **Agents** list with a `pending` status, then transitions to `online` after its first heartbeat.

You can assign labels to agents (for example, `env: production`, `cluster: us-east-1`) to organize them into groups for targeted deployments.

### Creating Fleet Groups

Fleet groups let you deploy pipelines to a set of agents at once based on label selectors.

1. Navigate to **Fleet** > **Groups**.
2. Click **Create Group**.
3. Enter a name and description.
4. Define a label selector (for example, `env: production`). All agents whose labels match the selector are included in the group.

### Deploying to Agents

1. Open the pipeline you want to deploy.
2. Click **Deploy**.
3. The deploy dialog shows the list of agents assigned to this pipeline, their current status, and how many are online.
4. Click **Deploy to N Agents** to push the configuration.

After deployment:

- Each agent picks up the new configuration on its next poll cycle (approximately 15 seconds).
- The agent validates the configuration locally with its own Vector binary.
- If validation passes, the agent applies the new configuration.
- If validation fails, the agent rejects it and reports the error back to Herald.

Monitor deployment status on the **Deployments** tab, which shows the sync result for each agent.

### Rolling Back a Deployment

If a deployed pipeline causes issues:

1. Navigate to the pipeline's **Deployments** tab.
2. Find the deployment you want to roll back.
3. Click **Rollback**. Herald creates a new deployment pointing to the previous pipeline version and pushes it to the affected agents.

## Exporting and Importing

### Exporting a Pipeline

Click **Export YAML** in the toolbar to download the compiled Vector YAML configuration as a file. This file works with any Vector installation. You can use it outside Herald, commit it to version control, or use it as a reference for manual Vector deployments.

### Importing a Pipeline

To import an existing Vector configuration into Herald:

1. Click **Import** in the toolbar (or during pipeline creation).
2. Paste your Vector configuration in YAML or TOML format.
3. Select the format (YAML or TOML).
4. Click **Import**. Herald parses the configuration into a DAG and renders it on the canvas.

The import process maps Vector configuration sections (`sources`, `transforms`, `sinks`) to pipeline components and reconstructs the topology from `inputs` fields. After import, you can modify the pipeline in the visual builder and save it as a Herald pipeline.

## See Also

- [Overview](./README.md) for an introduction to Herald and its architecture
- [Concepts](./concepts.md) for definitions of pipelines, sources, transforms, sinks, and other Herald terminology
- [Vector source components](https://vector.dev/docs/reference/configuration/sources/) for the complete list of available sources
- [Vector transform components](https://vector.dev/docs/reference/configuration/transforms/) for the complete list of available transforms
- [Vector sink components](https://vector.dev/docs/reference/configuration/sinks/) for the complete list of available sinks
- [VRL reference](https://vector.dev/docs/reference/vrl/) for the complete VRL function and expression documentation
