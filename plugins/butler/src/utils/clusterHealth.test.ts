// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { Cluster } from '../api/types/clusters';
import {
  clusterBanners,
  clusterOwner,
  controlPlaneState,
  describeDuration,
  requestsAbsenceNote,
  workersState,
} from './clusterHealth';

const NOW = new Date('2026-08-28T20:00:00Z');

/** The live e2e-talos shape on 2026-08-28: Ready by phase, one worker missing for 15 days. */
const liveTalos: Cluster = {
  metadata: {
    name: 'e2e-talos',
    namespace: 'platform-engineering',
    labels: { 'butler.butlerlabs.dev/environment': 'e2e-dev' },
    annotations: {
      'butler.butlerlabs.dev/creator-email': 'someone@example.com',
    },
  },
  spec: {
    kubernetesVersion: 'v1.31.2',
    teamRef: { name: 'platform-engineering' },
    providerConfigRef: { name: 'harvester', namespace: 'butler-system' },
    workers: { replicas: 2 },
    controlPlane: { replicas: 1 },
  } as Cluster['spec'],
  status: {
    phase: 'Ready',
    workerNodesDesired: 2,
    workerNodesReady: 1,
    lbAllocationRef: { name: 'platform-engineering-e2e-talos-lb' },
    conditions: [
      {
        type: 'NetworkReady',
        status: 'True',
        reason: 'Ready',
        message: 'LB IPs allocated: 10.40.2.56/30',
      },
      {
        type: 'WorkersReady',
        status: 'False',
        reason: 'WorkersProvisioning',
        message: 'Workers provisioning: 1/2 ready',
        lastTransitionTime: '2026-08-13T08:07:39Z',
      },
      {
        type: 'ControlPlaneReady',
        status: 'True',
        reason: 'ControlPlaneReady',
        message: 'Control plane is ready',
      },
      {
        type: 'Ready',
        status: 'True',
        reason: 'ReconcileSucceeded',
        message: 'All operations healthy',
      },
    ],
  } as Cluster['status'],
};

describe('workersState', () => {
  it('reports converging from the condition, not from the phase', () => {
    const w = workersState(liveTalos);
    expect(w.converging).toBe(true);
    expect(w.stale).toBe(false);
    expect(w.scalePending).toBe(false);
    expect(w.word.headline).toBe('1/2 ready');
    expect(w.word.tone).toBe('yellow');
    expect(w.since).toBe('2026-08-13T08:07:39Z');
  });

  it('shows a requested scale the controller has not picked up yet', () => {
    const w = workersState({
      ...liveTalos,
      spec: { ...liveTalos.spec, workers: { replicas: 3 } } as Cluster['spec'],
      status: {
        ...liveTalos.status,
        workerNodesDesired: 2,
        workerNodesReady: 2,
      } as Cluster['status'],
    });
    expect(w.scalePending).toBe(true);
    expect(w.word.headline).toBe('Scaling to 3');
  });

  it('calls more nodes than desired stale', () => {
    const w = workersState({
      ...liveTalos,
      status: {
        ...liveTalos.status,
        workerNodesDesired: 1,
        workerNodesReady: 2,
      } as Cluster['status'],
    });
    expect(w.stale).toBe(true);
  });
});

describe('controlPlaneState', () => {
  it('uses the ControlPlaneReady condition and the TCP replicas', () => {
    expect(
      controlPlaneState(liveTalos, {
        name: 'x',
        namespace: 'y',
        status: { replicas: 1, readyReplicas: 1 },
      } as any),
    ).toEqual({
      headline: 'Ready',
      detail: '1/1 replicas ready',
      tone: 'green',
    });
    const noCond = {
      ...liveTalos,
      status: { ...liveTalos.status, conditions: [] } as Cluster['status'],
    };
    expect(controlPlaneState(noCond).headline).toBe('Unknown');
  });
});

describe('clusterBanners', () => {
  it('flags workers that have not converged for a long time on a Ready cluster', () => {
    const banners = clusterBanners(liveTalos, NOW);
    expect(banners.map(b => b.kind)).toEqual(['workers-stuck']);
    expect(banners[0].message).toMatch(/1\/2 workers ready for 15 days/);
  });

  it('stays quiet while a young join is still in progress', () => {
    const young = {
      ...liveTalos,
      status: {
        ...liveTalos.status,
        conditions: liveTalos.status!.conditions!.map(c =>
          c.type === 'WorkersReady'
            ? { ...c, lastTransitionTime: '2026-08-28T19:50:00Z' }
            : c,
        ),
      } as Cluster['status'],
    };
    expect(clusterBanners(young, NOW)).toEqual([]);
  });

  it('keeps degraded and stale as their own banners', () => {
    const degraded = {
      ...liveTalos,
      status: {
        ...liveTalos.status,
        workerNodesReady: 2,
        conditions: liveTalos.status!.conditions!.map(c =>
          c.type === 'Ready'
            ? {
                ...c,
                reason: 'ReconcileDegraded',
                message: 'addon longhorn unhealthy',
              }
            : c,
        ),
      } as Cluster['status'],
    };
    expect(clusterBanners(degraded, NOW).map(b => b.kind)).toEqual([
      'degraded',
    ]);
    const stale = {
      ...liveTalos,
      status: {
        ...liveTalos.status,
        workerNodesDesired: 1,
        workerNodesReady: 2,
      } as Cluster['status'],
    };
    expect(clusterBanners(stale, NOW).map(b => b.kind)).toEqual(['stale']);
  });
});

describe('small helpers', () => {
  it('reads the creator from the annotations the server stamps', () => {
    expect(clusterOwner(liveTalos)).toBe('someone@example.com');
    expect(
      clusterOwner({ ...liveTalos, metadata: { name: 'a', namespace: 'b' } }),
    ).toBeUndefined();
  });

  it('describes durations coarsely', () => {
    expect(describeDuration('2026-08-28T19:59:30Z', NOW)).toBe(
      'about a minute',
    );
    expect(describeDuration('2026-08-28T18:00:00Z', NOW)).toBe('2 hours');
    expect(describeDuration('2026-08-13T08:07:39Z', NOW)).toBe('15 days');
  });

  it('explains why requests are absent without implying failure', () => {
    expect(requestsAbsenceNote('machine', liveTalos)).toMatch(
      /Cluster API machines/,
    );
    expect(requestsAbsenceNote('loadBalancer', liveTalos)).toMatch(
      /platform pool/,
    );
    expect(requestsAbsenceNote('loadBalancer', liveTalos)).toMatch(
      /10\.40\.2\.56\/30/,
    );
  });
});
