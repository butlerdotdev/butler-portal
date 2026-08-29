// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { ObservabilityConfig } from '../../../api/types/observability';
import { extractWebhookDenial } from '../../../api/ButlerApiError';
import {
  buildLogCollectionValues,
  buildMetricCollectionValues,
  buildTraceCollectionValues,
  type SignalDefinition,
} from '../../../utils/observability';
import { butlerTokens, rgb } from '../../../theme';
import {
  ButlerButton,
  ButlerCallout,
  ButlerCheckbox,
  ButlerDialog,
  ButlerField,
  ButlerInput,
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
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: 12,
    },
    checks: { display: 'flex', flexDirection: 'column', gap: 6 },
  };
});

export interface EnableSignalDialogProps {
  open: boolean;
  signal: SignalDefinition;
  clusterName: string;
  config: ObservabilityConfig | null;
  onClose: () => void;
  onEnabled: () => void | Promise<void>;
  onEnable: (
    addon: string,
    values: Record<string, unknown>,
  ) => Promise<unknown>;
}

/**
 * Enabling a signal installs its collector addon with values that point
 * at the platform pipeline. The inputs are the ones the console offers,
 * prefilled from the platform configuration; the values sent are built
 * by the same functions the tests cover, not assembled here.
 */
export const EnableSignalDialog = ({
  open,
  signal,
  clusterName,
  config,
  onClose,
  onEnabled,
  onEnable,
}: EnableSignalDialogProps) => {
  const classes = useStyles();
  const pipeline = config?.pipeline;
  const [endpoint, setEndpoint] = useState('');
  const [podLogs, setPodLogs] = useState(true);
  const [journald, setJournald] = useState(false);
  const [kubernetesEvents, setKubernetesEvents] = useState(false);
  const [retention, setRetention] = useState('2h');
  const [storageSize, setStorageSize] = useState('10Gi');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setEndpoint(pipeline?.[signal.endpointKey] ?? '');
    setPodLogs(config?.collection?.logs?.podLogs ?? true);
    setJournald(config?.collection?.logs?.journald ?? false);
    setKubernetesEvents(config?.collection?.logs?.kubernetesEvents ?? false);
    setRetention(config?.collection?.metrics?.retention ?? '2h');
    setStorageSize('10Gi');
    setSaving(false);
    setError(null);
  }, [open, signal, config, pipeline]);

  const values = (): Record<string, unknown> => {
    switch (signal.key) {
      case 'logs':
        return buildLogCollectionValues(clusterName, {
          aggregatorEndpoint: endpoint.trim(),
          podLogs,
          journald,
          kubernetesEvents,
        });
      case 'metrics':
        return buildMetricCollectionValues(clusterName, {
          metricEndpoint: endpoint.trim(),
          retention: retention.trim() || '2h',
          storageSize: storageSize.trim() || '10Gi',
        });
      default:
        return buildTraceCollectionValues(clusterName, {
          traceEndpoint: endpoint.trim(),
        });
    }
  };

  const handleEnable = async () => {
    setSaving(true);
    setError(null);
    try {
      await onEnable(signal.addon, values());
      await onEnabled();
    } catch (err) {
      setError(
        extractWebhookDenial(
          err instanceof Error ? err.message : 'Failed to enable collection',
        ),
      );
      setSaving(false);
    }
  };

  const endpointLabel =
    signal.key === 'logs'
      ? 'Aggregator endpoint'
      : signal.key === 'metrics'
      ? 'Remote write endpoint'
      : 'OTLP export endpoint';

  return (
    <ButlerDialog
      open={open}
      onClose={saving ? () => {} : onClose}
      title={`Enable ${signal.label.toLowerCase()} collection`}
      subtitle={clusterName}
      width={512}
      busy={saving}
      footer={
        <>
          <ButlerButton variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </ButlerButton>
          <ButlerButton onClick={handleEnable} disabled={saving}>
            {saving ? 'Requesting...' : `Enable ${signal.label.toLowerCase()}`}
          </ButlerButton>
        </>
      }
    >
      <p className={classes.lead}>
        Installs {signal.collector} as a {signal.collectorKind} on this cluster.
        Enablement is accepted immediately; the collector takes a little while
        to install and this page shows it as enabling until the platform reports
        it running.
      </p>

      <ButlerField
        label={endpointLabel}
        htmlFor="obs-endpoint"
        help={
          endpoint
            ? 'Prefilled from the platform pipeline.'
            : `No pipeline endpoint is configured; ${signal.fallbackDestination}.`
        }
      >
        <ButlerInput
          id="obs-endpoint"
          value={endpoint}
          onChange={e => setEndpoint(e.target.value)}
          disabled={saving}
          mono
          placeholder={
            signal.key === 'traces'
              ? 'http://tempo:4318 or tempo:4317'
              : 'http://host:port'
          }
        />
      </ButlerField>

      {signal.key === 'logs' && (
        <ButlerField label="Sources">
          <div className={classes.checks}>
            <ButlerCheckbox
              checked={podLogs}
              onChange={e => setPodLogs(e.target.checked)}
              label="Pod stdout and stderr"
              disabled={saving}
            />
            <ButlerCheckbox
              checked={journald}
              onChange={e => setJournald(e.target.checked)}
              label="Node journald"
              disabled={saving}
            />
            <ButlerCheckbox
              checked={kubernetesEvents}
              onChange={e => setKubernetesEvents(e.target.checked)}
              label="Kubernetes events and agent metrics"
              disabled={saving}
            />
          </div>
        </ButlerField>
      )}

      {signal.key === 'metrics' && (
        <div className={classes.grid}>
          <ButlerField label="Retention" htmlFor="obs-retention">
            <ButlerInput
              id="obs-retention"
              value={retention}
              onChange={e => setRetention(e.target.value)}
              disabled={saving}
              mono
              placeholder="2h"
            />
          </ButlerField>
          <ButlerField label="Storage" htmlFor="obs-storage">
            <ButlerInput
              id="obs-storage"
              value={storageSize}
              onChange={e => setStorageSize(e.target.value)}
              disabled={saving}
              mono
              placeholder="10Gi"
            />
          </ButlerField>
        </div>
      )}

      {error && (
        <ButlerCallout tone="danger" title="Could not enable">
          {error}
        </ButlerCallout>
      )}
    </ButlerDialog>
  );
};
