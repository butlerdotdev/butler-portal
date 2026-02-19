// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Chip,
  Tab,
  Tabs,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  makeStyles,
} from '@material-ui/core';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import { Progress, EmptyState } from '@backstage/core-components';
import { useRegistryApi } from '../../hooks/useRegistryApi';
import { ModuleVariablesEditor } from './ModuleVariablesEditor';
import { ModuleSettings } from './ModuleSettings';
import { ModuleRunsList } from './ModuleRunsList';
import type { EnvironmentModule } from '../../api/types/environments';

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
  tabs: {
    marginBottom: theme.spacing(2),
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
}));

function statusColor(status: string | null): 'default' | 'primary' | 'secondary' {
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

export function ModuleDetail() {
  const classes = useStyles();
  const navigate = useNavigate();
  const { envId, moduleId } = useParams<{
    envId: string;
    moduleId: string;
  }>();
  const api = useRegistryApi();

  const [mod, setMod] = useState<EnvironmentModule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabIndex, setTabIndex] = useState(0);

  // Run dialog
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [runOperation, setRunOperation] = useState<
    'plan' | 'apply' | 'destroy' | 'refresh'
  >('plan');

  const fetchModule = useCallback(async () => {
    if (!envId || !moduleId) return;
    try {
      setLoading(true);
      const data = await api.getModule(envId, moduleId);
      setMod(data);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load module',
      );
    } finally {
      setLoading(false);
    }
  }, [api, envId, moduleId]);

  useEffect(() => {
    fetchModule();
  }, [fetchModule]);

  const handleCreateRun = async () => {
    if (!envId || !moduleId) return;
    try {
      await api.createModuleRun(envId, moduleId, {
        operation: runOperation,
      });
      setRunDialogOpen(false);
      // Switch to runs tab
      setTabIndex(0);
    } catch {
      // Silent
    }
  };

  if (loading) return <Progress />;

  if (error) {
    return (
      <EmptyState
        title="Failed to load module"
        description={error}
        missing="data"
        action={
          <Button variant="outlined" onClick={fetchModule}>
            Retry
          </Button>
        }
      />
    );
  }

  if (!mod) {
    return <EmptyState title="Module not found" missing="data" />;
  }

  const tabDefs = [
    { label: 'Runs', id: 'runs' },
    { label: 'Variables', id: 'variables' },
    { label: 'Settings', id: 'settings' },
  ];

  return (
    <>
      {/* Header */}
      <Box className={classes.header}>
        <Box>
          <Box className={classes.headerLeft}>
            <IconButton
              size="small"
              onClick={() => navigate(`../../`)}
            >
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="h5">{mod.name}</Typography>
            <Chip label={mod.status} size="small" variant="outlined" />
            {mod.last_run_status && (
              <Chip
                label={mod.last_run_status}
                size="small"
                color={statusColor(mod.last_run_status)}
              />
            )}
          </Box>
          <Typography variant="body2" color="textSecondary" style={{ marginTop: 4 }}>
            {mod.artifact_namespace}/{mod.artifact_name}
            {mod.current_version && ` @ ${mod.current_version}`}
            {mod.pinned_version && ` (pinned: ${mod.pinned_version})`}
          </Typography>
          <Typography variant="caption" color="textSecondary">
            {mod.resource_count} resources | {mod.execution_mode}
            {mod.tf_version && ` | TF ${mod.tf_version}`}
          </Typography>
        </Box>

        <Button
          variant="contained"
          color="primary"
          startIcon={<PlayArrowIcon />}
          onClick={() => setRunDialogOpen(true)}
          size="small"
        >
          New Run
        </Button>
      </Box>

      <Tabs
        value={tabIndex}
        onChange={(_e, v) => setTabIndex(v)}
        className={classes.tabs}
      >
        {tabDefs.map(t => (
          <Tab key={t.id} label={t.label} />
        ))}
      </Tabs>

      {tabDefs[tabIndex]?.id === 'runs' && envId && moduleId && (
        <ModuleRunsList envId={envId} moduleId={moduleId} />
      )}

      {tabDefs[tabIndex]?.id === 'variables' && envId && moduleId && (
        <ModuleVariablesEditor envId={envId} moduleId={moduleId} />
      )}

      {tabDefs[tabIndex]?.id === 'settings' && envId && moduleId && (
        <ModuleSettings
          envId={envId}
          moduleId={moduleId}
          mod={mod}
          onRefresh={fetchModule}
        />
      )}

      {/* New Run Dialog */}
      <Dialog
        open={runDialogOpen}
        onClose={() => setRunDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>New Module Run</DialogTitle>
        <DialogContent>
          <TextField
            select
            fullWidth
            variant="outlined"
            label="Operation"
            value={runOperation}
            onChange={e =>
              setRunOperation(
                e.target.value as 'plan' | 'apply' | 'destroy' | 'refresh',
              )
            }
            margin="normal"
          >
            <MenuItem value="plan">Plan</MenuItem>
            <MenuItem value="apply">Apply</MenuItem>
            <MenuItem value="destroy">Destroy</MenuItem>
            <MenuItem value="refresh">Refresh</MenuItem>
          </TextField>
          <Typography variant="caption" color="textSecondary">
            Module: {mod.name} ({mod.artifact_namespace}/{mod.artifact_name})
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRunDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleCreateRun}
          >
            Start Run
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
