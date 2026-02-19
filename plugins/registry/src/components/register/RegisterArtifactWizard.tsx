// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState } from 'react';
import {
  Box,
  Typography,
  Stepper,
  Step,
  StepLabel,
  Button,
  TextField,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Paper,
  makeStyles,
} from '@material-ui/core';
import { useNavigate } from 'react-router-dom';
import { useRegistryApi } from '../../hooks/useRegistryApi';
import { useRegistryTeam } from '../../hooks/useRegistryTeam';
import type {
  ArtifactType,
  CreateArtifactRequest,
  StorageConfig,
} from '../../api/types/artifacts';

const useStyles = makeStyles(theme => ({
  root: {
    maxWidth: 800,
    margin: '0 auto',
  },
  stepContent: {
    padding: theme.spacing(3, 0),
  },
  actions: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: theme.spacing(3),
  },
  reviewSection: {
    padding: theme.spacing(2),
    marginBottom: theme.spacing(2),
  },
  field: {
    marginBottom: theme.spacing(2),
  },
}));

const STEPS = [
  'Select Type',
  'Basic Info',
  'Storage',
  'Approval Policy',
  'Review',
];

const ARTIFACT_TYPES: Array<{ value: ArtifactType; label: string; description: string }> = [
  {
    value: 'terraform-module',
    label: 'Terraform Module',
    description: 'Reusable Terraform infrastructure module',
  },
  {
    value: 'terraform-provider',
    label: 'Terraform Provider',
    description: 'Custom Terraform/OpenTofu provider plugin',
  },
  {
    value: 'helm-chart',
    label: 'Helm Chart',
    description: 'Kubernetes application package',
  },
  {
    value: 'opa-bundle',
    label: 'OPA Policy Bundle',
    description: 'Open Policy Agent policy bundle',
  },
  {
    value: 'oci-artifact',
    label: 'OCI Artifact',
    description: 'Generic OCI container artifact',
  },
];

