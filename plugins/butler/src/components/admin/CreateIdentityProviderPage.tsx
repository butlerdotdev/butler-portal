// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import { InfoCard } from '@backstage/core-components';
import {
  Grid,
  Typography,
  Button,
  TextField,
  Box,
  Chip,
  Divider,
  Paper,
  makeStyles,
} from '@material-ui/core';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import ErrorOutlineIcon from '@material-ui/icons/ErrorOutline';
import { butlerApiRef } from '../../api/ButlerApi';
import {
  PROVIDER_PRESETS,
  type ProviderPresetKey,
} from '../../api/types/identity-providers';

const useStyles = makeStyles(theme => ({
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(3),
  },
  presetGrid: {
    marginBottom: theme.spacing(3),
  },
  presetCard: {
    padding: theme.spacing(2),
    cursor: 'pointer',
    border: `2px solid transparent`,
    borderRadius: theme.shape.borderRadius,
    transition: 'border-color 0.2s, box-shadow 0.2s',
    '&:hover': {
      boxShadow: theme.shadows[2],
    },
  },
  presetCardSelected: {
    borderColor: theme.palette.primary.main,
    boxShadow: theme.shadows[2],
  },
  presetName: {
    fontWeight: 600,
  },
  formSection: {
    marginBottom: theme.spacing(3),
  },
  formField: {
    marginBottom: theme.spacing(2),
  },
  discoveryResult: {
    marginTop: theme.spacing(2),
    padding: theme.spacing(2),
    borderRadius: theme.shape.borderRadius,
  },
  discoverySuccess: {
    backgroundColor: 'rgba(76, 175, 80, 0.08)',
    border: '1px solid rgba(76, 175, 80, 0.3)',
  },
  discoveryError: {
    backgroundColor: 'rgba(244, 67, 54, 0.08)',
    border: '1px solid rgba(244, 67, 54, 0.3)',
  },
  discoveryEndpoint: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: theme.spacing(0.5, 0),
  },
  endpointLabel: {
    fontWeight: 600,
    color: theme.palette.text.secondary,
    minWidth: 200,
  },
  endpointValue: {
    wordBreak: 'break-all',
    textAlign: 'right',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: theme.spacing(2),
    marginTop: theme.spacing(3),
  },
}));

type PresetOption = ProviderPresetKey | 'custom';

interface DiscoveryResult {
  valid: boolean;
  message: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  userInfoEndpoint?: string;
  jwksURI?: string;
}

interface FormData {
  name: string;
  displayName: string;
  issuerURL: string;
  clientID: string;
  clientSecret: string;
  redirectURL: string;
  scopes: string;
  emailClaim: string;
  groupsClaim: string;
}

