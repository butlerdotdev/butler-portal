// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { InstalledAddon } from '../api/types/addons';
import type { ObservabilityConfig } from '../api/types/observability';

/**
 * Cluster observability is three ordinary addons, one per signal. Butler
 * installs and reconciles the collector; the platform pipeline they send
 * to is configured separately and only named here. There is no other
 * observability object on a cluster, so the addon list is the whole
 * state and this module is the one place that reads it.
 */
export type SignalKey = 'logs' | 'metrics' | 'traces';

export interface SignalDefinition {
  key: SignalKey;
  label: string;
  /** The catalog addon the signal is installed as. */
  addon: string;
  /** Older names the same signal was installed under, still matched. */
  aliases: string[];
  collector: string;
  collectorKind: string;
  sources: string;
  /** Which pipeline endpoint the collector sends to. */
  endpointKey: 'logEndpoint' | 'metricEndpoint' | 'traceEndpoint';
  fallbackDestination: string;
}

export const SIGNALS: SignalDefinition[] = [
  {
    key: 'logs',
    label: 'Logs',
    addon: 'vector-agent',
    aliases: [],
    collector: 'Vector Agent',
    collectorKind: 'DaemonSet',
    sources: 'Pod stdout, journald, Kubernetes events',
    endpointKey: 'logEndpoint',
    fallbackDestination: 'stdout of each agent (no aggregator configured)',
  },
  {
    key: 'metrics',
    label: 'Metrics',
    addon: 'prometheus-operator',
    aliases: ['kube-prometheus-stack', 'prometheus'],
    collector: 'Prometheus',
    collectorKind: 'kube-prometheus-stack',
    sources: 'Scrape, ServiceMonitor and PodMonitor',
    endpointKey: 'metricEndpoint',
    fallbackDestination: 'kept in the cluster only (no remote write)',
  },
  {
    key: 'traces',
    label: 'Traces',
    addon: 'otel-collector',
    aliases: [],
    collector: 'OpenTelemetry Collector',
    collectorKind: 'DaemonSet',
    sources: 'OTLP over gRPC and HTTP',
    endpointKey: 'traceEndpoint',
    fallbackDestination: 'debug exporter (dropped after logging)',
  },
];

/** The installed addon that carries a signal, if any. */
export function addonForSignal(
  signal: SignalDefinition,
  addons: InstalledAddon[],
): InstalledAddon | undefined {
  const names = new Set([signal.addon, ...signal.aliases]);
  return addons.find(a => names.has(a.addon ?? '') || names.has(a.name));
}

/**
 * Whether the server is still working on an addon. While any signal is
 * transitional the tab polls; once every signal is settled it stops.
 */
export function isTransitional(status: string | undefined): boolean {
  return (
    status === 'Installing' ||
    status === 'Pending' ||
    status === 'Upgrading' ||
    status === 'Deleting'
  );
}

/**
 * What a signal's state means to a person, separating "requested" from
 * "actually running". The server's status is the source; nothing here
 * infers health from anything but that field.
 */
export function describeSignalState(addon: InstalledAddon | undefined): {
  headline: string;
  detail: string;
  tone: 'green' | 'yellow' | 'red' | 'neutral' | 'blue';
} {
  if (!addon) {
    return {
      headline: 'Not enabled',
      detail: 'No collector is installed for this signal.',
      tone: 'neutral',
    };
  }
  switch (addon.status) {
    case 'Installed':
      return {
        headline: 'Collecting',
        detail: 'The collector is installed and healthy.',
        tone: 'green',
      };
    case 'Installing':
    case 'Pending':
      return {
        headline: 'Enabling',
        detail:
          'Enablement was accepted. The collector is being installed and is not collecting yet.',
        tone: 'blue',
      };
    case 'Upgrading':
      return {
        headline: 'Upgrading',
        detail: 'The collector is being upgraded.',
        tone: 'blue',
      };
    case 'Deleting':
      return {
        headline: 'Disabling',
        detail: 'Removal was accepted. The collector is being removed.',
        tone: 'yellow',
      };
    case 'Degraded':
      return {
        headline: 'Degraded',
        detail: addon.message || 'The collector is running but unhealthy.',
        tone: 'yellow',
      };
    case 'Failed':
      return {
        headline: 'Failed',
        detail: addon.message || 'The collector could not be installed.',
        tone: 'red',
      };
    default:
      return {
        headline: 'Unknown',
        detail: addon.message || 'The platform has not reported a state.',
        tone: 'neutral',
      };
  }
}

export interface LogCollectionOptions {
  aggregatorEndpoint: string;
  podLogs: boolean;
  journald: boolean;
  kubernetesEvents: boolean;
}

