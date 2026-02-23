// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import * as yaml from 'js-yaml';
import type {
  PipelineDag,
  DagComponent,
  DagEdge,
} from '../api/types/pipelines';

/**
 * Compile a pipeline DAG into Vector YAML configuration (browser-side).
 *
 * Mirrors the backend configCompiler.ts logic. Components are grouped by type
 * (sources, transforms, sinks) and sorted by ID for deterministic output.
 * Edge-derived `inputs` arrays are sorted alphabetically.
 */
export function compileDagToYaml(
  dag: PipelineDag,
  pipelineName?: string,
): string {
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

  if (Object.keys(config).length === 0) {
    return '# Empty pipeline \u2014 drag components onto the canvas to get started.\n';
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

  const header = pipelineName
    ? `# Pipeline: ${pipelineName} (unsaved preview)\n`
    : '# Pipeline preview (unsaved)\n';

  return header + parts.join('');
}

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

  for (const [, inputs] of map) {
    inputs.sort();
  }

  return map;
}

function buildSection(
  components: DagComponent[],
  inputMap: Map<string, string[]>,
): Record<string, unknown> {
  const section: Record<string, unknown> = {};

  for (const component of components) {
    const entry: Record<string, unknown> = {
      type: component.vectorType,
    };

    if (component.config) {
      const sortedKeys = Object.keys(component.config).sort();
      for (const key of sortedKeys) {
        entry[key] = component.config[key];
      }
    }

    const inputs = inputMap.get(component.id);
    if (inputs && inputs.length > 0 && component.type !== 'source') {
      entry.inputs = inputs;
    }

    section[component.id] = entry;
  }

  return section;
}
