// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  makeStyles,
  IconButton,
  Tooltip,
  Collapse,
} from '@material-ui/core';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import ExpandLessIcon from '@material-ui/icons/ExpandLess';
import FileCopyIcon from '@material-ui/icons/FileCopy';
import { Progress, EmptyState } from '@backstage/core-components';
import { useRegistryApi } from '../../hooks/useRegistryApi';
import type { IacRun, RunOperation, RunMode, CreateRunRequest } from '../../api/types/runs';

const useStyles = makeStyles(theme => ({
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(2),
  },
  statusChip: {
    fontWeight: 600,
  },
  resourceSummary: {
    display: 'flex',
    gap: theme.spacing(1),
    alignItems: 'center',
  },
  addChip: {
    backgroundColor: '#4caf50',
    color: '#fff',
  },
  changeChip: {
    backgroundColor: '#ff9800',
    color: '#fff',
  },
  destroyChip: {
    backgroundColor: '#f44336',
    color: '#fff',
  },
  expandedRow: {
    backgroundColor: theme.palette.background.default,
  },
  logBox: {
    fontFamily: 'monospace',
    fontSize: '0.8rem',
    backgroundColor: '#1e1e1e',
    color: '#d4d4d4',
    padding: theme.spacing(2),
    borderRadius: theme.shape.borderRadius,
    maxHeight: 400,
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  },
  pipelineBox: {
    fontFamily: 'monospace',
    fontSize: '0.8rem',
    backgroundColor: theme.palette.background.default,
    padding: theme.spacing(2),
    borderRadius: theme.shape.borderRadius,
    whiteSpace: 'pre-wrap',
    position: 'relative' as const,
  },
  copyButton: {
    position: 'absolute' as const,
    top: theme.spacing(0.5),
    right: theme.spacing(0.5),
  },
  detailSection: {
    padding: theme.spacing(2),
  },
}));

