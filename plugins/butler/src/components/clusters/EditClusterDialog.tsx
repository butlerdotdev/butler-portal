// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useMemo, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Cluster, UpdateClusterRequest } from '../../api/types/clusters';
import { ButlerApiError, extractWebhookDenial } from '../../api/ButlerApiError';
import { compareVersions } from '../../utils/environment';
import { butlerTokens, rgb } from '../../theme';
import {
  ButlerButton,
  ButlerCallout,
  ButlerDialog,
  ButlerField,
  ButlerFormSection,
  ButlerInput,
  ButlerKeyValueList,
  ButlerKeyValueRow,
  ButlerSelect,
} from '../ui';

/** Versions the portal offers. The server refuses downgrades regardless. */
export const SUPPORTED_K8S_VERSIONS = [
  'v1.30.2',
  'v1.31.0',
  'v1.31.2',
  'v1.32.0',
  'v1.32.2',
];

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  return {
    grid: {
      display: 'grid',
      gridTemplateColumns: '1fr',
      gap: 16,
      '@media (min-width: 640px)': {
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      },
    },
    note: {
      margin: 0,
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.muted,
    },
    ack: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 12,
      color: rgb(t.palette.amber[400]),
    },
  };
});

export interface EditClusterDialogProps {
  open: boolean;
  onClose: () => void;
  cluster: Cluster;
  /** Resolves with the updated cluster, or throws for the dialog to show. */
  onSave: (request: UpdateClusterRequest) => Promise<Cluster>;
  /** Platform admins may edit the infrastructure override; nobody else. */
  isPlatformAdmin?: boolean;
}

/**
 * Console's Edit Cluster: the fields butler-server accepts on PUT, with the
 * server's own rules mirrored so a person is told before the round trip,
 * and the server's field errors shown against the field that caused them.
 *
 * Only changed fields are sent, and the cluster's resourceVersion goes with
 * them, so a cluster that moved underneath is refused rather than clobbered.
 */
