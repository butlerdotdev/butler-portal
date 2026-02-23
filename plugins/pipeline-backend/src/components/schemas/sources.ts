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

export const sourceSchemas: ComponentSchemaDefinition[] = [
  // ── Kafka ─────────────────────────────────────────────────────────
  {
    type: 'source',
    vectorType: 'kafka',
    displayName: 'Kafka',
    description:
      'Consume events from Apache Kafka topics using a consumer group.',
    category: 'Messaging',
    configSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['bootstrap_servers', 'group_id', 'topics'],
      properties: {
        bootstrap_servers: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          description: 'List of Kafka broker addresses (host:port).',
        },
        group_id: {
          type: 'string',
          description: 'Kafka consumer group identifier.',
        },
        topics: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          description: 'Topics to subscribe to.',
        },
        auto_offset_reset: {
          type: 'string',
          enum: ['earliest', 'latest'],
          description:
            'Where to begin reading when no committed offset exists.',
        },
        sasl: {
          type: 'object',
          description: 'SASL authentication configuration.',
          properties: {
            enabled: {
              type: 'boolean',
              description: 'Enable SASL authentication.',
            },
            mechanism: {
              type: 'string',
              enum: ['PLAIN', 'SCRAM-SHA-256', 'SCRAM-SHA-512'],
              description: 'SASL mechanism.',
            },
            username: {
              type: 'string',
              description: 'SASL username.',
            },
            password: {
              type: 'string',
              description: 'SASL password.',
            },
          },
        },
      },
    },
    defaultConfig: {
      bootstrap_servers: ['localhost:9092'],
      group_id: 'vector',
      topics: ['logs'],
      auto_offset_reset: 'latest',
    },
  },

  // ── Syslog ────────────────────────────────────────────────────────
  {
    type: 'source',
    vectorType: 'syslog',
    displayName: 'Syslog',
    description:
      'Receive syslog messages over TCP or UDP following RFC 3164/5424.',
    category: 'System',
    configSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['mode', 'address'],
      properties: {
        mode: {
          type: 'string',
          enum: ['tcp', 'udp'],
          description: 'Transport protocol for incoming syslog messages.',
        },
        address: {
          type: 'string',
          description: 'Bind address in host:port format.',
        },
        max_length: {
          type: 'integer',
          minimum: 1,
          description: 'Maximum accepted message length in bytes.',
        },
      },
    },
    defaultConfig: {
      mode: 'tcp',
      address: '0.0.0.0:514',
      max_length: 102400,
    },
  },

  // ── File ──────────────────────────────────────────────────────────
  {
    type: 'source',
    vectorType: 'file',
    displayName: 'File',
    description: 'Tail files on the local filesystem and emit log lines.',
    category: 'System',
    configSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['include'],
      properties: {
        include: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          description: 'Glob patterns of files to tail.',
        },
        exclude: {
          type: 'array',
          items: { type: 'string' },
          description: 'Glob patterns of files to exclude.',
        },
        read_from: {
          type: 'string',
          enum: ['beginning', 'end'],
          description:
            'Where to start reading when a file is first discovered.',
        },
        fingerprint_bytes: {
          type: 'integer',
          minimum: 1,
          description:
            'Number of bytes read from the head of a file used for uniqueness fingerprinting.',
        },
      },
    },
    defaultConfig: {
      include: ['/var/log/**/*.log'],
      exclude: [],
      read_from: 'end',
      fingerprint_bytes: 256,
    },
  },

  // ── HTTP Server ───────────────────────────────────────────────────
  {
    type: 'source',
    vectorType: 'http_server',
    displayName: 'HTTP Server',
    description:
      'Accept log and metric data via HTTP POST requests.',
    category: 'HTTP',
    configSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['address'],
      properties: {
        address: {
          type: 'string',
          description: 'Bind address in host:port format.',
        },
        path: {
          type: 'string',
          description:
            'URL path the server listens on for incoming requests.',
        },
        encoding: {
          type: 'string',
          enum: ['text', 'json', 'ndjson', 'binary'],
          description: 'Expected encoding of the request body.',
        },
      },
    },
    defaultConfig: {
      address: '0.0.0.0:8080',
      path: '/',
      encoding: 'json',
    },
  },

  // ── AWS S3 ────────────────────────────────────────────────────────
  {
    type: 'source',
    vectorType: 'aws_s3',
    displayName: 'AWS S3',
    description:
      'Ingest objects from an S3 bucket, optionally triggered by SQS notifications.',
    category: 'Cloud',
    configSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['region', 'bucket', 'sqs'],
      properties: {
        region: {
          type: 'string',
          description: 'AWS region where the bucket resides.',
        },
        bucket: {
          type: 'string',
          description: 'Name of the S3 bucket to read from.',
        },
        prefix: {
          type: 'string',
          description:
            'Object key prefix used to filter which objects are ingested.',
        },
        sqs: {
          type: 'object',
          description: 'SQS queue that receives S3 event notifications.',
          required: ['queue_url'],
          properties: {
            queue_url: {
              type: 'string',
              format: 'uri',
              description: 'Full URL of the SQS queue.',
            },
          },
        },
      },
    },
    defaultConfig: {
      region: 'us-east-1',
      bucket: 'my-log-bucket',
      prefix: '',
      sqs: {
        queue_url: 'https://sqs.us-east-1.amazonaws.com/123456789012/s3-events',
      },
    },
  },

  // ── Splunk HEC ────────────────────────────────────────────────────
  {
    type: 'source',
    vectorType: 'splunk_hec',
    displayName: 'Splunk HEC',
    description:
      'Receive events via the Splunk HTTP Event Collector protocol.',
    category: 'HTTP',
    configSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['address'],
      properties: {
        address: {
          type: 'string',
          description: 'Bind address in host:port format.',
        },
        token: {
          type: 'string',
          description:
            'Optional single HEC token. If set, incoming requests must present this token.',
        },
        valid_tokens: {
          type: 'array',
          items: { type: 'string' },
          description:
            'List of accepted HEC tokens. Overrides token when set.',
        },
      },
    },
    defaultConfig: {
      address: '0.0.0.0:8088',
      token: '',
      valid_tokens: [],
    },
  },

  // ── Datadog Agent ─────────────────────────────────────────────────
  {
    type: 'source',
    vectorType: 'datadog_agent',
    displayName: 'Datadog Agent',
    description:
      'Accept logs, metrics, and traces forwarded from a Datadog Agent.',
    category: 'HTTP',
    configSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['address'],
      properties: {
        address: {
          type: 'string',
          description: 'Bind address in host:port format.',
        },
        multiple_outputs: {
          type: 'boolean',
          description:
            'When true, emit separate outputs for logs, metrics, and traces.',
        },
      },
    },
    defaultConfig: {
      address: '0.0.0.0:8282',
      multiple_outputs: false,
    },
  },

  // ── Journald ──────────────────────────────────────────────────────
  {
    type: 'source',
    vectorType: 'journald',
    displayName: 'Journald',
    description:
      'Read log entries from the systemd journal on Linux hosts.',
    category: 'System',
    configSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        current_boot_only: {
          type: 'boolean',
          description:
            'When true, only collect logs from the current boot session.',
        },
        units: {
          type: 'array',
          items: { type: 'string' },
          description: 'Systemd unit names to filter on.',
        },
        include_matches: {
          type: 'object',
          additionalProperties: {
            type: 'array',
            items: { type: 'string' },
          },
          description:
            'Key-value journal field matches for filtering (e.g., _TRANSPORT: ["syslog"]).',
        },
      },
    },
    defaultConfig: {
      current_boot_only: true,
      units: [],
      include_matches: {},
    },
  },

  // ── Kubernetes Logs ───────────────────────────────────────────────
  {
    type: 'source',
    vectorType: 'kubernetes_logs',
    displayName: 'Kubernetes Logs',
    description:
      'Collect container logs from Kubernetes pods on the local node.',
    category: 'Container',
    configSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        auto_partial_merge: {
          type: 'boolean',
          description:
            'Automatically merge partial container log lines (Docker runtime splits long lines).',
        },
        extra_label_selector: {
          type: 'string',
          description:
            'Additional Kubernetes label selector to filter which pods are collected.',
        },
      },
    },
    defaultConfig: {
      auto_partial_merge: true,
      extra_label_selector: '',
    },
  },

  // ── Demo Logs ─────────────────────────────────────────────────────
  {
    type: 'source',
    vectorType: 'demo_logs',
    displayName: 'Demo Logs',
    description:
      'Generate synthetic log events for testing and demonstration purposes.',
    category: 'Testing',
    configSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        format: {
          type: 'string',
          enum: ['shuffle', 'json', 'apache_common'],
          description: 'Format of the generated log lines.',
        },
        interval: {
          type: 'number',
          exclusiveMinimum: 0,
          description:
            'Seconds between emitted events. Fractional values are supported.',
        },
        count: {
          type: 'integer',
          minimum: 0,
          description:
            'Total number of events to emit. Zero means unlimited.',
        },
      },
    },
    defaultConfig: {
      format: 'json',
      interval: 1.0,
      count: 0,
    },
  },
];
