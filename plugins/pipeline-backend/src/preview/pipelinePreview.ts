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

import type { PipelineDag, DagComponent } from '../database/types';
import type { VrlExecutor } from '../vrl/vrlExecutor';

export interface PreviewStep {
  nodeId: string;
  nodeLabel: string;
  vectorType: string;
  inputEvents: Record<string, unknown>[];
  outputEvents: Record<string, unknown>[];
  droppedEvents: Record<string, unknown>[];
  errors: string[];
  skipped: boolean;
  skipReason?: string;
}

export interface PreviewResult {
  steps: PreviewStep[];
  finalEvents: Record<string, unknown>[];
}

export interface PreviewOptions {
  targetNodeId?: string;
}

// Transforms that support preview (stateless, VRL-based)
const PREVIEWABLE_TRANSFORMS = new Set(['remap', 'filter', 'route']);

/**
 * Preview a pipeline by executing transforms step-by-step against sample events.
 * Only remap, filter, and route transforms are executed; all others pass events through
 * with a "preview not available" indicator.
 */
export async function previewPipeline(
  dag: PipelineDag,
  sampleEvents: Record<string, unknown>[],
  vrlExecutor: VrlExecutor,
  options?: PreviewOptions,
): Promise<PreviewResult> {
  const sorted = topologicalSort(dag);
  const steps: PreviewStep[] = [];

  // Track events flowing through each node
  const nodeOutputs = new Map<string, Record<string, unknown>[]>();

  // Sources emit the sample events
  for (const comp of dag.components.filter(c => c.type === 'source')) {
    nodeOutputs.set(comp.id, sampleEvents);
  }

  for (const component of sorted) {
    if (component.type === 'source') continue;

    // Gather input events from upstream nodes
    const inputEvents = gatherInputs(component.id, dag, nodeOutputs);

    if (options?.targetNodeId && steps.length > 0) {
      const lastStep = steps[steps.length - 1];
      if (lastStep.nodeId === options.targetNodeId) {
        break;
      }
    }

    const step = await executeStep(component, inputEvents, vrlExecutor);
    steps.push(step);
    nodeOutputs.set(component.id, step.outputEvents);

    if (options?.targetNodeId === component.id) {
      break;
    }
  }

  // Final events are from the last step, or source events if no transforms
  const finalEvents =
    steps.length > 0
      ? steps[steps.length - 1].outputEvents
      : sampleEvents;

  return { steps, finalEvents };
}

function gatherInputs(
  nodeId: string,
  dag: PipelineDag,
  nodeOutputs: Map<string, Record<string, unknown>[]>,
): Record<string, unknown>[] {
  const inputs: Record<string, unknown>[] = [];
  for (const edge of dag.edges) {
    if (edge.to === nodeId) {
      const sourceEvents = nodeOutputs.get(edge.from) ?? [];
      inputs.push(...sourceEvents);
    }
  }
  return inputs;
}

async function executeStep(
  component: DagComponent,
  inputEvents: Record<string, unknown>[],
  vrlExecutor: VrlExecutor,
): Promise<PreviewStep> {
  const base: Omit<PreviewStep, 'outputEvents' | 'droppedEvents' | 'errors' | 'skipped' | 'skipReason'> = {
    nodeId: component.id,
    nodeLabel: component.metadata?.label ?? component.id,
    vectorType: component.vectorType,
    inputEvents: [...inputEvents],
  };

  if (!PREVIEWABLE_TRANSFORMS.has(component.vectorType)) {
    return {
      ...base,
      outputEvents: [...inputEvents],
      droppedEvents: [],
      errors: [],
      skipped: true,
      skipReason: `Preview not available for ${component.vectorType} transforms`,
    };
  }

  if (!vrlExecutor.isAvailable()) {
    return {
      ...base,
      outputEvents: [...inputEvents],
      droppedEvents: [],
      errors: ['Vector binary not available for preview'],
      skipped: true,
      skipReason: 'Vector binary not available',
    };
  }

  if (inputEvents.length === 0) {
    return {
      ...base,
      outputEvents: [],
      droppedEvents: [],
      errors: [],
      skipped: false,
    };
  }

  try {
    switch (component.vectorType) {
      case 'remap':
        return await executeRemap(base, inputEvents, component, vrlExecutor);
      case 'filter':
        return await executeFilter(base, inputEvents, component, vrlExecutor);
      case 'route':
        return await executeRoute(base, inputEvents, component, vrlExecutor);
      default:
        return {
          ...base,
          outputEvents: [...inputEvents],
          droppedEvents: [],
          errors: [],
          skipped: true,
          skipReason: `Preview not available for ${component.vectorType}`,
        };
    }
  } catch (err: any) {
    return {
      ...base,
      outputEvents: [],
      droppedEvents: [],
      errors: [err.message ?? String(err)],
      skipped: false,
    };
  }
}

