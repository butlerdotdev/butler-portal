// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

// Mirrors the projection built by butler-server buildTCPResponse.

export interface TenantControlPlaneWorkerBootstrap {
  provider?: string;
  endpoint?: string;
}

export interface TenantControlPlaneStatusSummary {
  phase?: string;
  version?: string;
  controlPlaneEndpoint?: string;
  replicas?: number;
  readyReplicas?: number;
  servicePort?: number;
  loadBalancerIP?: string;
  dataStoreName?: string;
  dataStoreDriver?: string;
  konnectivityEnabled?: boolean;
  workerBootstrap?: TenantControlPlaneWorkerBootstrap;
}

export interface TenantControlPlaneSummary {
  name: string;
  namespace: string;
  specVersion?: string;
  status?: TenantControlPlaneStatusSummary;
}
