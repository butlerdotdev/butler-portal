// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { alertApiRef, useApi } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';

import { butlerApiRef } from '../../api/ButlerApi';
import type {
  CreateProviderRequest,
  ValidateResponse,
} from '../../api/types/providers';
import { useButlerRoutes } from '../../hooks/useButlerRoutes';
import { useTeamContext } from '../../hooks/useTeamContext';
import { butlerTokens, rgb } from '../../theme';
import {
  ButlerButton,
  ButlerCard,
  ButlerCheckbox,
  ButlerEmptyState,
  ButlerField,
  ButlerFileButton,
  ButlerFormFooter,
  ButlerFormMessage,
  ButlerFormSection,
  ButlerInput,
  ButlerInsetPanel,
  ButlerPageHeader,
  ButlerRadioTile,
  ButlerRadioTileGroup,
  ButlerSegmented,
  ButlerSpinner,
  ButlerStack,
  ButlerTextarea,
  CheckIcon,
  XIcon,
} from '../ui';
import { ProviderIcon } from './ProviderIcon';

type ProviderType = CreateProviderRequest['provider'];
type ProxmoxAuthType = 'password' | 'token';

const ON_PREM_TYPES: ProviderType[] = ['harvester', 'nutanix', 'proxmox'];

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  return {
    page: {
      maxWidth: 576,
      margin: '0 auto',
    },
    card: {
      padding: 24,
      display: 'flex',
      flexDirection: 'column',
      gap: 24,
    },
    groupLabel: {
      display: 'block',
      marginBottom: 8,
      fontSize: 14,
      lineHeight: '20px',
      fontWeight: 500,
      color: t.text.muted,
    },
    tileLabel: { textTransform: 'capitalize' },
    grid2: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: 16,
    },
    grid3: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      gap: 16,
    },
    span2: { gridColumn: 'span 2' },
    result: { marginTop: 12 },
    resultValid: { color: rgb(p.green[400]) },
    resultInvalid: { color: rgb(p.red[400]) },
    testingLabel: { display: 'inline-flex', alignItems: 'center', gap: 8 },
  };
});

