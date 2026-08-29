// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type {
  TeamClusterDefaults,
  TeamResourceLimits,
} from '../../api/types/teams';
import { butlerTokens, rgb } from '../../theme';
import {
  ButlerButton,
  ButlerCallout,
  ButlerDialog,
  ButlerField,
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
  };
});

type Field<T> = {
  key: keyof T & string;
  label: string;
  help?: string;
  mono?: boolean;
};

const LIMIT_FIELDS: Field<TeamResourceLimits>[] = [
  { key: 'maxClusters', label: 'Max clusters', help: 'Blank means unlimited.' },
  { key: 'maxTotalNodes', label: 'Max nodes across clusters' },
  { key: 'maxNodesPerCluster', label: 'Max nodes per cluster' },
  {
    key: 'maxCPUCores',
    label: 'Max CPU cores',
    help: 'A quantity, e.g. 96.',
    mono: true,
  },
  {
    key: 'maxMemory',
    label: 'Max memory',
    help: 'A quantity, e.g. 256Gi.',
    mono: true,
  },
  {
    key: 'maxStorage',
    label: 'Max storage',
    help: 'A quantity, e.g. 2Ti.',
    mono: true,
  },
  { key: 'defaultNodeCount', label: 'Default node count' },
];

const DEFAULT_FIELDS: Field<TeamClusterDefaults>[] = [
  { key: 'kubernetesVersion', label: 'Kubernetes version', mono: true },
  { key: 'workerCount', label: 'Worker count' },
  { key: 'workerCPU', label: 'Worker CPU cores' },
  { key: 'workerMemoryGi', label: 'Worker memory (Gi)' },
  { key: 'workerDiskGi', label: 'Worker disk (Gi)' },
];

const INTEGER_KEYS = new Set([
  'maxClusters',
  'maxTotalNodes',
  'maxNodesPerCluster',
  'defaultNodeCount',
  'workerCount',
  'workerCPU',
  'workerMemoryGi',
  'workerDiskGi',
]);

/**
 * The server replaces the whole map it receives, so the request carries
 * every field that has a value, integers as numbers and quantities as
 * strings. A field left blank is omitted, which the server stores as
 * unset: for a limit that means unlimited.
 */
export function buildLimitsMap<T extends Record<string, unknown>>(
  form: Record<string, string>,
): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(form)) {
    const t = v.trim();
    if (!t) continue;
    if (INTEGER_KEYS.has(k)) {
      const n = Number(t);
      if (Number.isInteger(n) && n >= 0) out[k] = n;
    } else {
      out[k] = t;
    }
  }
  return out as T;
}

export function validateLimitsForm(
  form: Record<string, string>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [k, v] of Object.entries(form)) {
    const t = v.trim();
    if (!t) continue;
    if (INTEGER_KEYS.has(k)) {
      const n = Number(t);
      if (!Number.isInteger(n) || n < 0)
        errors[k] = 'Whole number, zero or more';
    } else if (
      k !== 'kubernetesVersion' &&
      !/^[0-9]*\.?[0-9]+(m|[KMGTP]i?)?$/.test(t)
    ) {
      errors[k] = 'A Kubernetes quantity, e.g. 96 or 256Gi';
    }
  }
  return errors;
}

function toForm(
  map: Record<string, unknown> | undefined,
  fields: Field<any>[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = map?.[f.key];
    out[f.key] = v === undefined || v === null ? '' : String(v);
  }
  return out;
}

export interface EditTeamMapDialogProps {
  open: boolean;
  kind: 'limits' | 'defaults';
  teamName: string;
  current: TeamResourceLimits | TeamClusterDefaults | undefined;
  onClose: () => void;
  onSave: (map: Record<string, unknown>) => Promise<unknown>;
  onSaved: () => void | Promise<void>;
}

/**
 * Edits `spec.resourceLimits` (platform admin only, enforced by the Team
 * admission webhook) or `spec.clusterDefaults` (team admin or platform
 * admin). Both are replaced whole by the server, so the dialog shows
 * every field and sends every filled one.
 */
export const EditTeamMapDialog = ({
  open,
  kind,
  teamName,
  current,
  onClose,
  onSave,
  onSaved,
}: EditTeamMapDialogProps) => {
  const classes = useStyles();
  const fields = kind === 'limits' ? LIMIT_FIELDS : DEFAULT_FIELDS;
  const [form, setForm] = useState<Record<string, string>>(() =>
    toForm(current as any, fields),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(toForm(current as any, fields));
    setErrors({});
    setError(null);
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, current, kind]);

  const save = async () => {
    const problems = validateLimitsForm(form);
    if (Object.keys(problems).length > 0) {
      setErrors(problems);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(buildLimitsMap(form));
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
      setSaving(false);
    }
  };

  return (
    <ButlerDialog
      open={open}
      onClose={saving ? () => {} : onClose}
      title={
        kind === 'limits' ? 'Edit resource limits' : 'Edit cluster defaults'
      }
      subtitle={`@${teamName}`}
      width={520}
      busy={saving}
      footer={
        <>
          <ButlerButton variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </ButlerButton>
          <ButlerButton onClick={save} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </ButlerButton>
        </>
      }
    >
      <p className={classes.lead}>
        {kind === 'limits'
          ? 'What this team may consume in total. A blank field is unlimited. Lowering a limit below current usage is accepted by the server and reported as over quota; existing clusters are not touched. Only a platform admin may change limits.'
          : 'What a new cluster starts with when its creator does not choose otherwise. Existing clusters are not changed.'}
      </p>
      <div className={classes.grid}>
        {fields.map(f => (
          <ButlerField
            key={f.key}
            label={f.label}
            htmlFor={`team-${kind}-${f.key}`}
            help={f.help}
            error={errors[f.key]}
          >
            <ButlerInput
              id={`team-${kind}-${f.key}`}
              value={form[f.key] ?? ''}
              mono={f.mono}
              onChange={e => {
                const v = e.target.value;
                setForm(prev => ({ ...prev, [f.key]: v }));
                setErrors(prev => {
                  const next = { ...prev };
                  delete next[f.key];
                  return next;
                });
              }}
              disabled={saving}
            />
          </ButlerField>
        ))}
      </div>
      {error && (
        <ButlerCallout tone="danger" title="Could not save">
          {error}
        </ButlerCallout>
      )}
    </ButlerDialog>
  );
};
