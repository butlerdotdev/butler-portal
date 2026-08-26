// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Cluster } from '../../api/types/clusters';
import { extractWebhookDenial } from '../../api/ButlerApiError';
import { butlerTokens, rgb } from '../../theme';
import {
  ButlerButton,
  ButlerCallout,
  ButlerDialog,
  ButlerField,
  ButlerInput,
} from '../ui';

const MIN_REPLICAS = 1;
const MAX_REPLICAS = 100;

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  return {
    change: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 12,
      fontFamily: t.fontMono,
      fontSize: 24,
      color: t.text.primary,
    },
    arrow: { color: t.text.subtle, fontSize: 16 },
    from: { color: t.text.muted },
    caption: {
      margin: 0,
      fontSize: 12,
      color: t.text.subtle,
    },
    removing: { color: rgb(t.palette.amber[400]) },
  };
});

export interface ScaleWorkersDialogProps {
  open: boolean;
  onClose: () => void;
  cluster: Cluster;
  /** Resolves with the scaled cluster, or throws for the dialog to show. */
  onScale: (replicas: number) => Promise<Cluster>;
}

/**
 * Console's Scale Workers. Butler carries a single worker replica count on
 * the cluster rather than several pools, so this is one number, bounded the
 * way butler-server bounds it.
 *
 * Scaling down removes nodes and whatever is still running on them, so that
 * direction is called out before it is accepted.
 */
export const ScaleWorkersDialog = ({
  open,
  onClose,
  cluster,
  onScale,
}: ScaleWorkersDialogProps) => {
  const classes = useStyles();
  const current = cluster.spec.workers?.replicas ?? 0;
  const [replicas, setReplicas] = useState(current);
  const [scaling, setScaling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReplicas(current);
      setError(null);
    }
  }, [open, current]);

  const valid =
    Number.isFinite(replicas) &&
    replicas >= MIN_REPLICAS &&
    replicas <= MAX_REPLICAS;
  const changed = replicas !== current;
  const removing = changed && replicas < current;

  const scale = async () => {
    if (!valid || !changed) return;
    setScaling(true);
    setError(null);
    try {
      await onScale(replicas);
      onClose();
    } catch (e) {
      setError(
        extractWebhookDenial(
          e instanceof Error ? e.message : 'Failed to scale cluster',
        ),
      );
      setScaling(false);
    }
  };

  return (
    <ButlerDialog
      open={open}
      onClose={onClose}
      busy={scaling}
      title="Scale Workers"
      subtitle={cluster.metadata.name}
      footer={
        <>
          <ButlerButton
            variant="secondary"
            onClick={onClose}
            disabled={scaling}
          >
            Cancel
          </ButlerButton>
          <ButlerButton
            variant={removing ? 'danger' : 'primary'}
            onClick={scale}
            disabled={scaling || !valid || !changed}
          >
            {scaling ? 'Scaling...' : removing ? 'Remove Nodes' : 'Scale'}
          </ButlerButton>
        </>
      }
    >
      <ButlerField
        label="Worker Replicas"
        htmlFor="scale-replicas"
        help={`Between ${MIN_REPLICAS} and ${MAX_REPLICAS}.`}
        error={
          valid
            ? undefined
            : `Must be between ${MIN_REPLICAS} and ${MAX_REPLICAS}`
        }
      >
        <ButlerInput
          id="scale-replicas"
          type="number"
          min={MIN_REPLICAS}
          max={MAX_REPLICAS}
          value={replicas}
          disabled={scaling}
          autoFocus
          onChange={e => setReplicas(parseInt(e.target.value, 10))}
          onKeyDown={e => {
            if (e.key === 'Enter') scale();
          }}
        />
      </ButlerField>

      <div>
        <div className={classes.change}>
          <span className={classes.from}>{current}</span>
          <span className={classes.arrow} aria-hidden>
            to
          </span>
          <span className={removing ? classes.removing : undefined}>
            {valid ? replicas : '-'}
          </span>
        </div>
        <p className={classes.caption}>
          {cluster.status?.workerNodesReady ?? 0} of {current} worker nodes
          ready right now.
        </p>
      </div>

      {removing && (
        <ButlerCallout tone="warning">
          {current - replicas} node{current - replicas === 1 ? '' : 's'} will be
          removed. Workloads that cannot be rescheduled elsewhere will stop.
        </ButlerCallout>
      )}

      {error && <ButlerCallout tone="danger">{error}</ButlerCallout>}
    </ButlerDialog>
  );
};