function statusColor(status: string): 'default' | 'primary' | 'secondary' {
  switch (status) {
    case 'succeeded':
      return 'primary';
    case 'failed':
    case 'timed_out':
    case 'cancelled':
      return 'secondary';
    default:
      return 'default';
  }
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '-';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

interface RunsTabProps {
  namespace: string;
  name: string;
}

export function RunsTab({ namespace, name }: RunsTabProps) {
  const classes = useStyles();
  const api = useRegistryApi();

  const [runs, setRuns] = useState<IacRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [runLogs, setRunLogs] = useState<Record<string, string>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [pipelineYaml, setPipelineYaml] = useState<string | null>(null);

  // Create form state
  const [newOperation, setNewOperation] = useState<RunOperation>('plan');
  const [newMode, setNewMode] = useState<RunMode>('byoc');
  const [newCiProvider, setNewCiProvider] = useState('github-actions');
  const [newTfVersion, setNewTfVersion] = useState('1.9.0');
  const [creating, setCreating] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRuns = useCallback(async () => {
    try {
      const result = await api.listRuns(namespace, name);
      setRuns(result.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load runs');
    } finally {
      setLoading(false);
    }
  }, [api, namespace, name]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  // Poll when there are active (non-terminal) runs
  useEffect(() => {
    const hasActive = runs.some(r =>
      ['pending', 'queued', 'running'].includes(r.status),
    );
    if (hasActive) {
      pollRef.current = setInterval(() => {
        fetchRuns().catch(() => {});
      }, 5000);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [runs, fetchRuns]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const data: CreateRunRequest = {
        operation: newOperation,
        mode: newMode,
        ci_provider: newMode === 'byoc' ? newCiProvider : undefined,
        tf_version: newTfVersion,
      };
      const result = await api.createRun(namespace, name, data);
      setRuns(prev => [result.run, ...prev]);
      setCreateOpen(false);

      // If BYOC, show the pipeline YAML
      if (newMode === 'byoc' && result.run.pipeline_config) {
        setPipelineYaml(result.run.pipeline_config);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create run');
    } finally {
      setCreating(false);
    }
  };

  const handleCancel = async (runId: string) => {
    try {
      const updated = await api.cancelRun(runId);
      setRuns(prev => prev.map(r => (r.id === runId ? updated : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel run');
    }
  };

  const handleConfirm = async (runId: string) => {
    try {
      const applyRun = await api.confirmRun(runId);
      setRuns(prev => [applyRun, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm plan');
    }
  };

  const handleExpand = async (runId: string) => {
    if (expandedRunId === runId) {
      setExpandedRunId(null);
      return;
    }
    setExpandedRunId(runId);
    // Fetch logs for this run
    try {
      const result = await api.getRunLogs(runId);
      const logText = result.logs.map(l => l.content).join('\n');
      setRunLogs(prev => ({ ...prev, [runId]: logText || '(no logs)' }));
    } catch {
      setRunLogs(prev => ({ ...prev, [runId]: '(failed to load logs)' }));
    }
  };

  const handleGeneratePipeline = async () => {
    try {
      const result = await api.generatePipeline(
        namespace,
        name,
        newCiProvider,
        newOperation,
      );
      setPipelineYaml(result.pipeline_config);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate pipeline');
    }
  };

  if (loading) return <Progress />;

  if (error && runs.length === 0) {
    return (
      <EmptyState
        title="Failed to load runs"
        description={error}
        missing="data"
        action={
          <Button variant="outlined" onClick={fetchRuns}>
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <Box>
      <Box className={classes.header}>
        <Typography variant="h6">IaC Runs</Typography>
        <Button
          variant="contained"
          color="primary"
          onClick={() => setCreateOpen(true)}
        >
          New Run
        </Button>
      </Box>

      {error && (
        <Typography color="error" variant="body2" gutterBottom>
          {error}
        </Typography>
      )}

      {runs.length === 0 ? (
        <EmptyState
          title="No runs yet"
          description="Create a run to execute Terraform plan, apply, validate, or test operations."
          missing="data"
          action={
            <Button
              variant="contained"
              color="primary"
              onClick={() => setCreateOpen(true)}
            >
              New Run
            </Button>
          }
        />
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" />
                <TableCell>Operation</TableCell>
                <TableCell>Mode</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Resources</TableCell>
                <TableCell>Duration</TableCell>
                <TableCell>Triggered By</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {runs.map(run => (
                <>
                  <TableRow key={run.id} hover>
                    <TableCell padding="checkbox">
                      <IconButton
                        size="small"
                        onClick={() => handleExpand(run.id)}
                      >
                        {expandedRunId === run.id ? (
                          <ExpandLessIcon />
                        ) : (
                          <ExpandMoreIcon />
                        )}
                      </IconButton>
                    </TableCell>
                    <TableCell>
                      <Chip label={run.operation} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>{run.mode}</TableCell>
                    <TableCell>
                      <Chip
                        label={run.status}
                        size="small"
                        color={statusColor(run.status)}
                        className={classes.statusChip}
                      />
                    </TableCell>
                    <TableCell>
                      {run.resources_to_add !== null || run.resources_to_change !== null || run.resources_to_destroy !== null ? (
                        <Box className={classes.resourceSummary}>
                          {run.resources_to_add ? (
                            <Chip label={`+${run.resources_to_add}`} size="small" className={classes.addChip} />
                          ) : null}
                          {run.resources_to_change ? (
                            <Chip label={`~${run.resources_to_change}`} size="small" className={classes.changeChip} />
                          ) : null}
                          {run.resources_to_destroy ? (
                            <Chip label={`-${run.resources_to_destroy}`} size="small" className={classes.destroyChip} />
                          ) : null}
                        </Box>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>{formatDuration(run.duration_seconds)}</TableCell>
                    <TableCell>{run.triggered_by || '-'}</TableCell>
                    <TableCell>
                      {new Date(run.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {['pending', 'queued', 'running'].includes(run.status) && (
                        <Button
                          size="small"
                          color="secondary"
                          onClick={() => handleCancel(run.id)}
                        >
                          Cancel
                        </Button>
                      )}
                      {run.operation === 'plan' && run.status === 'succeeded' && (
                        <Button
                          size="small"
                          color="primary"
                          variant="contained"
                          onClick={() => handleConfirm(run.id)}
                        >
                          Confirm Apply
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow key={`${run.id}-detail`}>
                    <TableCell
                      colSpan={9}
                      style={{ paddingBottom: 0, paddingTop: 0 }}
                    >
                      <Collapse
                        in={expandedRunId === run.id}
                        timeout="auto"
                        unmountOnExit
                      >
                        <Box className={classes.detailSection}>
                          <Typography variant="subtitle2" gutterBottom>
                            Run ID: {run.id}
                          </Typography>
                          {run.tf_version && (
                            <Typography variant="body2">
                              Terraform: {run.tf_version}
                            </Typography>
                          )}
                          {run.exit_code !== null && (
                            <Typography variant="body2">
                              Exit code: {run.exit_code}
                            </Typography>
                          )}
                          <Typography
                            variant="subtitle2"
                            style={{ marginTop: 8 }}
                          >
                            Logs
                          </Typography>
                          <Box className={classes.logBox}>
                            {runLogs[run.id] ?? 'Loading...'}
                          </Box>
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Pipeline YAML viewer */}
      {pipelineYaml && (
        <Dialog
          open
          onClose={() => setPipelineYaml(null)}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle>Pipeline Configuration</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="textSecondary" gutterBottom>
              Copy this configuration into your CI/CD pipeline.
            </Typography>
            <Box className={classes.pipelineBox}>
              <Tooltip title="Copy to clipboard">
                <IconButton
                  size="small"
                  className={classes.copyButton}
                  onClick={() => navigator.clipboard.writeText(pipelineYaml)}
                >
                  <FileCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              {pipelineYaml}
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPipelineYaml(null)}>Close</Button>
          </DialogActions>
        </Dialog>
      )}

      {/* Create Run Dialog */}
      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create Run</DialogTitle>
        <DialogContent>
          <TextField
            select
            label="Operation"
            value={newOperation}
            onChange={e => setNewOperation(e.target.value as RunOperation)}
            fullWidth
            margin="normal"
            variant="outlined"
          >
            <MenuItem value="plan">Plan</MenuItem>
            <MenuItem value="apply">Apply</MenuItem>
            <MenuItem value="validate">Validate</MenuItem>
            <MenuItem value="test">Test</MenuItem>
            <MenuItem value="destroy">Destroy</MenuItem>
          </TextField>

          <TextField
            select
            label="Execution Mode"
            value={newMode}
            onChange={e => setNewMode(e.target.value as RunMode)}
            fullWidth
            margin="normal"
            variant="outlined"
          >
            <MenuItem value="byoc">BYOC (Bring Your Own Compute)</MenuItem>
            <MenuItem value="peaas">PeaaS (Managed)</MenuItem>
          </TextField>

          {newMode === 'byoc' && (
            <TextField
              select
              label="CI Provider"
              value={newCiProvider}
              onChange={e => setNewCiProvider(e.target.value)}
              fullWidth
              margin="normal"
              variant="outlined"
            >
              <MenuItem value="github-actions">GitHub Actions</MenuItem>
              <MenuItem value="gitlab-ci">GitLab CI</MenuItem>
            </TextField>
          )}

          <TextField
            label="Terraform Version"
            value={newTfVersion}
            onChange={e => setNewTfVersion(e.target.value)}
            fullWidth
            margin="normal"
            variant="outlined"
            placeholder="1.9.0"
          />

          {newMode === 'byoc' && (
            <Box mt={2}>
              <Button
                variant="outlined"
                size="small"
                onClick={handleGeneratePipeline}
              >
                Preview Pipeline YAML
              </Button>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button
            onClick={handleCreate}
            color="primary"
            variant="contained"
            disabled={creating}
          >
            {creating ? 'Creating...' : 'Create Run'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
