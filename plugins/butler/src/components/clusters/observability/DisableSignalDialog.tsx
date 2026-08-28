// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { InstalledAddon } from '../../../api/types/addons';
import {
  ButlerApiError,
  extractWebhookDenial,
} from '../../../api/ButlerApiError';
import type { SignalDefinition } from '../../../utils/observability';
import { butlerTokens, rgb } from '../../../theme';
import {
  AlertTriangleIcon,
  ButlerButton,
  ButlerCallout,
  ButlerDialog,
  ButlerKeyValueList,
  ButlerKeyValueRow,
} from '../../ui';

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

export interface DisableSignalDialogProps {
  open: boolean;
  signal: SignalDefinition;
  addon: InstalledAddon;
  clusterName: string;
  onClose: () => void;
  onDisabled: () => void | Promise<void>;
  onDisable: (addonName: string) => Promise<void>;
}

/**
 * Disabling a signal uninstalls its collector addon. The console does
 * this with a bare button; here it is confirmed, because it is the
 * cluster's telemetry that stops. What it does and does not do is stated
 * from the server's behaviour: the addon and its release are removed,
 * nothing already shipped is touched, and metrics kept in a Prometheus
 * volume go with the release.
 */
export const DisableSignalDialog = ({
  open,
  signal,
  addon,
  clusterName,
  onClose,
  onDisabled,
  onDisable,
}: DisableSignalDialogProps) => {
  const classes = useStyles();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setBusy(false);
    setError(null);
  }, [open]);

  const handleDisable = async () => {
    setBusy(true);
    setError(null);
    try {
      await onDisable(addon.name);
      await onDisabled();
    } catch (err) {
      // Already gone is the state we were asking for.
      if (err instanceof ButlerApiError && err.status === 404) {
        await onDisabled();
        return;
      }
      setError(
        extractWebhookDenial(
          err instanceof Error ? err.message : 'Failed to disable collection',
        ),
      );
      setBusy(false);
    }
  };

  return (
    <ButlerDialog
      open={open}
      onClose={busy ? () => {} : onClose}
      title={`Disable ${signal.label.toLowerCase()} collection`}
      subtitle={clusterName}
      icon={<AlertTriangleIcon />}
      iconTone="danger"
      busy={busy}
      footer={
        <>
          <ButlerButton variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </ButlerButton>
          <ButlerButton
            variant="danger"
            onClick={handleDisable}
            disabled={busy}
          >
            {busy ? 'Requesting...' : `Disable ${signal.label.toLowerCase()}`}
          </ButlerButton>
        </>
      }
    >
      <p className={classes.lead}>
        This removes {signal.collector} from the cluster. {signal.label} stop
        being collected as soon as the collector is gone; anything already sent
        to the pipeline stays there.
        {signal.key === 'metrics'
          ? ' Metrics held in the in-cluster Prometheus volume are removed with it.'
          : ''}
      </p>
      <ButlerKeyValueList>
        <ButlerKeyValueRow label="Signal" dense>
          {signal.label}
        </ButlerKeyValueRow>
        <ButlerKeyValueRow label="Collector" dense>
          {signal.collector}
        </ButlerKeyValueRow>
        <ButlerKeyValueRow label="Addon" dense mono>
          {addon.name}
        </ButlerKeyValueRow>
        <ButlerKeyValueRow label="Cluster" dense mono>
          {clusterName}
        </ButlerKeyValueRow>
      </ButlerKeyValueList>
      {error && (
        <ButlerCallout tone="danger" title="Could not disable">
          {error}
        </ButlerCallout>
      )}
    </ButlerDialog>
  );
};
