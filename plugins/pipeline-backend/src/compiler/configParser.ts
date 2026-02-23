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

import * as yaml from 'js-yaml';
import dagre from '@dagrejs/dagre';
import type {
  PipelineDag,
  DagComponent,
  DagEdge,
} from '../database/types';
import { badRequest } from '../util/errors';

export interface ParsedConfig {
  dag: PipelineDag;
  originalConfig: string;
}

/**
 * Parse a Vector configuration (YAML or TOML) into a pipeline DAG.
 * Stores the original config text for reference.
 */
export function parseConfig(
  text: string,
  format?: 'yaml' | 'toml',
): ParsedConfig {
  const detected = format ?? detectFormat(text);

  if (detected === 'toml') {
    throw badRequest(
      'TOML import is not yet supported. Please convert to YAML first.',
    );
  }

  let parsed: Record<string, any>;
  try {
    parsed = yaml.load(text) as Record<string, any>;
  } catch (err: any) {
    throw badRequest(`Invalid YAML: ${err.message}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw badRequest('Configuration must be a YAML object');
  }

  const components: DagComponent[] = [];
  const edges: DagEdge[] = [];

  // Extract sources
  if (parsed.sources && typeof parsed.sources === 'object') {
    for (const [id, config] of Object.entries(parsed.sources)) {
      components.push(
        buildComponent(id, 'source', config as Record<string, any>),
      );
    }
  }

  // Extract transforms
  if (parsed.transforms && typeof parsed.transforms === 'object') {
    for (const [id, config] of Object.entries(parsed.transforms)) {
      const comp = buildComponent(
        id,
        'transform',
        config as Record<string, any>,
      );
      components.push(comp);
      extractEdges(id, config as Record<string, any>, edges);
    }
  }

  // Extract sinks
  if (parsed.sinks && typeof parsed.sinks === 'object') {
    for (const [id, config] of Object.entries(parsed.sinks)) {
      const comp = buildComponent(id, 'sink', config as Record<string, any>);
      components.push(comp);
      extractEdges(id, config as Record<string, any>, edges);
    }
  }

  if (components.length === 0) {
    throw badRequest(
      'No components found in configuration. Expected sources, transforms, or sinks.',
    );
  }

  // Auto-layout positions using dagre
  applyAutoLayout(components, edges);

  return { dag: { components, edges }, originalConfig: text };
}

/**
 * Detect whether config text is YAML or TOML.
 */
export function detectFormat(text: string): 'yaml' | 'toml' {
  const trimmed = text.trim();

  // TOML indicators: [section] headers or key = "value" with equals sign
  if (/^\[[\w.-]+\]\s*$/m.test(trimmed)) {
    return 'toml';
  }

  // Default to YAML
  return 'yaml';
}

function buildComponent(
  id: string,
  type: 'source' | 'transform' | 'sink',
  raw: Record<string, any>,
): DagComponent {
  const { type: vectorType, inputs, ...config } = raw;

  return {
    id,
    type,
    vectorType: vectorType ?? 'unknown',
    config,
    position: { x: 0, y: 0 },
    metadata: { label: id },
    inferredInputSchema: null,
    inferredOutputSchema: null,
  };
}

function extractEdges(
  targetId: string,
  config: Record<string, any>,
  edges: DagEdge[],
): void {
  if (!config.inputs) return;

  const inputs: string[] = Array.isArray(config.inputs)
    ? config.inputs
    : [config.inputs];

  for (const input of inputs) {
    // Handle route outputs: "route_by_level.error" → from=route_by_level, fromOutput=error
    const dotIndex = input.indexOf('.');
    if (dotIndex > 0) {
      edges.push({
        from: input.substring(0, dotIndex),
        to: targetId,
        fromOutput: input.substring(dotIndex + 1),
      });
    } else {
      edges.push({ from: input, to: targetId });
    }
  }
}

/**
 * Apply automatic layout using dagre (horizontal layered layout).
 * Sources on the left, transforms in the middle, sinks on the right.
 */
function applyAutoLayout(
  components: DagComponent[],
  edges: DagEdge[],
): void {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: 'LR',
    nodesep: 80,
    ranksep: 150,
    marginx: 50,
    marginy: 50,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const nodeWidth = 200;
  const nodeHeight = 80;

  for (const component of components) {
    g.setNode(component.id, { width: nodeWidth, height: nodeHeight });
  }

  for (const edge of edges) {
    g.setEdge(edge.from, edge.to);
  }

  dagre.layout(g);

  for (const component of components) {
    const node = g.node(component.id);
    if (node) {
      component.position = {
        x: Math.round(node.x - nodeWidth / 2),
        y: Math.round(node.y - nodeHeight / 2),
      };
    }
  }
}
