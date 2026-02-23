// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  LinearProgress,
  makeStyles,
} from '@material-ui/core';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import { Progress, EmptyState } from '@backstage/core-components';
import { useRegistryApi } from '../../hooks/useRegistryApi';
import type {
  EnvironmentRun,
  ModuleRun,
} from '../../api/types/environments';

const useStyles = makeStyles(theme => ({
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing(2),
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  actions: {
    display: 'flex',
    gap: theme.spacing(1),
  },
  section: {
    marginBottom: theme.spacing(3),
  },
  sectionTitle: {
    fontWeight: 600,
    marginBottom: theme.spacing(1),
  },
  metaGrid: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    gap: theme.spacing(0.5, 2),
    marginBottom: theme.spacing(2),
  },
  metaLabel: {
    fontWeight: 600,
    color: theme.palette.text.secondary,
  },
  progressBar: {
    marginTop: theme.spacing(1),
    marginBottom: theme.spacing(2),
  },
  clickableRow: {
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
  },
}));

function runStatusColor(
  status: string,
): 'default' | 'primary' | 'secondary' {
  switch (status) {
    case 'succeeded':
      return 'primary';
    case 'failed':
    case 'partial_failure':
    case 'timed_out':
    case 'cancelled':
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

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '-';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

export function EnvironmentRunDetail() {
  const classes = useStyles();
  const navigate = useNavigate();
  const { projectId, envId, runId } = useParams<{ projectId: string; envId: string; runId: string }>();
  const api = useRegistryApi();

  const [envRun, setEnvRun] = useState<EnvironmentRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRun = useCallback(
    async (silent = false) => {
      if (!runId) return;
      try {
        if (!silent) setLoading(true);
        const data = await api.getEnvironmentRun(runId);
        setEnvRun(data);
        setError(null);
      } catch (err) {
        if (!silent) {
          setError(
            err instanceof Error ? err.message : 'Failed to load run',
          );
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [api, runId],
  );

  useEffect(() => {
    fetchRun();
  }, [fetchRun]);

  // Poll while active
  useEffect(() => {
    if (!envRun) return;
    const isActive =
      envRun.status === 'pending' || envRun.status === 'running';
    if (!isActive) return;

    const interval = setInterval(() => fetchRun(true), 5000);
    return () => clearInterval(interval);
  }, [envRun?.status, fetchRun]);

  const handleConfirm = async () => {
    if (!runId) return;
    try {
      const updated = await api.confirmEnvironmentRun(runId);
      setEnvRun(updated);
    } catch {
      // Silent
    }
  };

  const handleCancel = async () => {
    if (!runId) return;
    try {
      const updated = await api.cancelEnvironmentRun(runId);
      setEnvRun(updated);
    } catch {
      // Silent
    }
  };

  if (loading) return <Progress />;

  if (error) {
    return (
      <EmptyState
        title="Failed to load environment run"
        description={error}
        missing="data"
        action={
          <Button variant="outlined" onClick={() => fetchRun()}>
            Retry
          </Button>
        }
      />
    );
  }

  if (!envRun) {
    return <EmptyState title="Run not found" missing="data" />;
  }

  const isActive =
    envRun.status === 'pending' || envRun.status === 'running';
  const awaitingConfirmation =
    envRun.status === 'running' &&
    envRun.module_runs?.some(mr => mr.status === 'planned');

  const totalProgress =
    envRun.total_modules > 0
      ? ((envRun.completed_modules +
          envRun.failed_modules +
          envRun.skipped_modules) /
          envRun.total_modules) *
        100
      : 0;

  const moduleRuns = envRun.module_runs ?? [];

  return (
    <>
      {/* Header */}
      <Box className={classes.header}>
        <Box>
          <Box className={classes.headerLeft}>
            <IconButton size="small" onClick={() => navigate(-1)}>
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="h5">{envRun.operation}</Typography>
            <Chip
              label={envRun.status}
              size="small"
              color={runStatusColor(envRun.status)}
            />
          </Box>
          <Typography variant="caption" color="textSecondary">
            {envRun.environment_name}
            {envRun.triggered_by && ` | by ${envRun.triggered_by}`}
            {' | '}
            {new Date(envRun.created_at).toLocaleString()}
          </Typography>
        </Box>

        <Box className={classes.actions}>
          {awaitingConfirmation && (
            <Button
              variant="contained"
              color="primary"
              onClick={handleConfirm}
            >
              Confirm & Apply All
            </Button>
          )}
          {isActive && (
            <Button
              variant="outlined"
              color="secondary"
              onClick={handleCancel}
            >
              Cancel
            </Button>
          )}
        </Box>
      </Box>

      {/* Progress */}
      {isActive && (
        <>
          <Typography variant="body2" color="textSecondary">
            {envRun.completed_modules}/{envRun.total_modules} modules
            complete
            {envRun.failed_modules > 0 &&
              ` | ${envRun.failed_modules} failed`}
            {envRun.skipped_modules > 0 &&
              ` | ${envRun.skipped_modules} skipped`}
          </Typography>
          <LinearProgress
            className={classes.progressBar}
            variant="determinate"
            value={totalProgress}
          />
        </>
      )}

      {/* Metadata */}
      <Box className={classes.metaGrid}>
        <Typography variant="body2" className={classes.metaLabel}>
          Run ID
        </Typography>
        <Typography variant="body2">{envRun.id}</Typography>

        <Typography variant="body2" className={classes.metaLabel}>
          Operation
        </Typography>
        <Typography variant="body2">{envRun.operation}</Typography>

        <Typography variant="body2" className={classes.metaLabel}>
          Status
        </Typography>
        <Typography variant="body2">{envRun.status}</Typography>

        <Typography variant="body2" className={classes.metaLabel}>
          Trigger
        </Typography>
        <Typography variant="body2">{envRun.trigger_source}</Typography>

        {envRun.duration_seconds != null && (
          <>
            <Typography variant="body2" className={classes.metaLabel}>
              Duration
            </Typography>
            <Typography variant="body2">
              {formatDuration(envRun.duration_seconds)}
            </Typography>
          </>
        )}

        <Typography variant="body2" className={classes.metaLabel}>
          Modules
        </Typography>
        <Typography variant="body2">
          {envRun.completed_modules} completed / {envRun.failed_modules}{' '}
          failed / {envRun.skipped_modules} skipped / {envRun.total_modules}{' '}
          total
        </Typography>
      </Box>

      {/* Module Runs */}
      <Box className={classes.section}>
        <Typography variant="subtitle1" className={classes.sectionTitle}>
          Module Runs ({moduleRuns.length})
        </Typography>
        {moduleRuns.length === 0 ? (
          <Typography variant="body2" color="textSecondary">
            No module runs yet.
          </Typography>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Module</TableCell>
                  <TableCell>Operation</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Resources</TableCell>
                  <TableCell>Duration</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {moduleRuns.map((mr: ModuleRun) => (
                  <TableRow
                    key={mr.id}
                    className={classes.clickableRow}
                    onClick={() =>
                      navigate(
                        projectId
                          ? `/registry/projects/${projectId}/environments/${envId}/modules/${mr.project_module_id}/runs/${mr.id}`
                          : `modules/${mr.project_module_id}/runs/${mr.id}`,
                      )
                    }
                  >
                    <TableCell>
                      <Typography variant="body2">
                        {mr.module_name}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        {mr.artifact_namespace}/{mr.artifact_name}
                      </Typography>
                    </TableCell>
                    <TableCell>{mr.operation}</TableCell>
                    <TableCell>
                      <Chip
                        label={mr.status}
                        size="small"
                        color={runStatusColor(mr.status)}
                      />
                      {mr.skip_reason && (
                        <Typography
                          variant="caption"
                          color="textSecondary"
                          display="block"
                        >
                          {mr.skip_reason}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {mr.resources_to_add != null ? (
                        <Typography variant="caption">
                          <span style={{ color: '#4caf50' }}>
                            +{mr.resources_to_add}
                          </span>{' '}
                          <span style={{ color: '#ff9800' }}>
                            ~{mr.resources_to_change ?? 0}
                          </span>{' '}
                          <span style={{ color: '#f44336' }}>
                            -{mr.resources_to_destroy ?? 0}
                          </span>
                        </Typography>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      {formatDuration(mr.duration_seconds)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </>
  );
}
