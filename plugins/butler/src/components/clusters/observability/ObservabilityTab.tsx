// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';
import { butlerApiRef } from '../../../api/ButlerApi';
import { ButlerApiError } from '../../../api/ButlerApiError';
import type { InstalledAddon } from '../../../api/types/addons';
import type { ObservabilityConfig } from '../../../api/types/observability';
import { useButlerResource } from '../../../hooks/useButlerResource';
import {
  SIGNALS,
  addonForSignal,
  describeSignalState,
  isTransitional,
  signalDestination,
  type SignalDefinition,
} from '../../../utils/observability';
import { butlerTokens, rgb } from '../../../theme';
import {
  ButlerButton,
  ButlerCallout,
  ButlerCard,
  ButlerChip,
  ButlerErrorState,
  ButlerGrid,
  ButlerKeyValueList,
  ButlerKeyValueRow,
  ButlerLoading,
  ButlerStack,
} from '../../ui';
import { EnableSignalDialog } from './EnableSignalDialog';
import { DisableSignalDialog } from './DisableSignalDialog';

/** Matches the cluster page's own cadence while something is in flight. */
const TRANSITIONAL_POLL_MS = 5000;

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  return {
    head: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    title: {
      margin: 0,
      fontSize: 16,
      fontWeight: 500,
      color: rgb(t.palette.neutral[100]),
    },
    sub: { margin: '2px 0 0', fontSize: 12, color: t.text.subtle },
    detail: {
      margin: '12px 0 0',
      fontSize: 13,
      lineHeight: '18px',
      color: rgb(t.palette.neutral[300]),
    },
    flow: {
      margin: '12px 0 0',
      display: 'grid',
      gridTemplateColumns: '1fr auto 1fr auto 1fr',
      alignItems: 'center',
      gap: 8,
      fontSize: 12,
      color: t.text.subtle,
    },
    flowNode: {
      padding: '6px 8px',
      borderRadius: t.radius.lg,
      border: `1px solid ${t.border}`,
      fontFamily: t.fontMono,
      fontSize: 12,
      color: rgb(t.palette.neutral[200]),
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    arrow: { color: t.text.subtle },
    actions: { display: 'flex', justifyContent: 'flex-end', marginTop: 12 },
    note: { margin: 0, fontSize: 12, color: t.text.subtle },
  };
});

export interface ObservabilityTabProps {
  clusterNamespace: string;
  clusterName: string;
  /** Whether the caller may install and remove addons on this cluster. */
  canOperate: boolean;
}

interface TabData {
  addons: InstalledAddon[];
  config: ObservabilityConfig | null;
  /** The platform answered 404 for its configuration: no pipeline exists. */
  pipelineAbsent: boolean;
}

/**
 * A cluster's observability: one card per signal, each backed by the
 * collector addon that carries it, plus where the platform pipeline
 * sends it. Butler manages the collectors on the cluster; the pipeline
 * is configured elsewhere and only named here.
 *
 * State comes straight from the server's addon status. "Enabling" and
 * "Collecting" are kept apart because an accepted install is not yet a
 * running collector, and the tab polls while anything is in flight so
 * the transition is watched rather than assumed.
 */
