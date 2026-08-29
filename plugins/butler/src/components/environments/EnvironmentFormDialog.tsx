// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type {
  EnvironmentRequest,
  TeamEnvironment,
} from '../../api/types/environments';
import { validateEnvironmentName } from '../../api/types/environments';
import { ButlerApiError, extractWebhookDenial } from '../../api/ButlerApiError';
import { butlerTokens, rgb } from '../../theme';
import {
  ButlerButton,
  ButlerCallout,
  ButlerDialog,
  ButlerField,
  ButlerFormSection,
  ButlerInput,
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
    hint: { margin: 0, fontSize: 12, color: t.text.subtle },
  };
});

/** Text inputs, because a blank field has to mean "unset" and not zero. */
interface FormState {
  name: string;
  description: string;
  maxClusters: string;
  maxClustersPerMember: string;
  kubernetesVersion: string;
  workerCount: string;
  workerCPU: string;
  workerMemoryGi: string;
  workerDiskGi: string;
}

const EMPTY: FormState = {
  name: '',
  description: '',
  maxClusters: '',
  maxClustersPerMember: '',
  kubernetesVersion: '',
  workerCount: '',
  workerCPU: '',
  workerMemoryGi: '',
  workerDiskGi: '',
};

function fromEnvironment(env: TeamEnvironment | null): FormState {
  if (!env) return EMPTY;
  const num = (v: number | undefined) => (v == null ? '' : String(v));
  return {
    name: env.name,
    description: env.description ?? '',
    maxClusters: num(env.limits?.maxClusters),
    maxClustersPerMember: num(env.limits?.maxClustersPerMember),
    kubernetesVersion: env.clusterDefaults?.kubernetesVersion ?? '',
    workerCount: num(env.clusterDefaults?.workerCount),
    workerCPU: num(env.clusterDefaults?.workerCPU),
    workerMemoryGi: num(env.clusterDefaults?.workerMemoryGi),
    workerDiskGi: num(env.clusterDefaults?.workerDiskGi),
  };
}

const NUMERIC_LABELS: Record<string, string> = {
  maxClusters: 'Max clusters',
  maxClustersPerMember: 'Max clusters per member',
  workerCount: 'Worker count',
  workerCPU: 'Worker CPU',
  workerMemoryGi: 'Worker memory',
  workerDiskGi: 'Worker disk',
};

/**
 * Builds the request, or the reason it cannot be built. Empty numeric
 * fields are left out entirely: the server treats an absent limit as
 * unlimited, so sending zero would silently impose a cap nobody asked for.
 */
export function buildEnvironmentRequest(
  form: FormState,
): { request: EnvironmentRequest } | { error: string; field: keyof FormState } {
  const nameError = validateEnvironmentName(form.name);
  if (nameError) return { error: nameError, field: 'name' };

  const numeric: Array<[keyof FormState, number | undefined]> = [];
  for (const key of [
    'maxClusters',
    'maxClustersPerMember',
    'workerCount',
    'workerCPU',
    'workerMemoryGi',
    'workerDiskGi',
  ] as const) {
    const raw = form[key].trim();
    if (!raw) {
      numeric.push([key, undefined]);
      continue;
    }
    if (!/^\d+$/.test(raw)) {
      return {
        error: `${NUMERIC_LABELS[key]} must be a whole number`,
        field: key,
      };
    }
    numeric.push([key, Number(raw)]);
  }
  const value = (key: keyof FormState) => numeric.find(([k]) => k === key)?.[1];

  const request: EnvironmentRequest = { name: form.name.trim() };
  if (form.description.trim()) request.description = form.description.trim();

  const limits: EnvironmentRequest['limits'] = {};
  if (value('maxClusters') !== undefined) {
    limits.maxClusters = value('maxClusters');
  }
  if (value('maxClustersPerMember') !== undefined) {
    limits.maxClustersPerMember = value('maxClustersPerMember');
  }
  if (Object.keys(limits).length > 0) request.limits = limits;

  const defaults: EnvironmentRequest['clusterDefaults'] = {};
  if (form.kubernetesVersion.trim()) {
    defaults.kubernetesVersion = form.kubernetesVersion.trim();
  }
  for (const key of [
    'workerCount',
    'workerCPU',
    'workerMemoryGi',
    'workerDiskGi',
  ] as const) {
    const v = value(key);
    if (v !== undefined) defaults[key] = v;
  }
  if (Object.keys(defaults).length > 0) request.clusterDefaults = defaults;

  return { request };
}