export const CreateProviderPage = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const alertApi = useApi(alertApiRef);
  const navigate = useNavigate();
  const routes = useButlerRoutes();
  const { isAdmin: canMutate } = useTeamContext();

  const [providerType, setProviderType] = useState<ProviderType>('harvester');
  const [name, setName] = useState('');
  const [namespace, setNamespace] = useState('butler-system');

  const [kubeconfig, setKubeconfig] = useState('');

  const [nutanixEndpoint, setNutanixEndpoint] = useState('');
  const [nutanixPort, setNutanixPort] = useState(9440);
  const [nutanixUsername, setNutanixUsername] = useState('');
  const [nutanixPassword, setNutanixPassword] = useState('');
  const [nutanixInsecure, setNutanixInsecure] = useState(false);

  const [proxmoxEndpoint, setProxmoxEndpoint] = useState('');
  const [proxmoxAuthType, setProxmoxAuthType] =
    useState<ProxmoxAuthType>('password');
  const [proxmoxUsername, setProxmoxUsername] = useState('');
  const [proxmoxPassword, setProxmoxPassword] = useState('');
  const [proxmoxTokenId, setProxmoxTokenId] = useState('');
  const [proxmoxTokenSecret, setProxmoxTokenSecret] = useState('');
  const [proxmoxInsecure, setProxmoxInsecure] = useState(false);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ValidateResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goBack = () => navigate(routes.adminProviders());

  // Credential edits invalidate a previous test result, as in the console.
  const credential =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setter(v);
      setTestResult(null);
    };

  const buildRequest = (): CreateProviderRequest | null => {
    if (!name) {
      setError('Provider name is required');
      return null;
    }
    if (providerType === 'harvester' && !kubeconfig) {
      setError('Kubeconfig is required for Harvester');
      return null;
    }
    if (providerType === 'nutanix') {
      if (!nutanixEndpoint) {
        setError('Endpoint is required');
        return null;
      }
      if (!nutanixUsername || !nutanixPassword) {
        setError('Username and password are required');
        return null;
      }
    }
    if (providerType === 'proxmox') {
      if (!proxmoxEndpoint) {
        setError('Endpoint is required');
        return null;
      }
      if (
        proxmoxAuthType === 'password' &&
        (!proxmoxUsername || !proxmoxPassword)
      ) {
        setError('Username and password are required');
        return null;
      }
      if (
        proxmoxAuthType === 'token' &&
        (!proxmoxTokenId || !proxmoxTokenSecret)
      ) {
        setError('Token ID and secret are required');
        return null;
      }
    }

    const request: CreateProviderRequest = {
      name: name.trim(),
      namespace: namespace.trim() || undefined,
      provider: providerType,
    };
    if (providerType === 'harvester') {
      request.harvesterKubeconfig = kubeconfig;
    } else if (providerType === 'nutanix') {
      request.nutanixEndpoint = nutanixEndpoint.trim();
      request.nutanixPort = nutanixPort;
      request.nutanixUsername = nutanixUsername.trim();
      request.nutanixPassword = nutanixPassword;
      request.nutanixInsecure = nutanixInsecure;
    } else if (providerType === 'proxmox') {
      request.proxmoxEndpoint = proxmoxEndpoint.trim();
      request.proxmoxInsecure = proxmoxInsecure;
      if (proxmoxAuthType === 'password') {
        request.proxmoxUsername = proxmoxUsername.trim();
        request.proxmoxPassword = proxmoxPassword;
      } else {
        request.proxmoxTokenId = proxmoxTokenId.trim();
        request.proxmoxTokenSecret = proxmoxTokenSecret;
      }
    }
    return request;
  };

  const canTest = () => {
    if (providerType === 'harvester') return !!kubeconfig;
    if (providerType === 'nutanix') {
      return !!(nutanixEndpoint && nutanixUsername && nutanixPassword);
    }
    if (!proxmoxEndpoint) return false;
    if (proxmoxAuthType === 'password') {
      return !!(proxmoxUsername && proxmoxPassword);
    }
    return !!(proxmoxTokenId && proxmoxTokenSecret);
  };

  const handleTestConnection = async () => {
    setError(null);
    setTestResult(null);
    const request = buildRequest();
    if (!request) return;
    setTesting(true);
    try {
      const result = await api.testProviderConnection(request);
      setTestResult(result);
      alertApi.post({
        message: result.valid
          ? `Connection Successful: ${result.message}`
          : `Connection Failed: ${result.message}`,
        severity: result.valid ? 'success' : 'error',
        display: 'transient',
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Connection test failed';
      setTestResult({ valid: false, message });
      alertApi.post({
        message: `Test Failed: ${message}`,
        severity: 'error',
        display: 'transient',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const request = buildRequest();
    if (!request) return;
    setSubmitting(true);
    try {
      await api.createProvider(request);
      alertApi.post({
        message: `Provider Created: ${request.name} has been created`,
        severity: 'success',
        display: 'transient',
      });
      goBack();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to create provider';
      setError(message);
      alertApi.post({
        message: `Creation Failed: ${message}`,
        severity: 'error',
        display: 'transient',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!canMutate) {
    return (
      <ButlerStack className={classes.page}>
        <ButlerPageHeader
          title="Add Provider"
          subtitle="Configure connection to an infrastructure provider"
        />
        <ButlerEmptyState
          title="Read-Only Access"
          description="You do not have permission to create providers."
          action={
            <ButlerButton variant="secondary" onClick={goBack}>
              Back to Providers
            </ButlerButton>
          }
        />
      </ButlerStack>
    );
  }

  return (
    <ButlerStack className={classes.page}>
      <ButlerPageHeader
        title="Add Provider"
        subtitle="Configure connection to an infrastructure provider"
      />

      <form onSubmit={handleSubmit} noValidate>
        <ButlerCard flush className={classes.card}>
          <div>
            <span className={classes.groupLabel} id="provider-type-label">
              On-Premises
            </span>
            <ButlerRadioTileGroup aria-labelledby="provider-type-label">
              {ON_PREM_TYPES.map(type => (
                <ButlerRadioTile
                  key={type}
                  selected={providerType === type}
                  onSelect={() => {
                    setProviderType(type);
                    setTestResult(null);
                    setError(null);
                  }}
                  icon={<ProviderIcon type={type} />}
                  label={<span className={classes.tileLabel}>{type}</span>}
                />
              ))}
            </ButlerRadioTileGroup>
          </div>

          <div className={classes.grid2}>
            <ButlerField label="Provider Name" required htmlFor="provider-name">
              <ButlerInput
                id="provider-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={`my-${providerType}`}
              />
            </ButlerField>
            <ButlerField label="Namespace" htmlFor="provider-namespace">
              <ButlerInput
                id="provider-namespace"
                value={namespace}
                onChange={e => setNamespace(e.target.value)}
              />
            </ButlerField>
          </div>

          {providerType === 'harvester' && (
            <ButlerFormSection title="Harvester Credentials">
              <ButlerField
                label="Kubeconfig"
                required
                htmlFor="harvester-kubeconfig"
                help="Upload your Harvester cluster kubeconfig file or paste the contents below"
                helpAbove
              >
                <ButlerFileButton onText={credential(setKubeconfig)}>
                  Upload kubeconfig file
                </ButlerFileButton>
                <ButlerTextarea
                  id="harvester-kubeconfig"
                  mono
                  rows={8}
                  value={kubeconfig}
                  onChange={e => credential(setKubeconfig)(e.target.value)}
                  placeholder="Paste kubeconfig contents here..."
                />
              </ButlerField>
            </ButlerFormSection>
          )}

          {providerType === 'nutanix' && (
            <ButlerFormSection title="Nutanix Connection">
              <div className={classes.grid3}>
                <ButlerField
                  label="Prism Central Endpoint"
                  required
                  htmlFor="nutanix-endpoint"
                  className={classes.span2}
                >
                  <ButlerInput
                    id="nutanix-endpoint"
                    value={nutanixEndpoint}
                    onChange={e =>
                      credential(setNutanixEndpoint)(e.target.value)
                    }
                    placeholder="https://prism.example.com"
                  />
                </ButlerField>
                <ButlerField label="Port" htmlFor="nutanix-port">
                  <ButlerInput
                    id="nutanix-port"
                    type="number"
                    value={nutanixPort}
                    onChange={e =>
                      setNutanixPort(parseInt(e.target.value, 10) || 9440)
                    }
                  />
                </ButlerField>
              </div>
              <div className={classes.grid2}>
                <ButlerField label="Username" required htmlFor="nutanix-user">
                  <ButlerInput
                    id="nutanix-user"
                    value={nutanixUsername}
                    onChange={e =>
                      credential(setNutanixUsername)(e.target.value)
                    }
                    placeholder="admin@example.com"
                  />
                </ButlerField>
                <ButlerField label="Password" required htmlFor="nutanix-pass">
                  <ButlerInput
                    id="nutanix-pass"
                    type="password"
                    value={nutanixPassword}
                    onChange={e =>
                      credential(setNutanixPassword)(e.target.value)
                    }
                    placeholder="••••••••"
                  />
                </ButlerField>
              </div>
              <ButlerCheckbox
                label="Allow insecure TLS (skip certificate verification)"
                checked={nutanixInsecure}
                onChange={e => setNutanixInsecure(e.target.checked)}
              />
            </ButlerFormSection>
          )}

          {providerType === 'proxmox' && (
            <ButlerFormSection title="Proxmox Connection">
              <ButlerField
                label="Proxmox Endpoint"
                required
                htmlFor="proxmox-endpoint"
              >
                <ButlerInput
                  id="proxmox-endpoint"
                  value={proxmoxEndpoint}
                  onChange={e => credential(setProxmoxEndpoint)(e.target.value)}
                  placeholder="https://pve.example.com:8006"
                />
              </ButlerField>
              <ButlerField label="Authentication Method">
                <ButlerSegmented<ProxmoxAuthType>
                  aria-label="Authentication Method"
                  value={proxmoxAuthType}
                  onChange={setProxmoxAuthType}
                  options={[
                    { value: 'password', label: 'Username/Password' },
                    { value: 'token', label: 'API Token' },
                  ]}
                />
              </ButlerField>
              {proxmoxAuthType === 'password' ? (
                <div className={classes.grid2}>
                  <ButlerField label="Username" required htmlFor="proxmox-user">
                    <ButlerInput
                      id="proxmox-user"
                      value={proxmoxUsername}
                      onChange={e =>
                        credential(setProxmoxUsername)(e.target.value)
                      }
                      placeholder="root@pam"
                    />
                  </ButlerField>
                  <ButlerField label="Password" required htmlFor="proxmox-pass">
                    <ButlerInput
                      id="proxmox-pass"
                      type="password"
                      value={proxmoxPassword}
                      onChange={e =>
                        credential(setProxmoxPassword)(e.target.value)
                      }
                      placeholder="••••••••"
                    />
                  </ButlerField>
                </div>
              ) : (
                <div className={classes.grid2}>
                  <ButlerField
                    label="Token ID"
                    required
                    htmlFor="proxmox-token"
                  >
                    <ButlerInput
                      id="proxmox-token"
                      value={proxmoxTokenId}
                      onChange={e =>
                        credential(setProxmoxTokenId)(e.target.value)
                      }
                      placeholder="user@pam!tokenname"
                    />
                  </ButlerField>
                  <ButlerField
                    label="Token Secret"
                    required
                    htmlFor="proxmox-secret"
                  >
                    <ButlerInput
                      id="proxmox-secret"
                      type="password"
                      value={proxmoxTokenSecret}
                      onChange={e =>
                        credential(setProxmoxTokenSecret)(e.target.value)
                      }
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    />
                  </ButlerField>
                </div>
              )}
              <ButlerCheckbox
                label="Allow insecure TLS (skip certificate verification)"
                checked={proxmoxInsecure}
                onChange={e => setProxmoxInsecure(e.target.checked)}
              />
            </ButlerFormSection>
          )}

          <ButlerInsetPanel
            title="Test Connection"
            description="Verify credentials before saving"
            action={
              <ButlerButton
                variant="secondary"
                onClick={handleTestConnection}
                disabled={!canTest() || testing}
              >
                {testing ? (
                  <span className={classes.testingLabel}>
                    <ButlerSpinner small />
                    Testing...
                  </span>
                ) : (
                  'Test Connection'
                )}
              </ButlerButton>
            }
          >
            {testResult && (
              <ButlerFormMessage
                tone={testResult.valid ? 'success' : 'danger'}
                icon={testResult.valid ? <CheckIcon size={20} /> : <XIcon />}
              >
                {testResult.message}
              </ButlerFormMessage>
            )}
          </ButlerInsetPanel>

          <ButlerFormMessage tone="info">
            <strong>Note:</strong> Infrastructure settings like subnets, images,
            and storage are configured per-cluster when you create a
            TenantCluster.
          </ButlerFormMessage>

          {error && <ButlerFormMessage>{error}</ButlerFormMessage>}

          <ButlerFormFooter>
            <ButlerButton variant="secondary" onClick={goBack}>
              Cancel
            </ButlerButton>
            <ButlerButton type="submit" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Provider'}
            </ButlerButton>
          </ButlerFormFooter>
        </ButlerCard>
      </form>
    </ButlerStack>
  );
};
