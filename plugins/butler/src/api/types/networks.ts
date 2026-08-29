// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

/** A contiguous range inside a pool. */
export interface AllocationRange {
  start: string;
  end: string;
}

export interface NetworkPool {
  metadata: {
    name: string;
    namespace: string;
    uid?: string;
    creationTimestamp?: string;
  };
  spec: {
    cidr: string;
    reserved?: Array<{ cidr: string; description?: string }>;
    tenantAllocation?: {
      start?: string;
      end?: string;
      ranges?: AllocationRange[];
      defaults?: {
        nodesPerTenant?: number;
        lbPoolPerTenant?: number;
      };
    };
  };
  status?: {
    totalIPs?: number;
    allocatedIPs?: number;
    availableIPs?: number;
    allocationCount?: number;
    fragmentation?: number;
    largestFreeBlock?: number;
    poolSizeIPs?: number;
    reservedIPs?: number;
    conditions?: Array<{
      type: string;
      status: string;
      reason?: string;
      message?: string;
    }>;
  };
}

export interface NetworkPoolListResponse {
  pools: NetworkPool[];
}

export type AllocationPhase = 'Pending' | 'Allocated' | 'Released' | 'Failed';

export interface IPAllocation {
  metadata: {
    name: string;
    namespace: string;
    uid?: string;
    creationTimestamp?: string;
  };
  spec: {
    poolRef: { name: string; namespace?: string };
    /**
     * The cluster this allocation belongs to. This reference is the
     * authoritative owner link: a namespace and name together identify one
     * TenantCluster, so allocations are matched on it rather than on a
     * displayed name.
     */
    tenantClusterRef?: { name: string; namespace?: string };
    type?: 'nodes' | 'loadbalancer';
    count?: number;
    pinnedRange?: AllocationRange;
  };
  status?: {
    phase?: AllocationPhase;
    startAddress?: string;
    endAddress?: string;
    addresses?: string[];
    allocatedAt?: string;
    conditions?: Array<{
      type: string;
      status: string;
      reason?: string;
      message?: string;
    }>;
  };
}

export interface IPAllocationListResponse {
  allocations: IPAllocation[];
}