export const CreateIdentityProviderPage = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const navigate = useNavigate();

  const [selectedPreset, setSelectedPreset] = useState<PresetOption | null>(
    null,
  );
  const [formData, setFormData] = useState<FormData>({
    name: '',
    displayName: '',
    issuerURL: '',
    clientID: '',
    clientSecret: '',
    redirectURL: '',
    scopes: 'openid,email,profile',
    emailClaim: 'email',
    groupsClaim: '',
  });
  const [formError, setFormError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [testingDiscovery, setTestingDiscovery] = useState(false);
  const [discoveryResult, setDiscoveryResult] =
    useState<DiscoveryResult | null>(null);

  const presetOptions: Array<{ key: PresetOption; label: string }> = [
    { key: 'google', label: 'Google Workspace' },
    { key: 'microsoft', label: 'Microsoft Entra ID' },
    { key: 'okta', label: 'Okta' },
    { key: 'auth0', label: 'Auth0' },
    { key: 'keycloak', label: 'Keycloak' },
    { key: 'custom', label: 'Custom OIDC' },
  ];

  const handleSelectPreset = (preset: PresetOption) => {
    setSelectedPreset(preset);
    setDiscoveryResult(null);

    if (preset === 'custom') {
      setFormData(prev => ({
        ...prev,
        issuerURL: '',
        scopes: 'openid,email,profile',
        emailClaim: 'email',
        groupsClaim: '',
      }));
      return;
    }

    const presetConfig = PROVIDER_PRESETS[preset];
    if (presetConfig) {
      setFormData(prev => ({
        ...prev,
        displayName: prev.displayName || presetConfig.name,
        issuerURL: presetConfig.issuerURL,
        scopes: presetConfig.scopes.join(','),
        emailClaim: presetConfig.emailClaim,
        groupsClaim: presetConfig.groupsClaim,
      }));
    }
  };

  const updateField = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setFormError(undefined);
  };

  const handleTestDiscovery = async () => {
    if (!formData.issuerURL.trim()) {
      setFormError('Issuer URL is required to test discovery.');
      return;
    }

    setTestingDiscovery(true);
    setDiscoveryResult(null);
    try {
      const result = await api.testIdPDiscovery(formData.issuerURL);
      setDiscoveryResult(result);
    } catch (e) {
      setDiscoveryResult({
        valid: false,
        message: e instanceof Error ? e.message : 'Discovery test failed.',
      });
    } finally {
      setTestingDiscovery(false);
    }
  };

  const handleSubmit = async () => {
    // Validation
    if (!formData.name.trim()) {
      setFormError('Name is required.');
      return;
    }

    const nameRegex = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
    if (formData.name.length > 2 && !nameRegex.test(formData.name)) {
      setFormError(
        'Name must be lowercase alphanumeric with hyphens, and cannot start or end with a hyphen.',
      );
      return;
    }

    if (!formData.issuerURL.trim()) {
      setFormError('Issuer URL is required.');
      return;
    }

    if (!formData.clientID.trim()) {
      setFormError('Client ID is required.');
      return;
    }

    if (!formData.clientSecret.trim()) {
      setFormError('Client Secret is required.');
      return;
    }

    setSubmitting(true);
    setFormError(undefined);
    try {
      const scopesArray = formData.scopes
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      await api.createIdentityProvider({
        name: formData.name,
        displayName: formData.displayName || undefined,
        issuerURL: formData.issuerURL,
        clientID: formData.clientID,
        clientSecret: formData.clientSecret,
        redirectURL: formData.redirectURL || '',
        scopes: scopesArray.length > 0 ? scopesArray : undefined,
        emailClaim: formData.emailClaim || undefined,
        groupsClaim: formData.groupsClaim || undefined,
      });

      navigate('../identity-providers');
    } catch (e) {
      setFormError(
        e instanceof Error
          ? e.message
          : 'Failed to create identity provider.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <Button
        startIcon={<ArrowBackIcon />}
        component={RouterLink}
        to="/butler/admin/identity-providers"
        style={{ textTransform: 'none', marginBottom: 16 }}
      >
        Back to Identity Providers
      </Button>
      <div className={classes.header}>
        <Typography variant="h4">Add Identity Provider</Typography>
      </div>

      {/* Preset Selection */}
      <InfoCard title="Choose Provider Type">
        <Grid container spacing={2} className={classes.presetGrid}>
          {presetOptions.map(option => (
            <Grid item xs={6} sm={4} md={2} key={option.key}>
              <Paper
                className={`${classes.presetCard} ${
                  selectedPreset === option.key
                    ? classes.presetCardSelected
                    : ''
                }`}
                onClick={() => handleSelectPreset(option.key)}
                elevation={selectedPreset === option.key ? 2 : 0}
                variant={
                  selectedPreset === option.key ? 'elevation' : 'outlined'
                }
              >
                <Typography
                  className={classes.presetName}
                  variant="body2"
                  align="center"
                >
                  {option.label}
                </Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </InfoCard>

      {/* Configuration Form */}
      {selectedPreset && (
        <Box mt={3}>
          <InfoCard title="Provider Configuration">
            {formError && (
              <Typography color="error" variant="body2" gutterBottom>
                {formError}
              </Typography>
            )}

            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <div className={classes.formSection}>
                  <Typography variant="subtitle2" gutterBottom>
                    Basic Information
                  </Typography>
                  <TextField
                    className={classes.formField}
                    label="Name"
                    helperText="Unique identifier for this provider (lowercase, hyphens allowed)."
                    value={formData.name}
                    onChange={e => updateField('name', e.target.value)}
                    fullWidth
                    required
                    margin="dense"
                  />
                  <TextField
                    className={classes.formField}
                    label="Display Name"
                    helperText="Human-readable name shown to users."
                    value={formData.displayName}
                    onChange={e =>
                      updateField('displayName', e.target.value)
                    }
                    fullWidth
                    margin="dense"
                  />
                </div>

                <Divider />

                <div className={classes.formSection}>
                  <Box mt={2}>
                    <Typography variant="subtitle2" gutterBottom>
                      OIDC Configuration
                    </Typography>
                  </Box>
                  <TextField
                    className={classes.formField}
                    label="Issuer URL"
                    helperText={
                      selectedPreset !== 'custom'
                        ? 'Pre-filled from preset. Replace placeholder values like {tenant} or {domain}.'
                        : 'The OIDC issuer URL for your identity provider.'
                    }
                    value={formData.issuerURL}
                    onChange={e =>
                      updateField('issuerURL', e.target.value)
                    }
                    fullWidth
                    required
                    margin="dense"
                  />
                  <Box display="flex" style={{ gap: 8 }} mb={2}>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={handleTestDiscovery}
                      disabled={
                        testingDiscovery || !formData.issuerURL.trim()
                      }
                    >
                      {testingDiscovery
                        ? 'Testing...'
                        : 'Test Discovery'}
                    </Button>
                  </Box>

                  {/* Discovery Result */}
                  {discoveryResult && (
                    <div
                      className={`${classes.discoveryResult} ${
                        discoveryResult.valid
                          ? classes.discoverySuccess
                          : classes.discoveryError
                      }`}
                    >
                      <Box
                        display="flex"
                        alignItems="center"
                        gridGap={8}
                        mb={1}
                      >
                        {discoveryResult.valid ? (
                          <CheckCircleIcon
                            fontSize="small"
                            style={{ color: '#4caf50' }}
                          />
                        ) : (
                          <ErrorOutlineIcon
                            fontSize="small"
                            color="error"
                          />
                        )}
                        <Typography variant="subtitle2">
                          {discoveryResult.valid
                            ? 'Discovery Successful'
                            : 'Discovery Failed'}
                        </Typography>
                      </Box>
                      <Typography variant="body2">
                        {discoveryResult.message}
                      </Typography>

                      {discoveryResult.valid && (
                        <Box mt={1}>
                          {discoveryResult.authorizationEndpoint && (
                            <div
                              className={classes.discoveryEndpoint}
                            >
                              <Typography
                                variant="caption"
                                className={classes.endpointLabel}
                              >
                                Authorization Endpoint
                              </Typography>
                              <Typography
                                variant="caption"
                                className={classes.endpointValue}
                              >
                                {
                                  discoveryResult.authorizationEndpoint
                                }
                              </Typography>
                            </div>
                          )}
                          {discoveryResult.tokenEndpoint && (
                            <div
                              className={classes.discoveryEndpoint}
                            >
                              <Typography
                                variant="caption"
                                className={classes.endpointLabel}
                              >
                                Token Endpoint
                              </Typography>
                              <Typography
                                variant="caption"
                                className={classes.endpointValue}
                              >
                                {discoveryResult.tokenEndpoint}
                              </Typography>
                            </div>
                          )}
                          {discoveryResult.userInfoEndpoint && (
                            <div
                              className={classes.discoveryEndpoint}
                            >
                              <Typography
                                variant="caption"
                                className={classes.endpointLabel}
                              >
                                UserInfo Endpoint
                              </Typography>
                              <Typography
                                variant="caption"
                                className={classes.endpointValue}
                              >
                                {discoveryResult.userInfoEndpoint}
                              </Typography>
                            </div>
                          )}
                          {discoveryResult.jwksURI && (
                            <div
                              className={classes.discoveryEndpoint}
                            >
                              <Typography
                                variant="caption"
                                className={classes.endpointLabel}
                              >
                                JWKS URI
                              </Typography>
                              <Typography
                                variant="caption"
                                className={classes.endpointValue}
                              >
                                {discoveryResult.jwksURI}
                              </Typography>
                            </div>
                          )}
                        </Box>
                      )}
                    </div>
                  )}

                  <TextField
                    className={classes.formField}
                    label="Client ID"
                    helperText="The OAuth 2.0 client ID."
                    value={formData.clientID}
                    onChange={e =>
                      updateField('clientID', e.target.value)
                    }
                    fullWidth
                    required
                    margin="dense"
                  />
                  <TextField
                    className={classes.formField}
                    label="Client Secret"
                    type="password"
                    helperText="The OAuth 2.0 client secret. Stored securely in a Kubernetes Secret."
                    value={formData.clientSecret}
                    onChange={e =>
                      updateField('clientSecret', e.target.value)
                    }
                    fullWidth
                    required
                    margin="dense"
                  />
                </div>
              </Grid>

              <Grid item xs={12} md={6}>
                <div className={classes.formSection}>
                  <Typography variant="subtitle2" gutterBottom>
                    Scopes and Claims
                  </Typography>
                  <TextField
                    className={classes.formField}
                    label="Scopes"
                    helperText="Comma-separated list of OIDC scopes to request."
                    value={formData.scopes}
                    onChange={e =>
                      updateField('scopes', e.target.value)
                    }
                    fullWidth
                    margin="dense"
                  />
                  <Box mb={2}>
                    {formData.scopes
                      .split(',')
                      .map(s => s.trim())
                      .filter(Boolean)
                      .map(scope => (
                        <Chip
                          key={scope}
                          label={scope}
                          size="small"
                          variant="outlined"
                          style={{ marginRight: 4, marginBottom: 4 }}
                        />
                      ))}
                  </Box>
                  <TextField
                    className={classes.formField}
                    label="Email Claim"
                    helperText="The JWT claim that contains the user's email address."
                    value={formData.emailClaim}
                    onChange={e =>
                      updateField('emailClaim', e.target.value)
                    }
                    fullWidth
                    margin="dense"
                  />
                  <TextField
                    className={classes.formField}
                    label="Groups Claim"
                    helperText="The JWT claim that contains the user's group memberships. Leave empty if not applicable."
                    value={formData.groupsClaim}
                    onChange={e =>
                      updateField('groupsClaim', e.target.value)
                    }
                    fullWidth
                    margin="dense"
                  />
                </div>

                <Divider />

                <div className={classes.formSection}>
                  <Box mt={2}>
                    <Typography variant="subtitle2" gutterBottom>
                      Advanced
                    </Typography>
                  </Box>
                  <TextField
                    className={classes.formField}
                    label="Redirect URL"
                    helperText="The OAuth 2.0 redirect URI. If left empty, the platform default will be used."
                    value={formData.redirectURL}
                    onChange={e =>
                      updateField('redirectURL', e.target.value)
                    }
                    fullWidth
                    margin="dense"
                  />
                </div>
              </Grid>
            </Grid>

            <Divider />

            <div className={classes.actions}>
              <Button
                onClick={() => navigate('../identity-providers')}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                color="primary"
                variant="contained"
                disabled={submitting}
              >
                {submitting ? 'Creating...' : 'Create Identity Provider'}
              </Button>
            </div>
          </InfoCard>
        </Box>
      )}
    </div>
  );
};
