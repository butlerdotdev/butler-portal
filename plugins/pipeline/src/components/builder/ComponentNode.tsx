// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { Typography, Box } from '@material-ui/core';
import { makeStyles, createStyles } from '@material-ui/core/styles';
import InputIcon from '@material-ui/icons/Input';
import TransformIcon from '@material-ui/icons/Transform';
import CallMadeIcon from '@material-ui/icons/CallMade';
import type { DagComponent } from '../../api/types/pipelines';

const TYPE_COLORS: Record<string, string> = {
  source: '#4caf50',
  transform: '#2196f3',
  sink: '#ff9800',
};

const TYPE_ICONS: Record<string, React.ComponentType> = {
  source: InputIcon,
  transform: TransformIcon,
  sink: CallMadeIcon,
};

const useStyles = makeStyles(() =>
  createStyles({
    node: {
      padding: '8px 12px',
      borderRadius: 8,
      border: '2px solid',
      backgroundColor: '#1e1e1e',
      minWidth: 160,
      maxWidth: 220,
      cursor: 'pointer',
      '&:hover': {
        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
        backgroundColor: '#252525',
      },
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
    },
    icon: {
      fontSize: 18,
    },
    label: {
      fontSize: '0.8rem',
      fontWeight: 600,
      color: '#e0e0e0',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    vectorType: {
      fontSize: '0.7rem',
      color: '#888',
      marginTop: 2,
      marginLeft: 24,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    handle: {
      width: 10,
      height: 10,
    },
  }),
);

function ComponentNodeInner({ data }: NodeProps) {
  const classes = useStyles();
  const component = data?.component as DagComponent | undefined;

  const componentType = component?.type ?? 'transform';
  const label = component?.metadata?.label ?? 'Unknown';
  const componentId = component?.id ?? '';
  const color = TYPE_COLORS[componentType] ?? '#999';
  const IconComponent = TYPE_ICONS[componentType] ?? TransformIcon;

  const showInputHandle = componentType !== 'source';
  const showOutputHandle = componentType !== 'sink';

  return (
    <Box className={classes.node} style={{ borderColor: color }}>
      {showInputHandle && (
        <Handle
          type="target"
          position={Position.Left}
          className={classes.handle}
          style={{ background: color }}
        />
      )}
      <div className={classes.header}>
        <IconComponent
          className={classes.icon}
          style={{ color }}
        />
        <Typography className={classes.label}>{label}</Typography>
      </div>
      {componentId && (
        <Typography className={classes.vectorType}>{componentId}</Typography>
      )}
      {showOutputHandle && (
        <Handle
          type="source"
          position={Position.Right}
          className={classes.handle}
          style={{ background: color }}
        />
      )}
    </Box>
  );
}

export const ComponentNode = memo(ComponentNodeInner);
