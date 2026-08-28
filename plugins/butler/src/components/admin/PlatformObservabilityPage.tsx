// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { alertApiRef, useApi } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';

import { butlerApiRef } from '../../api/ButlerApi';
import { ButlerApiError } from '../../api/ButlerApiError';
import type { Cluster } from '../../api/types/clusters';
import type {
  ClusterObsInfo,
  ObservabilityConfig,
  ObservabilityStatus,
} from '../../api/types/observability';
import { useButlerRoutes } from '../../hooks/useButlerRoutes';
import { useTeamContext } from '../../hooks/useTeamContext';
import { butlerTokens, rgb } from '../../theme';
import {
  autoEnrollAvailability,
  buildCollectionUpdate,
  buildPipelineUpdate,
  buildSetupRequest,
  clusterCollectors,
  collectionForm,
  isEnrolled,
  pipelineEndpointsForm,
  pipelineFacts,
  validatePipelineEndpoints,
  type CollectionForm,
  type PipelineEndpointsForm,
} from '../../utils/platformObservability';
import {
  ButlerButton,
  ButlerCallout,
  ButlerCard,
  ButlerCheckbox,
  ButlerChip,
  ButlerDashboardStat,
  ButlerDialog,
  ButlerErrorState,
  ButlerField,
  ButlerFormSection,
  ButlerInput,
  ButlerKeyValueList,
  ButlerKeyValueRow,
  ButlerLoading,
  ButlerPageHeader,
  ButlerSelect,
  ButlerStack,
  ButlerStatGrid,
  ButlerStatusBadge,
  ButlerTable,
  RefreshIcon,
  TrashIcon,
  type ButlerColumn,
} from '../ui';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  return {
    card: { padding: 24, display: 'flex', flexDirection: 'column', gap: 16 },
    cardHead: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
      flexWrap: 'wrap',
    },
    title: {
      margin: 0,
      fontSize: 16,
      lineHeight: '24px',
      fontWeight: 500,
      color: rgb(t.palette.neutral[100]),
    },
    lead: {
      margin: '4px 0 0',
      fontSize: 13,
      color: t.text.subtle,
      maxWidth: 640,
    },
    actions: {
      display: 'flex',
      gap: 8,
      alignItems: 'center',
      flexWrap: 'wrap',
    },
    grid2: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
      gap: 16,
    },
    facts: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
      gap: 12,
    },
    fact: { display: 'flex', flexDirection: 'column', gap: 4 },
    factLabel: { fontSize: 12, color: t.text.subtle },
    factValue: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 14,
      color: rgb(t.palette.neutral[200]),
    },
    factDetail: { fontSize: 12, color: t.text.subtle, margin: 0 },
    link: {
      color: rgb(t.palette.green[400]),
      textDecoration: 'none',
      '&:hover': { textDecoration: 'underline' },
    },
    muted: { color: t.text.subtle },
    deleteText: { margin: 0, fontSize: 14, color: rgb(t.palette.neutral[200]) },
    deleteHint: { margin: '8px 0 0', fontSize: 13, color: t.text.subtle },
  };
});

type LoadState = {
  config: ObservabilityConfig | null;
  /** The server does not expose observability configuration at all (404). */
  unsupported: boolean;
  status: ObservabilityStatus | null;
  /** Why fleet status is missing: 403 for a platform viewer, or a message. */
  statusError: { forbidden: boolean; message: string } | null;
};

/**
 * The central observability pipeline: where every cluster's collectors
 * send their signals, and how many clusters are enrolled. This page is
 * about the pipeline the platform names in ButlerConfig and the fleet
 * seen from it. The collectors themselves are installed and configured
 * per cluster on that cluster's Observability tab, and they are ordinary
 * addons on its Addons tab; this page links to them and does not manage
 * them.
 */
