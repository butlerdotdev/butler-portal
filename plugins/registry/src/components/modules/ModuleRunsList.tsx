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
  Tooltip,
  makeStyles,
} from '@material-ui/core';
import { Progress, EmptyState } from '@backstage/core-components';
import { useNavigate } from 'react-router-dom';
import { useRegistryApi } from '../../hooks/useRegistryApi';
import type { ModuleRun } from '../../api/types/environments';

const useStyles = makeStyles(theme => ({
  clickableRow: {
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
  },
  queueChip: {
    marginLeft: theme.spacing(0.5),
  },
  cascadeChip: {
    marginLeft: theme.spacing(0.5),
    fontSize: '0.7rem',
  },
}));

function runStatusColor(
  status: string,
): 'default' | 'primary' | 'secondary' {
  switch (status) {
    case 'succeeded':
      return 'primary';
    case 'failed':
    case 'timed_out':
      return 'secondary';
    case 'running':
    case 'applying':
    case 'planned':
    case 'confirmed':
      return 'primary';
    default:
      return 'default';
  }
}

interface ModuleRunsListProps {
  envId: string;
  moduleId: string;
}

export function ModuleRunsList({ envId, moduleId }: ModuleRunsListProps) {
  const classes = useStyles();
  const navigate = useNavigate();
  const api = useRegistryApi();

  const [runs, setRuns] = useState<ModuleRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRuns = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await api.listModuleRuns(envId, moduleId);
      setRuns(data.items);
      setError(null);
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : 'Failed to load runs');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [api, envId, moduleId]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  // Poll while any run is active
  useEffect(() => {
    const hasActive = runs.some(
      r =>
        r.status === 'pending' ||
        r.status === 'queued' ||
        r.status === 'running' ||
        r.status === 'planned' ||
        r.status === 'confirmed' ||
        r.status === 'applying',
    );
    if (!hasActive) return;
    const interval = setInterval(() => fetchRuns(true), 3000);
    return () => clearInterval(interval);
  }, [runs, fetchRuns]);

  if (loading) return <Progress />;

  if (error) {
    return (
      <EmptyState
        title="Failed to load runs"
        description={error}
        missing="data"
        action={
          <Button variant="outlined" onClick={() => fetchRuns()}>
            Retry
          </Button>
        }
      />
    );
  }

  if (runs.length === 0) {
    return (
      <EmptyState
        title="No runs yet"
        description="Start a run to plan or apply this module."
        missing="data"
      />
    );
  }

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Operation</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Version</TableCell>
            <TableCell>Trigger</TableCell>
            <TableCell>Changes</TableCell>
            <TableCell>Duration</TableCell>
            <TableCell>Created</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {runs.map(run => (
            <TableRow
              key={run.id}
              className={classes.clickableRow}
              onClick={() => navigate(`runs/${run.id}`)}
            >
              <TableCell>
                <Typography variant="body2">{run.operation}</Typography>
                <Typography variant="caption" color="textSecondary">
                  {run.mode}
                </Typography>
              </TableCell>
              <TableCell>
                <Chip
                  label={run.status}
                  size="small"
                  color={runStatusColor(run.status)}
                />
                {run.queue_position != null && (
                  <Chip
                    label={`#${run.queue_position}`}
                    size="small"
                    variant="outlined"
                    className={classes.queueChip}
                  />
                )}
                {run.priority === 'cascade' && (
                  <Chip
                    label="cascade"
                    size="small"
                    variant="outlined"
                    className={classes.cascadeChip}
                  />
                )}
                {run.skip_reason && (
                  <Tooltip title={run.skip_reason}>
                    <Typography
                      variant="caption"
                      color="textSecondary"
                      component="span"
                      style={{ marginLeft: 4 }}
                    >
                      (skipped)
                    </Typography>
                  </Tooltip>
                )}
              </TableCell>
              <TableCell>{run.module_version || '-'}</TableCell>
              <TableCell>
                <Typography variant="caption">
                  {run.trigger_source}
                  {run.triggered_by && ` by ${run.triggered_by}`}
                </Typography>
              </TableCell>
              <TableCell>
                {run.resources_to_add != null ? (
                  <Box display="flex" style={{ gap: 4 }}>
                    {run.resources_to_add > 0 && (
                      <Chip
                        label={`+${run.resources_to_add}`}
                        size="small"
                        style={{ backgroundColor: '#4caf50', color: '#fff' }}
                      />
                    )}
                    {(run.resources_to_change ?? 0) > 0 && (
                      <Chip
                        label={`~${run.resources_to_change}`}
                        size="small"
                        style={{ backgroundColor: '#ff9800', color: '#fff' }}
                      />
                    )}
                    {(run.resources_to_destroy ?? 0) > 0 && (
                      <Chip
                        label={`-${run.resources_to_destroy}`}
                        size="small"
                        style={{ backgroundColor: '#f44336', color: '#fff' }}
                      />
                    )}
                  </Box>
                ) : (
                  '-'
                )}
              </TableCell>
              <TableCell>
                {run.duration_seconds != null
                  ? `${run.duration_seconds}s`
                  : '-'}
              </TableCell>
              <TableCell>
                {new Date(run.created_at).toLocaleString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
