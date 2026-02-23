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

import { createHash } from 'crypto';
import * as yaml from 'js-yaml';
import type { PipelineDag, DagComponent, DagEdge } from '../database/types';

export interface CompiledConfig {
  yaml: string;
  hash: string;
}

/**
 * Compile a pipeline DAG into deterministic Vector YAML configuration.
 *
 * Determinism guarantees:
 * - Components grouped by type (sources, transforms, sinks), sorted by ID
 * - Config keys sorted alphabetically at every level
 * - Edge-derived `inputs` arrays sorted alphabetically
 * - Same DAG always produces byte-identical YAML and identical hash
 *
 * The hash is computed on the final string including the comment header.
 */
export function compileConfig(
  dag: PipelineDag,
  pipelineName: string,
  version: number,
): CompiledConfig {
  const sources = dag.components
    .filter(c => c.type === 'source')
    .sort((a, b) => a.id.localeCompare(b.id));
  const transforms = dag.components
    .filter(c => c.type === 'transform')
    .sort((a, b) => a.id.localeCompare(b.id));
  const sinks = dag.components
    .filter(c => c.type === 'sink')
    .sort((a, b) => a.id.localeCompare(b.id));

  const inputMap = buildInputMap(dag.components, dag.edges);

  const config: Record<string, unknown> = {};

  if (sources.length > 0) {
    config.sources = buildSection(sources, inputMap);
  }
  if (transforms.length > 0) {
    config.transforms = buildSection(transforms, inputMap);
  }
  if (sinks.length > 0) {
    config.sinks = buildSection(sinks, inputMap);
  }

  const dumpOpts: yaml.DumpOptions = {
    sortKeys: true,
    lineWidth: -1,
    noRefs: true,
    quotingType: '"',
  };

  // Dump each section separately to enforce sources → transforms → sinks order
  // (sortKeys would alphabetize the top-level keys: sinks, sources, transforms)
  const parts: string[] = [];
  if (config.sources) parts.push(yaml.dump({ sources: config.sources }, dumpOpts));
  if (config.transforms) parts.push(yaml.dump({ transforms: config.transforms }, dumpOpts));
  if (config.sinks) parts.push(yaml.dump({ sinks: config.sinks }, dumpOpts));

  const comment = `# Managed by Butler Portal \u2014 Pipeline: ${pipelineName} v${version}\n`;
  const fullYaml = comment + parts.join('');

  const hash = `sha256:${createHash('sha256').update(fullYaml).digest('hex')}`;

  return { yaml: fullYaml, hash };
}

/**
 * Build a map from component ID to its sorted list of input references.
 * For route transforms with `fromOutput`, the input becomes
 * `<sourceId>.<fromOutput>` (e.g., "route_by_level.error").
 */
function buildInputMap(
  components: DagComponent[],
  edges: DagEdge[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();

  for (const c of components) {
    map.set(c.id, []);
  }

  for (const edge of edges) {
    const inputs = map.get(edge.to);
    if (inputs) {
      const ref = edge.fromOutput
        ? `${edge.from}.${edge.fromOutput}`
        : edge.from;
      inputs.push(ref);
    }
  }

  // Sort inputs for determinism
  for (const [, inputs] of map) {
    inputs.sort();
  }

  return map;
}

/**
 * Build a Vector config section from a sorted list of components.
 */
function buildSection(
  components: DagComponent[],
  inputMap: Map<string, string[]>,
): Record<string, unknown> {
  const section: Record<string, unknown> = {};

  for (const component of components) {
    const entry: Record<string, unknown> = {
      type: component.vectorType,
    };

    // Merge component config, sorting keys
    if (component.config) {
      const sortedKeys = Object.keys(component.config).sort();
      for (const key of sortedKeys) {
        entry[key] = component.config[key];
      }
    }

    // Add inputs for transforms and sinks
    const inputs = inputMap.get(component.id);
    if (inputs && inputs.length > 0 && component.type !== 'source') {
      entry.inputs = inputs;
    }

    section[component.id] = entry;
  }

  return section;
}