export const EditClusterDialog = ({
  open,
  onClose,
  cluster,
  onSave,
  isPlatformAdmin = false,
}: EditClusterDialogProps) => {
  const classes = useStyles();
  const original = useMemo(
    () => ({
      kubernetesVersion: cluster.spec.kubernetesVersion ?? '',
      cpReplicas: cluster.spec.controlPlane?.replicas ?? 1,
      workerReplicas: cluster.spec.workers?.replicas ?? 1,
      cpu: cluster.spec.workers?.machineTemplate?.cpu ?? 0,
      memory: cluster.spec.workers?.machineTemplate?.memory ?? '',
      diskSize: cluster.spec.workers?.machineTemplate?.diskSize ?? '',
    }),
    [cluster],
  );

  const [form, setForm] = useState(original);
  const [acknowledgeDowngrade, setAcknowledgeDowngrade] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setForm(original);
      setAcknowledgeDowngrade(false);
      setError(null);
      setFieldErrors({});
    }
  }, [open, original]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  const isDowngrade =
    Boolean(form.kubernetesVersion) &&
    compareVersions(form.kubernetesVersion, original.kubernetesVersion) < 0;
  const losesHighAvailability =
    original.cpReplicas === 3 && form.cpReplicas === 1;
  const changed =
    form.kubernetesVersion !== original.kubernetesVersion ||
    form.cpReplicas !== original.cpReplicas ||
    form.workerReplicas !== original.workerReplicas ||
    form.cpu !== original.cpu ||
    form.memory !== original.memory ||
    form.diskSize !== original.diskSize;

  const buildRequest = (): UpdateClusterRequest => {
    const request: UpdateClusterRequest = {
      resourceVersion: cluster.metadata.resourceVersion ?? '',
    };
    if (form.kubernetesVersion !== original.kubernetesVersion) {
      request.kubernetesVersion = form.kubernetesVersion;
    }
    if (form.cpReplicas !== original.cpReplicas) {
      request.controlPlane = { replicas: form.cpReplicas };
    }
    const machineTemplate: Record<string, unknown> = {};
    if (form.cpu !== original.cpu) machineTemplate.cpu = form.cpu;
    if (form.memory !== original.memory) machineTemplate.memory = form.memory;
    if (form.diskSize !== original.diskSize) {
      machineTemplate.diskSize = form.diskSize;
    }
    if (
      form.workerReplicas !== original.workerReplicas ||
      Object.keys(machineTemplate).length > 0
    ) {
      request.workers = {};
      if (form.workerReplicas !== original.workerReplicas) {
        request.workers.replicas = form.workerReplicas;
      }
      if (Object.keys(machineTemplate).length > 0) {
        request.workers.machineTemplate = machineTemplate;
      }
    }
    if (losesHighAvailability) {
      request.acknowledgeDowngrade = true;
    }
    return request;
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      await onSave(buildRequest());
      onClose();
    } catch (e) {
      if (e instanceof ButlerApiError && e.fieldErrors.length > 0) {
        setFieldErrors(
          Object.fromEntries(e.fieldErrors.map(f => [f.field, f.reason])),
        );
        setError('The cluster was not changed. See the fields below.');
      } else {
        setError(
          extractWebhookDenial(
            e instanceof Error ? e.message : 'Failed to update cluster',
          ),
        );
      }
      setSaving(false);
    }
  };

  const blocked = losesHighAvailability && !acknowledgeDowngrade;

  return (
    <ButlerDialog
      open={open}
      onClose={onClose}
      busy={saving}
      width={512}
      title="Edit Cluster"
      subtitle={cluster.metadata.name}
      footer={
        <>
          <ButlerButton variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </ButlerButton>
          <ButlerButton
            onClick={save}
            disabled={saving || !changed || isDowngrade || blocked}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </ButlerButton>
        </>
      }
    >
      <ButlerFormSection title="Control Plane" uppercase>
        <ButlerField
          label="Control Plane Version"
          htmlFor="edit-k8s-version"
          error={fieldErrors['spec.kubernetesVersion']}
          help={
            isDowngrade
              ? undefined
              : 'Worker kubelet version is determined by the OS image.'
          }
        >
          <ButlerSelect
            id="edit-k8s-version"
            value={form.kubernetesVersion}
            disabled={saving}
            onChange={e => set('kubernetesVersion', e.target.value)}
            options={Array.from(
              new Set([original.kubernetesVersion, ...SUPPORTED_K8S_VERSIONS]),
            )
              .filter(Boolean)
              .map(v => ({
                value: v,
                label: v === original.kubernetesVersion ? `${v} (current)` : v,
                disabled: compareVersions(v, original.kubernetesVersion) < 0,
              }))}
          />
        </ButlerField>
        {isDowngrade && (
          <ButlerCallout tone="danger">
            Downgrades are not supported. Choose {original.kubernetesVersion} or
            newer.
          </ButlerCallout>
        )}
        <ButlerField
          label="Control Plane Replicas"
          htmlFor="edit-cp-replicas"
          error={fieldErrors['spec.controlPlane.replicas']}
          help="One or three, because etcd needs an odd number for quorum."
        >
          <ButlerSelect
            id="edit-cp-replicas"
            value={String(form.cpReplicas)}
            disabled={saving}
            onChange={e => set('cpReplicas', Number(e.target.value))}
            options={[
              { value: '1', label: '1 (no high availability)' },
              { value: '3', label: '3 (high availability)' },
            ]}
          />
        </ButlerField>
        {losesHighAvailability && (
          <ButlerCallout tone="warning">
            <label className={classes.ack}>
              <input
                type="checkbox"
                checked={acknowledgeDowngrade}
                disabled={saving}
                onChange={e => setAcknowledgeDowngrade(e.target.checked)}
              />
              I understand reducing from 3 to 1 removes high availability
            </label>
          </ButlerCallout>
        )}
      </ButlerFormSection>

      <ButlerFormSection title="Workers" uppercase>
        <div className={classes.grid}>
          <ButlerField
            label="Replicas"
            htmlFor="edit-worker-replicas"
            error={fieldErrors['spec.workers.replicas']}
          >
            <ButlerInput
              id="edit-worker-replicas"
              type="number"
              min={1}
              max={100}
              value={form.workerReplicas}
              disabled={saving}
              onChange={e =>
                set('workerReplicas', parseInt(e.target.value, 10) || 1)
              }
            />
          </ButlerField>
          <ButlerField
            label="CPU Cores"
            htmlFor="edit-worker-cpu"
            error={fieldErrors['spec.workers.machineTemplate.cpu']}
          >
            <ButlerInput
              id="edit-worker-cpu"
              type="number"
              min={1}
              value={form.cpu}
              disabled={saving}
              onChange={e => set('cpu', parseInt(e.target.value, 10) || 0)}
            />
          </ButlerField>
          <ButlerField label="Memory" htmlFor="edit-worker-memory">
            <ButlerInput
              id="edit-worker-memory"
              mono
              value={form.memory}
              disabled={saving}
              onChange={e => set('memory', e.target.value)}
            />
          </ButlerField>
          <ButlerField label="Disk Size" htmlFor="edit-worker-disk">
            <ButlerInput
              id="edit-worker-disk"
              mono
              value={form.diskSize}
              disabled={saving}
              onChange={e => set('diskSize', e.target.value)}
            />
          </ButlerField>
        </div>
        <p className={classes.note}>
          Changing worker size replaces machines one at a time.
        </p>
      </ButlerFormSection>

      <ButlerFormSection title="Not editable here" uppercase>
        <ButlerKeyValueList dense>
          <ButlerKeyValueRow label="Name" dense mono>
            {cluster.metadata.name}
          </ButlerKeyValueRow>
          <ButlerKeyValueRow label="Namespace" dense mono>
            {cluster.metadata.namespace}
          </ButlerKeyValueRow>
          <ButlerKeyValueRow label="Provider" dense>
            {cluster.spec.providerConfigRef?.name ?? 'Default'}
          </ButlerKeyValueRow>
          <ButlerKeyValueRow label="Team" dense>
            {cluster.spec.teamRef?.name ?? '-'}
          </ButlerKeyValueRow>
        </ButlerKeyValueList>
        <p className={classes.note}>
          {isPlatformAdmin
            ? 'Infrastructure overrides are changed through the platform tooling.'
            : 'These are fixed for the life of the cluster.'}
        </p>
      </ButlerFormSection>

      {error && <ButlerCallout tone="danger">{error}</ButlerCallout>}
    </ButlerDialog>
  );
};
