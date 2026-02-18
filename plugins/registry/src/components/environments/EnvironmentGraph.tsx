// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useMemo } from 'react';
import { Box, Typography, makeStyles } from '@material-ui/core';
import type { EnvironmentGraph as GraphData } from '../../api/types/environments';

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
  lastRunStatus: string | null;
  resourceCount: number;
}

function statusFill(status: string | null): string {
  switch (status) {
    case 'succeeded':
      return '#4caf50';
    case 'failed':
      return '#f44336';
    case 'running':
    case 'applying':
    case 'planned':
      return '#2196f3';
    case 'queued':
    case 'pending':
      return '#ff9800';
    case 'skipped':
    case 'cancelled':
      return '#9e9e9e';
    default:
      return '#bdbdbd';
  }
}

function layoutGraph(
  graph: GraphData,
): { nodes: NodePosition[]; width: number; height: number } {
  if (graph.nodes.length === 0) {
    return { nodes: [], width: 0, height: 0 };
  }

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

  // Handle disconnected nodes (cycle or no edges)
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
      positions.push({
        id,
        x: PADDING + layer * H_SPACING,
        y: PADDING + idx * V_SPACING,
        name: node.name,
        artifactName: node.artifact_name,
        lastRunStatus: node.last_run_status,
        resourceCount: node.resource_count,
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
  onNodeClick,
}: {
  graph: GraphData;
  onNodeClick?: (moduleId: string) => void;
}) {
  const classes = useStyles();

  const layout = useMemo(() => layoutGraph(graph), [graph]);

  if (graph.nodes.length === 0) {
    return (
      <Box className={classes.empty}>
        <Typography color="textSecondary">
          No modules in this environment yet.
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
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="10"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#666" />
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
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#666"
              strokeWidth={2}
              markerEnd="url(#arrowhead)"
            />
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
              stroke="#ccc"
              strokeWidth={2}
            />
            {/* Status indicator */}
            <rect
              width={6}
              height={NODE_HEIGHT}
              rx={3}
              fill={statusFill(node.lastRunStatus)}
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
            <text x={16} y={52} fontSize={10} fill="#888">
              {node.resourceCount} resources
            </text>
          </g>
        ))}
      </svg>
    </Box>
  );
}
