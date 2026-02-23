/*
 * Copyright 2026 The Butler Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { ComponentSchemaDefinition } from './transforms';

export const sinkSchemas: ComponentSchemaDefinition[] = [
  // ── Elasticsearch ────────────────────────────────────────────────────
  {
    type: 'sink',
    vectorType: 'elasticsearch',
    displayName: 'Elasticsearch',
    description:
      'Send log and metric events to Elasticsearch for indexing and search. Supports bulk API operations and multiple Elasticsearch versions.',
    category: 'Search',
    configSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        endpoints: {
          type: 'array',
          items: { type: 'string' },
          description:
            'A list of Elasticsearch endpoints to send data to. Multiple endpoints provide failover.',
        },
        index: {
          type: 'string',
          description:
            'The index name to write events to. Supports strftime specifiers for time-based indices (e.g. "vector-%Y-%m-%d").',
        },
        bulk: {
          type: 'object',
          description: 'Bulk API request configuration.',
          properties: {
            action: {
              type: 'string',
              enum: ['index', 'create'],
              description:
                'The bulk action to use when indexing documents. "index" overwrites existing documents with the same ID; "create" fails if a document with the same ID already exists.',
            },
          },
          additionalProperties: false,
        },
        api_version: {
          type: 'string',
          enum: ['v6', 'v7', 'v8', 'auto'],
          description:
            'The Elasticsearch API version to use. "auto" detects the version from the cluster.',
        },
      },
      required: ['endpoints'],
      additionalProperties: false,
    },
    defaultConfig: {
      endpoints: ['http://localhost:9200'],
      index: 'vector-%Y-%m-%d',
      bulk: { action: 'index' },
      api_version: 'auto',
    },
  },

  // ── AWS S3 ───────────────────────────────────────────────────────────
  {
    type: 'sink',
    vectorType: 'aws_s3',
    displayName: 'AWS S3',
    description:
      'Write events to Amazon S3 as compressed or uncompressed files. Useful for long-term log archival and data lake ingestion.',
    category: 'Cloud',
    configSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        region: {
          type: 'string',
          description:
            'The AWS region where the S3 bucket resides (e.g. "us-east-1").',
        },
        bucket: {
          type: 'string',
          description: 'The name of the S3 bucket to write to.',
        },
        key_prefix: {
          type: 'string',
          description:
            'A prefix prepended to the S3 object key. Supports strftime specifiers for time-based partitioning (e.g. "logs/%Y/%m/%d/").',
        },
        encoding: {
          type: 'object',
          description: 'Encoding configuration for the output data.',
          properties: {
            codec: {
              type: 'string',
              enum: ['json', 'ndjson', 'text', 'csv', 'native_json'],
              description: 'The codec to use for encoding events into the output file.',
            },
          },
          required: ['codec'],
          additionalProperties: false,
        },
        compression: {
          type: 'string',
          enum: ['none', 'gzip', 'zstd'],
          description:
            'Compression algorithm applied to S3 objects before upload.',
        },
      },
      required: ['region', 'bucket', 'encoding'],
      additionalProperties: false,
    },
    defaultConfig: {
      region: 'us-east-1',
      bucket: '',
      key_prefix: 'logs/%Y/%m/%d/',
      encoding: { codec: 'ndjson' },
      compression: 'gzip',
    },
  },

  // ── AWS CloudWatch Logs ──────────────────────────────────────────────
  {
    type: 'sink',
    vectorType: 'aws_cloudwatch_logs',
    displayName: 'CloudWatch Logs',
    description:
      'Send log events to AWS CloudWatch Logs. Events are published to a specified log group and stream.',
    category: 'Cloud',
    configSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        region: {
          type: 'string',
          description: 'The AWS region for the CloudWatch Logs service (e.g. "us-west-2").',
        },
        group_name: {
          type: 'string',
          description:
            'The CloudWatch Logs log group name. Supports template syntax for dynamic group names.',
        },
        stream_name: {
          type: 'string',
          description:
            'The CloudWatch Logs log stream name within the group. Supports template syntax for dynamic stream names.',
        },
      },
      required: ['region', 'group_name', 'stream_name'],
      additionalProperties: false,
    },
    defaultConfig: {
      region: 'us-east-1',
      group_name: '/butler/logs',
      stream_name: '{{ host }}',
    },
  },

  // ── Datadog Logs ─────────────────────────────────────────────────────
  {
    type: 'sink',
    vectorType: 'datadog_logs',
    displayName: 'Datadog Logs',
    description:
      'Forward log events to the Datadog Logs API for centralized log management, search, and analysis.',
    category: 'Observability',
    configSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        default_api_key: {
          type: 'string',
          description:
            'The Datadog API key used to authenticate requests. Can also reference a secret.',
        },
        site: {
          type: 'string',
          enum: [
            'datadoghq.com',
            'datadoghq.eu',
            'us3.datadoghq.com',
            'us5.datadoghq.com',
            'ap1.datadoghq.com',
            'ddog-gov.com',
          ],
          description:
            'The Datadog site to send data to. Determines the API endpoint region.',
        },
        compression: {
          type: 'string',
          enum: ['none', 'gzip'],
          description: 'Compression applied to payloads before sending to Datadog.',
        },
      },
      required: ['default_api_key'],
      additionalProperties: false,
    },
    defaultConfig: {
      default_api_key: '',
      site: 'datadoghq.com',
      compression: 'gzip',
    },
  },

  // ── Datadog Metrics ──────────────────────────────────────────────────
  {
    type: 'sink',
    vectorType: 'datadog_metrics',
    displayName: 'Datadog Metrics',
    description:
      'Forward metric events to the Datadog Metrics API. Supports counters, gauges, distributions, and sets.',
    category: 'Observability',
    configSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        default_api_key: {
          type: 'string',
          description:
            'The Datadog API key used to authenticate metrics submissions.',
        },
        site: {
          type: 'string',
          enum: [
            'datadoghq.com',
            'datadoghq.eu',
            'us3.datadoghq.com',
            'us5.datadoghq.com',
            'ap1.datadoghq.com',
            'ddog-gov.com',
          ],
          description:
            'The Datadog site to send metrics to. Determines the API endpoint region.',
        },
      },
      required: ['default_api_key'],
      additionalProperties: false,
    },
    defaultConfig: {
      default_api_key: '',
      site: 'datadoghq.com',
    },
  },

  // ── Splunk HEC ───────────────────────────────────────────────────────
  {
    type: 'sink',
    vectorType: 'splunk_hec',
    displayName: 'Splunk HEC',
    description:
      'Send events to a Splunk HTTP Event Collector (HEC) endpoint. Supports raw and JSON event formats with configurable index targeting.',
    category: 'Observability',
    configSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        endpoint: {
          type: 'string',
          description:
            'The base URL of the Splunk HEC endpoint (e.g. "https://splunk.example.com:8088").',
        },
        default_token: {
          type: 'string',
          description:
            'The HEC token used to authenticate with Splunk. Can reference a secret.',
        },
        index: {
          type: 'string',
          description:
            'The Splunk index to send events to. If omitted, the HEC token default index is used.',
        },
        encoding: {
          type: 'object',
          description: 'Encoding configuration for events sent to HEC.',
          properties: {
            codec: {
              type: 'string',
              enum: ['json', 'text'],
              description:
                'The codec to use when encoding events. "json" sends structured data; "text" sends the message field only.',
            },
          },
          required: ['codec'],
          additionalProperties: false,
        },
      },
      required: ['endpoint', 'default_token'],
      additionalProperties: false,
    },
    defaultConfig: {
      endpoint: '',
      default_token: '',
      index: 'main',
      encoding: { codec: 'json' },
    },
  },

  // ── Grafana Loki ─────────────────────────────────────────────────────
  {
    type: 'sink',
    vectorType: 'loki',
    displayName: 'Grafana Loki',
    description:
      'Push log events to Grafana Loki for storage and querying with LogQL. Events are batched and labeled for efficient stream indexing.',
    category: 'Observability',
    configSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        endpoint: {
          type: 'string',
          description:
            'The base URL of the Loki instance (e.g. "http://loki.monitoring:3100").',
        },
        labels: {
          type: 'object',
          description:
            'A map of label names to template values applied to every log stream sent to Loki. Values support template syntax for dynamic labeling.',
          additionalProperties: { type: 'string' },
        },
        encoding: {
          type: 'object',
          description: 'Encoding configuration for log entries.',
          properties: {
            codec: {
              type: 'string',
              enum: ['json', 'text'],
              description:
                'The codec to use for encoding log entries. "json" preserves structured fields; "text" sends only the message.',
            },
          },
          required: ['codec'],
          additionalProperties: false,
        },
        tenant_id: {
          type: 'string',
          description:
            'The tenant ID to include in requests for multi-tenant Loki deployments. Sets the X-Scope-OrgID header.',
        },
      },
      required: ['endpoint'],
      additionalProperties: false,
    },
    defaultConfig: {
      endpoint: 'http://loki.monitoring:3100',
      labels: {},
      encoding: { codec: 'json' },
      tenant_id: '',
    },
  },

  // ── ClickHouse ───────────────────────────────────────────────────────
  {
    type: 'sink',
    vectorType: 'clickhouse',
    displayName: 'ClickHouse',
    description:
      'Insert events into a ClickHouse database table. Useful for high-volume analytical workloads and real-time log analysis.',
    category: 'Database',
    configSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        endpoint: {
          type: 'string',
          description:
            'The ClickHouse HTTP endpoint URL (e.g. "http://clickhouse.example.com:8123").',
        },
        database: {
          type: 'string',
          description: 'The name of the ClickHouse database to write to.',
        },
        table: {
          type: 'string',
          description: 'The name of the table within the database to insert events into.',
        },
      },
      required: ['endpoint', 'database', 'table'],
      additionalProperties: false,
    },
    defaultConfig: {
      endpoint: 'http://localhost:8123',
      database: 'default',
      table: 'logs',
    },
  },

  // ── Kafka ────────────────────────────────────────────────────────────
  {
    type: 'sink',
    vectorType: 'kafka',
    displayName: 'Kafka',
    description:
      'Produce events to an Apache Kafka topic. Supports configurable encoding, compression, and partitioning.',
    category: 'Messaging',
    configSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        bootstrap_servers: {
          type: 'string',
          description:
            'A comma-separated list of Kafka broker addresses (e.g. "kafka-01:9092,kafka-02:9092").',
        },
        topic: {
          type: 'string',
          description: 'The Kafka topic to produce messages to.',
        },
        encoding: {
          type: 'object',
          description: 'Encoding configuration for Kafka message values.',
          properties: {
            codec: {
              type: 'string',
              enum: ['json', 'text', 'native_json'],
              description:
                'The codec to use for encoding the Kafka message value.',
            },
          },
          required: ['codec'],
          additionalProperties: false,
        },
        compression: {
          type: 'string',
          enum: ['none', 'gzip', 'lz4', 'snappy', 'zstd'],
          description:
            'Compression algorithm applied to Kafka message batches.',
        },
      },
      required: ['bootstrap_servers', 'topic', 'encoding'],
      additionalProperties: false,
    },
    defaultConfig: {
      bootstrap_servers: 'localhost:9092',
      topic: 'vector-events',
      encoding: { codec: 'json' },
      compression: 'none',
    },
  },

  // ── HTTP ─────────────────────────────────────────────────────────────
  {
    type: 'sink',
    vectorType: 'http',
    displayName: 'HTTP',
    description:
      'Send events via HTTP requests to any endpoint. Supports configurable methods, encoding, and custom headers for webhook integrations.',
    category: 'HTTP',
    configSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        uri: {
          type: 'string',
          description:
            'The full URI to send HTTP requests to (e.g. "https://api.example.com/ingest").',
        },
        method: {
          type: 'string',
          enum: ['post', 'put'],
          description: 'The HTTP method to use for sending events.',
        },
        encoding: {
          type: 'object',
          description: 'Encoding configuration for the HTTP request body.',
          properties: {
            codec: {
              type: 'string',
              enum: ['json', 'ndjson', 'text'],
              description: 'The codec to use for encoding events in the request body.',
            },
          },
          required: ['codec'],
          additionalProperties: false,
        },
        headers: {
          type: 'object',
          description:
            'A map of header names to values appended to every HTTP request. Useful for authorization or routing.',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['uri', 'encoding'],
      additionalProperties: false,
    },
    defaultConfig: {
      uri: '',
      method: 'post',
      encoding: { codec: 'json' },
      headers: {},
    },
  },

  // ── Prometheus Remote Write ──────────────────────────────────────────
  {
    type: 'sink',
    vectorType: 'prometheus_remote_write',
    displayName: 'Prometheus Remote Write',
    description:
      'Forward metric events to any Prometheus-compatible remote write endpoint such as Cortex, Thanos, or Grafana Mimir.',
    category: 'Observability',
    configSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        endpoint: {
          type: 'string',
          description:
            'The Prometheus remote write endpoint URL (e.g. "http://prometheus:9090/api/v1/write").',
        },
        default_namespace: {
          type: 'string',
          description:
            'A namespace prefix prepended to all metric names that do not already have one (e.g. "butler").',
        },
      },
      required: ['endpoint'],
      additionalProperties: false,
    },
    defaultConfig: {
      endpoint: 'http://prometheus:9090/api/v1/write',
      default_namespace: '',
    },
  },

  // ── Console ──────────────────────────────────────────────────────────
  {
    type: 'sink',
    vectorType: 'console',
    displayName: 'Console',
    description:
      'Print events to stdout or stderr. Primarily used for debugging and development pipelines.',
    category: 'Testing',
    configSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        encoding: {
          type: 'object',
          description: 'Encoding configuration for console output.',
          properties: {
            codec: {
              type: 'string',
              enum: ['json', 'text'],
              description:
                'The codec to use for printing events. "json" prints the full structured event; "text" prints only the message field.',
            },
          },
          required: ['codec'],
          additionalProperties: false,
        },
        target: {
          type: 'string',
          enum: ['stdout', 'stderr'],
          description: 'The output stream to write to.',
        },
      },
      required: ['encoding'],
      additionalProperties: false,
    },
    defaultConfig: {
      encoding: { codec: 'json' },
      target: 'stdout',
    },
  },

  // ── File ─────────────────────────────────────────────────────────────
  {
    type: 'sink',
    vectorType: 'file',
    displayName: 'File',
    description:
      'Write events to files on the local filesystem. Supports compression and configurable encoding for log archival or local debugging.',
    category: 'System',
    configSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'The file path to write to. Supports template syntax for dynamic paths (e.g. "/var/log/vector/%Y-%m-%d.log").',
        },
        encoding: {
          type: 'object',
          description: 'Encoding configuration for the output file.',
          properties: {
            codec: {
              type: 'string',
              enum: ['json', 'ndjson', 'text'],
              description: 'The codec to use for encoding events written to the file.',
            },
          },
          required: ['codec'],
          additionalProperties: false,
        },
        compression: {
          type: 'string',
          enum: ['none', 'gzip', 'zstd'],
          description: 'Compression algorithm applied to the output file.',
        },
      },
      required: ['path', 'encoding'],
      additionalProperties: false,
    },
    defaultConfig: {
      path: '/var/log/vector/output.log',
      encoding: { codec: 'ndjson' },
      compression: 'none',
    },
  },

  // ── GCP Cloud Storage ────────────────────────────────────────────────
  {
    type: 'sink',
    vectorType: 'gcp_cloud_storage',
    displayName: 'GCP Cloud Storage',
    description:
      'Write events to Google Cloud Storage buckets as object files. Supports time-based key prefixes for organized data partitioning.',
    category: 'Cloud',
    configSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        bucket: {
          type: 'string',
          description: 'The name of the GCS bucket to write objects to.',
        },
        key_prefix: {
          type: 'string',
          description:
            'A prefix prepended to the GCS object key. Supports strftime specifiers for time-based partitioning (e.g. "logs/%Y/%m/%d/").',
        },
        encoding: {
          type: 'object',
          description: 'Encoding configuration for the output objects.',
          properties: {
            codec: {
              type: 'string',
              enum: ['json', 'ndjson', 'text', 'csv'],
              description: 'The codec to use for encoding events into the output object.',
            },
          },
          required: ['codec'],
          additionalProperties: false,
        },
      },
      required: ['bucket', 'encoding'],
      additionalProperties: false,
    },
    defaultConfig: {
      bucket: '',
      key_prefix: 'logs/%Y/%m/%d/',
      encoding: { codec: 'ndjson' },
    },
  },

  // ── Azure Blob Storage ───────────────────────────────────────────────
  {
    type: 'sink',
    vectorType: 'azure_blob_storage',
    displayName: 'Azure Blob Storage',
    description:
      'Write events to Azure Blob Storage containers. Supports connection string authentication and configurable blob prefixes for partitioning.',
    category: 'Cloud',
    configSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        connection_string: {
          type: 'string',
          description:
            'The Azure Storage account connection string used for authentication and endpoint resolution.',
        },
        container_name: {
          type: 'string',
          description: 'The name of the Azure Blob Storage container to write to.',
        },
        blob_prefix: {
          type: 'string',
          description:
            'A prefix prepended to blob names within the container. Supports strftime specifiers for time-based partitioning.',
        },
      },
      required: ['connection_string', 'container_name'],
      additionalProperties: false,
    },
    defaultConfig: {
      connection_string: '',
      container_name: '',
      blob_prefix: 'logs/%Y/%m/%d/',
    },
  },
];
