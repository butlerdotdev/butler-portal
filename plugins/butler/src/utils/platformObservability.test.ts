// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import {
  autoEnrollAvailability,
  buildCollectionUpdate,
  buildPipelineUpdate,
  buildSetupRequest,
  collectionForm,
  describeAggregator,
  endpointError,
  isEnrolled,
  pipelineFacts,
  validatePipelineEndpoints,
} from './platformObservability';

describe('describeAggregator', () => {
  it('reads the probe results and the addon phases the server may send', () => {
    expect(describeAggregator('Healthy').tone).toBe('green');
    expect(describeAggregator('Unreachable')).toMatchObject({
      headline: 'Unreachable',
      tone: 'red',
    });
    expect(describeAggregator('Unreachable').detail).toMatch(/8686/);
    expect(describeAggregator('Degraded').tone).toBe('yellow');
    expect(describeAggregator('Installed').tone).toBe('green');
    expect(describeAggregator(undefined).headline).toBe('Unknown');
  });
});

describe('pipelineFacts', () => {
  it('keeps registered, cluster ready and aggregator reachable apart', () => {
    const facts = pipelineFacts(
      { configured: true, pipeline: { clusterName: 'pipelines' } },
      {
        pipeline: {
          clusterName: 'pipelines',
          clusterNamespace: 'platform-engineering',
          clusterPhase: 'Ready',
          logEndpoint: 'http://10.40.2.29:8080',
          aggregatorStatus: 'Unreachable',
        },
        clusters: [],
        summary: {
          totalClusters: 0,
          enrolledClusters: 0,
          vectorAgentCount: 0,
          prometheusCount: 0,
          otelCollectorCount: 0,
        },
      },
    );
    expect(facts.registered).toBe(true);
    expect(facts.clusterReady).toBe(true);
    expect(facts.aggregator.headline).toBe('Unreachable');
    expect(pipelineFacts({ configured: false }, null).registered).toBe(false);
  });
});

describe('endpoint validation', () => {
  it('applies the server rule of scheme plus host', () => {
    expect(endpointError('http://10.40.2.29:8080')).toBeUndefined();
    expect(endpointError('')).toBeUndefined();
    expect(endpointError('10.40.2.29:8080')).toMatch(/scheme and host/);
    expect(endpointError('not a url')).toMatch(/scheme and host/);
    expect(
      validatePipelineEndpoints({
        logEndpoint: '',
        metricEndpoint: 'x',
        traceEndpoint: '',
      }),
    ).toEqual({
      logEndpoint: 'Log endpoint is required',
      metricEndpoint: 'Must include scheme and host, e.g. http://host:port',
    });
  });
});

describe('request builders', () => {
  it('keeps the current cluster on an endpoint edit and drops blank optionals', () => {
    expect(
      buildPipelineUpdate(
        {
          logEndpoint: ' http://a:8080 ',
          metricEndpoint: '',
          traceEndpoint: 'http://t:4318',
        },
        { clusterName: 'pipelines', clusterNamespace: 'platform-engineering' },
      ),
    ).toEqual({
      pipeline: {
        clusterName: 'pipelines',
        clusterNamespace: 'platform-engineering',
        logEndpoint: 'http://a:8080',
        metricEndpoint: undefined,
        traceEndpoint: 'http://t:4318',
      },
    });
  });

  it('splits the cluster reference for setup', () => {
    expect(
      buildSetupRequest('platform-engineering/pipelines', {
        logEndpoint: 'http://a:8080',
        metricEndpoint: '',
        traceEndpoint: '',
      }),
    ).toEqual({
      clusterName: 'pipelines',
      clusterNamespace: 'platform-engineering',
      logEndpoint: 'http://a:8080',
      metricEndpoint: undefined,
      traceEndpoint: undefined,
    });
    expect(
      buildSetupRequest('', {
        logEndpoint: 'x',
        metricEndpoint: '',
        traceEndpoint: '',
      }),
    ).toBeNull();
  });

  it('round-trips collection defaults whole', () => {
    const cfg = {
      autoEnroll: {
        vectorAgent: true,
        prometheus: false,
        otelCollector: false,
      },
      logs: { podLogs: true, journald: false, kubernetesEvents: true },
      metrics: { enabled: true, retention: '2h' },
    };
    expect(buildCollectionUpdate(collectionForm(cfg))).toEqual({
      collection: cfg,
    });
  });

  it('only offers auto-enroll toward endpoints that exist', () => {
    expect(autoEnrollAvailability({ logEndpoint: 'http://a' })).toEqual({
      vectorAgent: true,
      prometheus: false,
      otelCollector: false,
    });
  });
});

describe('isEnrolled', () => {
  it('counts any non-deleting collector', () => {
    const base = { name: 'a', namespace: 'n', team: '', phase: 'Ready' };
    expect(isEnrolled(base)).toBe(false);
    expect(isEnrolled({ ...base, vectorAgent: { status: 'Installed' } })).toBe(
      true,
    );
    expect(isEnrolled({ ...base, vectorAgent: { status: 'Deleting' } })).toBe(
      false,
    );
  });
});
