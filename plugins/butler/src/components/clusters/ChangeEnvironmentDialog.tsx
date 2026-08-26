// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import type { Cluster, TeamEnvironment } from '../../api/types/clusters';
import { extractWebhookDenial } from '../../api/ButlerApiError';
import { clusterEnvironment } from '../../utils/environment';
import { butlerTokens, rgb, rgba } from '../../theme';
import { ButlerButton, ButlerCallout, ButlerDialog, CheckIcon } from '../ui';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  return {
    intro: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.muted,
    },
    list: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    },
    option: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      width: '100%',
      padding: '10px 12px',
      borderRadius: t.radius.lg,
      border: `1px solid ${t.border}`,
      backgroundColor: 'transparent',
      textAlign: 'left',
      cursor: 'pointer',
      fontFamily: t.fontSans,
      transition: 'border-color 150ms, background-color 150ms',
      '&:hover': { borderColor: t.borderStrong },
      '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
    },
    selected: {
      borderColor: rgba(p.blue[500], 0.4),
      backgroundColor: rgba(p.blue[500], 0.1),
    },
    name: {
      margin: 0,
      fontSize: 14,
      fontWeight: 500,
      color: t.text.secondary,
    },
    nameSelected: { color: rgb(p.blue[300]) },
    detail: {
      margin: 0,
      fontSize: 12,
      color: t.text.subtle,
    },
    grow: { flex: 1, minWidth: 0 },
    check: { color: rgb(p.blue[400]), flexShrink: 0 },
  };
});

export interface ChangeEnvironmentDialogProps {
  open: boolean;
  onClose: () => void;
  cluster: Cluster;
  environments: TeamEnvironment[];
  /** Resolves with the moved cluster, or throws for the dialog to show. */
  onChange: (environment: string) => Promise<Cluster>;
}

/**
 * Console's Change environment.
 *
 * This is not a cosmetic label. butler-server moves the environment label
 * and sets the migration annotation the ADR-009 admission webhook requires,
 * and the move is made as the calling user, so the webhook sees who asked.
 * Environment carries per-environment quota and placement, so a refusal
 * from the webhook is shown as the reason the move did not happen.
 *
 * Clearing the environment is only offered to a cluster that already has
 * none, because an unlabelled cluster cannot be recreated once a team runs
 * environments.
 */
export const ChangeEnvironmentDialog = ({
  open,
  onClose,
  cluster,
  environments,
  onChange,
}: ChangeEnvironmentDialogProps) => {
  const classes = useStyles();
  const current = clusterEnvironment(cluster.metadata.labels);
  const [selected, setSelected] = useState(current);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSelected(current);
      setError(null);
    }
  }, [open, current]);

  const changed = selected !== current;

  const move = async () => {
    if (!changed) return;
    setMoving(true);
    setError(null);
    try {
      await onChange(selected);
      onClose();
    } catch (e) {
      setError(
        extractWebhookDenial(
          e instanceof Error ? e.message : 'Failed to change environment',
        ),
      );
      setMoving(false);
    }
  };

  const options: Array<{ value: string; label: string; detail?: string }> = [
    ...(current === ''
      ? [{ value: '', label: 'None', detail: 'No environment label' }]
      : []),
    ...environments.map(env => ({
      value: env.name,
      label: env.displayName || env.name,
      detail:
        env.maxClusters !== undefined
          ? `Up to ${env.maxClusters} clusters`
          : env.description,
    })),
  ];

  return (
    <ButlerDialog
      open={open}
      onClose={onClose}
      busy={moving}
      title="Change environment"
      subtitle={cluster.metadata.name}
      footer={
        <>
          <ButlerButton variant="secondary" onClick={onClose} disabled={moving}>
            Cancel
          </ButlerButton>
          <ButlerButton onClick={move} disabled={moving || !changed}>
            {moving ? 'Moving...' : 'Change environment'}
          </ButlerButton>
        </>
      }
    >
      <p className={classes.intro}>
        Environment decides the quota this cluster counts against and where it
        is placed. The move is checked by the platform before it is applied.
      </p>

      <div className={classes.list} role="radiogroup" aria-label="Environment">
        {options.map(option => {
          const active = option.value === selected;
          return (
            <button
              key={option.value || 'none'}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={moving}
              className={clsx(classes.option, active && classes.selected)}
              onClick={() => setSelected(option.value)}
            >
              <span className={classes.grow}>
                <span
                  className={clsx(classes.name, active && classes.nameSelected)}
                >
                  {option.label}
                  {option.value === current ? ' (current)' : ''}
                </span>
                {option.detail && (
                  <span className={classes.detail}> {option.detail}</span>
                )}
              </span>
              {active && <CheckIcon className={classes.check} />}
            </button>
          );
        })}
      </div>

      {error && <ButlerCallout tone="danger">{error}</ButlerCallout>}
    </ButlerDialog>
  );
};
