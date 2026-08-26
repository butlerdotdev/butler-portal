// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { IPAllocation } from '../../api/types/networks';
import { ButlerApiError, extractWebhookDenial } from '../../api/ButlerApiError';
import { butlerTokens, rgb } from '../../theme';
import {
  AlertTriangleIcon,
  ButlerButton,
  ButlerCallout,
  ButlerDialog,
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

export interface ReleaseAllocationDialogProps {
  open: boolean;
  allocation: IPAllocation;
  clusterName: string;
  onClose: () => void;
  /** Re-reads the allocations from the server after a release. */
  onReleased: () => void | Promise<void>;
  onRelease: (namespace: string, name: string) => Promise<void>;
}

/**
 * Releasing returns addresses to the pool while the cluster is still using
 * them, so it is presented as the destructive act it is rather than as a
 * tidy-up. The list is re-read from the server afterwards instead of the
 * row being removed optimistically.
 */
export const ReleaseAllocationDialog = ({
  open,
  allocation,
  clusterName,
  onClose,
  onReleased,
  onRelease,
}: ReleaseAllocationDialogProps) => {
  const classes = useStyles();
  const [releasing, setReleasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = allocation.status ?? {};
  const range =
    status.startAddress && status.endAddress
      ? `${status.startAddress} to ${status.endAddress}`
      : (status.addresses ?? []).join(', ') || 'no addresses recorded';

  const release = async () => {
    setReleasing(true);
    setError(null);
    try {
      await onRelease(allocation.metadata.namespace, allocation.metadata.name);
      await onReleased();
      onClose();
    } catch (e) {
      if (e instanceof ButlerApiError && e.status === 404) {
        // Already gone. The list is refreshed so the row disappears rather
        // than leaving a stale entry behind.
        await onReleased();
        onClose();
        return;
      }
      setError(
        extractWebhookDenial(
          e instanceof Error ? e.message : 'Failed to release the allocation',
        ),
      );
      setReleasing(false);
    }
  };

  return (
    <ButlerDialog
      open={open}
      onClose={onClose}
      busy={releasing}
      title="Release allocation"
      subtitle={allocation.metadata.name}
      icon={<AlertTriangleIcon />}
      iconTone="danger"
      footer={
        <>
          <ButlerButton
            variant="secondary"
            onClick={onClose}
            disabled={releasing}
          >
            Cancel
          </ButlerButton>
          <ButlerButton variant="danger" onClick={release} disabled={releasing}>
            {releasing ? 'Releasing...' : 'Release addresses'}
          </ButlerButton>
        </>
      }
    >
      <p className={classes.lead}>
        These addresses return to the pool and can be handed to another cluster.{' '}
        {clusterName} is still using them, so anything reaching it on this range
        stops working.
      </p>

      <ButlerKeyValueList dense>
        <ButlerKeyValueRow label="Cluster" dense>
          {clusterName}
        </ButlerKeyValueRow>
        <ButlerKeyValueRow label="Type" dense>
          {allocation.spec.type ?? 'nodes'}
        </ButlerKeyValueRow>
        <ButlerKeyValueRow label="Addresses" dense mono>
          {range}
        </ButlerKeyValueRow>
        <ButlerKeyValueRow label="Pool" dense mono>
          {allocation.spec.poolRef.name}
        </ButlerKeyValueRow>
        <ButlerKeyValueRow label="Phase" dense>
          {status.phase ?? 'Pending'}
        </ButlerKeyValueRow>
      </ButlerKeyValueList>

      {error && <ButlerCallout tone="danger">{error}</ButlerCallout>}
    </ButlerDialog>
  );
};