async function executeRemap(
  base: Omit<PreviewStep, 'outputEvents' | 'droppedEvents' | 'errors' | 'skipped' | 'skipReason'>,
  inputEvents: Record<string, unknown>[],
  component: DagComponent,
  vrlExecutor: VrlExecutor,
): Promise<PreviewStep> {
  const source = component.config?.source as string;
  if (!source) {
    return {
      ...base,
      outputEvents: [...inputEvents],
      droppedEvents: [],
      errors: ['No VRL source configured'],
      skipped: false,
    };
  }

  const result = await vrlExecutor.execute(source, inputEvents);
  return {
    ...base,
    outputEvents: result.output,
    droppedEvents: [],
    errors: result.errors,
    skipped: false,
  };
}

async function executeFilter(
  base: Omit<PreviewStep, 'outputEvents' | 'droppedEvents' | 'errors' | 'skipped' | 'skipReason'>,
  inputEvents: Record<string, unknown>[],
  component: DagComponent,
  vrlExecutor: VrlExecutor,
): Promise<PreviewStep> {
  const condition = component.config?.condition as
    | { type?: string; source?: string }
    | undefined;
  const source = condition?.source;
  if (!source) {
    return {
      ...base,
      outputEvents: [...inputEvents],
      droppedEvents: [],
      errors: ['No filter condition configured'],
      skipped: false,
    };
  }

  // Wrap filter condition in a VRL program that outputs the boolean result
  const filterProgram = `
result = ${source}
if !is_boolean(result) { abort }
if result { . } else { abort }
`;

  const passed: Record<string, unknown>[] = [];
  const dropped: Record<string, unknown>[] = [];
  const errors: string[] = [];

  // Execute each event individually to determine pass/fail
  for (const event of inputEvents) {
    try {
      const result = await vrlExecutor.execute(filterProgram, [event]);
      if (result.output.length > 0) {
        passed.push(event);
      } else {
        dropped.push(event);
      }
      errors.push(...result.errors);
    } catch {
      dropped.push(event);
    }
  }

  return {
    ...base,
    outputEvents: passed,
    droppedEvents: dropped,
    errors,
    skipped: false,
  };
}

async function executeRoute(
  base: Omit<PreviewStep, 'outputEvents' | 'droppedEvents' | 'errors' | 'skipped' | 'skipReason'>,
  inputEvents: Record<string, unknown>[],
  component: DagComponent,
  vrlExecutor: VrlExecutor,
): Promise<PreviewStep> {
  const routes = component.config?.route as
    | Record<string, { type?: string; source?: string }>
    | undefined;
  if (!routes || Object.keys(routes).length === 0) {
    return {
      ...base,
      outputEvents: [...inputEvents],
      droppedEvents: [],
      errors: ['No routes configured'],
      skipped: false,
    };
  }

  // All events that match any route are output; unmatched are dropped
  const matched = new Set<number>();
  const errors: string[] = [];

  for (const [, routeConfig] of Object.entries(routes)) {
    const source = routeConfig.source;
    if (!source) continue;

    const routeProgram = `
result = ${source}
if !is_boolean(result) { abort }
if result { . } else { abort }
`;

    for (let i = 0; i < inputEvents.length; i++) {
      try {
        const result = await vrlExecutor.execute(routeProgram, [
          inputEvents[i],
        ]);
        if (result.output.length > 0) {
          matched.add(i);
        }
        errors.push(...result.errors);
      } catch {
        // Event doesn't match this route
      }
    }
  }

  const outputEvents = inputEvents.filter((_, i) => matched.has(i));
  const droppedEvents = inputEvents.filter((_, i) => !matched.has(i));

  return {
    ...base,
    outputEvents,
    droppedEvents,
    errors,
    skipped: false,
  };
}

/**
 * Topological sort of DAG components (Kahn's algorithm).
 * Returns transforms and sinks in execution order.
 */
function topologicalSort(dag: PipelineDag): DagComponent[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const c of dag.components) {
    inDegree.set(c.id, 0);
    adjacency.set(c.id, []);
  }

  for (const e of dag.edges) {
    adjacency.get(e.from)?.push(e.to);
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const sorted: DagComponent[] = [];
  const componentMap = new Map(dag.components.map(c => [c.id, c]));

  while (queue.length > 0) {
    const id = queue.shift()!;
    const comp = componentMap.get(id);
    if (comp) sorted.push(comp);

    for (const neighbor of adjacency.get(id) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  return sorted;
}
