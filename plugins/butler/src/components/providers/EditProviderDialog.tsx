// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type {
  Provider,
  UpdateProviderRequest,
} from '../../api/types/providers';
import { extractWebhookDenial } from '../../api/ButlerApiError';
import {
  PROVIDER_LABELS,
  buildUpdateProviderRequest,
  providerToForm,
  validateProviderForm,
  type ProviderFormValues,
} from '../../utils/providerRequest';
import { butlerTokens, rgb } from '../../theme';
import {
  ButlerButton,
  ButlerCallout,
  ButlerCheckbox,
  ButlerDialog,
  ButlerField,
  ButlerFormSection,
  ButlerInput,
  ButlerKeyValueList,
  ButlerKeyValueRow,
  ButlerTextarea,
} from '../ui';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  return {
    lead: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: rgb(t.palette.neutral[300]),
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: 12,
    },
    note: { margin: 0, fontSize: 12, color: t.text.subtle },
  };
});

export interface EditProviderDialogProps {
  open: boolean;
  provider: Provider;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  onSave: (
    namespace: string,
    name: string,
    request: UpdateProviderRequest,
  ) => Promise<unknown>;
}

/**
 * Edits a provider the way butler-server updates one: only the fields
 * that changed are sent, and the server changes only those. The name,
 * type and scope cannot change and are shown as facts. Credentials start
 * blank; leaving them blank keeps what the Secret holds, typing one
 * replaces that key alone. Saving does not validate; that stays a
 * separate action, because a saved endpoint and a reachable endpoint are
 * different things.
 */