export const ObservabilityTab = ({
  clusterNamespace,
  clusterName,
  canOperate,
}: ObservabilityTabProps) => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const [enabling, setEnabling] = useState<SignalDefinition | null>(null);
  const [disabling, setDisabling] = useState<{
    signal: SignalDefinition;
    addon: InstalledAddon;
  } | null>(null);

  const load = useCallback(async (): Promise<TabData> => {
    const [addonsRes, configRes] = await Promise.all([
      api.listClusterAddons(clusterNamespace, clusterName),
      api.getObservabilityConfig().then(
        c => ({ config: c, absent: false }),
        (err: unknown) => {
          if (err instanceof ButlerApiError && err.status === 404) {
            return { config: null, absent: true };
          }
          throw err;
        },
      ),
    ]);
    return {
      addons: addonsRes.addons ?? [],
      config: configRes.config,
      pipelineAbsent: configRes.absent,
    };
  }, [api, clusterNamespace, clusterName]);

  const state = useButlerResource<TabData>(load, {
    deps: [load],
    // Poll only while a collector is being installed or removed.
    pollIntervalMs: data =>
      data?.addons.some(a =>
        SIGNALS.some(s => addonForSignal(s, [a]) && isTransitional(a.status)),
      )
        ? TRANSITIONAL_POLL_MS
        : null,
  });

  // A dialog for a signal whose addon has since disappeared must close.
  const current = state.status === 'ready' ? state.data : undefined;
  useEffect(() => {
    if (!disabling || !current) return;
    if (!addonForSignal(disabling.signal, current.addons)) {
      setDisabling(null);
    }
  }, [disabling, current]);

  if (state.status === 'loading') return <ButlerLoading />;
  if (state.status === 'error' && !state.data) {
    return (
      <ButlerErrorState
        message="Failed to load observability state"
        detail={state.error.message}
        onRetry={() => state.refresh()}
      />
    );
  }

  const data = state.data ?? {
    addons: [],
    config: null,
    pipelineAbsent: false,
  };
  const pipeline = data.config?.pipeline;

  return (
    <ButlerStack>
      {data.pipelineAbsent ? (
        <ButlerCallout tone="warning" title="No platform pipeline">
          The platform has not registered an observability pipeline. Collectors
          can still be enabled; logs then go to each agent's stdout, metrics
          stay in the cluster, and traces are logged and dropped.
        </ButlerCallout>
      ) : data.config && !data.config.configured ? (
        <ButlerCallout tone="info" compact title="Pipeline not configured">
          The platform pipeline is not configured. Collectors can be enabled but
          have nowhere central to send to yet.
        </ButlerCallout>
      ) : null}

      {pipeline && (
        <ButlerCard title="Platform pipeline">
          <ButlerKeyValueList>
            {pipeline.clusterName && (
              <ButlerKeyValueRow label="Pipeline cluster" dense mono>
                {`${pipeline.clusterNamespace ?? ''}/${pipeline.clusterName}`}
              </ButlerKeyValueRow>
            )}
            {pipeline.logEndpoint && (
              <ButlerKeyValueRow label="Logs" dense mono>
                {pipeline.logEndpoint}
              </ButlerKeyValueRow>
            )}
            {pipeline.metricEndpoint && (
              <ButlerKeyValueRow label="Metrics" dense mono>
                {pipeline.metricEndpoint}
              </ButlerKeyValueRow>
            )}
            {pipeline.traceEndpoint && (
              <ButlerKeyValueRow label="Traces" dense mono>
                {pipeline.traceEndpoint}
              </ButlerKeyValueRow>
            )}
          </ButlerKeyValueList>
          {data.config?.collection?.autoEnroll && (
            <p className={classes.note}>
              Auto-enrolled on new clusters:{' '}
              {[
                data.config.collection.autoEnroll.vectorAgent && 'logs',
                data.config.collection.autoEnroll.prometheus && 'metrics',
                data.config.collection.autoEnroll.otelCollector && 'traces',
              ]
                .filter(Boolean)
                .join(', ') || 'none'}
              .
            </p>
          )}
        </ButlerCard>
      )}

      <ButlerGrid columns={3}>
        {SIGNALS.map(signal => {
          const addon = addonForSignal(signal, data.addons);
          const described = describeSignalState(addon);
          const moving = isTransitional(addon?.status);
          return (
            <ButlerCard
              key={signal.key}
              role="region"
              aria-label={`${signal.label} collection`}
            >
              <div className={classes.head}>
                <div>
                  <p className={classes.title}>{signal.label}</p>
                  <p className={classes.sub}>
                    {signal.collector}
                    {addon?.installedVersion || addon?.version
                      ? ` v${addon.installedVersion ?? addon.version}`
                      : ''}
                  </p>
                </div>
                <ButlerChip tone={described.tone}>
                  {described.headline}
                </ButlerChip>
              </div>
              <p className={classes.detail}>{described.detail}</p>
              {addon?.managedBy === 'platform' && (
                <p className={classes.note}>Managed by the platform.</p>
              )}
              <div className={classes.flow}>
                <span className={classes.flowNode} title={signal.sources}>
                  {signal.sources}
                </span>
                <span className={classes.arrow}>{'→'}</span>
                <span className={classes.flowNode}>
                  {signal.collector} ({signal.collectorKind})
                </span>
                <span className={classes.arrow}>{'→'}</span>
                <span
                  className={classes.flowNode}
                  title={signalDestination(signal, data.config)}
                >
                  {signalDestination(signal, data.config)}
                </span>
              </div>
              {canOperate && (
                <div className={classes.actions}>
                  {addon ? (
                    addon.managedBy === 'platform' ? null : (
                      <ButlerButton
                        variant="danger"
                        size="sm"
                        disabled={moving}
                        onClick={() => setDisabling({ signal, addon })}
                      >
                        Disable
                      </ButlerButton>
                    )
                  ) : (
                    <ButlerButton size="sm" onClick={() => setEnabling(signal)}>
                      Enable
                    </ButlerButton>
                  )}
                </div>
              )}
            </ButlerCard>
          );
        })}
      </ButlerGrid>

      <ButlerCard title="What Butler manages">
        <p className={classes.note}>
          Butler installs and reconciles the collector on this cluster for each
          signal and points it at the platform pipeline. The pipeline and what
          happens after data arrives there are the platform's, configured
          separately. Enablement and removal are accepted at once and carried
          out by the platform; this page watches the addon until it settles.
        </p>
      </ButlerCard>

      {enabling && (
        <EnableSignalDialog
          open
          signal={enabling}
          clusterName={clusterName}
          config={data.config}
          onClose={() => setEnabling(null)}
          onEnabled={async () => {
            setEnabling(null);
            await state.refresh(true);
          }}
          onEnable={(addon, values) =>
            api.installAddon(clusterNamespace, clusterName, { addon, values })
          }
        />
      )}

      {disabling && (
        <DisableSignalDialog
          open
          signal={disabling.signal}
          addon={disabling.addon}
          clusterName={clusterName}
          onClose={() => setDisabling(null)}
          onDisabled={async () => {
            setDisabling(null);
            await state.refresh(true);
          }}
          onDisable={name =>
            api.uninstallAddon(clusterNamespace, clusterName, name)
          }
        />
      )}
    </ButlerStack>
  );
};
