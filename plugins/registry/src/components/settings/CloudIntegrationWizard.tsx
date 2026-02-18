// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Stepper,
  Step,
  StepLabel,
  Button,
  TextField,
  MenuItem,
  Paper,
  Grid,
  makeStyles,
} from '@material-ui/core';
import { useNavigate, useParams } from 'react-router-dom';
import { Progress } from '@backstage/core-components';
import { useRegistryApi } from '../../hooks/useRegistryApi';
import { ProviderIcon } from './ProviderIcon';
import type {
  CloudProvider,
  AuthMethod,
  CreateCloudIntegrationRequest,
} from '../../api/types/cloudIntegrations';

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
  providerCard: {
    padding: theme.spacing(2),
    cursor: 'pointer',
    textAlign: 'center',
    border: `2px solid transparent`,
    '&:hover': {
      borderColor: theme.palette.primary.main,
    },
  },
  providerCardSelected: {
    borderColor: theme.palette.primary.main,
    backgroundColor: theme.palette.action.selected,
  },
  field: {
    marginBottom: theme.spacing(2),
  },
  reviewSection: {
    padding: theme.spacing(2),
    marginBottom: theme.spacing(2),
  },
}));

const STEPS = ['Select Provider', 'Auth Method', 'Configuration', 'Review'];

const PROVIDERS: Array<{
  value: CloudProvider;
  label: string;
  description: string;
}> = [
  { value: 'aws', label: 'AWS', description: 'Amazon Web Services' },
  { value: 'gcp', label: 'GCP', description: 'Google Cloud Platform' },
  { value: 'azure', label: 'Azure', description: 'Microsoft Azure' },
  { value: 'custom', label: 'Custom', description: 'Custom provider with env vars' },
];

const AUTH_METHODS: Record<
  CloudProvider,
  Array<{ value: AuthMethod; label: string; description: string }>
> = {
  aws: [
    { value: 'oidc', label: 'OIDC (Recommended)', description: 'Assume role via OIDC token exchange' },
    { value: 'static', label: 'Static Credentials', description: 'Access key + secret key via CI secrets' },
  ],
  gcp: [
    { value: 'oidc', label: 'Workload Identity Federation (Recommended)', description: 'Federated credentials via OIDC' },
    { value: 'static', label: 'Service Account Key', description: 'JSON credentials via CI secret' },
  ],
  azure: [
    { value: 'oidc', label: 'Federated Credentials (Recommended)', description: 'OIDC federated login' },
    { value: 'static', label: 'Client Secret', description: 'Service principal via CI secrets' },
  ],
  custom: [
    { value: 'static', label: 'Environment Variables', description: 'Custom env vars via CI secrets or literals' },
  ],
};