export function RegisterArtifactWizard() {
  const classes = useStyles();
  const navigate = useNavigate();
  const api = useRegistryApi();
  const { activeTeam, isPlatformAdmin, teams } = useRegistryTeam();
  const isAdminMode = !activeTeam && isPlatformAdmin;

  const [activeStep, setActiveStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [type, setType] = useState<ArtifactType>('terraform-module');
  const [namespace, setNamespace] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [provider, setProvider] = useState('');
  const [storageBackend, setStorageBackend] = useState<'git' | 'oci'>('git');
  const [repoUrl, setRepoUrl] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const [ociRegistry, setOciRegistry] = useState('');
  const [autoApprovePatches, setAutoApprovePatches] = useState(true);
  const [requirePassingTests, setRequirePassingTests] = useState(false);
  const [requirePassingValidate, setRequirePassingValidate] = useState(false);
  const [targetTeam, setTargetTeam] = useState('__platform__');

  const handleNext = () => setActiveStep(prev => prev + 1);
  const handleBack = () => setActiveStep(prev => prev - 1);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const storageConfig: StorageConfig = {
        backend: storageBackend,
        ...(storageBackend === 'git'
          ? { git: { repositoryUrl: repoUrl, path: repoPath || undefined } }
          : { oci: { registryUrl: ociRegistry || undefined } }),
      };

      const data: CreateArtifactRequest = {
        namespace,
        name,
        type,
        description: description || undefined,
        provider: type === 'terraform-module' ? provider || undefined : undefined,
        storage_config: storageConfig,
        approval_policy: {
          autoApprovePatches,
          ...(requirePassingTests ? { requirePassingTests: true } : {}),
          ...(requirePassingValidate ? { requirePassingValidate: true } : {}),
        },
        source_config: repoUrl
          ? { repositoryUrl: repoUrl, vcsProvider: 'github' }
          : undefined,
        ...(isAdminMode && targetTeam !== '__platform__' ? { team: targetTeam } : {}),
      };

      await api.createArtifact(data);
      navigate(`/registry/artifact/${namespace}/${name}`);
    } catch {
      setSubmitting(false);
    }
  };

  const canProceed = (): boolean => {
    switch (activeStep) {
      case 0:
        return !!type;
      case 1:
        return !!namespace && !!name;
      case 2:
        return storageBackend === 'git' ? !!repoUrl : true;
      case 3:
        return true;
      default:
        return true;
    }
  };

  return (
    <Box className={classes.root}>
      <Box display="flex" alignItems="center" mb={1}>
        <Button size="small" onClick={() => navigate('..')}>
          &larr; Back to Catalog
        </Button>
      </Box>
      <Typography variant="h5" gutterBottom>
        Register Artifact
      </Typography>

      <Stepper activeStep={activeStep} alternativeLabel>
        {STEPS.map(label => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      <Box className={classes.stepContent}>
        {activeStep === 0 && (
          <TextField
            select
            fullWidth
            variant="outlined"
            label="Artifact Type"
            value={type}
            onChange={e => setType(e.target.value as ArtifactType)}
            className={classes.field}
          >
            {ARTIFACT_TYPES.map(t => (
              <MenuItem key={t.value} value={t.value}>
                {t.label} - {t.description}
              </MenuItem>
            ))}
          </TextField>
        )}

        {activeStep === 1 && (
          <>
            {isAdminMode ? (
              <TextField
                select
                fullWidth
                variant="outlined"
                label="Scope"
                value={targetTeam}
                onChange={e => setTargetTeam(e.target.value)}
                className={classes.field}
                helperText="Platform artifacts are visible to all teams"
              >
                <MenuItem value="__platform__">Platform (shared)</MenuItem>
                {teams.map(t => (
                  <MenuItem key={t} value={t}>{t}</MenuItem>
                ))}
              </TextField>
            ) : activeTeam ? (
              <TextField
                fullWidth
                variant="outlined"
                label="Team"
                value={activeTeam}
                className={classes.field}
                disabled
                helperText="Artifact will be scoped to your active team"
              />
            ) : null}
            <TextField
              fullWidth
              variant="outlined"
              label="Namespace"
              value={namespace}
              onChange={e => setNamespace(e.target.value)}
              className={classes.field}
              helperText="3-64 lowercase alphanumeric characters or hyphens"
            />
            <TextField
              fullWidth
              variant="outlined"
              label="Name"
              value={name}
              onChange={e => setName(e.target.value)}
              className={classes.field}
              helperText="3-64 lowercase alphanumeric characters or hyphens"
            />
            <TextField
              fullWidth
              variant="outlined"
              label="Description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className={classes.field}
              multiline
              rows={2}
            />
            {type === 'terraform-module' && (
              <TextField
                fullWidth
                variant="outlined"
                label="Provider (e.g. aws, gcp, azure)"
                value={provider}
                onChange={e => setProvider(e.target.value)}
                className={classes.field}
              />
            )}
          </>
        )}

        {activeStep === 2 && (
          <>
            <TextField
              select
              fullWidth
              variant="outlined"
              label="Storage Backend"
              value={storageBackend}
              onChange={e =>
                setStorageBackend(e.target.value as 'git' | 'oci')
              }
              className={classes.field}
            >
              <MenuItem value="git">Git Repository</MenuItem>
              <MenuItem value="oci">OCI Registry</MenuItem>
            </TextField>
            {storageBackend === 'git' && (
              <>
                <TextField
                  fullWidth
                  variant="outlined"
                  label="Repository URL"
                  value={repoUrl}
                  onChange={e => setRepoUrl(e.target.value)}
                  className={classes.field}
                  placeholder="https://github.com/org/repo"
                />
                <TextField
                  fullWidth
                  variant="outlined"
                  label="Path (optional)"
                  value={repoPath}
                  onChange={e => setRepoPath(e.target.value)}
                  className={classes.field}
                  placeholder="modules/vpc"
                />
              </>
            )}
            {storageBackend === 'oci' && (
              <TextField
                fullWidth
                variant="outlined"
                label="OCI Registry URL (optional, uses default)"
                value={ociRegistry}
                onChange={e => setOciRegistry(e.target.value)}
                className={classes.field}
              />
            )}
          </>
        )}

        {activeStep === 3 && (
          <>
            <FormControlLabel
              control={
                <Checkbox
                  checked={autoApprovePatches}
                  onChange={e => setAutoApprovePatches(e.target.checked)}
                />
              }
              label="Auto-approve patch version bumps"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={requirePassingTests}
                  onChange={e => setRequirePassingTests(e.target.checked)}
                />
              }
              label="Require passing terraform test before approval"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={requirePassingValidate}
                  onChange={e => setRequirePassingValidate(e.target.checked)}
                />
              }
              label="Require passing terraform validate before approval"
            />
          </>
        )}

        {activeStep === 4 && (
          <Paper variant="outlined" className={classes.reviewSection}>
            <Typography variant="subtitle2" gutterBottom>
              Scope: {isAdminMode
                ? (targetTeam === '__platform__' ? 'Platform (shared)' : targetTeam)
                : activeTeam ?? 'Platform'}
            </Typography>
            <Typography variant="subtitle2" gutterBottom>
              Type: {ARTIFACT_TYPES.find(t => t.value === type)?.label}
            </Typography>
            <Typography variant="subtitle2" gutterBottom>
              Namespace: {namespace}
            </Typography>
            <Typography variant="subtitle2" gutterBottom>
              Name: {name}
            </Typography>
            {description && (
              <Typography variant="subtitle2" gutterBottom>
                Description: {description}
              </Typography>
            )}
            {provider && (
              <Typography variant="subtitle2" gutterBottom>
                Provider: {provider}
              </Typography>
            )}
            <Typography variant="subtitle2" gutterBottom>
              Storage: {storageBackend}
              {storageBackend === 'git' && ` (${repoUrl})`}
            </Typography>
            <Typography variant="subtitle2">
              Auto-approve patches: {autoApprovePatches ? 'Yes' : 'No'}
            </Typography>
            {requirePassingTests && (
              <Typography variant="subtitle2">
                Require passing tests: Yes
              </Typography>
            )}
            {requirePassingValidate && (
              <Typography variant="subtitle2">
                Require passing validate: Yes
              </Typography>
            )}
          </Paper>
        )}
      </Box>

      <Box className={classes.actions}>
        <Button
          disabled={activeStep === 0}
          onClick={handleBack}
        >
          Back
        </Button>
        {activeStep < STEPS.length - 1 ? (
          <Button
            variant="contained"
            color="primary"
            onClick={handleNext}
            disabled={!canProceed()}
          >
            Next
          </Button>
        ) : (
          <Button
            variant="contained"
            color="primary"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Creating...' : 'Create Artifact'}
          </Button>
        )}
      </Box>
    </Box>
  );
}
