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
import { ModuleOutputsViewer } from './ModuleOutputsViewer';
import type { ProjectModule } from '../../api/types/projects';

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

export function ModuleDetail() {
  const classes = useStyles();
  const navigate = useNavigate();
  const { projectId, envId, moduleId } = useParams<{
    projectId: string;
    envId: string;
    moduleId: string;
  }>();
  const api = useRegistryApi();

  const [mod, setMod] = useState<ProjectModule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabIndex, setTabIndex] = useState(0);

  // Run dialog
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [runOperation, setRunOperation] = useState<
    'plan' | 'apply' | 'destroy' | 'refresh'
  >('plan');

  const fetchModule = useCallback(async () => {
    if (!projectId || !moduleId) return;
    try {
      setLoading(true);
      const data = await api.getProjectModule(projectId, moduleId);
      setMod(data);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load module',
      );
    } finally {
      setLoading(false);
    }
  }, [api, projectId, moduleId]);

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

  // When accessed from an environment context, show runs/variables/settings
  // When accessed from project context (no envId), show settings only
  const isEnvContext = !!envId;
  const tabDefs = isEnvContext
    ? [
        { label: 'Runs', id: 'runs' },
        { label: 'Variables', id: 'variables' },
        { label: 'Outputs', id: 'outputs' },
        { label: 'Settings', id: 'settings' },
      ]
    : [{ label: 'Settings', id: 'settings' }];

  return (
    <>
      {/* Header */}
      <Box className={classes.header}>
        <Box>
          <Box className={classes.headerLeft}>
            <IconButton
              size="small"
              onClick={() => navigate(-1)}
            >
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="h5">{mod.name}</Typography>
            <Chip label={mod.status} size="small" variant="outlined" />
          </Box>
          <Typography variant="body2" color="textSecondary" style={{ marginTop: 4 }}>
            {mod.artifact_namespace}/{mod.artifact_name}
            {mod.pinned_version && ` (pinned: ${mod.pinned_version})`}
          </Typography>
          <Typography variant="caption" color="textSecondary">
            {mod.tf_version && `TF ${mod.tf_version}`}
          </Typography>
        </Box>

        {isEnvContext && (
          <Button
            variant="contained"
            color="primary"
            startIcon={<PlayArrowIcon />}
            onClick={() => setRunDialogOpen(true)}
            size="small"
          >
            New Run
          </Button>
        )}
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

      {tabDefs[tabIndex]?.id === 'outputs' && envId && moduleId && (
        <ModuleOutputsViewer envId={envId} moduleId={moduleId} />
      )}

      {tabDefs[tabIndex]?.id === 'settings' && projectId && moduleId && (
        <ModuleSettings
          projectId={projectId}
          moduleId={moduleId}
          mod={mod}
          onRefresh={fetchModule}
          envId={envId}
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