export function CloudIntegrationWizard() {
  const classes = useStyles();
  const api = useRegistryApi();
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id?: string }>();
  const isEdit = Boolean(editId) && editId !== 'create';

  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [provider, setProvider] = useState<CloudProvider | null>(null);
  const [authMethod, setAuthMethod] = useState<AuthMethod | null>(null);
  const [config, setConfig] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isEdit && editId) {
      api.getCloudIntegration(editId).then(ci => {
        setName(ci.name);
        setDescription(ci.description ?? '');
        setProvider(ci.provider);
        setAuthMethod(ci.auth_method);
        const flat: Record<string, string> = {};
        for (const [k, v] of Object.entries(ci.credential_config)) {
          if (typeof v === 'string') flat[k] = v;
          else if (typeof v === 'number') flat[k] = String(v);
        }
        setConfig(flat);
        setLoading(false);
      });
    }
  }, [api, editId, isEdit]);

  const handleNext = () => setActiveStep(s => s + 1);
  const handleBack = () => setActiveStep(s => s - 1);

  const handleSubmit = async () => {
    if (!provider || !authMethod) return;
    setSaving(true);
    try {
      const credentialConfig = buildCredentialConfig(provider, authMethod, config);
      const data: CreateCloudIntegrationRequest = {
        name,
        description: description || undefined,
        provider,
        auth_method: authMethod,
        credential_config: credentialConfig,
      };
      if (isEdit && editId) {
        await api.updateCloudIntegration(editId, data);
      } else {
        await api.createCloudIntegration(data);
      }
      navigate('..');
    } catch {
      setSaving(false);
    }
  };

  const setConfigField = (field: string, value: string) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  if (loading) return <Progress />;

  return (
    <Box className={classes.root}>
      <Typography variant="h5" gutterBottom>
        {isEdit ? 'Edit Cloud Integration' : 'New Cloud Integration'}
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
          <StepProvider
            classes={classes}
            provider={provider}
            onSelect={p => { setProvider(p); setAuthMethod(null); setConfig({}); }}
          />
        )}
        {activeStep === 1 && provider && (
          <StepAuth
            provider={provider}
            authMethod={authMethod}
            onSelect={setAuthMethod}
          />
        )}
        {activeStep === 2 && provider && authMethod && (
          <StepConfig
            classes={classes}
            name={name}
            description={description}
            provider={provider}
            authMethod={authMethod}
            config={config}
            onNameChange={setName}
            onDescriptionChange={setDescription}
            onConfigChange={setConfigField}
          />
        )}
        {activeStep === 3 && provider && authMethod && (
          <StepReview
            classes={classes}
            name={name}
            description={description}
            provider={provider}
            authMethod={authMethod}
            config={config}
          />
        )}
      </Box>

      <Box className={classes.actions}>
        <Button disabled={activeStep === 0} onClick={handleBack}>
          Back
        </Button>
        {activeStep < STEPS.length - 1 ? (
          <Button
            variant="contained"
            color="primary"
            onClick={handleNext}
            disabled={
              (activeStep === 0 && !provider) ||
              (activeStep === 1 && !authMethod) ||
              (activeStep === 2 && !name)
            }
          >
            Next
          </Button>
        ) : (
          <Button
            variant="contained"
            color="primary"
            onClick={handleSubmit}
            disabled={saving}
          >
            {isEdit ? 'Update' : 'Create'}
          </Button>
        )}
      </Box>
    </Box>
  );
}

// ── Step Subcomponents ──────────────────────────────────────────────

function StepProvider({
  classes,
  provider,
  onSelect,
}: {
  classes: ReturnType<typeof useStyles>;
  provider: CloudProvider | null;
  onSelect: (p: CloudProvider) => void;
}) {
  return (
    <Grid container spacing={2}>
      {PROVIDERS.map(p => (
        <Grid item xs={6} sm={3} key={p.value}>
          <Paper
            className={`${classes.providerCard} ${
              provider === p.value ? classes.providerCardSelected : ''
            }`}
            onClick={() => onSelect(p.value)}
            variant="outlined"
          >
            <ProviderIcon provider={p.value} size="medium" />
            <Typography variant="body2" style={{ marginTop: 8 }}>
              {p.description}
            </Typography>
          </Paper>
        </Grid>
      ))}
    </Grid>
  );
}

function StepAuth({
  provider,
  authMethod,
  onSelect,
}: {
  provider: CloudProvider;
  authMethod: AuthMethod | null;
  onSelect: (m: AuthMethod) => void;
}) {
  const methods = AUTH_METHODS[provider];
  return (
    <Box>
      <Typography variant="subtitle1" gutterBottom>
        Choose authentication method for {provider.toUpperCase()}
      </Typography>
      {methods.map(m => (
        <Paper
          key={m.value}
          variant="outlined"
          style={{
            padding: 16,
            marginBottom: 8,
            cursor: 'pointer',
            borderColor: authMethod === m.value ? '#1976d2' : undefined,
            backgroundColor: authMethod === m.value ? 'rgba(25, 118, 210, 0.04)' : undefined,
          }}
          onClick={() => onSelect(m.value)}
        >
          <Typography variant="subtitle2">{m.label}</Typography>
          <Typography variant="body2" color="textSecondary">
            {m.description}
          </Typography>
        </Paper>
      ))}
    </Box>
  );
}

