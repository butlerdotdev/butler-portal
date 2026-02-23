// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Divider,
  IconButton,
} from '@material-ui/core';
import { makeStyles, Theme, createStyles } from '@material-ui/core/styles';
import CloseIcon from '@material-ui/icons/Close';
import DeleteIcon from '@material-ui/icons/Delete';
import type { Node } from '@xyflow/react';
import type { DagComponent } from '../../api/types/pipelines';

const TYPE_COLORS: Record<string, string> = {
  source: '#4caf50',
  transform: '#2196f3',
  sink: '#ff9800',
};

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    root: {
      width: 320,
      height: '100%',
      borderLeft: `1px solid ${theme.palette.divider}`,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: theme.spacing(1.5, 2),
      borderBottom: `1px solid ${theme.palette.divider}`,
    },
    headerTitle: {
      display: 'flex',
      alignItems: 'center',
      gap: theme.spacing(1),
    },
    typeBadge: {
      fontSize: '0.7rem',
      fontWeight: 700,
      textTransform: 'uppercase',
      padding: '2px 8px',
      borderRadius: 4,
      color: '#fff',
    },
    content: {
      flex: 1,
      overflowY: 'auto',
      padding: theme.spacing(2),
    },
    field: {
      marginBottom: theme.spacing(2),
    },
    footer: {
      padding: theme.spacing(1.5, 2),
      borderTop: `1px solid ${theme.palette.divider}`,
    },
    vrlTextarea: {
      fontFamily: 'monospace',
      fontSize: '0.85rem',
    },
  }),
);

interface ComponentPanelProps {
  node: Node;
  allNodeIds: string[];
  onClose: () => void;
  onRemove?: (nodeId: string) => void;
  onUpdateConfig?: (nodeId: string, config: Record<string, unknown>) => void;
  onRename?: (oldId: string, newId: string) => void;
}

export function ComponentPanel({
  node,
  allNodeIds,
  onClose,
  onRemove,
  onUpdateConfig,
  onRename,
}: ComponentPanelProps) {
  const classes = useStyles();
  const component = node.data?.component as DagComponent | undefined;

  if (!component) {
    return (
      <Box className={classes.root}>
        <Box className={classes.header}>
          <Typography variant="subtitle1">No component data</Typography>
          <IconButton size="small" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>
    );
  }

  const componentType = component.type;
  const displayName = component.metadata?.label ?? component.vectorType;
  const vectorType = component.vectorType;
  const color = TYPE_COLORS[componentType] ?? '#999';
  const configSchema = (node.data?.configSchema as Record<string, unknown>) ?? {};
  const config = component.config ?? {};

  const isRemapTransform =
    componentType === 'transform' && vectorType === 'remap';

  const handleConfigChange = (key: string, value: unknown) => {
    if (!onUpdateConfig) return;
    const updated = { ...config, [key]: value };
    onUpdateConfig(node.id, updated);
  };

  // ── Rename state ────────────────────────────────────────────────
  const [editingId, setEditingId] = useState(node.id);
  const [idError, setIdError] = useState('');

  useEffect(() => {
    setEditingId(node.id);
    setIdError('');
  }, [node.id]);

  const validateAndApplyRename = () => {
    if (!onRename) return;
    const trimmed = editingId.trim();
    if (trimmed === node.id) return;

    if (!trimmed) {
      setIdError('ID cannot be empty');
      return;
    }
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(trimmed)) {
      setIdError('Must start with a letter; only letters, digits, and underscores');
      return;
    }
    if (allNodeIds.some(id => id !== node.id && id === trimmed)) {
      setIdError('Another component already uses this ID');
      return;
    }
    setIdError('');
    onRename(node.id, trimmed);
  };

  const renderSchemaFields = () => {
    const properties =
      (configSchema.properties as Record<string, any>) ?? {};
    const fieldNames = Object.keys(properties);

    if (fieldNames.length === 0 && !isRemapTransform) {
      return (
        <Typography variant="body2" color="textSecondary">
          No configurable fields for this component.
        </Typography>
      );
    }

    return fieldNames.map(fieldName => {
      const fieldSchema = properties[fieldName];
      const fieldType = fieldSchema?.type ?? 'string';
      const fieldDescription = fieldSchema?.description ?? '';
      const currentValue = config[fieldName] ?? '';

      if (fieldName === 'source' && isRemapTransform) {
        return null;
      }

      return (
        <TextField
          key={fieldName}
          className={classes.field}
          fullWidth
          variant="outlined"
          size="small"
          label={fieldName}
          helperText={fieldDescription}
          value={String(currentValue)}
          onChange={e => {
            let parsed: unknown = e.target.value;
            if (fieldType === 'number' || fieldType === 'integer') {
              const num = Number(e.target.value);
              if (!Number.isNaN(num)) parsed = num;
            } else if (fieldType === 'boolean') {
              parsed = e.target.value === 'true';
            }
            handleConfigChange(fieldName, parsed);
          }}
          multiline={fieldType === 'object' || fieldType === 'array'}
          rows={fieldType === 'object' || fieldType === 'array' ? 3 : 1}
        />
      );
    });
  };

  return (
    <Box className={classes.root}>
      <Box className={classes.header}>
        <div className={classes.headerTitle}>
          <Typography variant="subtitle1" style={{ fontWeight: 600 }}>
            {displayName}
          </Typography>
          <span
            className={classes.typeBadge}
            style={{ backgroundColor: color }}
          >
            {componentType}
          </span>
        </div>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      <div className={classes.content}>
        <Typography variant="caption" color="textSecondary" gutterBottom>
          Vector type: {vectorType}
        </Typography>

        {onRename && (
          <TextField
            className={classes.field}
            fullWidth
            variant="outlined"
            size="small"
            label="Component ID"
            helperText={idError || 'Name used in Vector YAML config (e.g. datadog_agent)'}
            error={!!idError}
            value={editingId}
            onChange={e => {
              setEditingId(e.target.value);
              setIdError('');
            }}
            onBlur={validateAndApplyRename}
            onKeyDown={e => {
              if (e.key === 'Enter') validateAndApplyRename();
            }}
          />
        )}

        <Box mt={onRename ? 0 : 2}>
          {renderSchemaFields()}

          {isRemapTransform && (
            <TextField
              className={classes.field}
              fullWidth
              variant="outlined"
              size="small"
              label="VRL Source"
              helperText="Vector Remap Language program"
              value={String(config.source ?? '')}
              onChange={e => handleConfigChange('source', e.target.value)}
              multiline
              rows={10}
              InputProps={{
                classes: { input: classes.vrlTextarea },
              }}
            />
          )}
        </Box>
      </div>

      <Divider />
      {onRemove && (
        <Box className={classes.footer}>
          <Button
            fullWidth
            variant="outlined"
            color="secondary"
            startIcon={<DeleteIcon />}
            onClick={() => onRemove(node.id)}
          >
            Remove Node
          </Button>
        </Box>
      )}
    </Box>
  );
}
