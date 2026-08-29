// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type {
  ClusterObsInfo,
  CollectionConfigInfo,
  ObservabilityConfig,
  ObservabilityStatus,
  PipelineConfigInfo,
  SetupPipelineRequest,
  UpdateObservabilityConfigRequest,
} from '../api/types/observability';

export type Tone = 'green' | 'yellow' | 'red' | 'neutral';

/**
 * What the server's aggregator status means. The value is either a
 * TenantAddon phase (when the pipeline cluster runs a vector-aggregator
 * addon Butler knows about) or the outcome of the server probing the log
 * endpoint host's Vector API port. Both are the server's word; the page
 * does not probe anything itself.
 */
export function describeAggregator(status: string | undefined): {
  headline: string;
  detail: string;
  tone: Tone;
} {
  switch ((status ?? '').toLowerCase()) {
    case 'healthy':
      return {
        headline: 'Healthy',
        detail:
          'The server reached the aggregator API on the log endpoint host.',
        tone: 'green',
      };
    case 'installed':
      return {
        headline: 'Installed',
        detail:
          'A vector-aggregator addon is installed on the pipeline cluster.',
        tone: 'green',
      };
    case 'degraded':
      return {
        headline: 'Degraded',
        detail: 'The aggregator API answered, but not with success.',
        tone: 'yellow',
      };
    case 'installing':
    case 'upgrading':
    case 'pending':
      return {
        headline: status as string,
        detail: 'The aggregator addon is still converging.',
        tone: 'yellow',
      };
    case 'unreachable':
      return {
        headline: 'Unreachable',
        detail:
          'The server could not reach the aggregator API (port 8686) on the log endpoint host. Collectors may still deliver to the log endpoint; only the health port is unanswered.',
        tone: 'red',
      };
    case 'failed':
      return {
        headline: 'Failed',
        detail: 'The aggregator addon reports a failure.',
        tone: 'red',
      };
    case '':
    case 'unknown':
    default:
      return {
        headline: 'Unknown',
        detail: 'The server did not determine an aggregator status.',
        tone: 'neutral',
      };
  }
}

/**
 * Three separate facts about the pipeline, kept apart because the
 * server reports them apart: whether a pipeline is registered at all,
 * whether the cluster that hosts it is Ready, and whether the aggregator
 * on it answers.
 */
export function pipelineFacts(
  config: ObservabilityConfig | null,
  status: ObservabilityStatus | null,
): {
  registered: boolean;
  clusterPhase?: string;
  clusterReady: boolean;
  aggregator: ReturnType<typeof describeAggregator>;
} {
  const registered = Boolean(
    config?.configured && config.pipeline?.clusterName,
  );
  const clusterPhase = status?.pipeline?.clusterPhase;
  return {
    registered,
    clusterPhase,
    clusterReady: clusterPhase === 'Ready',
    aggregator: describeAggregator(status?.pipeline?.aggregatorStatus),
  };
}

/** The server's own rule: a scheme and a host, nothing more. */
export function endpointError(value: string): string | undefined {
  const v = value.trim();
  if (!v) return undefined;
  try {
    const u = new URL(v);
    if (!u.protocol || !u.host)
      return 'Must include scheme and host, e.g. http://host:port';
    return undefined;
  } catch {
    return 'Must include scheme and host, e.g. http://host:port';
  }
}

export interface PipelineEndpointsForm {
  logEndpoint: string;
  metricEndpoint: string;
  traceEndpoint: string;
}

export function pipelineEndpointsForm(
  pipeline: PipelineConfigInfo | undefined,
): PipelineEndpointsForm {
  return {
    logEndpoint: pipeline?.logEndpoint ?? '',
    metricEndpoint: pipeline?.metricEndpoint ?? '',
    traceEndpoint: pipeline?.traceEndpoint ?? '',
  };
}

export function validatePipelineEndpoints(
  form: PipelineEndpointsForm,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.logEndpoint.trim()) errors.logEndpoint = 'Log endpoint is required';
  for (const key of [
    'logEndpoint',
    'metricEndpoint',
    'traceEndpoint',
  ] as const) {
    const e = endpointError(form[key]);
    if (e && !errors[key]) errors[key] = e;
  }
  return errors;
}

