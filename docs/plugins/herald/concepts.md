---
sidebar_position: 2
sidebar_label: Concepts
---

# Concepts

This page defines the core concepts used throughout Herald. Understanding these terms helps you work with the pipeline builder and deploy telemetry routing configurations to your clusters.

## Pipeline

A pipeline is a complete data routing configuration that defines how observability data flows from ingestion points through processing steps to output destinations. Each pipeline is owned by a team and consists of three types of components connected in a directed acyclic graph (DAG).

Pipelines are versioned. Every time you save a pipeline, Herald creates a new version containing the DAG definition and its compiled Vector configuration. You can compare versions, review diffs, and roll back to a previous version.

A pipeline has one of two statuses:

| Status | Description |
|--------|-------------|
| `active` | The pipeline is available for editing and deployment. |
| `archived` | The pipeline is retired and no longer deployable. Archived pipelines remain visible for reference. |

## Sources

Sources define where data enters the pipeline. Each source corresponds to a Vector source component that collects or receives observability data. Common source types include:

- **Kubernetes Logs**: Collects container logs from Kubernetes pods
- **Host Metrics**: Gathers CPU, memory, disk, and network metrics from the host system
- **Syslog**: Receives syslog messages over TCP or UDP
- **Internal Metrics**: Exposes Vector's own internal metrics
- **Demo Logs**: Generates sample log data for testing pipelines
- **HTTP Server**: Accepts data via HTTP POST requests
- **Datadog Agent**: Receives data forwarded from Datadog agents

Sources do not have inputs. They sit at the beginning of the pipeline graph and feed data into transforms or directly into sinks.

## Transforms

Transforms process data as it flows through the pipeline. Each transform takes input from one or more upstream components (sources or other transforms), applies a processing operation, and passes the result downstream. Common transform types include:

| Transform | Purpose |
|-----------|---------|
| **Remap** | Apply a VRL program to restructure, enrich, or modify events. This is the most flexible and commonly used transform. |
| **Filter** | Drop events that do not match a specified VRL condition. |
| **Aggregate** | Combine multiple metric events into statistical summaries over a time window. |
| **Sample** | Pass through only a percentage of events, useful for reducing volume. |
| **Dedupe** | Remove duplicate events based on specified fields. |
| **Reduce** | Collapse multiple log events into one based on grouping conditions. |
| **Route** | Split a stream into multiple named outputs based on VRL conditions, allowing different downstream processing paths. |

Transforms require at least one input. In the visual builder, you connect a source or another transform to a transform's input port to establish the data flow.

## Sinks

Sinks define where processed data is delivered. Each sink corresponds to a Vector sink component that writes data to an external system or storage. Common sink types include:

- **Elasticsearch**: Index logs and events into Elasticsearch clusters
- **Loki**: Send logs to Grafana Loki for aggregation and querying
- **Prometheus Remote Write**: Push metrics to Prometheus-compatible endpoints
- **AWS S3**: Write data to S3 buckets for archival or batch processing
- **Datadog**: Forward logs, metrics, and traces to Datadog
- **Blackhole**: Discard all incoming events (useful for testing and benchmarking)
- **Console**: Print events to stdout (useful for debugging)
- **HTTP**: Send events to any HTTP endpoint as JSON payloads
- **File**: Write events to local files on the agent host

Sinks require at least one input. In the visual builder, you connect a transform or source to a sink's input port.

## Pipeline Topology

The pipeline topology is the directed acyclic graph (DAG) that represents the complete data flow from sources through transforms to sinks. Each node in the graph is a component (source, transform, or sink), and each edge represents a data flow connection.

```
┌──────────┐     ┌───────────┐     ┌──────────────┐
│ k8s_logs │────>│  filter   │────>│ elasticsearch│
└──────────┘     └───────────┘     └──────────────┘
                       │
┌──────────┐           │           ┌──────────────┐
│host_metrics│─────────┼──────────>│  prometheus  │
└──────────┘           │           └──────────────┘
                       │
                       v
                 ┌───────────┐     ┌──────────────┐
                 │  sample   │────>│     loki     │
                 └───────────┘     └──────────────┘
```

The topology enforces two constraints:

1. **Acyclic**: Data flows in one direction. You cannot create loops in the graph.
2. **Typed connections**: Sources produce data, transforms process data, and sinks consume data. While any component can connect to any other component of a valid downstream type, the pipeline must contain at least one source and one sink to be deployable.

