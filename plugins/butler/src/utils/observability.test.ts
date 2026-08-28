// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { InstalledAddon } from '../api/types/addons';
import {
  SIGNALS,
  addonForSignal,
  buildLogCollectionValues,
  buildMetricCollectionValues,
  buildTraceCollectionValues,
  describeSignalState,
  isTransitional,
  signalDestination,
} from './observability';

const logs = SIGNALS[0];
const metrics = SIGNALS[1];
const traces = SIGNALS[2];

const addon = (over: Partial<InstalledAddon>): InstalledAddon => ({
  name: 'x',
  status: 'Installed',
  ...over,
});

describe('addonForSignal', () => {
  it('matches by catalog addon name or by the installed resource name', () => {
    const list = [
      addon({ name: 'e2e-talos-vector-agent', addon: 'vector-agent' }),
      addon({ name: 'otel-collector' }),
    ];
    expect(addonForSignal(logs, list)?.name).toBe('e2e-talos-vector-agent');
    expect(addonForSignal(traces, list)?.name).toBe('otel-collector');
    expect(addonForSignal(metrics, list)).toBeUndefined();
  });

  it('accepts the older metrics chart names', () => {
    const list = [addon({ name: 'm', addon: 'kube-prometheus-stack' })];
    expect(addonForSignal(metrics, list)?.name).toBe('m');
  });
});

describe('signal state', () => {
  it('separates requested from actually collecting', () => {
    expect(describeSignalState(addon({ status: 'Installing' })).headline).toBe(
      'Enabling',
    );
    expect(describeSignalState(addon({ status: 'Installed' })).headline).toBe(
      'Collecting',
    );
    expect(describeSignalState(undefined).headline).toBe('Not enabled');
  });

  it('surfaces the server message on failure and degradation', () => {
    expect(
      describeSignalState(addon({ status: 'Failed', message: 'pull error' }))
        .detail,
    ).toBe('pull error');
    expect(
      describeSignalState(addon({ status: 'Degraded', message: 'crashloop' }))
        .tone,
    ).toBe('yellow');
  });

  it('knows which states are still moving', () => {
    expect(isTransitional('Installing')).toBe(true);
    expect(isTransitional('Deleting')).toBe(true);
    expect(isTransitional('Installed')).toBe(false);
    expect(isTransitional('Failed')).toBe(false);
    expect(isTransitional(undefined)).toBe(false);
  });
});

describe('log collection values', () => {
  it('sends to the aggregator and stamps the cluster name', () => {
    const v = buildLogCollectionValues('e2e-talos', {
      aggregatorEndpoint: 'http://10.40.2.29:8080',
      podLogs: true,
      journald: false,
      kubernetesEvents: true,
    }) as any;
    expect(v.role).toBe('Agent');
    expect(Object.keys(v.customConfig.sources)).toEqual([
      'kubernetes_logs',
      'internal_metrics',
    ]);
    expect(v.customConfig.transforms.add_cluster.source).toBe(
      '.cluster = "e2e-talos"',
    );
    expect(v.customConfig.sinks.aggregator.uri).toBe('http://10.40.2.29:8080');
    expect(v.customConfig.sinks.stdout).toBeUndefined();
  });

  it('falls back to stdout with no aggregator', () => {
    const v = buildLogCollectionValues('c', {
      aggregatorEndpoint: '',
      podLogs: true,
      journald: true,
      kubernetesEvents: false,
    }) as any;
    expect(v.customConfig.sinks.stdout.type).toBe('console');
    expect(v.customConfig.sources.journald).toEqual({ type: 'journald' });
  });
});

describe('metric collection values', () => {
  it('disables the bundled grafana and alertmanager and remote-writes', () => {
    const v = buildMetricCollectionValues('c', {
      metricEndpoint: 'http://10.40.2.29:9000',
      retention: '2h',
      storageSize: '10Gi',
    }) as any;
    expect(v.grafana).toEqual({ enabled: false });
    expect(v.prometheus.prometheusSpec.retention).toBe('2h');
    expect(v.prometheus.prometheusSpec.externalLabels).toEqual({
      cluster: 'c',
    });
    expect(v.prometheus.prometheusSpec.remoteWrite).toEqual([
      { url: 'http://10.40.2.29:9000' },
    ]);
  });

  it('omits remote write with no endpoint', () => {
    const v = buildMetricCollectionValues('c', {
      metricEndpoint: '',
      retention: '2h',
      storageSize: '10Gi',
    }) as any;
    expect(v.prometheus.prometheusSpec.remoteWrite).toBeUndefined();
  });
});

describe('trace collection values', () => {
  it('picks the exporter from the endpoint scheme', () => {
    const http = buildTraceCollectionValues('c', {
      traceEndpoint: 'http://10.40.2.41:4318',
    }) as any;
    expect(http.config.exporters).toEqual({
      otlphttp: { endpoint: 'http://10.40.2.41:4318' },
    });
    expect(http.config.service.pipelines.traces.exporters).toEqual([
      'otlphttp',
    ]);

    const grpc = buildTraceCollectionValues('c', {
      traceEndpoint: 'tempo:4317',
    }) as any;
    expect(grpc.config.exporters.otlp.tls).toEqual({ insecure: true });

    const none = buildTraceCollectionValues('c', { traceEndpoint: ' ' }) as any;
    expect(none.config.exporters).toEqual({ debug: { verbosity: 'detailed' } });
  });

  it('stamps the cluster name as a resource attribute', () => {
    const v = buildTraceCollectionValues('e2e-talos', {
      traceEndpoint: '',
    }) as any;
    expect(v.config.processors.resource.attributes[0]).toEqual({
      key: 'k8s.cluster.name',
      value: 'e2e-talos',
      action: 'upsert',
    });
  });
});

describe('signalDestination', () => {
  it('names the configured endpoint or the honest fallback', () => {
    const config = { configured: true, pipeline: { logEndpoint: 'http://a' } };
    expect(signalDestination(logs, config)).toBe('http://a');
    expect(signalDestination(traces, config)).toMatch(/debug exporter/);
    expect(signalDestination(metrics, null)).toMatch(/no remote write/);
  });
});