/**
 * The endpoint edit the server understands. It keeps the cluster the
 * pipeline already names and sends every endpoint, because the server
 * ignores empty strings rather than clearing: an endpoint cannot be
 * removed by editing, only replaced.
 */
export function buildPipelineUpdate(
  form: PipelineEndpointsForm,
  current: PipelineConfigInfo | undefined,
): UpdateObservabilityConfigRequest {
  return {
    pipeline: {
      clusterName: current?.clusterName,
      clusterNamespace: current?.clusterNamespace,
      logEndpoint: form.logEndpoint.trim(),
      metricEndpoint: form.metricEndpoint.trim() || undefined,
      traceEndpoint: form.traceEndpoint.trim() || undefined,
    },
  };
}

export function buildSetupRequest(
  clusterRef: string,
  form: PipelineEndpointsForm,
): SetupPipelineRequest | null {
  const [clusterNamespace, clusterName] = clusterRef.split('/');
  if (!clusterNamespace || !clusterName) return null;
  return {
    clusterName,
    clusterNamespace,
    logEndpoint: form.logEndpoint.trim(),
    metricEndpoint: form.metricEndpoint.trim() || undefined,
    traceEndpoint: form.traceEndpoint.trim() || undefined,
  };
}

export interface CollectionForm {
  autoEnrollVector: boolean;
  autoEnrollPrometheus: boolean;
  autoEnrollOtel: boolean;
  podLogs: boolean;
  journald: boolean;
  kubernetesEvents: boolean;
  retention: string;
}

export function collectionForm(
  collection: CollectionConfigInfo | undefined,
): CollectionForm {
  return {
    autoEnrollVector: collection?.autoEnroll?.vectorAgent ?? false,
    autoEnrollPrometheus: collection?.autoEnroll?.prometheus ?? false,
    autoEnrollOtel: collection?.autoEnroll?.otelCollector ?? false,
    podLogs: collection?.logs?.podLogs ?? true,
    journald: collection?.logs?.journald ?? false,
    kubernetesEvents: collection?.logs?.kubernetesEvents ?? false,
    retention: collection?.metrics?.retention || '2h',
  };
}

/**
 * The collection defaults as the server stores them: every section is
 * sent whole, since the server replaces each section it receives.
 */
export function buildCollectionUpdate(
  form: CollectionForm,
): UpdateObservabilityConfigRequest {
  return {
    collection: {
      autoEnroll: {
        vectorAgent: form.autoEnrollVector,
        prometheus: form.autoEnrollPrometheus,
        otelCollector: form.autoEnrollOtel,
      },
      logs: {
        podLogs: form.podLogs,
        journald: form.journald,
        kubernetesEvents: form.kubernetesEvents,
      },
      metrics: { enabled: true, retention: form.retention.trim() || '2h' },
    },
  };
}

/**
 * Which auto-enroll toggles the pipeline can honour. The server does not
 * refuse the others, but an agent enrolled toward a missing endpoint has
 * nowhere to send, so the page disables them the way the console does.
 */
export function autoEnrollAvailability(
  pipeline: PipelineConfigInfo | undefined,
) {
  return {
    vectorAgent: Boolean(pipeline?.logEndpoint),
    prometheus: Boolean(pipeline?.metricEndpoint),
    otelCollector: Boolean(pipeline?.traceEndpoint),
  };
}

/** Collectors a fleet row reports, in the order the tab shows them. */
export function clusterCollectors(c: ClusterObsInfo) {
  return [
    { key: 'logs', label: 'Vector Agent', addon: c.vectorAgent },
    { key: 'metrics', label: 'Prometheus', addon: c.prometheus },
    { key: 'traces', label: 'OTel Collector', addon: c.otelCollector },
  ] as const;
}

export function isEnrolled(c: ClusterObsInfo): boolean {
  return clusterCollectors(c).some(
    x => x.addon && x.addon.status.toLowerCase() !== 'deleting',
  );
}
