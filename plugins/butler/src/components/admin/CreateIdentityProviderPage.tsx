// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { alertApiRef, useApi } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';

import { butlerApiRef } from '../../api/ButlerApi';
import {
  PROVIDER_PRESETS,
  type CreateIdentityProviderRequest,
  type ProviderPresetKey,
  type TestDiscoveryResponse,
} from '../../api/types/identity-providers';
import { useButlerRoutes } from '../../hooks/useButlerRoutes';
import { useTeamContext } from '../../hooks/useTeamContext';
import { butlerTokens, rgb } from '../../theme';
import {
  ButlerButton,
  ButlerCard,
  ButlerEmptyState,
  ButlerIconButton,
  ButlerInput,
  ButlerPageHeader,
  ButlerStack,
  ChevronLeftIcon,
} from '../ui';
import {
  ButlerField,
  ButlerFormFooter,
  ButlerFormMessage,
  ButlerFormSection,
} from '../ui/ButlerFormSection';
import { ButlerOptionRow } from '../ui/ButlerRadioTile';
import {
  GoogleIcon,
  MicrosoftIcon,
  OidcKeyIcon,
  OktaIcon,
} from './IdentityProviderIcons';

type PresetOption = ProviderPresetKey | 'custom';

interface PresetConfig {
  key: PresetOption;
  name: string;
  icon: ReactNode;
  description: string;
}

// Same four choices as the console's step 1; Auth0 and Keycloak presets
// in PROVIDER_PRESETS are reachable through Custom OIDC.
const PRESET_OPTIONS: PresetConfig[] = [
  {
    key: 'google',
    name: 'Google Workspace',
    icon: <GoogleIcon />,
    description: 'Sign in with Google accounts',
  },
  {
    key: 'microsoft',
    name: 'Microsoft Entra ID',
    icon: <MicrosoftIcon />,
    description: 'Sign in with Microsoft/Azure AD',
  },
  {
    key: 'okta',
    name: 'Okta',
    icon: <OktaIcon />,
    description: 'Sign in with Okta',
  },
  {
    key: 'custom',
    name: 'Custom OIDC',
    icon: <OidcKeyIcon />,
    description: 'Any OIDC-compliant provider',
  },
];

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  return {
    page: { maxWidth: 672, margin: '0 auto' },
    options: { display: 'grid', gap: 12 },
    stepHeader: { display: 'flex', alignItems: 'center', gap: 16 },
    stepIdentity: { display: 'flex', alignItems: 'center', gap: 12 },
    iconTile: {
      width: 40,
      height: 40,
      borderRadius: t.radius.lg,
      backgroundColor: rgb(p.neutral[800]),
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    stepTitle: {
      margin: 0,
      fontSize: 20,
      lineHeight: '28px',
      fontWeight: 600,
      color: t.text.primary,
    },
    stepSubtitle: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.subtle,
    },
    card: {
      padding: 24,
      display: 'flex',
      flexDirection: 'column',
      gap: 24,
    },
    discoveryRow: { display: 'flex', alignItems: 'center', gap: 8 },
    discoveryText: { fontSize: 14, lineHeight: '20px' },
    discoveryValid: { color: rgb(p.green[400]) },
    discoveryInvalid: { color: rgb(p.red[400]) },
  };
});

