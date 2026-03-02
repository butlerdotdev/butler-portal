// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useMemo } from 'react';
import { Box, Typography, makeStyles } from '@material-ui/core';
import type { ProjectGraph } from '../../api/types/projects';
import type { EnvironmentModuleState } from '../../api/types/projects';

const useStyles = makeStyles(theme => ({
  root: {
    width: '100%',
    overflow: 'auto',
    padding: theme.spacing(2),
  },
  svg: {
    display: 'block',
    margin: '0 auto',
  },
  empty: {
    textAlign: 'center',
    padding: theme.spacing(4),
  },
}));

const NODE_WIDTH = 160;
const NODE_HEIGHT = 60;
const H_SPACING = 200;
const V_SPACING = 100;
const PADDING = 40;

interface NodePosition {
  id: string;
  x: number;
  y: number;
  name: string;
  artifactName: string;
  status: string;
  runStatus: string | null;
}

function runStatusFill(runStatus: string | null): string {
  switch (runStatus) {
    case 'succeeded':
      return '#4caf50';
    case 'failed':
    case 'timed_out':
    case 'cancelled':
      return '#f44336';
    case 'running':
    case 'applying':
    case 'confirmed':
      return '#2196f3';
    case 'planned':
      return '#ff9800';
    case 'queued':
    case 'pending':
      return '#9e9e9e';
    default:
      return '#bdbdbd';
  }
}

function runStatusLabel(runStatus: string | null): string {
  if (!runStatus) return 'no runs';
  return runStatus;
}

