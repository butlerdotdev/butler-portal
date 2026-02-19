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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  LinearProgress,
  makeStyles,
} from '@material-ui/core';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import LockIcon from '@material-ui/icons/Lock';
import LockOpenIcon from '@material-ui/icons/LockOpen';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import AddIcon from '@material-ui/icons/Add';
import { Progress, EmptyState } from '@backstage/core-components';
import { usePermission } from '@backstage/plugin-permission-react';
import {
  registryEnvironmentUpdatePermission,
  registryEnvironmentLockPermission,
  registryRunCreatePermission,
} from '@internal/plugin-registry-common';
import { useRegistryApi } from '../../hooks/useRegistryApi';
import { EnvironmentGraph } from './EnvironmentGraph';
import { EnvironmentBindings } from './EnvironmentBindings';
import { AddModuleDialog } from '../modules/AddModuleDialog';
import type {
  Environment,
  EnvironmentModule,
  EnvironmentRun,
  EnvironmentGraph as GraphData,
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
  lockBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    padding: theme.spacing(1, 2),
    backgroundColor: theme.palette.warning.light,
    borderRadius: theme.shape.borderRadius,
    marginBottom: theme.spacing(2),
  },
  clickableRow: {
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
  },
  envRunCard: {
    padding: theme.spacing(2),
    marginBottom: theme.spacing(1),
  },
  progressBar: {
    marginTop: theme.spacing(1),
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
      return 'secondary';
    default:
      return 'default';
  }
}

function moduleStatusColor(
  status: string | null,
): 'default' | 'primary' | 'secondary' {
  switch (status) {
    case 'succeeded':
      return 'primary';
    case 'failed':
      return 'secondary';
    case 'running':
    case 'applying':
    case 'planned':
      return 'primary';
    default:
      return 'default';
  }
}

