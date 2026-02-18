// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Chip,
  Paper,
  IconButton,
  Stepper,
  Step,
  StepLabel,
  makeStyles,
} from '@material-ui/core';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import { Progress, EmptyState } from '@backstage/core-components';
import { useRegistryApi } from '../../hooks/useRegistryApi';
import type { ModuleRun, RunLogEntry } from '../../api/types/environments';

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
  timeline: {
    marginBottom: theme.spacing(2),
  },
  logBox: {
    fontFamily: 'monospace',
    fontSize: '0.8rem',
    backgroundColor: '#1e1e1e',
    color: '#d4d4d4',
    padding: theme.spacing(2),
    borderRadius: theme.shape.borderRadius,
    maxHeight: 500,
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    lineHeight: 1.4,
  },
  planSummary: {
    display: 'flex',
    gap: theme.spacing(2),
    padding: theme.spacing(2),
    marginBottom: theme.spacing(2),
  },
  planText: {
    fontFamily: 'monospace',
    fontSize: '0.8rem',
    whiteSpace: 'pre-wrap',
    padding: theme.spacing(2),
    maxHeight: 400,
    overflow: 'auto',
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
}));

function statusColor(
  status: string,
): 'default' | 'primary' | 'secondary' {
  switch (status) {
    case 'succeeded':
      return 'primary';
    case 'failed':
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

const STATUS_STEPS = [
  'pending',
  'queued',
  'running',
  'planned',
  'confirmed',
  'applying',
  'succeeded',
];

function getActiveStep(status: string): number {
  const idx = STATUS_STEPS.indexOf(status);
  if (idx >= 0) return idx;
  // Terminal states
  if (status === 'failed' || status === 'timed_out') return 3; // failed during running
  if (status === 'cancelled') return 2;
  if (status === 'discarded') return 4;
  if (status === 'skipped') return 0;
  return 0;
}

export function ModuleRunDetail() {
  const classes = useStyles();
  const navigate = useNavigate();
  const { runId } = useParams<{ runId: string }>();
  const api = useRegistryApi();

  const [run, setRun] = useState<ModuleRun | null>(null);
  const [logs, setLogs] = useState<string>('');
  const [planText, setPlanText] = useState<string | null>(null);
  const [outputs, setOutputs] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const logSequenceRef = useRef(0);
  const logPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRun = useCallback(async () => {
    if (!runId) return;
    try {
      const data = await api.getModuleRun(runId);
      setRun(data);
      setError(null);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load run');
      return null;
    } finally {
      setLoading(false);
    }
  }, [api, runId]);

  const fetchLogs = useCallback(async () => {
    if (!runId) return;
    try {
      const data = await api.getModuleRunLogs(runId, logSequenceRef.current);
      if (data.logs.length > 0) {
        const newText = data.logs.map((l: RunLogEntry) => l.content).join('\n');
        setLogs(prev => (prev ? `${prev}\n${newText}` : newText));
        logSequenceRef.current = Math.max(
          ...data.logs.map((l: RunLogEntry) => l.sequence),
        );
      }
    } catch {
      // Silent
    }
  }, [api, runId]);

  const fetchPlan = useCallback(async () => {
    if (!runId) return;
    try {
      const data = await api.getModuleRunPlan(runId);
      setPlanText(data.plan_text);
    } catch {
      // Silent
    }
  }, [api, runId]);

  const fetchOutputs = useCallback(async () => {
    if (!runId) return;
    try {
      const data = await api.getModuleRunOutputs(runId);
      setOutputs(data.outputs);
    } catch {
      // Silent
    }
  }, [api, runId]);

  // Initial load
  useEffect(() => {
    (async () => {
      const data = await fetchRun();
      await fetchLogs();
      if (data && (data.status === 'planned' || data.status === 'succeeded')) {
        fetchPlan();
      }
      if (data && data.status === 'succeeded') {
        fetchOutputs();
      }
    })();
  }, [fetchRun, fetchLogs, fetchPlan, fetchOutputs]);

  // Poll for active runs
  useEffect(() => {
    if (!run) return;
    const isActive = [
      'pending',
      'queued',
      'running',
      'planned',
      'confirmed',
      'applying',
    ].includes(run.status);

    if (isActive) {
      const interval = setInterval(async () => {
        const data = await fetchRun();
        await fetchLogs();
        if (data && (data.status === 'planned' || data.status === 'succeeded')) {
          fetchPlan();
        }
        if (data && data.status === 'succeeded') {
          fetchOutputs();
        }
      }, 2000);
      logPollRef.current = interval;
      return () => clearInterval(interval);
    }
    return undefined;
  }, [run?.status, fetchRun, fetchLogs, fetchPlan, fetchOutputs]);

  const handleConfirm = async () => {
    if (!runId) return;
    try {
      const updated = await api.confirmModuleRun(runId);
      setRun(updated);
    } catch {
      // Silent
    }
  };

  const handleDiscard = async () => {
    if (!runId) return;
    try {
      const updated = await api.discardModuleRun(runId);
      setRun(updated);
    } catch {
      // Silent
    }
  };

  const handleCancel = async () => {
    if (!runId) return;
    try {
      const updated = await api.cancelModuleRun(runId);
      setRun(updated);
    } catch {
      // Silent
    }
  };

  if (loading) return <Progress />;

  if (error) {
    return (
      <EmptyState
        title="Failed to load run"
        description={error}
        missing="data"
        action={
          <Button variant="outlined" onClick={fetchRun}>
            Retry
          </Button>
        }
      />
    );
  }

  if (!run) {
    return <EmptyState title="Run not found" missing="data" />;
  }

  const isTerminal = [
    'succeeded',
    'failed',
    'cancelled',
    'timed_out',
    'discarded',
    'skipped',
  ].includes(run.status);

  return (
    <>
      {/* Header */}
      <Box className={classes.header}>
        <Box>
          <Box className={classes.headerLeft}>
            <IconButton size="small" onClick={() => navigate('..')}>
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="h5">
              {run.operation} - {run.module_name}
            </Typography>
            <Chip
              label={run.status}
              size="small"
              color={statusColor(run.status)}
            />
            {run.priority === 'cascade' && (
              <Chip label="cascade" size="small" variant="outlined" />
            )}
          </Box>
          <Typography variant="caption" color="textSecondary">
            {run.artifact_namespace}/{run.artifact_name}
            {run.module_version && ` @ ${run.module_version}`}
            {' | '}{run.mode}
            {run.triggered_by && ` | by ${run.triggered_by}`}
          </Typography>
        </Box>

        <Box className={classes.actions}>
          {run.status === 'planned' && (
            <>
              <Button
                variant="contained"
                color="primary"
                onClick={handleConfirm}
              >
                Confirm & Apply
              </Button>
              <Button
                variant="outlined"
                onClick={handleDiscard}
              >
                Discard
              </Button>
            </>
          )}
          {!isTerminal && run.status !== 'planned' && (
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

      {/* Skip reason */}
      {run.skip_reason && (
        <Paper
          variant="outlined"
          style={{ padding: 12, marginBottom: 16, backgroundColor: '#fff3e0' }}
        >
          <Typography variant="body2">
            Skipped: {run.skip_reason}
          </Typography>
        </Paper>
      )}

      {/* Status Timeline */}
      <Box className={classes.timeline}>
        <Stepper activeStep={getActiveStep(run.status)} alternativeLabel>
          {STATUS_STEPS.map(step => (
            <Step key={step}>
              <StepLabel>{step}</StepLabel>
            </Step>
          ))}
        </Stepper>
      </Box>

      {/* Metadata */}
      <Box className={classes.metaGrid}>
        <Typography variant="body2" className={classes.metaLabel}>
          Run ID
        </Typography>
        <Typography variant="body2">{run.id}</Typography>

        <Typography variant="body2" className={classes.metaLabel}>
          Trigger
        </Typography>
        <Typography variant="body2">{run.trigger_source}</Typography>

        {run.duration_seconds != null && (
          <>
            <Typography variant="body2" className={classes.metaLabel}>
              Duration
            </Typography>
            <Typography variant="body2">{run.duration_seconds}s</Typography>
          </>
        )}

        {run.confirmed_by && (
          <>
            <Typography variant="body2" className={classes.metaLabel}>
              Confirmed by
            </Typography>
            <Typography variant="body2">{run.confirmed_by}</Typography>
          </>
        )}
      </Box>

      {/* Plan Summary */}
      {run.resources_to_add != null && (
        <Paper variant="outlined" className={classes.planSummary}>
          <Box textAlign="center">
            <Typography variant="h4" style={{ color: '#4caf50' }}>
              +{run.resources_to_add}
            </Typography>
            <Typography variant="caption">to add</Typography>
          </Box>
          <Box textAlign="center">
            <Typography variant="h4" style={{ color: '#ff9800' }}>
              ~{run.resources_to_change ?? 0}
            </Typography>
            <Typography variant="caption">to change</Typography>
          </Box>
          <Box textAlign="center">
            <Typography variant="h4" style={{ color: '#f44336' }}>
              -{run.resources_to_destroy ?? 0}
            </Typography>
            <Typography variant="caption">to destroy</Typography>
          </Box>
        </Paper>
      )}

      {/* Plan Output */}
      {planText && (
        <Box className={classes.section}>
          <Typography variant="subtitle1" className={classes.sectionTitle}>
            Plan
          </Typography>
          <Paper variant="outlined" className={classes.planText}>
            {planText}
          </Paper>
        </Box>
      )}

      {/* Logs */}
      <Box className={classes.section}>
        <Typography variant="subtitle1" className={classes.sectionTitle}>
          Logs
        </Typography>
        <Box className={classes.logBox}>{logs || '(no logs yet)'}</Box>
      </Box>

      {/* Outputs */}
      {outputs && Object.keys(outputs).length > 0 && (
        <Box className={classes.section}>
          <Typography variant="subtitle1" className={classes.sectionTitle}>
            Outputs
          </Typography>
          <Paper variant="outlined" style={{ padding: 16 }}>
            <Typography
              component="pre"
              style={{
                fontFamily: 'monospace',
                fontSize: '0.85rem',
                whiteSpace: 'pre-wrap',
              }}
            >
              {JSON.stringify(outputs, null, 2)}
            </Typography>
          </Paper>
        </Box>
      )}
    </>
  );
}
