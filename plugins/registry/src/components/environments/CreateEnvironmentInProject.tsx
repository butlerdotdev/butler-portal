// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  IconButton,
  makeStyles,
} from '@material-ui/core';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import { useParams, useNavigate } from 'react-router-dom';
import { EmptyState, Progress } from '@backstage/core-components';
import { useRegistryApi } from '../../hooks/useRegistryApi';
import { useRegistryTeam } from '../../hooks/useRegistryTeam';
import { hasMinRole } from '@internal/plugin-registry-common';
import { StateBackendForm } from '../modules/StateBackendForm';
import type { StateBackendConfig } from '../../api/types/environments';
import type { ExecutionMode } from '../../api/types/projects';

const useStyles = makeStyles(theme => ({
  root: {
    maxWidth: 700,
  },
  section: {
    marginBottom: theme.spacing(3),
  },
  buttonBar: {
    display: 'flex',
    gap: theme.spacing(1),
    marginTop: theme.spacing(3),
  },
}));

export function CreateEnvironmentInProject() {
  const classes = useStyles();
  const navigate = useNavigate();
  const api = useRegistryApi();
  const { projectId } = useParams<{ projectId: string }>();
  const { activeRole } = useRegistryTeam();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [stateBackend, setStateBackend] = useState<StateBackendConfig | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch project to get execution mode
  const [executionMode, setExecutionMode] = useState<ExecutionMode | undefined>(undefined);
  const [loadingProject, setLoadingProject] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    api
      .getProject(projectId)
      .then(project => {
        setExecutionMode(project.execution_mode);
      })
      .catch(() => {
        // Fallback — don't block the form
      })
      .finally(() => setLoadingProject(false));
  }, [api, projectId]);

  if (!hasMinRole(activeRole, 'operator')) {
    return (
      <EmptyState
        title="Insufficient permissions"
        description="You need at least operator role to create environments."
        missing="info"
      />
    );
  }

  if (loadingProject) return <Progress />;

  const isByoc = executionMode === 'byoc';
  const stateBackendLabel = isByoc
    ? 'State Backend'
    : 'State Backend (optional)';
  const stateBackendDescription = isByoc
    ? 'BYOC projects require a state backend. Configure where Terraform state is stored for modules in this environment.'
    : 'Configure where Terraform state is stored for modules in this environment. PEaaS projects use Butler Labs managed storage by default.';

  const handleCreate = async () => {
    if (!projectId || !name.trim()) return;
    // For BYOC, require state backend
    if (isByoc && !stateBackend) {
      setError('State backend is required for BYOC projects.');
      return;
    }
    try {
      setCreating(true);
      setError(null);
      const env = await api.createProjectEnvironment(projectId, {
        name: name.trim(),
        description: description.trim() || undefined,
        state_backend: stateBackend ?? undefined,
      });
      navigate(`../projects/${projectId}/environments/${env.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create environment');
      setCreating(false);
    }
  };

  return (
    <Box className={classes.root}>
      <Box display="flex" alignItems="center" mb={2}>
        <IconButton
          size="small"
          onClick={() => navigate(`../projects/${projectId}`)}
          style={{ marginRight: 8 }}
        >
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5">Create Environment</Typography>
      </Box>

      <Box className={classes.section}>
        <TextField
          fullWidth
          variant="outlined"
          label="Environment Name"
          value={name}
          onChange={e => setName(e.target.value)}
          margin="normal"
          placeholder="e.g. dev, staging, prod"
          helperText="Required. Must be unique within this project."
          required
        />
        <TextField
          fullWidth
          variant="outlined"
          label="Description"
          value={description}
          onChange={e => setDescription(e.target.value)}
          margin="normal"
          multiline
          rows={2}
          placeholder="What is this environment for?"
        />
      </Box>

      <Box className={classes.section}>
        <Typography variant="subtitle1" gutterBottom>
          {stateBackendLabel}
        </Typography>
        <Typography variant="body2" color="textSecondary" gutterBottom>
          {stateBackendDescription}
        </Typography>
        <StateBackendForm
          value={stateBackend}
          onSave={setStateBackend}
          executionMode={executionMode}
        />
      </Box>

      {error && (
        <Typography color="error" variant="body2" gutterBottom>
          {error}
        </Typography>
      )}

      <Box className={classes.buttonBar}>
        <Button
          variant="contained"
          color="primary"
          onClick={handleCreate}
          disabled={creating || !name.trim()}
        >
          {creating ? 'Creating...' : 'Create Environment'}
        </Button>
        <Button onClick={() => navigate(`../projects/${projectId}`)}>
          Cancel
        </Button>
      </Box>
    </Box>
  );
}
