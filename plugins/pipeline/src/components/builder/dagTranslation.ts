// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { Node, Edge } from '@xyflow/react';
import type {
  PipelineDag,
  DagComponent,
  DagEdge,
} from '../../api/types/pipelines';

/**
 * Converts a PipelineDag (spec format) into React Flow nodes and edges.
 */
export function dagToReactFlow(dag: PipelineDag): {
  nodes: Node[];
  edges: Edge[];
} {
  const nodes: Node[] = dag.components.map((component: DagComponent) => ({
    id: component.id,
    type: 'component',
    position: component.position,
    data: { component },
  }));

  const edges: Edge[] = dag.edges.map((edge: DagEdge, index: number) => ({
    id: `edge-${index}-${edge.from}-${edge.to}`,
    source: edge.from,
    target: edge.to,
    sourceHandle: edge.fromOutput ?? undefined,
  }));

  return { nodes, edges };
}

/**
 * Converts React Flow nodes and edges back into the PipelineDag spec format.
 */
export function reactFlowToDag(nodes: Node[], edges: Edge[]): PipelineDag {
  const components: DagComponent[] = nodes.map(node => {
    const component = node.data?.component as DagComponent | undefined;

    return {
      id: node.id,
      type: component?.type ?? 'transform',
      vectorType: component?.vectorType ?? '',
      config: component?.config ?? {},
      position: { x: node.position.x, y: node.position.y },
      metadata: component?.metadata ?? { label: node.id },
      inferredInputSchema: component?.inferredInputSchema ?? null,
      inferredOutputSchema: component?.inferredOutputSchema ?? null,
    };
  });

  const dagEdges: DagEdge[] = edges.map(edge => {
    const dagEdge: DagEdge = {
      from: edge.source,
      to: edge.target,
    };
    if (edge.sourceHandle) {
      dagEdge.fromOutput = edge.sourceHandle;
    }
    return dagEdge;
  });

  return { components, edges: dagEdges };
}
