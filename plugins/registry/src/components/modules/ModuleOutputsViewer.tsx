// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  makeStyles,
} from '@material-ui/core';
import RefreshIcon from '@material-ui/icons/Refresh';
import { useRegistryApi } from '../../hooks/useRegistryApi';

const useStyles = makeStyles(theme => ({
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(1),
  },
  emptyState: {
    padding: theme.spacing(4),
    textAlign: 'center' as const,
  },
  outputKey: {
    fontFamily: 'monospace',
    fontWeight: 600,
  },
  outputValue: {
    fontFamily: 'monospace',
    fontSize: '0.85rem',
    maxWidth: 400,
    wordBreak: 'break-all' as const,
  },
  sensitiveValue: {
    fontStyle: 'italic',
    color: theme.palette.text.secondary,
  },
}));

interface ModuleOutputsViewerProps {
  envId: string;
  moduleId: string;
}

export function ModuleOutputsViewer({
  envId,
  moduleId,
}: ModuleOutputsViewerProps) {
  const classes = useStyles();
  const api = useRegistryApi();

  const [outputs, setOutputs] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOutputs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getModuleLatestOutputs(envId, moduleId);
      setOutputs(data.outputs);
    } catch {
      setOutputs(null);
      setError('No outputs available');
    } finally {
      setLoading(false);
    }
  }, [api, envId, moduleId]);

  useEffect(() => {
    fetchOutputs();
  }, [fetchOutputs]);

  const entries = outputs ? Object.entries(outputs) : [];

  return (
    <Box>
      <Box className={classes.header}>
        <Box display="flex" alignItems="center" style={{ gap: 8 }}>
          <Typography variant="subtitle1" style={{ fontWeight: 600 }}>
            Terraform Outputs
          </Typography>
          {entries.length > 0 && (
            <Chip label={`${entries.length}`} size="small" />
          )}
        </Box>
        <Button
          size="small"
          startIcon={<RefreshIcon />}
          onClick={fetchOutputs}
          disabled={loading}
        >
          Refresh
        </Button>
      </Box>

      {loading ? (
        <Typography variant="body2" color="textSecondary">
          Loading...
        </Typography>
      ) : error || entries.length === 0 ? (
        <Paper variant="outlined" className={classes.emptyState}>
          <Typography variant="body2" color="textSecondary">
            No outputs available yet. Outputs are populated after a
            successful apply.
          </Typography>
          <Typography
            variant="caption"
            color="textSecondary"
            display="block"
            style={{ marginTop: 8 }}
          >
            These outputs can be referenced by downstream modules via output
            mappings in the dependency configuration.
          </Typography>
        </Paper>
      ) : (
        <>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Output Key</TableCell>
                  <TableCell>Value</TableCell>
                  <TableCell>Type</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {entries.map(([key, value]) => {
                  const isSensitive =
                    typeof value === 'object' &&
                    value !== null &&
                    'sensitive' in value &&
                    (value as Record<string, unknown>).sensitive === true;
                  const displayValue = isSensitive
                    ? null
                    : typeof value === 'object'
                      ? JSON.stringify(value, null, 2)
                      : String(value ?? '');
                  const valueType =
                    value === null
                      ? 'null'
                      : Array.isArray(value)
                        ? 'list'
                        : typeof value === 'object'
                          ? 'map'
                          : typeof value;

                  return (
                    <TableRow key={key}>
                      <TableCell className={classes.outputKey}>
                        {key}
                      </TableCell>
                      <TableCell>
                        {isSensitive ? (
                          <Typography
                            variant="body2"
                            className={classes.sensitiveValue}
                          >
                            (sensitive)
                          </Typography>
                        ) : (
                          <code className={classes.outputValue}>
                            {displayValue}
                          </code>
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={valueType}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          <Typography
            variant="caption"
            color="textSecondary"
            style={{ marginTop: 4, display: 'block' }}
          >
            Outputs from the last successful apply. Downstream modules can
            reference these via output mappings.
          </Typography>
        </>
      )}
    </Box>
  );
}
