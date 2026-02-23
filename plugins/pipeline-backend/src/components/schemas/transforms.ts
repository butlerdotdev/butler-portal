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

export interface ComponentSchemaDefinition {
  type: 'source' | 'transform' | 'sink';
  vectorType: string;
  displayName: string;
  description: string;
  category: string;
  configSchema: Record<string, unknown>;
  defaultConfig: Record<string, unknown>;
}

export const transformSchemas: ComponentSchemaDefinition[] = [
  // ── Remap ───────────────────────────────────────────────────────────
  {
    type: 'transform',
    vectorType: 'remap',
    displayName: 'Remap (VRL)',
    description:
      'Transform events using Vector Remap Language (VRL) programs. The source field contains the VRL program that is executed against each event.',
    category: 'Processing',
    configSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description:
            'The VRL program to execute for each event. Has access to the event as the root object (.).',
        },
        drop_on_error: {
          type: 'boolean',
          description:
            'Drop events that cause a runtime error in the VRL program instead of forwarding them unchanged.',
        },
        drop_on_abort: {
          type: 'boolean',
          description:
            'Drop events when the VRL program calls the abort expression instead of forwarding them unchanged.',
        },
      },
      required: ['source'],
      additionalProperties: false,
    },
    defaultConfig: {
      source: '. = parse_json!(.message)',
      drop_on_error: false,
      drop_on_abort: false,
    },
  },

  // ── Filter ──────────────────────────────────────────────────────────
  {
    type: 'transform',
    vectorType: 'filter',
    displayName: 'Filter',
    description:
      'Filter events based on a VRL condition. Events that evaluate to true are passed through; events that evaluate to false are dropped.',
    category: 'Filtering',
    configSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        condition: {
          type: 'object',
          description:
            'The condition used to filter events. Must return a boolean value.',
          properties: {
            type: {
              type: 'string',
              enum: ['vrl'],
              description: 'The condition type. Currently only VRL is supported.',
            },
            source: {
              type: 'string',
              description:
                'A VRL expression that evaluates to a boolean. Events where this returns true are kept.',
            },
          },
          required: ['type', 'source'],
          additionalProperties: false,
        },
      },
      required: ['condition'],
      additionalProperties: false,
    },
    defaultConfig: {
      condition: {
        type: 'vrl',
        source: 'exists(.message)',
      },
    },
  },

  // ── Route ───────────────────────────────────────────────────────────
  {
    type: 'transform',
    vectorType: 'route',
    displayName: 'Route',
    description:
      'Route events to different downstream transforms or sinks based on VRL conditions. Each named route produces a separate output that can be referenced as an input by other components.',
    category: 'Routing',
    configSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        route: {
          type: 'object',
          description:
            'A map of output names to conditions. Each key becomes a named output (e.g. "route_id.output_name").',
          additionalProperties: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['vrl'],
                description: 'The condition type. Currently only VRL is supported.',
              },
              source: {
                type: 'string',
                description:
                  'A VRL expression that evaluates to a boolean. Events where this returns true are sent to this route output.',
              },
            },
            required: ['type', 'source'],
            additionalProperties: false,
          },
        },
      },
      required: ['route'],
      additionalProperties: false,
    },
    defaultConfig: {
      route: {},
    },
  },

  // ── Sample ──────────────────────────────────────────────────────────
  {
    type: 'transform',
    vectorType: 'sample',
    displayName: 'Sample',
    description:
      'Sample events at a configurable rate, passing through 1 out of every N events. Optionally exclude events matching a VRL condition from sampling.',
    category: 'Filtering',
    configSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        rate: {
          type: 'integer',
          minimum: 1,
          description:
            'The rate of sampling. A value of 10 means 1 out of every 10 events will be passed through.',
        },
        exclude: {
          type: 'object',
          description:
            'An optional condition. Events matching this condition are always passed through, bypassing the sampling rate.',
          properties: {
            type: {
              type: 'string',
              enum: ['vrl'],
              description: 'The condition type. Currently only VRL is supported.',
            },
            source: {
              type: 'string',
              description:
                'A VRL expression that evaluates to a boolean. Events where this returns true bypass sampling.',
            },
          },
          required: ['type', 'source'],
          additionalProperties: false,
        },
      },
      required: ['rate'],
      additionalProperties: false,
    },
    defaultConfig: {
      rate: 10,
    },
  },

  // ── Dedupe ──────────────────────────────────────────────────────────
  {
    type: 'transform',
    vectorType: 'dedupe',
    displayName: 'Dedupe',
    description:
      'Deduplicate events by caching recent events and dropping duplicates that match on the specified fields.',
    category: 'Filtering',
    configSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        fields: {
          type: 'object',
          description:
            'Configuration for which fields to use when determining if an event is a duplicate.',
          properties: {
            match: {
              type: 'array',
              items: {
                type: 'string',
              },
              description:
                'List of field names to compare. Events with identical values for all listed fields are considered duplicates.',
            },
          },
          required: ['match'],
          additionalProperties: false,
        },
        cache: {
          type: 'object',
          description:
            'Configuration for the deduplication cache that stores recent events for comparison.',
          properties: {
            num_events: {
              type: 'integer',
              minimum: 1,
              description:
                'The number of recent events to cache. Older entries are evicted when the cache is full.',
            },
          },
          required: ['num_events'],
          additionalProperties: false,
        },
      },
      required: ['fields'],
      additionalProperties: false,
    },
    defaultConfig: {
      fields: { match: ['.message'] },
      cache: { num_events: 5000 },
    },
  },
];