function StepConfig({
  classes,
  name,
  description,
  provider,
  authMethod,
  config,
  onNameChange,
  onDescriptionChange,
  onConfigChange,
}: {
  classes: ReturnType<typeof useStyles>;
  name: string;
  description: string;
  provider: CloudProvider;
  authMethod: AuthMethod;
  config: Record<string, string>;
  onNameChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onConfigChange: (field: string, value: string) => void;
}) {
  const fields = getConfigFields(provider, authMethod);

  return (
    <Box>
      <TextField
        className={classes.field}
        fullWidth
        variant="outlined"
        label="Integration Name"
        value={name}
        onChange={e => onNameChange(e.target.value)}
        placeholder="e.g. aws-prod-oidc"
        required
      />
      <TextField
        className={classes.field}
        fullWidth
        variant="outlined"
        label="Description"
        value={description}
        onChange={e => onDescriptionChange(e.target.value)}
        placeholder="Optional description"
      />
      <Typography variant="subtitle2" style={{ marginTop: 16, marginBottom: 8 }}>
        Provider Configuration
      </Typography>
      {fields.map(f => (
        <TextField
          key={f.key}
          className={classes.field}
          fullWidth
          variant="outlined"
          label={f.label}
          value={config[f.key] ?? ''}
          onChange={e => onConfigChange(f.key, e.target.value)}
          placeholder={f.placeholder}
          required={f.required}
          helperText={f.helperText}
          select={f.select}
        >
          {f.select && f.options?.map(o => (
            <MenuItem key={o} value={o}>{o}</MenuItem>
          ))}
        </TextField>
      ))}
    </Box>
  );
}

function StepReview({
  classes,
  name,
  description,
  provider,
  authMethod,
  config,
}: {
  classes: ReturnType<typeof useStyles>;
  name: string;
  description: string;
  provider: CloudProvider;
  authMethod: AuthMethod;
  config: Record<string, string>;
}) {
  return (
    <Box>
      <Paper className={classes.reviewSection} variant="outlined">
        <Typography variant="subtitle2" gutterBottom>
          General
        </Typography>
        <Typography variant="body2">Name: {name}</Typography>
        {description && (
          <Typography variant="body2">Description: {description}</Typography>
        )}
      </Paper>
      <Paper className={classes.reviewSection} variant="outlined">
        <Typography variant="subtitle2" gutterBottom>
          Provider
        </Typography>
        <Box display="flex" alignItems="center" style={{ gap: 8 }}>
          <ProviderIcon provider={provider} />
          <Typography variant="body2">Auth: {authMethod}</Typography>
        </Box>
      </Paper>
      <Paper className={classes.reviewSection} variant="outlined">
        <Typography variant="subtitle2" gutterBottom>
          Configuration
        </Typography>
        {Object.entries(config)
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <Typography key={k} variant="body2">
              {k}: {v}
            </Typography>
          ))}
      </Paper>
    </Box>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

interface ConfigField {
  key: string;
  label: string;
  placeholder: string;
  required: boolean;
  helperText?: string;
  select?: boolean;
  options?: string[];
}