export const PlatformObservabilityPage = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const alertApi = useApi(alertApiRef);
  const routes = useButlerRoutes();
  const { isAdmin: canMutate } = useTeamContext();

  const [state, setState] = useState<LoadState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setRefreshing(true);
    try {
      let config: ObservabilityConfig | null = null;
      let unsupported = false;
      try {
        config = await api.getObservabilityConfig();
      } catch (err) {
        if (err instanceof ButlerApiError && err.status === 404) {
          unsupported = true;
        } else {
          throw err;
        }
      }
      let status: ObservabilityStatus | null = null;
      let statusError: LoadState['statusError'] = null;
      if (!unsupported) {
        try {
          status = await api.getObservabilityStatus();
        } catch (err) {
          statusError = {
            forbidden: err instanceof ButlerApiError && err.status === 403,
            message:
              err instanceof Error
                ? err.message
                : 'Failed to load fleet status',
          };
        }
      }
      setState({ config, unsupported, status, statusError });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load observability',
      );
    } finally {
      setRefreshing(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  // Clusters are only needed to pick a pipeline host, which only an
  // admin can do; nobody else pays for the list.
  useEffect(() => {
    if (!canMutate) return;
    let cancelled = false;
    api
      .listClusters()
      .then(res => {
        if (!cancelled) setClusters(res.clusters ?? []);
      })
      .catch(() => {
        if (!cancelled) setClusters([]);
      });
    return () => {
      cancelled = true;
    };
  }, [api, canMutate]);

  const notify = (message: string, severity: 'success' | 'error') =>
    alertApi.post({ message, severity, display: 'transient' });

  if (error) return <ButlerErrorState message={error} onRetry={load} />;
  if (!state) return <ButlerLoading />;

  const header = (
    <ButlerPageHeader
      title="Observability"
      subtitle="The central pipeline that every cluster's collectors send to, and the fleet enrolled in it"
      actions={
        <ButlerButton
          variant="secondary"
          startIcon={<RefreshIcon />}
          onClick={load}
          disabled={refreshing}
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </ButlerButton>
      }
    />
  );

  if (state.unsupported) {
    return (
      <ButlerStack>
        {header}
        <ButlerCallout
          tone="warning"
          title="Observability is not available on this server"
        >
          The server answered 404 for the observability configuration. Butler
          Server needs a version that carries the observability routes before a
          pipeline can be registered or the fleet read.
        </ButlerCallout>
      </ButlerStack>
    );
  }

  const { config, status, statusError } = state;
  const facts = pipelineFacts(config, status);

  return (
    <ButlerStack>
      {header}

      {!facts.registered ? (
        <>
          <ButlerCallout tone="info" title="No pipeline registered">
            Clusters can still install collectors, but until a pipeline is
            registered they have no central endpoint to send logs, metrics or
            traces to. A pipeline is an existing Ready cluster that runs the
            aggregation stack; registering it records its endpoints on the
            platform configuration.
          </ButlerCallout>
          {canMutate ? (
            <RegisterPipelineCard
              clusters={clusters}
              onRegister={async req => {
                await api.setupObservabilityPipeline(req);
                notify(`Pipeline registered: ${req.clusterName}`, 'success');
                await load();
              }}
            />
          ) : (
            <ButlerCallout tone="neutral" compact>
              Registering a pipeline needs a platform admin.
            </ButlerCallout>
          )}
        </>
      ) : (
        <PipelineCard
          config={config!}
          status={status}
          statusError={statusError}
          canMutate={canMutate}
          onUpdateEndpoints={async form => {
            await api.updateObservabilityConfig(
              buildPipelineUpdate(form, config!.pipeline),
            );
            notify('Pipeline endpoints updated', 'success');
            await load();
          }}
          onDeregister={async () => {
            await api.deregisterObservabilityPipeline();
            notify('Pipeline deregistered', 'success');
            await load();
          }}
        />
      )}

      {status && (
        <ButlerStatGrid aria-label="Fleet summary">
          <ButlerDashboardStat
            label="Clusters"
            value={status.summary.totalClusters}
          />
          <ButlerDashboardStat
            label="Enrolled"
            value={status.summary.enrolledClusters}
            iconTone="green"
          />
          <ButlerDashboardStat
            label="Vector agents"
            value={status.summary.vectorAgentCount}
          />
          <ButlerDashboardStat
            label="Prometheus"
            value={status.summary.prometheusCount}
          />
          <ButlerDashboardStat
            label="OTel collectors"
            value={status.summary.otelCollectorCount}
          />
        </ButlerStatGrid>
      )}

      {statusError && (
        <ButlerCallout
          tone={statusError.forbidden ? 'neutral' : 'warning'}
          title={
            statusError.forbidden
              ? 'Fleet status needs a platform admin'
              : 'Fleet status unavailable'
          }
          compact
        >
          {statusError.forbidden
            ? 'The server serves the pipeline configuration to every role but the fleet view only to platform admins.'
            : statusError.message}
        </ButlerCallout>
      )}

      {config && (
        <CollectionDefaultsCard
          config={config}
          canMutate={canMutate}
          onSave={async form => {
            await api.updateObservabilityConfig(buildCollectionUpdate(form));
            notify('Collection defaults saved', 'success');
            await load();
          }}
        />
      )}

      {status && <FleetTable clusters={status.clusters} />}
    </ButlerStack>
  );
};

/* ------------------------------------------------------------------ */

const EndpointFields = ({
  form,
  errors,
  onChange,
  disabled,
  idPrefix,
}: {
  form: PipelineEndpointsForm;
  errors: Record<string, string>;
  onChange: (next: PipelineEndpointsForm) => void;
  disabled: boolean;
  idPrefix: string;
}) => (
  <>
    <ButlerField
      label="Log endpoint"
      required
      htmlFor={`${idPrefix}-log`}
      error={errors.logEndpoint}
      help="Where Vector agents send logs: the aggregator's HTTP source or a log store API."
    >
      <ButlerInput
        id={`${idPrefix}-log`}
        mono
        value={form.logEndpoint}
        onChange={e => onChange({ ...form, logEndpoint: e.target.value })}
        placeholder="http://vector-aggregator.vector.svc:8080"
        disabled={disabled}
      />
    </ButlerField>
    <ButlerField
      label="Metric remote-write endpoint"
      htmlFor={`${idPrefix}-metric`}
      error={errors.metricEndpoint}
      help="Prometheus remote-write URL that tenant Prometheus instances forward to."
    >
      <ButlerInput
        id={`${idPrefix}-metric`}
        mono
        value={form.metricEndpoint}
        onChange={e => onChange({ ...form, metricEndpoint: e.target.value })}
        placeholder="http://victoria-metrics.monitoring.svc:8428/api/v1/write"
        disabled={disabled}
      />
    </ButlerField>
    <ButlerField
      label="Trace OTLP endpoint"
      htmlFor={`${idPrefix}-trace`}
      error={errors.traceEndpoint}
      help="OTLP endpoint that OTel collectors forward traces to."
    >
      <ButlerInput
        id={`${idPrefix}-trace`}
        mono
        value={form.traceEndpoint}
        onChange={e => onChange({ ...form, traceEndpoint: e.target.value })}
        placeholder="http://tempo.tracing.svc:4318"
        disabled={disabled}
      />
    </ButlerField>
  </>
);

const RegisterPipelineCard = ({
  clusters,
  onRegister,
}: {
  clusters: Cluster[];
  onRegister: (
    req: NonNullable<ReturnType<typeof buildSetupRequest>>,
  ) => Promise<void>;
}) => {
  const classes = useStyles();
  const [clusterRef, setClusterRef] = useState('');
  const [form, setForm] = useState<PipelineEndpointsForm>(
    pipelineEndpointsForm(undefined),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = clusters.find(
    c => `${c.metadata.namespace}/${c.metadata.name}` === clusterRef,
  );
  const phase = selected?.status?.phase;
  const notReady = Boolean(selected) && phase !== 'Ready';

  const submit = async () => {
    const problems = validatePipelineEndpoints(form);
    if (!clusterRef)
      problems.cluster = 'Pick the cluster that hosts the pipeline';
    if (Object.keys(problems).length > 0) {
      setErrors(problems);
      return;
    }
    const req = buildSetupRequest(clusterRef, form);
    if (!req) return;
    setSubmitting(true);
    setError(null);
    try {
      await onRegister(req);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to register pipeline',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ButlerCard flush className={classes.card}>
      <div>
        <h3 className={classes.title}>Register pipeline</h3>
        <p className={classes.lead}>
          Pick the Ready cluster that runs the aggregation stack and record the
          endpoints collectors should send to. Registering labels that cluster
          and writes the platform configuration; it installs nothing.
        </p>
      </div>
      <ButlerSelect
        label="Pipeline cluster"
        id="register-cluster"
        value={clusterRef}
        onChange={e => {
          setClusterRef(e.target.value);
          setErrors(prev => {
            const next = { ...prev };
            delete next.cluster;
            return next;
          });
        }}
        placeholder="Select a cluster"
        error={errors.cluster}
        options={clusters.map(c => ({
          value: `${c.metadata.namespace}/${c.metadata.name}`,
          label: `${c.metadata.namespace}/${c.metadata.name} (${
            c.status?.phase ?? 'Unknown'
          })`,
        }))}
        disabled={submitting}
      />
      {notReady && (
        <ButlerCallout tone="warning" compact>
          {`${selected?.metadata.name} is ${
            phase ?? 'Unknown'
          }. The server only registers a Ready cluster.`}
        </ButlerCallout>
      )}
      <EndpointFields
        form={form}
        errors={errors}
        onChange={next => {
          setForm(next);
          setErrors({});
        }}
        disabled={submitting}
        idPrefix="register"
      />
      {error && (
        <ButlerCallout tone="danger" compact>
          {error}
        </ButlerCallout>
      )}
      <div className={classes.actions}>
        <ButlerButton onClick={submit} disabled={submitting || notReady}>
          {submitting ? 'Registering...' : 'Register pipeline'}
        </ButlerButton>
      </div>
    </ButlerCard>
  );
};

const PipelineCard = ({
  config,
  status,
  statusError,
  canMutate,
  onUpdateEndpoints,
  onDeregister,
}: {
  config: ObservabilityConfig;
  status: ObservabilityStatus | null;
  statusError: LoadState['statusError'];
  canMutate: boolean;
  onUpdateEndpoints: (form: PipelineEndpointsForm) => Promise<void>;
  onDeregister: () => Promise<void>;
}) => {
  const classes = useStyles();
  const routes = useButlerRoutes();
  const pipeline = config.pipeline!;
  const facts = pipelineFacts(config, status);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<PipelineEndpointsForm>(
    pipelineEndpointsForm(pipeline),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDeregister, setConfirmDeregister] = useState(false);
  const [deregistering, setDeregistering] = useState(false);
  const [deregisterError, setDeregisterError] = useState<string | null>(null);

  const clusterHref = routes.clusterDetail({
    team: pipeline.clusterNamespace ?? '',
    namespace: pipeline.clusterNamespace ?? '',
    name: pipeline.clusterName ?? '',
  });

  const startEdit = () => {
    setForm(pipelineEndpointsForm(pipeline));
    setErrors({});
    setSaveError(null);
    setEditing(true);
  };

  const save = async () => {
    const problems = validatePipelineEndpoints(form);
    if (Object.keys(problems).length > 0) {
      setErrors(problems);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await onUpdateEndpoints(form);
      setEditing(false);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : 'Failed to update pipeline',
      );
    } finally {
      setSaving(false);
    }
  };

  const deregister = async () => {
    setDeregistering(true);
    setDeregisterError(null);
    try {
      await onDeregister();
      setConfirmDeregister(false);
    } catch (err) {
      setDeregisterError(
        err instanceof Error ? err.message : 'Failed to deregister pipeline',
      );
    } finally {
      setDeregistering(false);
    }
  };

  return (
    <ButlerCard flush className={classes.card}>
      <div className={classes.cardHead}>
        <div>
          <h3 className={classes.title}>Pipeline</h3>
          <p className={classes.lead}>
            Registered on the platform configuration. Collectors on every
            enrolled cluster send to these endpoints.
          </p>
        </div>
        {canMutate && !editing && (
          <div className={classes.actions}>
            <ButlerButton variant="secondary" onClick={startEdit}>
              Edit endpoints
            </ButlerButton>
            <ButlerButton
              variant="danger"
              startIcon={<TrashIcon />}
              onClick={() => setConfirmDeregister(true)}
            >
              Deregister
            </ButlerButton>
          </div>
        )}
      </div>

      <div className={classes.facts}>
        <div className={classes.fact}>
          <span className={classes.factLabel}>Cluster</span>
          <span className={classes.factValue}>
            <RouterLink className={classes.link} to={clusterHref}>
              {pipeline.clusterName}
            </RouterLink>
            <span className={classes.muted}>{pipeline.clusterNamespace}</span>
          </span>
          <p className={classes.factDetail}>
            {facts.clusterPhase
              ? `Cluster phase ${facts.clusterPhase}`
              : 'Cluster phase is part of the fleet status'}
          </p>
        </div>
        <div className={classes.fact}>
          <span className={classes.factLabel}>Cluster phase</span>
          <span className={classes.factValue}>
            {facts.clusterPhase ? (
              <ButlerStatusBadge status={facts.clusterPhase} />
            ) : (
              <span className={classes.muted}>
                {statusError?.forbidden ? 'Platform admin only' : 'Unknown'}
              </span>
            )}
          </span>
        </div>
        <div className={classes.fact}>
          <span className={classes.factLabel}>Aggregator</span>
          <span className={classes.factValue}>
            {status ? (
              <ButlerChip tone={facts.aggregator.tone}>
                {facts.aggregator.headline}
              </ButlerChip>
            ) : (
              <span className={classes.muted}>
                {statusError?.forbidden ? 'Platform admin only' : 'Unknown'}
              </span>
            )}
          </span>
          {status && (
            <p className={classes.factDetail}>{facts.aggregator.detail}</p>
          )}
        </div>
      </div>

      {editing ? (
        <>
          <EndpointFields
            form={form}
            errors={errors}
            onChange={next => {
              setForm(next);
              setErrors({});
            }}
            disabled={saving}
            idPrefix="pipeline"
          />
          <ButlerCallout tone="neutral" compact>
            The server keeps an endpoint that is sent empty. To stop sending a
            signal, disable that collector on each cluster instead.
          </ButlerCallout>
          {saveError && (
            <ButlerCallout tone="danger" compact>
              {saveError}
            </ButlerCallout>
          )}
          <div className={classes.actions}>
            <ButlerButton
              variant="secondary"
              onClick={() => setEditing(false)}
              disabled={saving}
            >
              Cancel
            </ButlerButton>
            <ButlerButton onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Save endpoints'}
            </ButlerButton>
          </div>
        </>
      ) : (
        <ButlerKeyValueList>
          <ButlerKeyValueRow label="Log endpoint" mono dense>
            {pipeline.logEndpoint || 'Not set'}
          </ButlerKeyValueRow>
          <ButlerKeyValueRow label="Metric endpoint" mono dense>
            {pipeline.metricEndpoint || 'Not set'}
          </ButlerKeyValueRow>
          <ButlerKeyValueRow label="Trace endpoint" mono dense>
            {pipeline.traceEndpoint || 'Not set'}
          </ButlerKeyValueRow>
        </ButlerKeyValueList>
      )}

      {canMutate && (
        <ButlerDialog
          open={confirmDeregister}
          onClose={() =>
            deregistering ? undefined : setConfirmDeregister(false)
          }
          busy={deregistering}
          title="Deregister pipeline"
          subtitle="Collectors keep running; they lose their destination"
          icon={<TrashIcon />}
          iconTone="danger"
          footer={
            <>
              <ButlerButton
                variant="secondary"
                onClick={() => setConfirmDeregister(false)}
                disabled={deregistering}
              >
                Cancel
              </ButlerButton>
              <ButlerButton
                variant="danger"
                onClick={deregister}
                disabled={deregistering}
              >
                {deregistering ? 'Deregistering...' : 'Deregister pipeline'}
              </ButlerButton>
            </>
          }
        >
          <p className={classes.deleteText}>
            Remove <strong>{pipeline.clusterName}</strong> as the observability
            pipeline?
          </p>
          <p className={classes.deleteHint}>
            This clears the pipeline reference and endpoints from the platform
            configuration and removes the pipeline label from the cluster. No
            cluster, addon or collector is deleted, and the pipeline can be
            registered again.
          </p>
          {deregisterError && (
            <ButlerCallout tone="danger" compact>
              {deregisterError}
            </ButlerCallout>
          )}
        </ButlerDialog>
      )}
    </ButlerCard>
  );
};

const CollectionDefaultsCard = ({
  config,
  canMutate,
  onSave,
}: {
  config: ObservabilityConfig;
  canMutate: boolean;
  onSave: (form: CollectionForm) => Promise<void>;
}) => {
  const classes = useStyles();
  const [form, setForm] = useState<CollectionForm>(() =>
    collectionForm(config.collection),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setForm(collectionForm(config.collection));
  }, [config]);

  const available = autoEnrollAvailability(config.pipeline);
  const set = <K extends keyof CollectionForm>(
    key: K,
    value: CollectionForm[K],
  ) => setForm(prev => ({ ...prev, [key]: value }));
  const disabled = !canMutate || saving;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save defaults');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ButlerCard flush className={classes.card}>
      <div>
        <h3 className={classes.title}>Collection defaults</h3>
        <p className={classes.lead}>
          What a new cluster starts with. Auto-enroll installs a collector when
          a cluster reaches Ready; the log and metric settings pre-fill the
          Observability tab when a signal is enabled on a cluster. Existing
          clusters are not changed by saving here.
        </p>
      </div>
      <ButlerFormSection title="Auto-enroll new clusters">
        <ButlerCheckbox
          label="Vector agent (logs)"
          description={
            available.vectorAgent
              ? 'Forwards logs to the pipeline log endpoint.'
              : 'Needs a log endpoint on the pipeline.'
          }
          checked={form.autoEnrollVector}
          onChange={e => set('autoEnrollVector', e.target.checked)}
          disabled={disabled || !available.vectorAgent}
        />
        <ButlerCheckbox
          label="Prometheus (metrics)"
          description={
            available.prometheus
              ? 'Remote-writes to the pipeline metric endpoint.'
              : 'Needs a metric endpoint on the pipeline.'
          }
          checked={form.autoEnrollPrometheus}
          onChange={e => set('autoEnrollPrometheus', e.target.checked)}
          disabled={disabled || !available.prometheus}
        />
        <ButlerCheckbox
          label="OpenTelemetry collector (traces)"
          description={
            available.otelCollector
              ? 'Forwards traces to the pipeline trace endpoint.'
              : 'Needs a trace endpoint on the pipeline.'
          }
          checked={form.autoEnrollOtel}
          onChange={e => set('autoEnrollOtel', e.target.checked)}
          disabled={disabled || !available.otelCollector}
        />
      </ButlerFormSection>
      <div className={classes.grid2}>
        <ButlerFormSection title="Log sources">
          <ButlerCheckbox
            label="Pod logs"
            checked={form.podLogs}
            onChange={e => set('podLogs', e.target.checked)}
            disabled={disabled}
          />
          <ButlerCheckbox
            label="Systemd journal"
            checked={form.journald}
            onChange={e => set('journald', e.target.checked)}
            disabled={disabled}
          />
          <ButlerCheckbox
            label="Kubernetes events"
            checked={form.kubernetesEvents}
            onChange={e => set('kubernetesEvents', e.target.checked)}
            disabled={disabled}
          />
        </ButlerFormSection>
        <ButlerFormSection title="Metrics">
          <ButlerField
            label="Local retention"
            htmlFor="collection-retention"
            help="How long a cluster's Prometheus buffers before remote-write."
          >
            <ButlerInput
              id="collection-retention"
              value={form.retention}
              onChange={e => set('retention', e.target.value)}
              placeholder="2h"
              disabled={disabled}
            />
          </ButlerField>
        </ButlerFormSection>
      </div>
      {error && (
        <ButlerCallout tone="danger" compact>
          {error}
        </ButlerCallout>
      )}
      {canMutate && (
        <div className={classes.actions}>
          <ButlerButton onClick={save} disabled={saving}>
            {saving ? 'Saving...' : 'Save defaults'}
          </ButlerButton>
        </div>
      )}
    </ButlerCard>
  );
};

