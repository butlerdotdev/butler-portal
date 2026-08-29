// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { TeamEnvironment } from '../../api/types/environments';
import { ButlerApiError, extractWebhookDenial } from '../../api/ButlerApiError';
import { butlerTokens, rgb } from '../../theme';
import {
  AlertTriangleIcon,
  ButlerButton,
  ButlerCallout,
  ButlerDialog,
  ButlerField,
  ButlerInput,
  ButlerKeyValueList,
  ButlerKeyValueRow,
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
  };
});

export interface DeleteEnvironmentDialogProps {
  open: boolean;
  team: string;
  environment: TeamEnvironment;
  /** Clusters currently labelled with this environment. */
  clusterCount: number;
  onClose: () => void;
  onDeleted: () => void | Promise<void>;
  onDelete: (team: string, name: string) => Promise<void>;
}

/**
 * Deleting an environment is not blocked by the clusters that use it. The
 * server removes the entry and leaves those clusters labelled, so they
 * keep running while pointing at an environment that no longer exists and
 * stop counting against any per-environment limit. That consequence is
 * stated here rather than discovered afterwards, and the name has to be
 * typed because it cannot be undone.
 */
export const DeleteEnvironmentDialog = ({
  open,
  team,
  environment,
  clusterCount,
  onClose,
  onDeleted,
  onDelete,
}: DeleteEnvironmentDialogProps) => {
  const classes = useStyles();
  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setConfirmation('');
    setDeleting(false);
    setError(null);
  }, [open]);

  const confirmed = confirmation === environment.name;

  const handleDelete = async () => {
    if (!confirmed) return;
    setDeleting(true);
    setError(null);
    try {
      await onDelete(team, environment.name);
      await onDeleted();
    } catch (err) {
      // Already gone is the state we were asking for.
      if (err instanceof ButlerApiError && err.status === 404) {
        await onDeleted();
        return;
      }
      setError(
        extractWebhookDenial(
          err instanceof Error ? err.message : 'Failed to delete environment',
        ),
      );
      setDeleting(false);
      return;
    }
    setDeleting(false);
  };

  return (
    <ButlerDialog
      open={open}
      onClose={deleting ? () => {} : onClose}
      title="Delete environment"
      subtitle={environment.name}
      icon={<AlertTriangleIcon />}
      iconTone="danger"
      busy={deleting}
      footer={
        <>
          <ButlerButton
            variant="secondary"
            onClick={onClose}
            disabled={deleting}
            type="button"
          >
            Cancel
          </ButlerButton>
          <ButlerButton
            variant="danger"
            onClick={handleDelete}
            disabled={!confirmed || deleting}
            type="button"
          >
            {deleting ? 'Deleting...' : 'Delete environment'}
          </ButlerButton>
        </>
      }
    >
      <p className={classes.lead}>
        {clusterCount > 0
          ? `${clusterCount} ${
              clusterCount === 1
                ? 'cluster still carries'
                : 'clusters still carry'
            } this environment. ${
              clusterCount === 1 ? 'It keeps' : 'They keep'
            } running, but ${
              clusterCount === 1 ? 'it will' : 'they will'
            } point at an environment that no longer exists and stop counting against any per-environment limit.`
          : 'No clusters currently use this environment.'}
      </p>

      <ButlerKeyValueList>
        <ButlerKeyValueRow label="Environment" dense mono>
          {environment.name}
        </ButlerKeyValueRow>
        <ButlerKeyValueRow label="Team" dense mono>
          {team}
        </ButlerKeyValueRow>
        <ButlerKeyValueRow label="Clusters affected" dense>
          {clusterCount}
        </ButlerKeyValueRow>
        <ButlerKeyValueRow label="Max clusters" dense>
          {environment.limits?.maxClusters == null
            ? 'unlimited'
            : environment.limits.maxClusters}
        </ButlerKeyValueRow>
      </ButlerKeyValueList>

      <ButlerField
        label={`Type ${environment.name} to confirm`}
        htmlFor="delete-env-confirm"
      >
        <ButlerInput
          id="delete-env-confirm"
          value={confirmation}
          onChange={e => setConfirmation(e.target.value)}
          placeholder={environment.name}
          disabled={deleting}
          mono
          autoFocus
        />
      </ButlerField>

      {error && (
        <ButlerCallout tone="danger" title="Could not delete">
          {error}
        </ButlerCallout>
      )}
    </ButlerDialog>
  );
};