export const EditProviderDialog = ({
  open,
  provider,
  onClose,
  onSaved,
  onSave,
}: EditProviderDialogProps) => {
  const classes = useStyles();
  const [form, setForm] = useState<ProviderFormValues>(() =>
    providerToForm(provider),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nothingChanged, setNothingChanged] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(providerToForm(provider));
    setErrors({});
    setError(null);
    setSaving(false);
    setNothingChanged(false);
  }, [open, provider]);

  const set = <K extends keyof ProviderFormValues>(
    key: K,
    value: ProviderFormValues[K],
  ) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setErrors(prev => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setNothingChanged(false);
  };

  const text = (
    key: keyof ProviderFormValues,
    label: string,
    opts?: {
      mono?: boolean;
      secret?: boolean;
      help?: string;
      placeholder?: string;
    },
  ) => (
    <ButlerField
      label={label}
      htmlFor={`edit-${key}`}
      error={errors[key]}
      help={opts?.help}
    >
      <ButlerInput
        id={`edit-${key}`}
        type={opts?.secret ? 'password' : 'text'}
        value={String(form[key] ?? '')}
        onChange={e => set(key, e.target.value as never)}
        disabled={saving}
        mono={opts?.mono}
        placeholder={opts?.placeholder}
        autoComplete={opts?.secret ? 'new-password' : undefined}
      />
    </ButlerField>
  );

  const handleSave = async () => {
    const problems = validateProviderForm(form, 'edit');
    if (Object.keys(problems).length > 0) {
      setErrors(problems);
      return;
    }
    const request = buildUpdateProviderRequest(form, provider);
    if (Object.keys(request).length === 0) {
      setNothingChanged(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(
        provider.metadata.namespace,
        provider.metadata.name,
        request,
      );
      await onSaved();
    } catch (err) {
      setError(
        extractWebhookDenial(
          err instanceof Error ? err.message : 'Failed to update provider',
        ),
      );
      setSaving(false);
    }
  };

  const type = form.provider;

  return (
    <ButlerDialog
      open={open}
      onClose={saving ? () => {} : onClose}
      title={`Edit ${provider.metadata.name}`}
      subtitle={PROVIDER_LABELS[type] ?? type}
      width={560}
      busy={saving}
      footer={
        <>
          <ButlerButton variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </ButlerButton>
          <ButlerButton onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save changes'}
          </ButlerButton>
        </>
      }
    >
      <p className={classes.lead}>
        Only the fields you change are sent. Credentials are not shown; leave
        one blank to keep it, or enter a new value to replace it. Saving does
        not test the connection.
      </p>

      <ButlerKeyValueList>
        <ButlerKeyValueRow label="Type" dense>
          {PROVIDER_LABELS[type] ?? type}
        </ButlerKeyValueRow>
        <ButlerKeyValueRow label="Scope" dense>
          {provider.spec.scope?.type === 'team'
            ? `Team ${provider.spec.scope.teamRef?.name ?? ''}`
            : 'Platform wide'}
        </ButlerKeyValueRow>
        {provider.spec.credentialsRef && (
          <ButlerKeyValueRow label="Credentials" dense mono>
            {`secret ${provider.spec.credentialsRef.name}`}
          </ButlerKeyValueRow>
        )}
      </ButlerKeyValueList>
      <p className={classes.note}>
        The type and scope are fixed once a provider exists.
      </p>

      {type === 'harvester' && (
        <ButlerFormSection title="Credentials">
          <ButlerField
            label="Replace kubeconfig"
            htmlFor="edit-harvesterKubeconfig"
            help="Leave empty to keep the current kubeconfig."
          >
            <ButlerTextarea
              id="edit-harvesterKubeconfig"
              rows={5}
              mono
              value={form.harvesterKubeconfig}
              onChange={e => set('harvesterKubeconfig', e.target.value)}
              disabled={saving}
            />
          </ButlerField>
        </ButlerFormSection>
      )}

      {type === 'nutanix' && (
        <ButlerFormSection title="Prism Central">
          <div className={classes.grid}>
            {text('nutanixEndpoint', 'Endpoint', { mono: true })}
            {text('nutanixPort', 'Port', { mono: true })}
            {text('nutanixUsername', 'Username')}
            {text('nutanixPassword', 'New password', {
              secret: true,
              help: 'Leave empty to keep the current one.',
            })}
          </div>
          <ButlerField
            label="Replace CA bundle"
            htmlFor="edit-nutanixCABundle"
            help="PEM. Leave empty to keep the current bundle."
          >
            <ButlerTextarea
              id="edit-nutanixCABundle"
              rows={4}
              mono
              value={form.nutanixCABundle}
              onChange={e => set('nutanixCABundle', e.target.value)}
              disabled={saving || form.removeCABundle}
            />
          </ButlerField>
          <ButlerCheckbox
            checked={form.removeCABundle}
            onChange={e => set('removeCABundle', e.target.checked)}
            label="Remove the CA bundle"
            disabled={saving}
          />
        </ButlerFormSection>
      )}

      {type === 'proxmox' && (
        <ButlerFormSection title="Proxmox">
          <div className={classes.grid}>
            {text('proxmoxEndpoint', 'Endpoint', { mono: true })}
            {text('proxmoxUsername', 'Username')}
            {text('proxmoxPassword', 'New password', { secret: true })}
            {text('proxmoxTokenId', 'Token id', { mono: true })}
            {text('proxmoxTokenSecret', 'New token secret', { secret: true })}
          </div>
        </ButlerFormSection>
      )}

      {type === 'aws' && (
        <ButlerFormSection title="Amazon Web Services">
          <div className={classes.grid}>
            {text('awsRegion', 'Region', { mono: true })}
            {text('awsVpcId', 'VPC id', { mono: true })}
            {text('awsAccessKeyId', 'Access key id', { mono: true })}
            {text('awsSecretAccessKey', 'New secret access key', {
              secret: true,
            })}
          </div>
          {text('awsSubnetIds', 'Subnet ids', {
            mono: true,
            help: 'Comma separated.',
          })}
          {text('awsSecurityGroupIds', 'Security group ids', {
            mono: true,
            help: 'Comma separated.',
          })}
        </ButlerFormSection>
      )}

      {type === 'azure' && (
        <ButlerFormSection title="Microsoft Azure">
          <div className={classes.grid}>
            {text('azureSubscriptionId', 'Subscription id', { mono: true })}
            {text('azureTenantId', 'Tenant id', { mono: true })}
            {text('azureClientId', 'Client id', { mono: true })}
            {text('azureClientSecret', 'New client secret', { secret: true })}
            {text('azureResourceGroup', 'Resource group')}
            {text('azureLocation', 'Location')}
            {text('azureVnetName', 'VNet')}
            {text('azureSubnetName', 'Subnet')}
            {text('azureVmSize', 'VM size')}
            {text('azureImageUrn', 'Image URN', { mono: true })}
          </div>
        </ButlerFormSection>
      )}

      {type === 'gcp' && (
        <ButlerFormSection title="Google Cloud Platform">
          <div className={classes.grid}>
            {text('gcpProjectId', 'Project id', { mono: true })}
            {text('gcpRegion', 'Region')}
            {text('gcpZone', 'Zone')}
            {text('gcpNetwork', 'Network')}
            {text('gcpSubnetwork', 'Subnetwork')}
            {text('gcpMachineType', 'Machine type')}
            {text('gcpImageProject', 'Image project')}
            {text('gcpImageFamily', 'Image family')}
            {text('gcpImage', 'Image')}
            {text('gcpTags', 'Tags', { help: 'Comma separated.' })}
          </div>
          <ButlerField
            label="Replace service account key"
            htmlFor="edit-gcpServiceAccount"
            help="JSON key. Leave empty to keep the current one."
          >
            <ButlerTextarea
              id="edit-gcpServiceAccount"
              rows={4}
              mono
              value={form.gcpServiceAccount}
              onChange={e => set('gcpServiceAccount', e.target.value)}
              disabled={saving}
            />
          </ButlerField>
        </ButlerFormSection>
      )}

      {form.networkMode === 'ipam' && (
        <ButlerFormSection
          title="Network"
          description="Addresses the platform allocates to this provider's clusters."
        >
          <div className={classes.grid}>
            {text('networkSubnet', 'Subnet', { mono: true })}
            {text('networkGateway', 'Gateway', { mono: true })}
          </div>
          {text('networkDnsServers', 'DNS servers', {
            mono: true,
            help: 'Comma separated.',
          })}
          {text('poolRefs', 'Network pools', {
            mono: true,
            help: 'Comma separated pool names, optionally name:priority. At least one is required in IPAM mode.',
          })}
          <div className={classes.grid}>
            {text('lbDefaultPoolSize', 'Default load balancer pool size')}
            {text('quotaMaxNodeIPs', 'Max node addresses per tenant')}
            {text(
              'quotaMaxLoadBalancerIPs',
              'Max load balancer addresses per tenant',
            )}
          </div>
        </ButlerFormSection>
      )}

      <ButlerFormSection
        title="Limits"
        description="Ceilings applied to every team on this provider. Leave blank for none."
      >
        <div className={classes.grid}>
          {text('maxClustersPerTeam', 'Max clusters per team')}
          {text('maxNodesPerTeam', 'Max nodes per team')}
        </div>
      </ButlerFormSection>

      {nothingChanged && (
        <ButlerCallout tone="info" compact>
          Nothing has changed, so there is nothing to save.
        </ButlerCallout>
      )}
      {error && (
        <ButlerCallout tone="danger" title="Could not update">
          {error}
        </ButlerCallout>
      )}
    </ButlerDialog>
  );
};
