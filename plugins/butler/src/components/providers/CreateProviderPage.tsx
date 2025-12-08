// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import {
  InfoCard,
} from '@backstage/core-components';
import {
  Grid,
  Typography,
  Button,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Box,
  Chip,
  makeStyles,
  FormControlLabel,
  Switch,
} from '@material-ui/core';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import ErrorIcon from '@material-ui/icons/Error';
import NetworkCheckIcon from '@material-ui/icons/NetworkCheck';
import SaveIcon from '@material-ui/icons/Save';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';

import { butlerApiRef } from '../../api/ButlerApi';
import type { CreateProviderRequest } from '../../api/types/providers';

type ProviderType = 'harvester' | 'nutanix' | 'proxmox';

const useStyles = makeStyles(theme => ({
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(2.5),
  },
  sectionTitle: {
    marginTop: theme.spacing(2),
    marginBottom: theme.spacing(1),
    fontWeight: 600,
  },
  actions: {
    display: 'flex',
    gap: theme.spacing(1.5),
    marginTop: theme.spacing(3),
  },
  backButton: {
    textTransform: 'none',
  },
  testResultBox: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    padding: theme.spacing(1.5, 2),
    borderRadius: theme.shape.borderRadius,
    marginTop: theme.spacing(1),
  },
  testSuccess: {
    backgroundColor: 'rgba(76, 175, 80, 0.08)',
    border: '1px solid rgba(76, 175, 80, 0.3)',
  },
  testFailure: {
    backgroundColor: 'rgba(244, 67, 54, 0.08)',
    border: '1px solid rgba(244, 67, 54, 0.3)',
  },
  testIcon: {
    fontSize: '1.25rem',
  },
  testSuccessIcon: {
    color: '#4caf50',
  },
  testErrorIcon: {
    color: '#f44336',
  },
  submitError: {
    color: theme.palette.error.main,
    marginTop: theme.spacing(1),
  },
  kubeconfigField: {
    fontFamily: 'monospace',
    fontSize: '0.8rem',
  },
}));

interface TestResult {
  success: boolean;
  message: string;
}

