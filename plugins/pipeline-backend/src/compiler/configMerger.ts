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
import { PipelineError } from '../util/errors';

export interface PipelineConfig {
  pipelineName: string;
  vectorConfig: string; // compiled YAML
}

export interface CollisionError {
  componentId: string;
  section: string; // 'sources' | 'transforms' | 'sinks'
  pipelines: string[]; // names of conflicting pipelines
}

export interface MergeResult {
  vectorConfig: string;
  configHash: string;
}

const SECTIONS = ['sources', 'transforms', 'sinks'] as const;
type Section = (typeof SECTIONS)[number];

/**
 * Check for component ID collisions across multiple pipeline configs.
 * Returns an empty array if no collisions are found.
 */
export function detectCollisions(
  pipelines: PipelineConfig[],
): CollisionError[] {
  // Map from componentId to { section, pipelines[] }
  const ownership = new Map<
    string,
    { section: Section; pipelines: string[] }
  >();

  for (const pipeline of pipelines) {
    const parsed = parsePipelineYaml(pipeline.pipelineName, pipeline.vectorConfig);

    for (const section of SECTIONS) {
      const sectionData = parsed[section];
      if (!sectionData || typeof sectionData !== 'object') continue;

      for (const componentId of Object.keys(sectionData)) {
        const existing = ownership.get(componentId);
        if (existing) {
          // Only add the pipeline name if not already tracked
          if (!existing.pipelines.includes(pipeline.pipelineName)) {
            existing.pipelines.push(pipeline.pipelineName);
          }
          // If the collision is across different sections, keep the first
          // section seen. The important thing is that we detect the conflict.
        } else {
          ownership.set(componentId, {
            section,
            pipelines: [pipeline.pipelineName],
          });
        }
      }
    }
  }

  const collisions: CollisionError[] = [];
  for (const [componentId, entry] of ownership) {
    if (entry.pipelines.length > 1) {
      collisions.push({
        componentId,
        section: entry.section,
        pipelines: entry.pipelines,
      });
    }
  }

  // Sort collisions for deterministic output
  collisions.sort((a, b) => a.componentId.localeCompare(b.componentId));

  return collisions;
}

/**
 * Merge multiple pipeline configs into a single Vector config.
 * Throws PipelineError with CONFIG_COLLISION code if duplicate component IDs
 * are found across pipelines.
 */
export function mergeConfigs(pipelines: PipelineConfig[]): MergeResult {
  if (pipelines.length === 0) {
    const emptyYaml = yaml.dump({}, { sortKeys: true, lineWidth: -1 });
    const hash = `sha256:${createHash('sha256').update(emptyYaml).digest('hex')}`;
    return { vectorConfig: emptyYaml, configHash: hash };
  }

  // Check for collisions first
  const collisions = detectCollisions(pipelines);
  if (collisions.length > 0) {
    const details = collisions.map(c =>
      `Component "${c.componentId}" (${c.section}) exists in pipelines: ${c.pipelines.join(', ')}`,
    );
    throw new PipelineError(
      409,
      'CONFIG_COLLISION',
      `Cannot merge configs: ${collisions.length} component ID collision(s) detected`,
      { collisions, details },
    );
  }

  // Merge all sections
  const merged: Record<string, Record<string, unknown>> = {
    sources: {},
    transforms: {},
    sinks: {},
  };

  for (const pipeline of pipelines) {
    const parsed = parsePipelineYaml(pipeline.pipelineName, pipeline.vectorConfig);

    for (const section of SECTIONS) {
      const sectionData = parsed[section];
      if (!sectionData || typeof sectionData !== 'object') continue;

      for (const [id, config] of Object.entries(sectionData)) {
        merged[section][id] = config;
      }
    }
  }

  // Remove empty sections
  const config: Record<string, unknown> = {};
  for (const section of SECTIONS) {
    if (Object.keys(merged[section]).length > 0) {
      config[section] = merged[section];
    }
  }

  // Dump each section separately to enforce sources → transforms → sinks order
  const dumpOpts: yaml.DumpOptions = {
    sortKeys: true,
    lineWidth: -1,
    noRefs: true,
    quotingType: '"',
  };
  const parts: string[] = [];
  if (config.sources) parts.push(yaml.dump({ sources: config.sources }, dumpOpts));
  if (config.transforms) parts.push(yaml.dump({ transforms: config.transforms }, dumpOpts));
  if (config.sinks) parts.push(yaml.dump({ sinks: config.sinks }, dumpOpts));
  const vectorConfig = parts.join('') || yaml.dump({}, dumpOpts);

  const configHash = `sha256:${createHash('sha256').update(vectorConfig).digest('hex')}`;

  return { vectorConfig, configHash };
}

/**
 * Parse a pipeline's YAML config into a typed object.
 * Strips leading comment lines (e.g. "# Managed by Butler Portal ...").
 */
function parsePipelineYaml(
  pipelineName: string,
  vectorConfig: string,
): Record<string, Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = yaml.load(vectorConfig);
  } catch (err: any) {
    throw new PipelineError(
      400,
      'VALIDATION_ERROR',
      `Invalid YAML in pipeline "${pipelineName}": ${err.message}`,
    );
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new PipelineError(
      400,
      'VALIDATION_ERROR',
      `Pipeline "${pipelineName}" config must be a YAML object`,
    );
  }

  return parsed as Record<string, Record<string, unknown>>;
}
