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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  makeStyles,
} from '@material-ui/core';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import AddIcon from '@material-ui/icons/Add';
import DeleteIcon from '@material-ui/icons/Delete';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useRegistryApi } from '../../hooks/useRegistryApi';
import { useRegistryTeam } from '../../hooks/useRegistryTeam';
import type { Artifact } from '../../api/types/artifacts';

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
  moduleCard: {
    padding: theme.spacing(2),
    marginBottom: theme.spacing(2),
  },
  reviewSection: {
    marginBottom: theme.spacing(2),
  },
}));

interface ModuleEntry {
  localName: string;
  artifactNamespace: string;
  artifactName: string;
  pinnedVersion: string;
  executionMode: 'byoc' | 'peaas';
}

const steps = ['Basic Info', 'Add Modules', 'Review'];

export function CreateEnvironmentWizard() {
  const classes = useStyles();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const api = useRegistryApi();
  const { activeTeam, isPlatformAdmin, teams } = useRegistryTeam();
  const teamParam = searchParams.get('team');
  const isAdminMode = !activeTeam && isPlatformAdmin;

  const [activeStep, setActiveStep] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Team selection (admin mode without URL param)
  const [selectedTeam, setSelectedTeam] = useState(teamParam ?? '');
  // The resolved team: URL param > admin selector > active team context
  const resolvedTeam = teamParam || (isAdminMode ? selectedTeam : undefined);

  // Step 1: Basic Info
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Step 2: Modules
  const [modules, setModules] = useState<ModuleEntry[]>([]);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [moduleLocalName, setModuleLocalName] = useState('');
  const [moduleArtifactNs, setModuleArtifactNs] = useState('');
  const [moduleArtifactName, setModuleArtifactName] = useState('');
  const [moduleVersion, setModuleVersion] = useState('');
  const [moduleExecMode, setModuleExecMode] = useState<'byoc' | 'peaas'>('byoc');

  // Artifact search for module dialog
  const [artifactSearch, setArtifactSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Artifact[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearchArtifacts = async () => {
    if (!artifactSearch) return;
    try {
      setSearching(true);
      const data = await api.listArtifacts({
        search: artifactSearch,
        type: 'terraform-module',
        limit: 10,
      });
      setSearchResults(data.items);
    } catch {
      // Silent failure
    } finally {
      setSearching(false);
    }
  };

  const selectArtifact = (artifact: Artifact) => {
    setModuleArtifactNs(artifact.namespace);
    setModuleArtifactName(artifact.name);
    if (!moduleLocalName) {
      setModuleLocalName(artifact.name);
    }
    setSearchResults([]);
    setArtifactSearch('');
  };

  const addModule = () => {
    setModules(prev => [
      ...prev,
      {
        localName: moduleLocalName,
        artifactNamespace: moduleArtifactNs,
        artifactName: moduleArtifactName,
        pinnedVersion: moduleVersion,
        executionMode: moduleExecMode,
      },
    ]);
    setModuleLocalName('');
    setModuleArtifactNs('');
    setModuleArtifactName('');
    setModuleVersion('');
    setModuleExecMode('byoc');
    setAddDialogOpen(false);
  };

  const removeModule = (idx: number) => {
    setModules(prev => prev.filter((_, i) => i !== idx));
  };

  const canNext = () => {
    switch (activeStep) {
      case 0:
        if (isAdminMode && !resolvedTeam) return false;
        return name.trim().length > 0;
      case 1:
        return true; // Modules are optional at creation
      case 2:
        return true;
      default:
        return false;
    }
  };

  const handleCreate = async () => {
    try {
      setCreating(true);
      setError(null);
      const env = await api.createEnvironment({
        name: name.trim(),
        description: description.trim() || undefined,
        team: resolvedTeam || undefined,
      });

      // Add modules sequentially
      for (const mod of modules) {
        await api.addModule(env.id, {
          name: mod.localName,
          artifact_namespace: mod.artifactNamespace,
          artifact_name: mod.artifactName,
          pinned_version: mod.pinnedVersion || undefined,
          execution_mode: mod.executionMode,
        });
      }

      navigate(`../environments/${env.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create environment');
      setCreating(false);
    }
  };

  return (
    <Box className={classes.root}>
      <Box display="flex" alignItems="center" mb={2}>
        <IconButton size="small" onClick={() => navigate('..')} style={{ marginRight: 8 }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5">Create Environment</Typography>
        {resolvedTeam && (
          <Chip label={`Team: ${resolvedTeam}`} size="small" variant="outlined" style={{ marginLeft: 8 }} />
        )}
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
            {isAdminMode && !teamParam && (
              <TextField
                select
                fullWidth
                variant="outlined"
                label="Team"
                value={selectedTeam}
                onChange={e => setSelectedTeam(e.target.value)}
                margin="normal"
                helperText="Environments must belong to a team"
              >
                {teams.map(t => (
                  <MenuItem key={t} value={t}>{t}</MenuItem>
                ))}
              </TextField>
            )}
            <TextField
              fullWidth
              variant="outlined"
              label="Environment Name"
              value={name}
              onChange={e => setName(e.target.value)}
              margin="normal"
              placeholder="e.g. dev, staging, prod"
              helperText="Unique within your team"
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
              placeholder="What does this environment contain?"
            />
          </Box>
        )}

        {/* Step 2: Add Modules */}
        {activeStep === 1 && (
          <Box>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="subtitle1">
                Modules ({modules.length})
              </Typography>
              <Button
                variant="outlined"
                size="small"
                startIcon={<AddIcon />}
                onClick={() => setAddDialogOpen(true)}
              >
                Add Module
              </Button>
            </Box>

            {modules.length === 0 ? (
              <Typography color="textSecondary">
                No modules added yet. You can add modules now or after creation.
              </Typography>
            ) : (
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Local Name</TableCell>
                      <TableCell>Artifact</TableCell>
                      <TableCell>Version</TableCell>
                      <TableCell>Mode</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {modules.map((mod, i) => (
                      <TableRow key={i}>
                        <TableCell>{mod.localName}</TableCell>
                        <TableCell>
                          {mod.artifactNamespace}/{mod.artifactName}
                        </TableCell>
                        <TableCell>
                          {mod.pinnedVersion || (
                            <Chip label="latest" size="small" />
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip label={mod.executionMode} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell>
                          <IconButton size="small" onClick={() => removeModule(i)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            <Dialog
              open={addDialogOpen}
              onClose={() => setAddDialogOpen(false)}
              maxWidth="sm"
              fullWidth
            >
              <DialogTitle>Add Module</DialogTitle>
              <DialogContent>
                <Box mb={2}>
                  <Typography variant="subtitle2" gutterBottom>
                    Search Registry Artifacts
                  </Typography>
                  <Box display="flex" style={{ gap: 8 }}>
                    <TextField
                      fullWidth
                      variant="outlined"
                      size="small"
                      placeholder="Search by name..."
                      value={artifactSearch}
                      onChange={e => setArtifactSearch(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSearchArtifacts()}
                    />
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={handleSearchArtifacts}
                      disabled={searching}
                    >
                      Search
                    </Button>
                  </Box>
                  {searchResults.length > 0 && (
                    <Paper variant="outlined" style={{ marginTop: 8, maxHeight: 200, overflow: 'auto' }}>
                      {searchResults.map(a => (
                        <Box
                          key={a.id}
                          p={1}
                          style={{ cursor: 'pointer' }}
                          onClick={() => selectArtifact(a)}
                        >
                          <Typography variant="body2">
                            {a.namespace}/{a.name}
                          </Typography>
                          <Typography variant="caption" color="textSecondary">
                            {a.type} | {a.description || 'No description'}
                          </Typography>
                        </Box>
                      ))}
                    </Paper>
                  )}
                </Box>

                <TextField
                  fullWidth
                  variant="outlined"
                  label="Local Name"
                  value={moduleLocalName}
                  onChange={e => setModuleLocalName(e.target.value)}
                  margin="normal"
                  size="small"
                  placeholder="e.g. vpc, eks, rds"
                  helperText="Name for this module within the environment"
                />
                <Box display="flex" style={{ gap: 16 }}>
                  <TextField
                    variant="outlined"
                    label="Namespace"
                    value={moduleArtifactNs}
                    onChange={e => setModuleArtifactNs(e.target.value)}
                    margin="normal"
                    size="small"
                    style={{ flex: 1 }}
                  />
                  <TextField
                    variant="outlined"
                    label="Artifact Name"
                    value={moduleArtifactName}
                    onChange={e => setModuleArtifactName(e.target.value)}
                    margin="normal"
                    size="small"
                    style={{ flex: 1 }}
                  />
                </Box>
                <TextField
                  fullWidth
                  variant="outlined"
                  label="Pinned Version"
                  value={moduleVersion}
                  onChange={e => setModuleVersion(e.target.value)}
                  margin="normal"
                  size="small"
                  placeholder="Leave empty to track latest"
                  helperText="Exact version (1.2.3) or constraint (~> 1.2)"
                />
                <TextField
                  select
                  fullWidth
                  variant="outlined"
                  label="Execution Mode"
                  value={moduleExecMode}
                  onChange={e => setModuleExecMode(e.target.value as 'byoc' | 'peaas')}
                  margin="normal"
                  size="small"
                >
                  <MenuItem value="byoc">BYOC (Bring Your Own Compute)</MenuItem>
                  <MenuItem value="peaas">PeaaS (Platform-Managed)</MenuItem>
                </TextField>
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={addModule}
                  disabled={!moduleLocalName || !moduleArtifactNs || !moduleArtifactName}
                >
                  Add
                </Button>
              </DialogActions>
            </Dialog>
          </Box>
        )}

        {/* Step 3: Review */}
        {activeStep === 2 && (
          <Box>
            <Paper variant="outlined" className={classes.reviewSection} style={{ padding: 16 }}>
              <Typography variant="subtitle2" gutterBottom>
                Environment
              </Typography>
              {resolvedTeam && (
                <Typography variant="body2" gutterBottom>
                  Team: {resolvedTeam}
                </Typography>
              )}
              <Typography variant="body1">{name}</Typography>
              {description && (
                <Typography variant="body2" color="textSecondary">
                  {description}
                </Typography>
              )}
            </Paper>

            <Paper variant="outlined" className={classes.reviewSection} style={{ padding: 16 }}>
              <Typography variant="subtitle2" gutterBottom>
                Modules ({modules.length})
              </Typography>
              {modules.length === 0 ? (
                <Typography variant="body2" color="textSecondary">
                  No modules — you can add them after creation.
                </Typography>
              ) : (
                modules.map((mod, i) => (
                  <Box key={i} mb={1}>
                    <Typography variant="body2">
                      {mod.localName} — {mod.artifactNamespace}/{mod.artifactName}
                      {mod.pinnedVersion && ` @ ${mod.pinnedVersion}`}
                      {' '}({mod.executionMode})
                    </Typography>
                  </Box>
                ))
              )}
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
            {creating ? 'Creating...' : 'Create Environment'}
          </Button>
        )}
      </Box>
    </Box>
  );
}