export function EnvironmentDetail() {
  const classes = useStyles();
  const navigate = useNavigate();
  const { envId } = useParams<{ envId: string }>();
  const api = useRegistryApi();

  const [environment, setEnvironment] = useState<Environment | null>(null);
  const [modules, setModules] = useState<EnvironmentModule[]>([]);
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [envRuns, setEnvRuns] = useState<EnvironmentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Lock dialog
  const [lockDialogOpen, setLockDialogOpen] = useState(false);
  const [lockReason, setLockReason] = useState('');

  // Add module dialog
  const [addModuleDialogOpen, setAddModuleDialogOpen] = useState(false);

  // Run dialog
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [runOperation, setRunOperation] = useState<'plan-all' | 'apply-all' | 'destroy-all'>('plan-all');

  // Permissions
  const { allowed: canUpdate } = usePermission({ permission: registryEnvironmentUpdatePermission });
  const { allowed: canLock } = usePermission({ permission: registryEnvironmentLockPermission });
  const { allowed: canRun } = usePermission({ permission: registryRunCreatePermission });

  const fetchData = useCallback(async (silent = false) => {
    if (!envId) return;
    try {
      if (!silent) setLoading(true);
      const [envData, modulesData, graphData, runsData] = await Promise.all([
        api.getEnvironment(envId),
        api.listEnvironmentModules(envId),
        api.getEnvironmentGraph(envId),
        api.listEnvironmentRuns(envId),
      ]);
      setEnvironment(envData);
      setModules(modulesData.modules);
      setGraph(graphData);
      setEnvRuns(runsData.runs);
      setError(null);
    } catch (err) {
      if (!silent) {
        setError(
          err instanceof Error ? err.message : 'Failed to load environment',
        );
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [api, envId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Poll for active env runs
  useEffect(() => {
    const activeRun = envRuns.find(
      r => r.status === 'pending' || r.status === 'running',
    );
    if (!activeRun) return;

    const interval = setInterval(() => fetchData(true), 5000);
    return () => clearInterval(interval);
  }, [envRuns, fetchData]);

  const handleLock = async () => {
    if (!envId) return;
    try {
      await api.lockEnvironment(envId, lockReason || undefined);
      setLockDialogOpen(false);
      setLockReason('');
      fetchData();
    } catch {
      // Silent
    }
  };

  const handleUnlock = async () => {
    if (!envId) return;
    try {
      await api.unlockEnvironment(envId);
      fetchData();
    } catch {
      // Silent
    }
  };

  const handleStartRun = async () => {
    if (!envId) return;
    try {
      await api.createEnvironmentRun(envId, {
        operation: runOperation,
      });
      setRunDialogOpen(false);
      fetchData();
    } catch {
      // Silent
    }
  };

  if (loading) return <Progress />;

  if (error) {
    return (
      <EmptyState
        title="Failed to load environment"
        description={error}
        missing="data"
        action={
          <Button variant="outlined" onClick={() => fetchData()}>
            Retry
          </Button>
        }
      />
    );
  }

  if (!environment) {
    return <EmptyState title="Environment not found" missing="data" />;
  }

  const activeEnvRun = envRuns.find(
    r => r.status === 'pending' || r.status === 'running',
  );

  return (
    <>
      {/* Header */}
      <Box className={classes.header}>
        <Box>
          <Box className={classes.headerLeft}>
            <IconButton size="small" onClick={() => navigate('..')}>
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="h5">{environment.name}</Typography>
            <Chip
              label={environment.status}
              size="small"
              color={environment.status === 'active' ? 'primary' : 'default'}
            />
            {environment.locked && (
              <Chip
                icon={<LockIcon />}
                label="Locked"
                size="small"
                color="secondary"
              />
            )}
          </Box>
          {environment.description && (
            <Typography variant="body2" color="textSecondary" style={{ marginTop: 4 }}>
              {environment.description}
            </Typography>
          )}
          <Typography variant="caption" color="textSecondary">
            {environment.module_count} modules | {environment.total_resources}{' '}
            resources
            {environment.team && ` | Team: ${environment.team}`}
          </Typography>
        </Box>

        <Box className={classes.actions}>
          {canUpdate && (
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => setAddModuleDialogOpen(true)}
              size="small"
            >
              Add Module
            </Button>
          )}
          {canRun && (
            <Button
              variant="contained"
              color="primary"
              startIcon={<PlayArrowIcon />}
              onClick={() => setRunDialogOpen(true)}
              size="small"
              disabled={environment.locked || !!activeEnvRun}
            >
              Plan All
            </Button>
          )}
          {canLock && environment.locked ? (
            <Button
              variant="outlined"
              startIcon={<LockOpenIcon />}
              onClick={handleUnlock}
              size="small"
            >
              Unlock
            </Button>
          ) : canLock ? (
            <Button
              variant="outlined"
              startIcon={<LockIcon />}
              onClick={() => setLockDialogOpen(true)}
              size="small"
            >
              Lock
            </Button>
          ) : null}
        </Box>
      </Box>

      {/* Lock Banner */}
      {environment.locked && (
        <Box className={classes.lockBanner}>
          <LockIcon fontSize="small" />
          <Typography variant="body2">
            Locked by {environment.locked_by || 'unknown'}
            {environment.lock_reason && `: ${environment.lock_reason}`}
          </Typography>
        </Box>
      )}

      {/* Active Environment Run Banner */}
      {activeEnvRun && (
        <Paper variant="outlined" className={classes.envRunCard}>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="subtitle2">
                {activeEnvRun.operation} in progress
              </Typography>
              <Typography variant="caption" color="textSecondary">
                {activeEnvRun.completed_modules}/{activeEnvRun.total_modules}{' '}
                modules complete
                {activeEnvRun.failed_modules > 0 &&
                  ` | ${activeEnvRun.failed_modules} failed`}
                {activeEnvRun.skipped_modules > 0 &&
                  ` | ${activeEnvRun.skipped_modules} skipped`}
              </Typography>
            </Box>
            <Chip
              label={activeEnvRun.status}
              size="small"
              color="primary"
            />
          </Box>
          <LinearProgress
            className={classes.progressBar}
            variant="determinate"
            value={
              activeEnvRun.total_modules > 0
                ? ((activeEnvRun.completed_modules +
                    activeEnvRun.failed_modules +
                    activeEnvRun.skipped_modules) /
                    activeEnvRun.total_modules) *
                  100
                : 0
            }
          />
        </Paper>
      )}

      {/* DAG Graph */}
      {graph && (
        <Box className={classes.section}>
          <Typography variant="subtitle1" className={classes.sectionTitle}>
            Dependency Graph
          </Typography>
          <Paper variant="outlined">
            <EnvironmentGraph
              graph={graph}
              onNodeClick={moduleId =>
                navigate(`modules/${moduleId}`)
              }
            />
          </Paper>
        </Box>
      )}

      {/* Module List */}
      <Box className={classes.section}>
        <Typography variant="subtitle1" className={classes.sectionTitle}>
          Modules ({modules.length})
        </Typography>
        {modules.length === 0 ? (
          <EmptyState
            title="No modules"
            description="Add a module from the registry to start deploying infrastructure."
            missing="data"
            action={
              <Button
                variant="contained"
                color="primary"
                startIcon={<AddIcon />}
                onClick={() => setAddModuleDialogOpen(true)}
              >
                Add Module
              </Button>
            }
          />
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Artifact</TableCell>
                  <TableCell>Version</TableCell>
                  <TableCell>Last Run</TableCell>
                  <TableCell>Resources</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {modules.map(mod => (
                  <TableRow
                    key={mod.id}
                    className={classes.clickableRow}
                    onClick={() => navigate(`modules/${mod.id}`)}
                  >
                    <TableCell>
                      <Typography variant="body2">{mod.name}</Typography>
                      {mod.description && (
                        <Typography variant="caption" color="textSecondary">
                          {mod.description}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {mod.artifact_namespace}/{mod.artifact_name}
                    </TableCell>
                    <TableCell>
                      {mod.current_version || mod.pinned_version || (
                        <Chip label="latest" size="small" />
                      )}
                    </TableCell>
                    <TableCell>
                      {mod.last_run_status ? (
                        <Chip
                          label={mod.last_run_status}
                          size="small"
                          color={moduleStatusColor(mod.last_run_status)}
                        />
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>{mod.resource_count}</TableCell>
                    <TableCell>
                      <Chip label={mod.status} size="small" variant="outlined" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>

      {/* Bindings */}
      {envId && <EnvironmentBindings envId={envId} />}

      {/* Environment Runs History */}
      {envRuns.length > 0 && (
        <Box className={classes.section}>
          <Typography variant="subtitle1" className={classes.sectionTitle}>
            Environment Runs
          </Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Operation</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Modules</TableCell>
                  <TableCell>Triggered By</TableCell>
                  <TableCell>Duration</TableCell>
                  <TableCell>Created</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {envRuns.map(run => (
                  <TableRow key={run.id}>
                    <TableCell>{run.operation}</TableCell>
                    <TableCell>
                      <Chip
                        label={run.status}
                        size="small"
                        color={runStatusColor(run.status)}
                      />
                    </TableCell>
                    <TableCell>
                      {run.completed_modules}/{run.total_modules}
                      {run.failed_modules > 0 &&
                        ` (${run.failed_modules} failed)`}
                    </TableCell>
                    <TableCell>{run.triggered_by || '-'}</TableCell>
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
        </Box>
      )}

      {/* Lock Dialog */}
      <Dialog
        open={lockDialogOpen}
        onClose={() => setLockDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Lock Environment</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>
            Locking prevents all module runs in this environment.
          </Typography>
          <TextField
            fullWidth
            variant="outlined"
            label="Reason (optional)"
            value={lockReason}
            onChange={e => setLockReason(e.target.value)}
            margin="normal"
            placeholder="e.g. Maintenance window, investigating issue"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLockDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="primary" onClick={handleLock}>
            Lock
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Module Dialog */}
      {envId && (
        <AddModuleDialog
          open={addModuleDialogOpen}
          envId={envId}
          onClose={() => setAddModuleDialogOpen(false)}
          onAdded={fetchData}
        />
      )}

      {/* Run Dialog */}
      <Dialog
        open={runDialogOpen}
        onClose={() => setRunDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Start Environment Run</DialogTitle>
        <DialogContent>
          <TextField
            select
            fullWidth
            variant="outlined"
            label="Operation"
            value={runOperation}
            onChange={e =>
              setRunOperation(
                e.target.value as 'plan-all' | 'apply-all' | 'destroy-all',
              )
            }
            margin="normal"
          >
            <MenuItem value="plan-all">Plan All</MenuItem>
            <MenuItem value="apply-all">Apply All</MenuItem>
            <MenuItem value="destroy-all">Destroy All</MenuItem>
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRunDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleStartRun}
          >
            Start
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
