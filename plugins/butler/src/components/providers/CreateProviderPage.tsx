// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { alertApiRef, useApi } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';

import { butlerApiRef } from '../../api/ButlerApi';
import { extractWebhookDenial } from '../../api/ButlerApiError';
import type { ProviderType, ValidateResponse } from '../../api/types/providers';
import { useButlerRoutes } from '../../hooks/useButlerRoutes';
import { useTeamContext } from '../../hooks/useTeamContext';
import { butlerTokens, rgb } from '../../theme';
import {
  CLOUD_TYPES,
  EMPTY_PROVIDER_FORM,
  ON_PREM_TYPES,
  PROVIDER_LABELS,
  buildCreateProviderRequest,
  describeValidation,
  isCredentialField,
  validateProviderForm,
  type ProviderFormValues,
} from '../../utils/providerRequest';
import {
  ButlerButton,
  ButlerCard,
  ButlerCheckbox,
  ButlerDisclosure,
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

type ProxmoxAuthType = 'password' | 'token';

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
    stack: { display: 'flex', flexDirection: 'column', gap: 16 },
    result: { marginTop: 12 },
    resultValid: { color: rgb(p.green[400]) },
    resultInvalid: { color: rgb(p.red[400]) },
    testingLabel: { display: 'inline-flex', alignItems: 'center', gap: 8 },
  };
});

/**
 * Creates a platform provider through butler-server's provider control
 * plane. Credentials go to the server once, which stores them in a Secret
 * and records only the reference on the ProviderConfig; the page never
 * reads them back. Test and create send the same request, so what was
 * tested is what gets saved.
 */