/**
 * Helm values for the log collector. The shape is the console's exactly:
 * Vector in agent mode with a remap that stamps the cluster name, sending
 * to the aggregator when one is configured and to stdout when not.
 */
export function buildLogCollectionValues(
  clusterName: string,
  options: LogCollectionOptions,
): Record<string, unknown> {
  const sources: Record<string, unknown> = {};
  if (options.podLogs) sources.kubernetes_logs = { type: 'kubernetes_logs' };
  if (options.journald) sources.journald = { type: 'journald' };
  if (options.kubernetesEvents) {
    sources.internal_metrics = { type: 'internal_metrics' };
  }
  const transforms = {
    add_cluster: {
      type: 'remap',
      inputs: Object.keys(sources),
      source: `.cluster = "${clusterName}"`,
    },
  };
  const sinks: Record<string, unknown> = options.aggregatorEndpoint
    ? {
        aggregator: {
          type: 'http',
          inputs: ['add_cluster'],
          uri: options.aggregatorEndpoint,
          encoding: { codec: 'json' },
        },
      }
    : {
        stdout: {
          type: 'console',
          inputs: ['add_cluster'],
          encoding: { codec: 'json' },
        },
      };
  return {
    role: 'Agent',
    customConfig: {
      data_dir: '/vector-data-dir',
      api: { enabled: true, address: '127.0.0.1:8686', playground: false },
      sources,
      transforms,
      sinks,
    },
  };
}

export interface MetricCollectionOptions {
  metricEndpoint: string;
  retention: string;
  storageSize: string;
}

/** Helm values for kube-prometheus-stack, as the console sends them. */
export function buildMetricCollectionValues(
  clusterName: string,
  options: MetricCollectionOptions,
): Record<string, unknown> {
  return {
    grafana: { enabled: false },
    alertmanager: { enabled: false },
    prometheus: {
      prometheusSpec: {
        retention: options.retention,
        externalLabels: { cluster: clusterName },
        serviceMonitorNamespaceSelector: {},
        podMonitorNamespaceSelector: {},
        serviceMonitorSelector: {},
        podMonitorSelector: {},
        storageSpec: {
          volumeClaimTemplate: {
            spec: {
              accessModes: ['ReadWriteOnce'],
              resources: { requests: { storage: options.storageSize } },
            },
          },
        },
        ...(options.metricEndpoint
          ? { remoteWrite: [{ url: options.metricEndpoint }] }
          : {}),
      },
    },
  };
}

export interface TraceCollectionOptions {
  traceEndpoint: string;
}

/**
 * Helm values for the OpenTelemetry collector. An HTTP endpoint gets the
 * OTLP/HTTP exporter, anything else OTLP/gRPC, and no endpoint at all
 * the debug exporter, which logs and drops.
 */
export function buildTraceCollectionValues(
  clusterName: string,
  options: TraceCollectionOptions,
): Record<string, unknown> {
  const endpoint = options.traceEndpoint.trim();
  let exporters: Record<string, unknown>;
  let exporterName: string;
  if (!endpoint) {
    exporters = { debug: { verbosity: 'detailed' } };
    exporterName = 'debug';
  } else if (
    endpoint.startsWith('http://') ||
    endpoint.startsWith('https://')
  ) {
    exporters = { otlphttp: { endpoint } };
    exporterName = 'otlphttp';
  } else {
    exporters = { otlp: { endpoint, tls: { insecure: true } } };
    exporterName = 'otlp';
  }
  return {
    mode: 'daemonset',
    image: { repository: 'otel/opentelemetry-collector-contrib' },
    presets: { kubernetesAttributes: { enabled: true } },
    config: {
      receivers: {
        otlp: {
          protocols: {
            grpc: { endpoint: '0.0.0.0:4317' },
            http: { endpoint: '0.0.0.0:4318' },
          },
        },
      },
      processors: {
        resource: {
          attributes: [
            { key: 'k8s.cluster.name', value: clusterName, action: 'upsert' },
          ],
        },
        batch: { timeout: '5s', send_batch_size: 1024 },
        memory_limiter: { check_interval: '5s', limit_mib: 256 },
      },
      exporters,
      service: {
        pipelines: {
          traces: {
            receivers: ['otlp'],
            processors: ['memory_limiter', 'resource', 'batch'],
            exporters: [exporterName],
          },
        },
      },
    },
  };
}

/** Where a signal will be sent, from the platform config. */
export function signalDestination(
  signal: SignalDefinition,
  config: ObservabilityConfig | null,
): string {
  const endpoint = config?.pipeline?.[signal.endpointKey];
  return endpoint || signal.fallbackDestination;
}