function layoutGraph(
  graph: ProjectGraph,
  moduleStates?: EnvironmentModuleState[],
): { nodes: NodePosition[]; width: number; height: number } {
  if (graph.nodes.length === 0) {
    return { nodes: [], width: 0, height: 0 };
  }

  const stateMap = new Map(
    (moduleStates ?? []).map(s => [s.project_module_id, s]),
  );

  // Build adjacency for topological layering
  const incoming = new Map<string, Set<string>>();
  const outgoing = new Map<string, Set<string>>();
  for (const n of graph.nodes) {
    incoming.set(n.id, new Set());
    outgoing.set(n.id, new Set());
  }
  for (const e of graph.edges) {
    incoming.get(e.to)?.add(e.from);
    outgoing.get(e.from)?.add(e.to);
  }

  // Assign layers via BFS (Kahn's)
  const layers = new Map<string, number>();
  const queue: string[] = [];
  const inDegree = new Map<string, number>();
  for (const n of graph.nodes) {
    const deg = incoming.get(n.id)?.size ?? 0;
    inDegree.set(n.id, deg);
    if (deg === 0) {
      queue.push(n.id);
      layers.set(n.id, 0);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentLayer = layers.get(current) ?? 0;
    for (const next of outgoing.get(current) ?? []) {
      const newDeg = (inDegree.get(next) ?? 1) - 1;
      inDegree.set(next, newDeg);
      const existingLayer = layers.get(next) ?? 0;
      layers.set(next, Math.max(existingLayer, currentLayer + 1));
      if (newDeg === 0) {
        queue.push(next);
      }
    }
  }

  // Handle disconnected nodes
  for (const n of graph.nodes) {
    if (!layers.has(n.id)) {
      layers.set(n.id, 0);
    }
  }

  // Group by layer
  const layerGroups = new Map<number, string[]>();
  for (const [id, layer] of layers) {
    const group = layerGroups.get(layer) ?? [];
    group.push(id);
    layerGroups.set(layer, group);
  }

  const nodeMap = new Map(graph.nodes.map(n => [n.id, n]));
  const positions: NodePosition[] = [];
  const maxLayer = Math.max(...layerGroups.keys(), 0);

  for (let layer = 0; layer <= maxLayer; layer++) {
    const ids = layerGroups.get(layer) ?? [];
    ids.forEach((id, idx) => {
      const node = nodeMap.get(id)!;
      const state = stateMap.get(id);
      positions.push({
        id,
        x: PADDING + layer * H_SPACING,
        y: PADDING + idx * V_SPACING,
        name: node.name,
        artifactName: node.artifact_name,
        status: node.status,
        runStatus: state?.last_run_status ?? null,
      });
    });
  }

  const maxNodesInLayer = Math.max(
    ...Array.from(layerGroups.values()).map(g => g.length),
    1,
  );
  const width = PADDING * 2 + maxLayer * H_SPACING + NODE_WIDTH;
  const height = PADDING * 2 + (maxNodesInLayer - 1) * V_SPACING + NODE_HEIGHT;

  return { nodes: positions, width, height };
}

export function EnvironmentGraph({
  graph,
  moduleStates,
  onNodeClick,
}: {
  graph: ProjectGraph;
  moduleStates?: EnvironmentModuleState[];
  onNodeClick?: (moduleId: string) => void;
}) {
  const classes = useStyles();

  const layout = useMemo(
    () => layoutGraph(graph, moduleStates),
    [graph, moduleStates],
  );

  if (graph.nodes.length === 0) {
    return (
      <Box className={classes.empty}>
        <Typography color="textSecondary">
          No modules in this project yet.
        </Typography>
      </Box>
    );
  }

  const posMap = new Map(layout.nodes.map(n => [n.id, n]));

  return (
    <Box className={classes.root}>
      <svg
        className={classes.svg}
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
      >
        <defs>
          <marker
            id="env-arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="10"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#666" />
          </marker>
          <marker
            id="env-arrowhead-blue"
            markerWidth="10"
            markerHeight="7"
            refX="10"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#1976d2" />
          </marker>
        </defs>

        {/* Edges */}
        {graph.edges.map((edge, i) => {
          const from = posMap.get(edge.from);
          const to = posMap.get(edge.to);
          if (!from || !to) return null;
          const x1 = from.x + NODE_WIDTH;
          const y1 = from.y + NODE_HEIGHT / 2;
          const x2 = to.x;
          const y2 = to.y + NODE_HEIGHT / 2;
          const mappingCount = edge.output_mapping_count ?? 0;
          const hasData = mappingCount > 0;
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;
          return (
            <g key={i}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={hasData ? '#1976d2' : '#999'}
                strokeWidth={hasData ? 2.5 : 1.5}
                strokeDasharray={hasData ? undefined : '6 3'}
                markerEnd={
                  hasData
                    ? 'url(#env-arrowhead-blue)'
                    : 'url(#env-arrowhead)'
                }
              />
              {hasData && (
                <>
                  <rect
                    x={midX - 16}
                    y={midY - 10}
                    width={32}
                    height={16}
                    rx={8}
                    fill="#1976d2"
                  />
                  <text
                    x={midX}
                    y={midY + 2}
                    textAnchor="middle"
                    fontSize={9}
                    fontWeight={600}
                    fill="#fff"
                  >
                    {mappingCount} out
                  </text>
                </>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {layout.nodes.map(node => (
          <g
            key={node.id}
            transform={`translate(${node.x},${node.y})`}
            style={{ cursor: onNodeClick ? 'pointer' : 'default' }}
            onClick={() => onNodeClick?.(node.id)}
          >
            <rect
              width={NODE_WIDTH}
              height={NODE_HEIGHT}
              rx={6}
              fill="#fff"
              stroke={runStatusFill(node.runStatus)}
              strokeWidth={2}
            />
            {/* Run status indicator */}
            <rect
              width={6}
              height={NODE_HEIGHT}
              rx={3}
              fill={runStatusFill(node.runStatus)}
            />
            <text
              x={16}
              y={22}
              fontSize={13}
              fontWeight={600}
              fill="#333"
            >
              {node.name.length > 16
                ? `${node.name.slice(0, 15)}...`
                : node.name}
            </text>
            <text x={16} y={38} fontSize={10} fill="#888">
              {node.artifactName}
            </text>
            <text
              x={16}
              y={52}
              fontSize={10}
              fill={runStatusFill(node.runStatus)}
              fontWeight={500}
            >
              {runStatusLabel(node.runStatus)}
            </text>
          </g>
        ))}
      </svg>
    </Box>
  );
}