Herald compiles the topology into Vector YAML configuration. Each edge becomes an `inputs` entry on the downstream component. The compiled output uses deterministic ordering (components sorted by ID within each section) for consistent diffs between versions.

## Vector

[Vector](https://vector.dev) is the open-source data pipeline engine that Herald uses under the hood. Vector is a high-performance, end-to-end observability data pipeline built in Rust. It collects, transforms, and routes logs, metrics, and traces.

Herald does not embed or modify Vector. Instead, it provides a visual interface for authoring Vector configurations and a fleet system for distributing those configurations to Vector instances running on your clusters. The compiled output of a Herald pipeline is standard Vector YAML that works with any Vector installation.

The backend plugin uses the Vector binary for two operations:

- **`vector validate`**: Checks compiled pipeline configurations for structural correctness, including VRL syntax validation within remap transforms
- **`vector vrl`**: Executes VRL programs against sample events for the pipeline preview feature

## VRL (Vector Remap Language)

VRL is Vector's expression-oriented language for transforming observability data. You use VRL inside **remap** transforms to restructure events, parse fields, add metadata, filter content, and perform type conversions. VRL programs run once per event and produce a modified event as output.

Example VRL program that parses a log message, adds a field, and removes sensitive data:

```vrl
. = parse_json!(.message)
.environment = "production"
del(.password)
del(.secret)
.timestamp = now()
```

Key characteristics of VRL:

- **Compiled and type-safe**: VRL programs are compiled before execution. Type errors are caught at compile time, not at runtime.
- **Fail-safe by default**: Functions that can fail require explicit error handling with the `!` operator (abort on error) or pattern matching.
- **No side effects**: VRL programs cannot make network calls, read files, or modify state outside the current event.
- **Event-scoped**: Each VRL program operates on a single event. The `.` root path refers to the current event.

Herald provides VRL support in two places:

1. **Remap transform configuration**: When you add a remap transform to your pipeline, the component panel includes a VRL editor with syntax highlighting.
2. **VRL validation**: The backend validates VRL syntax by wrapping the program in a minimal Vector config and running `vector validate`.

For the complete VRL function reference, see the [VRL documentation](https://vector.dev/docs/reference/vrl/).

## Fleet

The fleet system manages the connection between Herald and Vector instances running on your infrastructure. It consists of three resources.

### Fleet Agents

A fleet agent represents a single Vector instance that has registered with Herald. Agents are identified by a unique agent ID and report their hostname, IP address, OS, architecture, and Vector version. Each agent polls the Herald backend for configuration updates on a regular cycle (approximately every 15 seconds).

Agent statuses:

| Status | Description |
|--------|-------------|
| `pending` | Agent has registered but has not yet sent a heartbeat. |
| `online` | Agent is actively sending heartbeats. |
| `offline` | Agent has missed recent heartbeats. |
| `stale` | Agent has not sent a heartbeat for an extended period. |

### Fleet Groups

A fleet group is a named collection of agents selected by label matching. You assign labels to agents (for example, `env: production` or `cluster: us-east-1`) and define groups with label selectors that match those labels. Groups simplify deployment by letting you target a logical set of agents rather than individual ones.

### Fleet Tokens

Fleet tokens authenticate agents when they register with Herald. You create a token in the UI, install it on the agent, and the agent presents it during registration. Tokens are scoped to a team and can have an optional expiration date. You can revoke tokens to prevent new agent registrations.

## Pipeline Deployment

Deploying a pipeline pushes its compiled Vector configuration to one or more fleet agents. The deployment process works as follows:

1. You click **Deploy** on a pipeline and confirm the target agents.
2. Herald creates a deployment record linking the pipeline version to each target agent.
3. On its next poll cycle, each agent retrieves the new configuration.
4. The agent validates the configuration locally using its own Vector binary.
5. If validation passes, the agent applies the configuration. If validation fails, the agent rejects it and reports the error.

You can monitor deployment status on the Deployments tab, which shows whether each agent has applied, rejected, or not yet received the configuration. If a deployment causes issues, you can roll back to a previous pipeline version.

## See Also

- [Overview](./README.md) for an introduction to Herald and its architecture
- [Usage Guide](./usage.md) for step-by-step instructions on building and deploying pipelines
