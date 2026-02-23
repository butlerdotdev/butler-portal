// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Stepper,
  Step,
  StepLabel,
  Paper,
  IconButton,
  MenuItem,
  makeStyles,
} from '@material-ui/core';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import { useNavigate } from 'react-router-dom';
import { EmptyState } from '@backstage/core-components';
import { useRegistryApi } from '../../hooks/useRegistryApi';
import { useRegistryTeam } from '../../hooks/useRegistryTeam';
import { hasMinRole } from '@internal/plugin-registry-common';
import type { CreateProjectRequest } from '../../api/types/projects';

const useStyles = makeStyles(theme => ({
  root: {
    maxWidth: 800,
  },
  stepContent: {
    padding: theme.spacing(3, 0),
  },
  buttonBar: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: theme.spacing(3),
  },
  reviewSection: {
    marginBottom: theme.spacing(2),
  },
}));

const steps = ['Basic Info', 'Review'];

export function CreateProjectWizard() {
  const classes = useStyles();
  const navigate = useNavigate();
  const api = useRegistryApi();
  const { teams, activeTeam, activeRole, isPlatformAdmin } = useRegistryTeam();

  const [activeStep, setActiveStep] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Basic Info
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [executionMode, setExecutionMode] = useState<'byoc' | 'peaas'>('byoc');
  const [team, setTeam] = useState(activeTeam ?? '');

  const canCreate = hasMinRole(activeRole, 'operator');

  if (!canCreate) {
    return (
      <EmptyState
        title="Insufficient permissions"
        description="You need at least operator role to create projects."
        missing="info"
      />
    );
  }

  const needsTeam = isPlatformAdmin && !activeTeam;

  const canNext = () => {
    switch (activeStep) {
      case 0:
        return name.trim().length > 0 && (!needsTeam || team.length > 0);
      case 1:
        return true;
      default:
        return false;
    }
  };

  const handleCreate = async () => {
    try {
      setCreating(true);
      setError(null);
      const resolvedTeam = activeTeam ?? team;
      const request: CreateProjectRequest = {
        name: name.trim(),
        description: description.trim() || undefined,
        execution_mode: executionMode,
        ...(resolvedTeam ? { team: resolvedTeam } : {}),
      };
      const project = await api.createProject(request);
      navigate(`../projects/${project.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
      setCreating(false);
    }
  };

  return (
    <Box className={classes.root}>
      <Box display="flex" alignItems="center" mb={2}>
        <IconButton size="small" onClick={() => navigate('../projects')} style={{ marginRight: 8 }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5">Create Project</Typography>
      </Box>

      <Stepper activeStep={activeStep} alternativeLabel>
        {steps.map(label => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      <Box className={classes.stepContent}>
        {/* Step 1: Basic Info */}
        {activeStep === 0 && (
          <Box>
            {needsTeam && (
              <TextField
                select
                fullWidth
                variant="outlined"
                label="Team"
                value={team}
                onChange={e => setTeam(e.target.value)}
                margin="normal"
                helperText="Required. Select the team this project belongs to."
                required
              >
                {teams.map(t => (
                  <MenuItem key={t} value={t}>
                    {t}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <TextField
              fullWidth
              variant="outlined"
              label="Project Name"
              value={name}
              onChange={e => setName(e.target.value)}
              margin="normal"
              placeholder="e.g. my-infra-project"
              helperText="Required. Must be unique within your team."
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
              rows={3}
              placeholder="What does this project manage?"
            />
            <TextField
              select
              fullWidth
              variant="outlined"
              label="Execution Mode"
              value={executionMode}
              onChange={e => setExecutionMode(e.target.value as 'byoc' | 'peaas')}
              margin="normal"
              helperText="BYOC runs on your compute; PeaaS runs on platform-managed compute."
            >
              <MenuItem value="byoc">BYOC (Bring Your Own Compute)</MenuItem>
              <MenuItem value="peaas">PeaaS (Platform-Managed)</MenuItem>
            </TextField>
          </Box>
        )}

        {/* Step 2: Review */}
        {activeStep === 1 && (
          <Box>
            <Paper variant="outlined" className={classes.reviewSection} style={{ padding: 16 }}>
              <Typography variant="subtitle2" gutterBottom>
                Project Details
              </Typography>
              {needsTeam && (
                <Typography variant="body1" gutterBottom>
                  <strong>Team:</strong> {team}
                </Typography>
              )}
              <Typography variant="body1" gutterBottom>
                <strong>Name:</strong> {name}
              </Typography>
              {description && (
                <Typography variant="body2" color="textSecondary" gutterBottom>
                  <strong>Description:</strong> {description}
                </Typography>
              )}
              <Typography variant="body2">
                <strong>Execution Mode:</strong>{' '}
                {executionMode === 'byoc'
                  ? 'BYOC (Bring Your Own Compute)'
                  : 'PeaaS (Platform-Managed)'}
              </Typography>
            </Paper>

            {error && (
              <Typography color="error" variant="body2" gutterBottom>
                {error}
              </Typography>
            )}
          </Box>
        )}
      </Box>

      <Box className={classes.buttonBar}>
        <Button
          disabled={activeStep === 0}
          onClick={() => setActiveStep(s => s - 1)}
        >
          Back
        </Button>
        {activeStep < steps.length - 1 ? (
          <Button
            variant="contained"
            color="primary"
            disabled={!canNext()}
            onClick={() => setActiveStep(s => s + 1)}
          >
            Next
          </Button>
        ) : (
          <Button
            variant="contained"
            color="primary"
            disabled={creating}
            onClick={handleCreate}
          >
            {creating ? 'Creating...' : 'Create Project'}
          </Button>
        )}
      </Box>
    </Box>
  );
}