function getConfigFields(
  provider: CloudProvider,
  authMethod: AuthMethod,
): ConfigField[] {
  if (provider === 'aws' && authMethod === 'oidc') {
    return [
      { key: 'roleArn', label: 'Role ARN', placeholder: 'arn:aws:iam::123456789:role/butler-terraform', required: true },
      { key: 'region', label: 'Region', placeholder: 'us-east-1', required: true },
      { key: 'sessionName', label: 'Session Name', placeholder: 'butler-registry (optional)', required: false },
      { key: 'sessionDuration', label: 'Session Duration (seconds)', placeholder: '3600', required: false },
    ];
  }
  if (provider === 'aws' && authMethod === 'static') {
    return [
      { key: 'region', label: 'Region', placeholder: 'us-east-1', required: true },
      { key: 'accessKeyIdSecret', label: 'Access Key ID (CI Secret Name)', placeholder: 'AWS_ACCESS_KEY_ID', required: true, helperText: 'Name of the CI secret containing the access key' },
      { key: 'secretAccessKeySecret', label: 'Secret Access Key (CI Secret Name)', placeholder: 'AWS_SECRET_ACCESS_KEY', required: true, helperText: 'Name of the CI secret containing the secret key' },
    ];
  }
  if (provider === 'gcp' && authMethod === 'oidc') {
    return [
      { key: 'workloadIdentityProvider', label: 'Workload Identity Provider', placeholder: 'projects/123/locations/global/workloadIdentityPools/...', required: true },
      { key: 'serviceAccount', label: 'Service Account', placeholder: 'terraform@project.iam.gserviceaccount.com', required: true },
      { key: 'projectId', label: 'Project ID', placeholder: 'my-project (optional)', required: false },
    ];
  }
  if (provider === 'gcp' && authMethod === 'static') {
    return [
      { key: 'credentialsJsonSecret', label: 'Credentials JSON (CI Secret Name)', placeholder: 'GCP_CREDENTIALS_JSON', required: true },
      { key: 'projectId', label: 'Project ID', placeholder: 'my-project (optional)', required: false },
    ];
  }
  if (provider === 'azure' && authMethod === 'oidc') {
    return [
      { key: 'clientId', label: 'Client ID', placeholder: 'App registration client ID', required: true },
      { key: 'tenantId', label: 'Tenant ID', placeholder: 'Azure AD tenant ID', required: true },
      { key: 'subscriptionId', label: 'Subscription ID', placeholder: 'Optional', required: false },
    ];
  }
  if (provider === 'azure' && authMethod === 'static') {
    return [
      { key: 'clientIdSecret', label: 'Client ID (CI Secret Name)', placeholder: 'AZURE_CLIENT_ID', required: true },
      { key: 'clientSecretSecret', label: 'Client Secret (CI Secret Name)', placeholder: 'AZURE_CLIENT_SECRET', required: true },
      { key: 'tenantIdSecret', label: 'Tenant ID (CI Secret Name)', placeholder: 'AZURE_TENANT_ID', required: true },
      { key: 'subscriptionId', label: 'Subscription ID', placeholder: 'Optional', required: false },
    ];
  }
  // custom
  return [
    { key: 'envVarName', label: 'Environment Variable Name', placeholder: 'CLOUDFLARE_API_TOKEN', required: true },
    { key: 'envVarSource', label: 'Source', placeholder: '', required: true, select: true, options: ['ci_secret', 'literal'] },
    { key: 'envVarValue', label: 'Value / CI Secret Name', placeholder: 'Secret name or literal value', required: true },
  ];
}

function buildCredentialConfig(
  provider: CloudProvider,
  authMethod: AuthMethod,
  config: Record<string, string>,
): Record<string, unknown> {
  if (provider === 'aws' && authMethod === 'oidc') {
    return {
      roleArn: config.roleArn,
      region: config.region,
      sessionName: config.sessionName || undefined,
      sessionDuration: config.sessionDuration
        ? Number(config.sessionDuration)
        : undefined,
    };
  }
  if (provider === 'aws' && authMethod === 'static') {
    return {
      region: config.region,
      ciSecrets: {
        accessKeyId: config.accessKeyIdSecret || 'AWS_ACCESS_KEY_ID',
        secretAccessKey: config.secretAccessKeySecret || 'AWS_SECRET_ACCESS_KEY',
      },
    };
  }
  if (provider === 'gcp' && authMethod === 'oidc') {
    return {
      workloadIdentityProvider: config.workloadIdentityProvider,
      serviceAccount: config.serviceAccount,
      projectId: config.projectId || undefined,
    };
  }
  if (provider === 'gcp' && authMethod === 'static') {
    return {
      ciSecrets: {
        credentialsJson: config.credentialsJsonSecret || 'GCP_CREDENTIALS_JSON',
      },
      projectId: config.projectId || undefined,
    };
  }
  if (provider === 'azure' && authMethod === 'oidc') {
    return {
      clientId: config.clientId,
      tenantId: config.tenantId,
      subscriptionId: config.subscriptionId || undefined,
    };
  }
  if (provider === 'azure' && authMethod === 'static') {
    return {
      ciSecrets: {
        clientId: config.clientIdSecret || 'AZURE_CLIENT_ID',
        clientSecret: config.clientSecretSecret || 'AZURE_CLIENT_SECRET',
        tenantId: config.tenantIdSecret || 'AZURE_TENANT_ID',
      },
      subscriptionId: config.subscriptionId || undefined,
    };
  }
  // custom
  return {
    envVars: {
      [config.envVarName || 'CUSTOM_VAR']: {
        source: config.envVarSource || 'ci_secret',
        value: config.envVarValue || '',
      },
    },
  };
}
