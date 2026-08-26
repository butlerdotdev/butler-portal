// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { clusterPollInterval } from './ClusterDetailPage';
import type { Cluster } from '../../api/types/clusters';

function cluster(status?: Cluster['status']): Cluster {
  return {
    metadata: { name: 'c', namespace: 'ns' },
    spec: {},
    status,
  } as unknown as Cluster;
}

describe('clusterPollInterval', () => {
  it('does not poll without a status block or with partial counters', () => {
    expect(clusterPollInterval(undefined)).toBeNull();
    expect(clusterPollInterval(cluster(undefined))).toBeNull();
    expect(clusterPollInterval(cluster({ phase: 'Ready' } as any))).toBeNull();
    expect(
      clusterPollInterval(
        cluster({ phase: 'Ready', workerNodesReady: 1 } as any),
      ),
    ).toBeNull();
  });

  it('polls while workers converge or the phase is not Ready', () => {
    expect(
      clusterPollInterval(
        cluster({
          phase: 'Ready',
          workerNodesReady: 1,
          workerNodesDesired: 2,
        } as any),
      ),
    ).toBe(5000);
    expect(clusterPollInterval(cluster({ phase: 'Provisioning' } as any))).toBe(
      5000,
    );
    expect(
      clusterPollInterval(
        cluster({
          phase: 'Ready',
          workerNodesReady: 2,
          workerNodesDesired: 2,
        } as any),
      ),
    ).toBeNull();
  });
});
