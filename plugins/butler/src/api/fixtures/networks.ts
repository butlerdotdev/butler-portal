// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { IPAllocation, NetworkPool } from '../types/networks';
import { FIXTURE_NAMESPACE, readyCluster, failedCluster } from './clusters';

export const FIXTURE_POOL_NAMESPACE = 'butler-system';
export const FIXTURE_POOL_NAME = 'vlan40-underlay';

export const fixturePool: NetworkPool = {
  metadata: {
    name: FIXTURE_POOL_NAME,
    namespace: FIXTURE_POOL_NAMESPACE,
    uid: 'pool-uid-1',
    creationTimestamp: '2026-02-01T10:00:00Z',
  },
  spec: {
    cidr: '10.40.0.0/22',
    reserved: [{ cidr: '10.40.0.0/24', description: 'infrastructure' }],
    tenantAllocation: {
      start: '10.40.2.0',
      end: '10.40.3.255',
      defaults: { nodesPerTenant: 4, lbPoolPerTenant: 4 },
    },
  },
  status: {
    totalIPs: 511,
    allocatedIPs: 68,
    availableIPs: 443,
    allocationCount: 15,
    poolSizeIPs: 1024,
    reservedIPs: 256,
  },
};

/** Belongs to the ready cluster. */
export const fixtureAllocation: IPAllocation = {
  metadata: {
    name: `${FIXTURE_NAMESPACE}-${readyCluster.metadata.name}-lb`,
    namespace: FIXTURE_POOL_NAMESPACE,
    uid: 'alloc-uid-1',
  },
  spec: {
    poolRef: { name: FIXTURE_POOL_NAME, namespace: FIXTURE_POOL_NAMESPACE },
    tenantClusterRef: {
      name: readyCluster.metadata.name,
      namespace: readyCluster.metadata.namespace,
    },
    type: 'loadbalancer',
    count: 4,
  },
  status: {
    phase: 'Allocated',
    startAddress: '10.40.2.56',
    endAddress: '10.40.2.59',
    allocatedAt: '2026-03-01T09:12:00Z',
  },
};

/** Same cluster, a second allocation of a different type. */
export const fixtureNodesAllocation: IPAllocation = {
  metadata: {
    name: `${FIXTURE_NAMESPACE}-${readyCluster.metadata.name}-nodes`,
    namespace: FIXTURE_POOL_NAMESPACE,
    uid: 'alloc-uid-2',
  },
  spec: {
    poolRef: { name: FIXTURE_POOL_NAME, namespace: FIXTURE_POOL_NAMESPACE },
    tenantClusterRef: {
      name: readyCluster.metadata.name,
      namespace: readyCluster.metadata.namespace,
    },
    type: 'nodes',
    count: 2,
  },
  status: {
    phase: 'Allocated',
    startAddress: '10.40.2.20',
    endAddress: '10.40.2.21',
    allocatedAt: '2026-03-01T09:10:00Z',
  },
};

/**
 * Belongs to a different cluster, and one carries the same cluster name in
 * another namespace. Both exist so scoping is proven rather than assumed.
 */
export const fixtureOtherClusterAllocation: IPAllocation = {
  metadata: { name: 'other-cluster-lb', namespace: FIXTURE_POOL_NAMESPACE },
  spec: {
    poolRef: { name: FIXTURE_POOL_NAME },
    tenantClusterRef: {
      name: failedCluster.metadata.name,
      namespace: failedCluster.metadata.namespace,
    },
    type: 'loadbalancer',
  },
  status: {
    phase: 'Allocated',
    startAddress: '10.40.2.90',
    endAddress: '10.40.2.93',
  },
};

export const fixtureSameNameOtherNamespaceAllocation: IPAllocation = {
  metadata: { name: 'lookalike-lb', namespace: FIXTURE_POOL_NAMESPACE },
  spec: {
    poolRef: { name: FIXTURE_POOL_NAME },
    tenantClusterRef: {
      name: readyCluster.metadata.name,
      namespace: 'someone-elses-team',
    },
    type: 'loadbalancer',
  },
  status: {
    phase: 'Allocated',
    startAddress: '10.40.3.10',
    endAddress: '10.40.3.13',
  },
};

export const fixtureAllocations: IPAllocation[] = [
  fixtureAllocation,
  fixtureNodesAllocation,
  fixtureOtherClusterAllocation,
  fixtureSameNameOtherNamespaceAllocation,
];

export const fixturePools: NetworkPool[] = [fixturePool];