export const CreateIdentityProviderPage = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const alertApi = useApi(alertApiRef);
  const routes = useButlerRoutes();
  const navigate = useNavigate();
  const { isAdmin: canMutate } = useTeamContext();

  const [selectedPreset, setSelectedPreset] = useState<PresetOption | null>(
    null,
  );
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [issuerURL, setIssuerURL] = useState('');
  const [clientID, setClientID] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [redirectURL, setRedirectURL] = useState('');
  const [hostedDomain, setHostedDomain] = useState('');
  const [scopes, setScopes] = useState('');
  const [groupsClaim, setGroupsClaim] = useState('');
  const [emailClaim, setEmailClaim] = useState('');

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestDiscoveryResponse | null>(
    null,
  );
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goBack = () => navigate(routes.adminIdentityProviders());

  const handlePresetSelect = (preset: PresetOption) => {
    setSelectedPreset(preset);
    setTestResult(null);
    setError(null);
    if (preset !== 'custom' && preset in PROVIDER_PRESETS) {
      const config = PROVIDER_PRESETS[preset];
      setDisplayName(config.name);
      setIssuerURL(config.issuerURL);
      setScopes(config.scopes.join(', '));
      setGroupsClaim(config.groupsClaim);
      setEmailClaim(config.emailClaim);
    } else {
      setDisplayName('');
      setIssuerURL('');
      setScopes('openid, email, profile');
      setGroupsClaim('groups');
      setEmailClaim('email');
    }
  };

  const handleTestDiscovery = async () => {
    if (!issuerURL) {
      setError('Issuer URL is required');
      return;
    }
    setTesting(true);
    setError(null);
    setTestResult(null);
    try {
      const result = await api.testIdPDiscovery(issuerURL);
      setTestResult(result);
      if (!result.valid) setError(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Discovery failed');
      setTestResult({ valid: false, message: 'Discovery failed' });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name) {
      setError('Name is required');
      return;
    }
    if (!issuerURL) {
      setError('Issuer URL is required');
      return;
    }
    if (!clientID) {
      setError('Client ID is required');
      return;
    }
    if (!clientSecret) {
      setError('Client Secret is required');
      return;
    }
    if (!redirectURL) {
      setError('Redirect URL is required');
      return;
    }
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(name)) {
      setError(
        'Name must be lowercase alphanumeric with hyphens (e.g., "google-workspace")',
      );
      return;
    }

    setCreating(true);
    try {
      const request: CreateIdentityProviderRequest = {
        name,
        displayName: displayName || undefined,
        issuerURL,
        clientID,
        clientSecret,
        redirectURL,
        hostedDomain: hostedDomain || undefined,
        scopes: scopes
          ? scopes
              .split(',')
              .map(s => s.trim())
              .filter(Boolean)
          : undefined,
        groupsClaim: groupsClaim || undefined,
        emailClaim: emailClaim || undefined,
      };
      await api.createIdentityProvider(request);
      alertApi.post({
        message: `Created identity provider "${displayName || name}"`,
        severity: 'success',
        display: 'transient',
      });
      goBack();
    } catch (err) {
      let message = 'Failed to create identity provider';
      if (err && typeof err === 'object' && 'message' in err) {
        message = String((err as Error).message);
      }
      if (
        err &&
        typeof err === 'object' &&
        'status' in err &&
        (err as { status?: number }).status === 409
      ) {
        message += ' You can delete it from the Identity Providers list page.';
      }
      setError(message);
    } finally {
      setCreating(false);
    }
  };

  if (!canMutate) {
    return (
      <ButlerStack className={classes.page}>
        <ButlerPageHeader
          title="Add Identity Provider"
          subtitle="Configure SSO authentication for Butler Console"
        />
        <ButlerEmptyState
          title="Read-Only Access"
          description="You do not have permission to create identity providers."
          action={
            <ButlerButton variant="secondary" onClick={goBack}>
              Back to Identity Providers
            </ButlerButton>
          }
        />
      </ButlerStack>
    );
  }

  if (!selectedPreset) {
    return (
      <ButlerStack className={classes.page}>
        <ButlerPageHeader
          title="Add Identity Provider"
          subtitle="Select the type of identity provider you want to configure"
        />
        <div className={classes.options}>
          {PRESET_OPTIONS.map(preset => (
            <ButlerOptionRow
              key={preset.key}
              icon={preset.icon}
              title={preset.name}
              description={preset.description}
              onClick={() => handlePresetSelect(preset.key)}
            />
          ))}
        </div>
        <div>
          <ButlerButton variant="secondary" onClick={goBack}>
            Cancel
          </ButlerButton>
        </div>
      </ButlerStack>
    );
  }

  const presetConfig = PRESET_OPTIONS.find(p => p.key === selectedPreset);
  const issuerHelp =
    selectedPreset === 'microsoft'
      ? 'Replace {tenant} with your Azure tenant ID'
      : selectedPreset === 'okta'
      ? 'Replace {domain} with your Okta domain'
      : 'The OIDC issuer URL (must support .well-known/openid-configuration)';

  return (
    <ButlerStack className={classes.page}>
      <div className={classes.stepHeader}>
        <ButlerIconButton
          aria-label="Back to provider types"
          onClick={() => setSelectedPreset(null)}
        >
          <ChevronLeftIcon />
        </ButlerIconButton>
        <div className={classes.stepIdentity}>
          <div className={classes.iconTile}>{presetConfig?.icon}</div>
          <div>
            <h1 className={classes.stepTitle}>
              Configure {presetConfig?.name}
            </h1>
            <p className={classes.stepSubtitle}>
              Enter your OIDC configuration details
            </p>
          </div>
        </div>
      </div>

      {error && <ButlerFormMessage>{error}</ButlerFormMessage>}

      <form onSubmit={handleSubmit} noValidate>
        <ButlerCard flush className={classes.card}>
          <ButlerFormSection title="Basic Information" uppercase>
            <ButlerField
              label="Name"
              required
              htmlFor="idp-name"
              help="Unique identifier (lowercase, alphanumeric, hyphens only)"
            >
              <ButlerInput
                id="idp-name"
                value={name}
                onChange={e =>
                  setName(
                    e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                  )
                }
                placeholder="google-workspace"
              />
            </ButlerField>
            <ButlerField
              label="Display Name"
              htmlFor="idp-display-name"
              help="Shown on the login button"
            >
              <ButlerInput
                id="idp-display-name"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Google Workspace"
              />
            </ButlerField>
          </ButlerFormSection>

          <ButlerFormSection title="OIDC Configuration" uppercase>
            <ButlerField
              label="Issuer URL"
              required
              htmlFor="idp-issuer"
              help={issuerHelp}
            >
              <ButlerInput
                id="idp-issuer"
                value={issuerURL}
                onChange={e => {
                  setIssuerURL(e.target.value);
                  setTestResult(null);
                }}
                placeholder="https://accounts.google.com"
              />
            </ButlerField>
            <div className={classes.discoveryRow}>
              <ButlerButton
                variant="secondary"
                size="sm"
                onClick={handleTestDiscovery}
                disabled={!issuerURL || testing}
              >
                {testing ? 'Testing...' : 'Test Discovery'}
              </ButlerButton>
              {testResult && (
                <span
                  className={clsx(
                    classes.discoveryText,
                    testResult.valid
                      ? classes.discoveryValid
                      : classes.discoveryInvalid,
                  )}
                  role="status"
                >
                  {testResult.valid
                    ? 'Discovery successful'
                    : 'Discovery failed'}
                </span>
              )}
            </div>
            <ButlerField
              label="Client ID"
              required
              htmlFor="idp-client-id"
              help="OAuth2 Client ID from your identity provider"
            >
              <ButlerInput
                id="idp-client-id"
                value={clientID}
                onChange={e => setClientID(e.target.value)}
                placeholder="your-client-id"
              />
            </ButlerField>
            <ButlerField
              label="Client Secret"
              required
              htmlFor="idp-client-secret"
              help="OAuth2 Client Secret (stored securely as a Kubernetes Secret)"
            >
              <ButlerInput
                id="idp-client-secret"
                type="password"
                value={clientSecret}
                onChange={e => setClientSecret(e.target.value)}
                placeholder="••••••••••••••••"
              />
            </ButlerField>
            <ButlerField
              label="Redirect URL"
              required
              htmlFor="idp-redirect"
              help="Must match the redirect URI in your identity provider settings"
            >
              <ButlerInput
                id="idp-redirect"
                value={redirectURL}
                onChange={e => setRedirectURL(e.target.value)}
                placeholder="https://butler.example.com/api/auth/callback"
              />
            </ButlerField>
            {selectedPreset === 'google' && (
              <ButlerField
                label="Hosted Domain (Optional)"
                htmlFor="idp-hosted-domain"
                help="Restrict login to a specific Google Workspace domain"
              >
                <ButlerInput
                  id="idp-hosted-domain"
                  value={hostedDomain}
                  onChange={e => setHostedDomain(e.target.value)}
                  placeholder="example.com"
                />
              </ButlerField>
            )}
          </ButlerFormSection>

          <ButlerFormSection
            title="Advanced Options"
            uppercase
            collapsible
            bordered
          >
            <ButlerField
              label="Scopes"
              htmlFor="idp-scopes"
              help="Comma-separated OAuth2 scopes to request"
            >
              <ButlerInput
                id="idp-scopes"
                value={scopes}
                onChange={e => setScopes(e.target.value)}
                placeholder="openid, email, profile"
              />
            </ButlerField>
            <ButlerField
              label="Groups Claim"
              htmlFor="idp-groups-claim"
              help="JWT claim containing group memberships (leave empty to disable)"
            >
              <ButlerInput
                id="idp-groups-claim"
                value={groupsClaim}
                onChange={e => setGroupsClaim(e.target.value)}
                placeholder="groups"
              />
            </ButlerField>
            <ButlerField
              label="Email Claim"
              htmlFor="idp-email-claim"
              help="JWT claim containing the user's email"
            >
              <ButlerInput
                id="idp-email-claim"
                value={emailClaim}
                onChange={e => setEmailClaim(e.target.value)}
                placeholder="email"
              />
            </ButlerField>
          </ButlerFormSection>

          <ButlerFormFooter>
            <ButlerButton
              variant="secondary"
              onClick={goBack}
              disabled={creating}
            >
              Cancel
            </ButlerButton>
            <ButlerButton type="submit" disabled={creating}>
              {creating ? 'Creating...' : 'Create Provider'}
            </ButlerButton>
          </ButlerFormFooter>
        </ButlerCard>
      </form>
    </ButlerStack>
  );
};