export const CreateProviderPage = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const alertApi = useApi(alertApiRef);
  const navigate = useNavigate();
  const routes = useButlerRoutes();
  const { isAdmin: canMutate } = useTeamContext();

  const [form, setForm] = useState<ProviderFormValues>(EMPTY_PROVIDER_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [proxmoxAuthType, setProxmoxAuthType] =
    useState<ProxmoxAuthType>('password');

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ValidateResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goBack = () => navigate(routes.adminProviders());

  const set = <K extends keyof ProviderFormValues>(
    key: K,
    value: ProviderFormValues[K],
  ) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setFieldErrors(prev => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    // Credential edits invalidate a previous test result, as in the console.
    if (isCredentialField(key) || key === 'provider') setTestResult(null);
  };

  const selectType = (type: ProviderType) => {
    set('provider', type);
    setError(null);
  };

  /** The proxmox auth method the user did not pick is dropped on send. */
  const effectiveForm = (): ProviderFormValues => {
    if (form.provider !== 'proxmox') return form;
    return proxmoxAuthType === 'password'
      ? { ...form, proxmoxTokenId: '', proxmoxTokenSecret: '' }
      : { ...form, proxmoxUsername: '', proxmoxPassword: '' };
  };

  const buildRequest = () => {
    const values = effectiveForm();
    const problems = validateProviderForm(values, 'create');
    if (Object.keys(problems).length > 0) {
      setFieldErrors(problems);
      setError(Object.values(problems)[0]);
      return null;
    }
    return buildCreateProviderRequest(values);
  };

  const canTest = () => {
    const f = effectiveForm();
    switch (f.provider) {
      case 'harvester':
        return !!f.harvesterKubeconfig;
      case 'nutanix':
        return !!(f.nutanixEndpoint && f.nutanixUsername && f.nutanixPassword);
      case 'proxmox':
        if (!f.proxmoxEndpoint) return false;
        return proxmoxAuthType === 'password'
          ? !!(f.proxmoxUsername && f.proxmoxPassword)
          : !!(f.proxmoxTokenId && f.proxmoxTokenSecret);
      case 'aws':
        return !!(f.awsRegion && f.awsAccessKeyId && f.awsSecretAccessKey);
      case 'azure':
        return !!(
          f.azureSubscriptionId &&
          f.azureTenantId &&
          f.azureClientId &&
          f.azureClientSecret
        );
      case 'gcp':
        return !!(f.gcpProjectId && f.gcpServiceAccount);
      default:
        return false;
    }
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
      const described = describeValidation(result);
      alertApi.post({
        message: `${described.headline}: ${described.detail}`,
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
      const message = extractWebhookDenial(
        err instanceof Error ? err.message : 'Failed to create provider',
      );
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

  const text = (
    key: keyof ProviderFormValues,
    label: string,
    opts?: {
      required?: boolean;
      secret?: boolean;
      mono?: boolean;
      placeholder?: string;
      help?: string;
      className?: string;
      type?: 'text' | 'number';
    },
  ): ReactNode => {
    const id = `provider-${key}`;
    return (
      <ButlerField
        label={label}
        required={opts?.required}
        htmlFor={id}
        help={opts?.help}
        error={fieldErrors[key]}
        className={opts?.className}
      >
        <ButlerInput
          id={id}
          type={opts?.secret ? 'password' : opts?.type ?? 'text'}
          value={String(form[key] ?? '')}
          onChange={ev => set(key, ev.target.value as never)}
          placeholder={opts?.placeholder}
          mono={opts?.mono}
          autoComplete={opts?.secret ? 'new-password' : undefined}
        />
      </ButlerField>
    );
  };

  const typeTiles = (types: ProviderType[]) =>
    types.map(type => (
      <ButlerRadioTile
        key={type}
        selected={form.provider === type}
        onSelect={() => selectType(type)}
        icon={<ProviderIcon type={type} />}
        label={<span className={classes.tileLabel}>{type}</span>}
      />
    ));

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

  const { provider } = form;

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
              {typeTiles(ON_PREM_TYPES)}
            </ButlerRadioTileGroup>
          </div>
          <div>
            <span className={classes.groupLabel} id="provider-cloud-label">
              Cloud
            </span>
            <ButlerRadioTileGroup aria-labelledby="provider-cloud-label">
              {typeTiles(CLOUD_TYPES)}
            </ButlerRadioTileGroup>
          </div>

          <div className={classes.grid2}>
            <ButlerField
              label="Provider Name"
              required
              htmlFor="provider-name"
              error={fieldErrors.name}
            >
              <ButlerInput
                id="provider-name"
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder={`my-${provider}`}
              />
            </ButlerField>
            <ButlerField label="Namespace" htmlFor="provider-namespace">
              <ButlerInput
                id="provider-namespace"
                value={form.namespace}
                onChange={e => set('namespace', e.target.value)}
              />
            </ButlerField>
          </div>

          {provider === 'harvester' && (
            <ButlerFormSection title="Harvester Credentials">
              <ButlerField
                label="Kubeconfig"
                required
                htmlFor="harvester-kubeconfig"
                help="Upload your Harvester cluster kubeconfig file or paste the contents below"
                helpAbove
                error={fieldErrors.harvesterKubeconfig}
              >
                <ButlerFileButton
                  onText={value => set('harvesterKubeconfig', value)}
                >
                  Upload kubeconfig file
                </ButlerFileButton>
                <ButlerTextarea
                  id="harvester-kubeconfig"
                  mono
                  rows={8}
                  value={form.harvesterKubeconfig}
                  onChange={e => set('harvesterKubeconfig', e.target.value)}
                  placeholder="Paste kubeconfig contents here..."
                />
              </ButlerField>
            </ButlerFormSection>
          )}

          {provider === 'nutanix' && (
            <ButlerFormSection title="Nutanix Connection">
              <div className={classes.grid3}>
                {text('nutanixEndpoint', 'Prism Central Endpoint', {
                  required: true,
                  placeholder: 'https://prism.example.com',
                  className: classes.span2,
                })}
                {text('nutanixPort', 'Port', { type: 'number' })}
              </div>
              <div className={classes.grid2}>
                {text('nutanixUsername', 'Username', {
                  required: true,
                  placeholder: 'admin@example.com',
                })}
                {text('nutanixPassword', 'Password', {
                  required: true,
                  secret: true,
                  placeholder: '••••••••',
                })}
              </div>
              <ButlerField
                label="CA Bundle"
                htmlFor="provider-nutanixCABundle"
                help="PEM certificate chain for Prism Central. Optional; can be inspected later from the provider's CA info."
              >
                <ButlerTextarea
                  id="provider-nutanixCABundle"
                  mono
                  rows={4}
                  value={form.nutanixCABundle}
                  onChange={e => set('nutanixCABundle', e.target.value)}
                  placeholder="-----BEGIN CERTIFICATE-----"
                />
              </ButlerField>
              <ButlerCheckbox
                label="Allow insecure TLS (skip certificate verification)"
                description="Set only at creation; it cannot be changed by editing."
                checked={form.nutanixInsecure}
                onChange={e => set('nutanixInsecure', e.target.checked)}
              />
            </ButlerFormSection>
          )}

          {provider === 'proxmox' && (
            <ButlerFormSection title="Proxmox Connection">
              {text('proxmoxEndpoint', 'Proxmox Endpoint', {
                required: true,
                placeholder: 'https://pve.example.com:8006',
              })}
              <ButlerField label="Authentication Method">
                <ButlerSegmented<ProxmoxAuthType>
                  aria-label="Authentication Method"
                  value={proxmoxAuthType}
                  onChange={v => {
                    setProxmoxAuthType(v);
                    setTestResult(null);
                  }}
                  options={[
                    { value: 'password', label: 'Username/Password' },
                    { value: 'token', label: 'API Token' },
                  ]}
                />
              </ButlerField>
              {proxmoxAuthType === 'password' ? (
                <div className={classes.grid2}>
                  {text('proxmoxUsername', 'Username', {
                    required: true,
                    placeholder: 'root@pam',
                  })}
                  {text('proxmoxPassword', 'Password', {
                    required: true,
                    secret: true,
                    placeholder: '••••••••',
                  })}
                </div>
              ) : (
                <div className={classes.grid2}>
                  {text('proxmoxTokenId', 'Token ID', {
                    required: true,
                    placeholder: 'user@pam!tokenname',
                  })}
                  {text('proxmoxTokenSecret', 'Token Secret', {
                    required: true,
                    secret: true,
                    placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
                  })}
                </div>
              )}
              <ButlerCheckbox
                label="Allow insecure TLS (skip certificate verification)"
                description="Set only at creation; it cannot be changed by editing."
                checked={form.proxmoxInsecure}
                onChange={e => set('proxmoxInsecure', e.target.checked)}
              />
            </ButlerFormSection>
          )}

          {provider === 'aws' && (
            <ButlerFormSection title="AWS Credentials">
              <div className={classes.grid2}>
                {text('awsRegion', 'Region', {
                  required: true,
                  mono: true,
                  placeholder: 'us-east-1',
                })}
                {text('awsVpcId', 'VPC ID', {
                  mono: true,
                  placeholder: 'vpc-',
                })}
                {text('awsAccessKeyId', 'Access Key ID', {
                  required: true,
                  mono: true,
                })}
                {text('awsSecretAccessKey', 'Secret Access Key', {
                  required: true,
                  secret: true,
                })}
              </div>
              {text('awsSubnetIds', 'Subnet IDs', {
                mono: true,
                help: 'Comma separated.',
              })}
              {text('awsSecurityGroupIds', 'Security Group IDs', {
                mono: true,
                help: 'Comma separated.',
              })}
            </ButlerFormSection>
          )}

          {provider === 'azure' && (
            <ButlerFormSection title="Azure Credentials">
              <div className={classes.grid2}>
                {text('azureSubscriptionId', 'Subscription ID', {
                  required: true,
                  mono: true,
                })}
                {text('azureTenantId', 'Tenant ID', {
                  required: true,
                  mono: true,
                })}
                {text('azureClientId', 'Client ID', {
                  required: true,
                  mono: true,
                })}
                {text('azureClientSecret', 'Client Secret', {
                  required: true,
                  secret: true,
                })}
                {text('azureResourceGroup', 'Resource Group')}
                {text('azureLocation', 'Location', { placeholder: 'eastus' })}
                {text('azureVnetName', 'VNet Name')}
                {text('azureSubnetName', 'Subnet Name')}
                {text('azureVmSize', 'VM Size', {
                  placeholder: 'Standard_D2s_v3',
                })}
                {text('azureImageUrn', 'Image URN', { mono: true })}
              </div>
            </ButlerFormSection>
          )}

          {provider === 'gcp' && (
            <ButlerFormSection title="GCP Credentials">
              <div className={classes.grid2}>
                {text('gcpProjectId', 'Project ID', {
                  required: true,
                  mono: true,
                })}
                {text('gcpRegion', 'Region', { placeholder: 'us-central1' })}
                {text('gcpZone', 'Zone', { placeholder: 'us-central1-a' })}
                {text('gcpNetwork', 'Network', { placeholder: 'default' })}
                {text('gcpSubnetwork', 'Subnetwork')}
                {text('gcpMachineType', 'Machine Type', {
                  placeholder: 'e2-standard-2',
                })}
                {text('gcpImageProject', 'Image Project')}
                {text('gcpImageFamily', 'Image Family')}
                {text('gcpImage', 'Image')}
                {text('gcpTags', 'Tags', { help: 'Comma separated.' })}
              </div>
              <ButlerField
                label="Service Account Key"
                required
                htmlFor="provider-gcpServiceAccount"
                help="JSON key file contents"
                error={fieldErrors.gcpServiceAccount}
              >
                <ButlerFileButton
                  onText={value => set('gcpServiceAccount', value)}
                >
                  Upload key file
                </ButlerFileButton>
                <ButlerTextarea
                  id="provider-gcpServiceAccount"
                  mono
                  rows={6}
                  value={form.gcpServiceAccount}
                  onChange={e => set('gcpServiceAccount', e.target.value)}
                  placeholder='{ "type": "service_account", ... }'
                />
              </ButlerField>
            </ButlerFormSection>
          )}

          <ButlerDisclosure title="Network" variant="plain">
            <div className={classes.stack}>
              <ButlerField
                label="Network Mode"
                help="IPAM allocates addresses from Butler network pools; cloud leaves addressing to the provider. Leave unset to accept the server default."
              >
                <ButlerSegmented<ProviderFormValues['networkMode']>
                  aria-label="Network Mode"
                  value={form.networkMode}
                  onChange={v => set('networkMode', v)}
                  options={[
                    { value: '', label: 'Default' },
                    { value: 'ipam', label: 'IPAM' },
                    { value: 'cloud', label: 'Cloud' },
                  ]}
                />
              </ButlerField>
              {form.networkMode === 'ipam' && (
                <>
                  {text('poolRefs', 'Network Pools', {
                    required: true,
                    mono: true,
                    placeholder: 'vlan40-underlay:1, spare',
                    help: 'Comma separated pool names, optionally name:priority. Admission refuses IPAM mode without one.',
                  })}
                  <div className={classes.grid2}>
                    {text('networkSubnet', 'Subnet', {
                      mono: true,
                      placeholder: '10.40.0.0/22',
                    })}
                    {text('networkGateway', 'Gateway', {
                      mono: true,
                      placeholder: '10.40.0.1',
                    })}
                  </div>
                  {text('networkDnsServers', 'DNS Servers', {
                    mono: true,
                    help: 'Comma separated.',
                  })}
                  <div className={classes.grid3}>
                    {text('lbDefaultPoolSize', 'LB Pool Size', {
                      type: 'number',
                    })}
                    {text('quotaMaxNodeIPs', 'Max Node IPs / Tenant', {
                      type: 'number',
                    })}
                    {text('quotaMaxLoadBalancerIPs', 'Max LB IPs / Tenant', {
                      type: 'number',
                    })}
                  </div>
                </>
              )}
            </div>
          </ButlerDisclosure>

          <ButlerDisclosure title="Scope" variant="plain">
            <div className={classes.stack}>
              <ButlerField
                label="Visibility"
                help="Platform providers are usable by every team; a team provider is usable only by that team. Scope is fixed once created."
              >
                <ButlerSegmented<ProviderFormValues['scopeType']>
                  aria-label="Visibility"
                  value={form.scopeType}
                  onChange={v => set('scopeType', v)}
                  options={[
                    { value: '', label: 'Default (platform)' },
                    { value: 'platform', label: 'Platform' },
                    { value: 'team', label: 'Team' },
                  ]}
                />
              </ButlerField>
              {form.scopeType === 'team' &&
                text('scopeTeamRef', 'Team', {
                  required: true,
                  placeholder: 'platform-engineering',
                })}
            </div>
          </ButlerDisclosure>

          <ButlerDisclosure title="Limits" variant="plain">
            <div className={classes.grid2}>
              {text('maxClustersPerTeam', 'Max Clusters / Team', {
                type: 'number',
                help: 'Blank for no limit.',
              })}
              {text('maxNodesPerTeam', 'Max Nodes / Team', {
                type: 'number',
                help: 'Blank for no limit.',
              })}
            </div>
          </ButlerDisclosure>

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
                <strong>{describeValidation(testResult).headline}.</strong>{' '}
                {describeValidation(testResult).detail}
              </ButlerFormMessage>
            )}
          </ButlerInsetPanel>

          <ButlerFormMessage tone="info">
            <strong>Note:</strong> Infrastructure settings like subnets, images,
            and storage are configured per-cluster when you create a
            TenantCluster. {PROVIDER_LABELS[provider]} credentials are stored in
            a Secret the server manages; only its reference is kept on the
            provider.
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