export interface EnvironmentFormDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  team: string;
  /** The environment being edited; ignored when creating. */
  environment?: TeamEnvironment | null;
  existingNames: string[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  onSubmit: (request: EnvironmentRequest) => Promise<unknown>;
}

/**
 * Create and edit share one form because they share one contract. The
 * name is the environment's identity and the server refuses to change it,
 * so editing shows it as fixed rather than offering a rename that would
 * be rejected.
 *
 * Access entries are deliberately not editable here: the admission
 * webhook only accepts subjects that already belong to the team, so
 * offering a free-text subject list would invite denials the form cannot
 * anticipate. Existing entries are preserved untouched on save.
 */
export const EnvironmentFormDialog = ({
  open,
  mode,
  team,
  environment,
  existingNames,
  onClose,
  onSaved,
  onSubmit,
}: EnvironmentFormDialogProps) => {
  const classes = useStyles();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [fieldError, setFieldError] = useState<{
    field: keyof FormState;
    message: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(fromEnvironment(mode === 'edit' ? environment ?? null : null));
    setFieldError(null);
    setError(null);
    setSaving(false);
  }, [open, mode, environment]);

  const set = (key: keyof FormState) => (value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setFieldError(prev => (prev?.field === key ? null : prev));
  };

  const handleSubmit = async () => {
    const built = buildEnvironmentRequest(form);
    if ('error' in built) {
      setFieldError({ field: built.field, message: built.error });
      return;
    }
    if (mode === 'create') {
      const clash = existingNames.some(
        n => n.toLowerCase() === built.request.name.toLowerCase(),
      );
      if (clash) {
        setFieldError({
          field: 'name',
          message: `This team already has an environment called ${built.request.name}`,
        });
        return;
      }
    }
    // Access is not editable here, so carry what the environment already
    // has rather than dropping it on save.
    if (mode === 'edit' && environment?.access) {
      built.request.access = environment.access;
    }

    setSaving(true);
    setError(null);
    try {
      await onSubmit(built.request);
      await onSaved();
    } catch (err) {
      if (err instanceof ButlerApiError && err.isConflict) {
        setError(
          `An environment called ${built.request.name} already exists in this team.`,
        );
      } else {
        setError(
          extractWebhookDenial(
            err instanceof Error ? err.message : 'Failed to save environment',
          ),
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const errorFor = (key: keyof FormState) =>
    fieldError?.field === key ? fieldError.message : undefined;

  return (
    <ButlerDialog
      open={open}
      onClose={saving ? () => {} : onClose}
      title={mode === 'create' ? 'Create environment' : `Edit ${form.name}`}
      subtitle={team}
      busy={saving}
      width={512}
      footer={
        <>
          <ButlerButton
            variant="secondary"
            onClick={onClose}
            disabled={saving}
            type="button"
          >
            Cancel
          </ButlerButton>
          <ButlerButton onClick={handleSubmit} disabled={saving} type="button">
            {saving
              ? 'Saving...'
              : mode === 'create'
              ? 'Create environment'
              : 'Save changes'}
          </ButlerButton>
        </>
      }
    >
      <p className={classes.lead}>
        An environment groups a team's clusters and caps how many of them may
        exist in it. Clusters carry the environment as a label, so the name is
        fixed once created.
      </p>

      <ButlerFormSection title="Identity">
        <ButlerField
          label="Name"
          htmlFor="env-name"
          error={errorFor('name')}
          help={
            mode === 'edit'
              ? 'The name cannot change; delete and recreate to rename.'
              : 'Letters, numbers, dots, dashes and underscores.'
          }
        >
          <ButlerInput
            id="env-name"
            value={form.name}
            onChange={e => set('name')(e.target.value)}
            disabled={mode === 'edit' || saving}
            placeholder="staging"
          />
        </ButlerField>
        <ButlerField label="Description" htmlFor="env-description">
          <ButlerInput
            id="env-description"
            value={form.description}
            onChange={e => set('description')(e.target.value)}
            disabled={saving}
            placeholder="What this environment is for"
          />
        </ButlerField>
      </ButlerFormSection>

      <ButlerFormSection
        title="Limits"
        description="Leave blank for no limit. These caps sit inside the team's own limit."
      >
        <div className={classes.grid}>
          <ButlerField
            label="Max clusters"
            htmlFor="env-max-clusters"
            error={errorFor('maxClusters')}
          >
            <ButlerInput
              id="env-max-clusters"
              value={form.maxClusters}
              onChange={e => set('maxClusters')(e.target.value)}
              disabled={saving}
              placeholder="unlimited"
            />
          </ButlerField>
          <ButlerField
            label="Max clusters per member"
            htmlFor="env-max-per-member"
            error={errorFor('maxClustersPerMember')}
          >
            <ButlerInput
              id="env-max-per-member"
              value={form.maxClustersPerMember}
              onChange={e => set('maxClustersPerMember')(e.target.value)}
              disabled={saving}
              placeholder="unlimited"
            />
          </ButlerField>
        </div>
        <p className={classes.hint}>
          Changing a limit needs a team admin. The platform refuses the change
          otherwise.
        </p>
      </ButlerFormSection>

      <ButlerFormSection
        title="Cluster defaults"
        description="Applied to clusters created in this environment unless the form overrides them."
      >
        <ButlerField label="Kubernetes version" htmlFor="env-k8s">
          <ButlerInput
            id="env-k8s"
            value={form.kubernetesVersion}
            onChange={e => set('kubernetesVersion')(e.target.value)}
            disabled={saving}
            placeholder="v1.31.0"
          />
        </ButlerField>
        <div className={classes.grid}>
          <ButlerField
            label="Worker count"
            htmlFor="env-worker-count"
            error={errorFor('workerCount')}
          >
            <ButlerInput
              id="env-worker-count"
              value={form.workerCount}
              onChange={e => set('workerCount')(e.target.value)}
              disabled={saving}
              placeholder="team default"
            />
          </ButlerField>
          <ButlerField
            label="Worker CPU"
            htmlFor="env-worker-cpu"
            error={errorFor('workerCPU')}
          >
            <ButlerInput
              id="env-worker-cpu"
              value={form.workerCPU}
              onChange={e => set('workerCPU')(e.target.value)}
              disabled={saving}
              placeholder="team default"
            />
          </ButlerField>
          <ButlerField
            label="Worker memory (Gi)"
            htmlFor="env-worker-memory"
            error={errorFor('workerMemoryGi')}
          >
            <ButlerInput
              id="env-worker-memory"
              value={form.workerMemoryGi}
              onChange={e => set('workerMemoryGi')(e.target.value)}
              disabled={saving}
              placeholder="team default"
            />
          </ButlerField>
          <ButlerField
            label="Worker disk (Gi)"
            htmlFor="env-worker-disk"
            error={errorFor('workerDiskGi')}
          >
            <ButlerInput
              id="env-worker-disk"
              value={form.workerDiskGi}
              onChange={e => set('workerDiskGi')(e.target.value)}
              disabled={saving}
              placeholder="team default"
            />
          </ButlerField>
        </div>
      </ButlerFormSection>

      {error && (
        <ButlerCallout tone="danger" title="Could not save">
          {error}
        </ButlerCallout>
      )}
    </ButlerDialog>
  );
};
