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

import type { PipelineDag } from '../database/types';
import { badRequest } from './errors';

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

export function validatePipelineName(name: string): void {
  if (!name || name.length < 3 || name.length > 256) {
    throw badRequest('Pipeline name must be between 3 and 256 characters');
  }
  if (!NAME_PATTERN.test(name)) {
    throw badRequest(
      'Pipeline name must start and end with a lowercase letter or number, and contain only lowercase letters, numbers, and hyphens',
    );
  }
}

/**
 * Validate DAG structural integrity:
 * - Components have unique IDs
 * - Edges reference valid component IDs
 * - No orphan edges
 * - At least one source and one sink
 * - No cycles (topological sort)
 */
export function validateDag(dag: PipelineDag): void {
  if (
    !dag ||
    !Array.isArray(dag.components) ||
    !Array.isArray(dag.edges)
  ) {
    throw badRequest('DAG must have components and edges arrays');
  }

  // Unique IDs
  const ids = new Set<string>();
  for (const component of dag.components) {
    if (!component.id) {
      throw badRequest('All components must have an id');
    }
    if (ids.has(component.id)) {
      throw badRequest(`Duplicate component id: ${component.id}`);
    }
    ids.add(component.id);

    if (!['source', 'transform', 'sink'].includes(component.type)) {
      throw badRequest(
        `Invalid component type "${component.type}" for ${component.id}`,
      );
    }
    if (!component.vectorType) {
      throw badRequest(`Component ${component.id} must have a vectorType`);
    }
  }

  // Edge references
  for (const edge of dag.edges) {
    if (!ids.has(edge.from)) {
      throw badRequest(
        `Edge references unknown source component: ${edge.from}`,
      );
    }
    if (!ids.has(edge.to)) {
      throw badRequest(
        `Edge references unknown target component: ${edge.to}`,
      );
    }
    if (edge.from === edge.to) {
      throw badRequest(`Self-referencing edge on component: ${edge.from}`);
    }
  }

  // At least one source and one sink
  const sources = dag.components.filter(c => c.type === 'source');
  const sinks = dag.components.filter(c => c.type === 'sink');
  if (sources.length === 0) {
    throw badRequest('Pipeline must have at least one source');
  }
  if (sinks.length === 0) {
    throw badRequest('Pipeline must have at least one sink');
  }

  // Cycle detection via topological sort (Kahn's algorithm)
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const component of dag.components) {
    adjacency.set(component.id, []);
    inDegree.set(component.id, 0);
  }

  for (const edge of dag.edges) {
    adjacency.get(edge.from)!.push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  let visited = 0;
  while (queue.length > 0) {
    const node = queue.shift()!;
    visited++;
    for (const neighbor of adjacency.get(node) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  if (visited !== dag.components.length) {
    throw badRequest('Pipeline contains a cycle');
  }
}