export const CreateProviderPage = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const navigate = useNavigate();

  // Form state
  const [name, setName] = useState('');
  const [namespace, setNamespace] = useState('butler-system');
  const [providerType, setProviderType] = useState<ProviderType>('harvester');

  // Harvester fields
  const [harvesterKubeconfig, setHarvesterKubeconfig] = useState('');

  // Nutanix fields
  const [nutanixEndpoint, setNutanixEndpoint] = useState('');
  const [nutanixPort, setNutanixPort] = useState<number | ''>(9440);
  const [nutanixUsername, setNutanixUsername] = useState('');
  const [nutanixPassword, setNutanixPassword] = useState('');
  const [nutanixInsecure, setNutanixInsecure] = useState(false);

  // Proxmox fields
  const [proxmoxEndpoint, setProxmoxEndpoint] = useState('');
  const [proxmoxTokenId, setProxmoxTokenId] = useState('');
  const [proxmoxTokenSecret, setProxmoxTokenSecret] = useState('');
  const [proxmoxInsecure, setProxmoxInsecure] = useState(false);

  // Test connection state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const buildRequest = (): CreateProviderRequest => {
    const request: CreateProviderRequest = {
      name: name.trim(),
      namespace: namespace.trim() || undefined,
      provider: providerType,
    };

    switch (providerType) {
      case 'harvester':
        request.harvesterKubeconfig = harvesterKubeconfig.trim();
        break;
      case 'nutanix':
        request.nutanixEndpoint = nutanixEndpoint.trim();
        request.nutanixPort = nutanixPort !== '' ? nutanixPort : undefined;
        request.nutanixUsername = nutanixUsername.trim();
        request.nutanixPassword = nutanixPassword;
        request.nutanixInsecure = nutanixInsecure;
        break;
      case 'proxmox':
        request.proxmoxEndpoint = proxmoxEndpoint.trim();
        request.proxmoxTokenId = proxmoxTokenId.trim();
        request.proxmoxTokenSecret = proxmoxTokenSecret;
        request.proxmoxInsecure = proxmoxInsecure;
        break;
    }

    return request;
  };

  const isFormValid = (): boolean => {
    if (!name.trim()) return false;

    switch (providerType) {
      case 'harvester':
        return !!harvesterKubeconfig.trim();
      case 'nutanix':
        return (
          !!nutanixEndpoint.trim() &&
          !!nutanixUsername.trim() &&
          !!nutanixPassword
        );
      case 'proxmox':
        return (
          !!proxmoxEndpoint.trim() &&
          !!proxmoxTokenId.trim() &&
          !!proxmoxTokenSecret
        );
      default:
        return false;
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const request = buildRequest();
      const result = await api.testProviderConnection(request);
      setTestResult({
        success: result.valid,
        message: result.message,
      });
    } catch (err) {
      setTestResult({
        success: false,
        message:
          err instanceof Error ? err.message : 'Connection test failed',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);

    try {
      const request = buildRequest();
      await api.createProvider(request);
      navigate('..');
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Failed to create provider',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const renderProviderFields = () => {
    switch (providerType) {
      case 'harvester':
        return (
          <>
            <Typography variant="subtitle1" className={classes.sectionTitle}>
              Harvester Configuration
            </Typography>
            <TextField
              label="Kubeconfig"
              variant="outlined"
              size="small"
              multiline
              rows={10}
              fullWidth
              required
              value={harvesterKubeconfig}
              onChange={e => setHarvesterKubeconfig(e.target.value)}
              placeholder="Paste Harvester kubeconfig YAML here..."
              InputProps={{
                className: classes.kubeconfigField,
              }}
              helperText="The kubeconfig for connecting to the Harvester cluster"
            />
          </>
        );

      case 'nutanix':
        return (
          <>
            <Typography variant="subtitle1" className={classes.sectionTitle}>
              Nutanix Configuration
            </Typography>
            <TextField
              label="Endpoint"
              variant="outlined"
              size="small"
              fullWidth
              required
              value={nutanixEndpoint}
              onChange={e => setNutanixEndpoint(e.target.value)}
              placeholder="prism-central.example.com"
              helperText="Nutanix Prism Central hostname or IP"
            />
            <TextField
              label="Port"
              variant="outlined"
              size="small"
              type="number"
              fullWidth
              value={nutanixPort}
              onChange={e =>
                setNutanixPort(
                  e.target.value === '' ? '' : parseInt(e.target.value, 10),
                )
              }
              helperText="Prism Central API port (default 9440)"
            />
            <TextField
              label="Username"
              variant="outlined"
              size="small"
              fullWidth
              required
              value={nutanixUsername}
              onChange={e => setNutanixUsername(e.target.value)}
              placeholder="admin"
            />
            <TextField
              label="Password"
              variant="outlined"
              size="small"
              type="password"
              fullWidth
              required
              value={nutanixPassword}
              onChange={e => setNutanixPassword(e.target.value)}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={nutanixInsecure}
                  onChange={e => setNutanixInsecure(e.target.checked)}
                  color="primary"
                />
              }
              label="Allow insecure TLS (skip certificate verification)"
            />
          </>
        );

      case 'proxmox':
        return (
          <>
            <Typography variant="subtitle1" className={classes.sectionTitle}>
              Proxmox Configuration
            </Typography>
            <TextField
              label="Endpoint"
              variant="outlined"
              size="small"
              fullWidth
              required
              value={proxmoxEndpoint}
              onChange={e => setProxmoxEndpoint(e.target.value)}
              placeholder="https://proxmox.example.com:8006"
              helperText="Proxmox VE API endpoint URL"
            />
            <TextField
              label="Token ID"
              variant="outlined"
              size="small"
              fullWidth
              required
              value={proxmoxTokenId}
              onChange={e => setProxmoxTokenId(e.target.value)}
              placeholder="user@pam!token-name"
              helperText="API token ID (e.g., user@pam!token-name)"
            />
            <TextField
              label="Token Secret"
              variant="outlined"
              size="small"
              type="password"
              fullWidth
              required
              value={proxmoxTokenSecret}
              onChange={e => setProxmoxTokenSecret(e.target.value)}
              helperText="API token secret value"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={proxmoxInsecure}
                  onChange={e => setProxmoxInsecure(e.target.checked)}
                  color="primary"
                />
              }
              label="Allow insecure TLS (skip certificate verification)"
            />
          </>
        );

      default:
        return null;
    }
  };

  return (
    <Grid container spacing={3}>
          <Grid item xs={12}>
            <Button
              className={classes.backButton}
              startIcon={<ArrowBackIcon />}
              onClick={() => navigate('..')}
            >
              Back to Providers
            </Button>
          </Grid>

          <Grid item xs={12} md={8}>
            <InfoCard title="Provider Configuration">
              <Box className={classes.form}>
                {/* Common fields */}
                <TextField
                  label="Name"
                  variant="outlined"
                  size="small"
                  fullWidth
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="my-provider"
                  helperText="A unique name for this provider configuration"
                />

                <TextField
                  label="Namespace"
                  variant="outlined"
                  size="small"
                  fullWidth
                  value={namespace}
                  onChange={e => setNamespace(e.target.value)}
                  helperText="Kubernetes namespace for the provider resource (default: butler-system)"
                />

                <FormControl variant="outlined" size="small" fullWidth>
                  <InputLabel id="provider-type-label">
                    Provider Type
                  </InputLabel>
                  <Select
                    labelId="provider-type-label"
                    value={providerType}
                    onChange={e => {
                      setProviderType(e.target.value as ProviderType);
                      setTestResult(null);
                    }}
                    label="Provider Type"
                  >
                    <MenuItem value="harvester">
                      <Box display="flex" alignItems="center" gridGap={8}>
                        Harvester
                        <Chip size="small" label="HCI" variant="outlined" />
                      </Box>
                    </MenuItem>
                    <MenuItem value="nutanix">
                      <Box display="flex" alignItems="center" gridGap={8}>
                        Nutanix
                        <Chip size="small" label="HCI" variant="outlined" />
                      </Box>
                    </MenuItem>
                    <MenuItem value="proxmox">
                      <Box display="flex" alignItems="center" gridGap={8}>
                        Proxmox
                        <Chip
                          size="small"
                          label="Hypervisor"
                          variant="outlined"
                        />
                      </Box>
                    </MenuItem>
                  </Select>
                </FormControl>

                {/* Provider-specific fields */}
                {renderProviderFields()}

                {/* Test Connection */}
                <Box>
                  <Button
                    variant="outlined"
                    startIcon={<NetworkCheckIcon />}
                    onClick={handleTestConnection}
                    disabled={testing || !isFormValid()}
                  >
                    {testing ? 'Testing...' : 'Test Connection'}
                  </Button>

                  {testResult && (
                    <Box
                      className={`${classes.testResultBox} ${
                        testResult.success
                          ? classes.testSuccess
                          : classes.testFailure
                      }`}
                    >
                      {testResult.success ? (
                        <CheckCircleIcon
                          className={`${classes.testIcon} ${classes.testSuccessIcon}`}
                        />
                      ) : (
                        <ErrorIcon
                          className={`${classes.testIcon} ${classes.testErrorIcon}`}
                        />
                      )}
                      <Typography variant="body2">
                        {testResult.message}
                      </Typography>
                    </Box>
                  )}
                </Box>

                {/* Submit */}
                <Box className={classes.actions}>
                  <Button
                    variant="contained"
                    color="primary"
                    startIcon={<SaveIcon />}
                    onClick={handleSubmit}
                    disabled={submitting || !isFormValid()}
                  >
                    {submitting ? 'Creating...' : 'Create Provider'}
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={() => navigate('..')}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                </Box>

                {submitError && (
                  <Typography variant="body2" className={classes.submitError}>
                    {submitError}
                  </Typography>
                )}
              </Box>
            </InfoCard>
          </Grid>

          {/* Sidebar hints */}
          <Grid item xs={12} md={4}>
            <InfoCard title="Provider Types">
              <Box display="flex" flexDirection="column" gridGap={16}>
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Harvester
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    SUSE Harvester is a hyper-converged infrastructure (HCI)
                    solution built on Kubernetes. Butler connects using a
                    kubeconfig to the Harvester management cluster.
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Nutanix
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    Nutanix AHV via Prism Central API. Butler uses username and
                    password authentication to provision VMs for tenant cluster
                    worker nodes.
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Proxmox
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    Proxmox VE hypervisor using API token authentication. Butler
                    manages VMs via the Proxmox REST API for tenant cluster
                    worker nodes.
                  </Typography>
                </Box>
              </Box>
            </InfoCard>
          </Grid>
    </Grid>
  );
};