const FleetTable = ({ clusters }: { clusters: ClusterObsInfo[] }) => {
  const classes = useStyles();
  const routes = useButlerRoutes();

  const columns = useMemo<ButlerColumn<ClusterObsInfo>[]>(
    () => [
      {
        id: 'name',
        header: 'Cluster',
        primary: true,
        render: c => (
          <RouterLink
            className={classes.link}
            to={`${routes.clusterDetail({
              team: c.team || c.namespace,
              namespace: c.namespace,
              name: c.name,
            })}?tab=observability`}
          >
            {c.name}
          </RouterLink>
        ),
      },
      { id: 'team', header: 'Team', render: c => c.team || c.namespace },
      {
        id: 'phase',
        header: 'Phase',
        render: c => <ButlerStatusBadge status={c.phase} />,
      },
      ...clusterCollectors({
        name: '',
        namespace: '',
        team: '',
        phase: '',
      }).map(col => ({
        id: col.key,
        header: col.label,
        render: (c: ClusterObsInfo) => {
          const addon = clusterCollectors(c).find(
            x => x.key === col.key,
          )?.addon;
          return addon ? (
            <span
              title={addon.version ? `Version ${addon.version}` : undefined}
            >
              <ButlerStatusBadge status={addon.status} />
            </span>
          ) : (
            <span className={classes.muted}>Not installed</span>
          );
        },
      })),
      {
        id: 'enrolled',
        header: 'Enrolled',
        align: 'right' as const,
        render: c => (isEnrolled(c) ? 'Yes' : 'No'),
      },
    ],
    [classes, routes],
  );

  return (
    <ButlerCard flush className={classes.card}>
      <div>
        <h3 className={classes.title}>Clusters</h3>
        <p className={classes.lead}>
          Collector state per cluster as the server reads it from each cluster's
          addons. Open a cluster to enable, configure or disable its collectors
          on its Observability tab.
        </p>
      </div>
      <ButlerTable
        bare
        aria-label="Fleet observability"
        columns={columns}
        rows={clusters}
        rowKey={c => `${c.namespace}/${c.name}`}
      />
    </ButlerCard>
  );
};
