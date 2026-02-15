// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

export interface Cluster {
  metadata: {
    name: string;
    namespace: string;
    uid?: string;
    creationTimestamp?: string;
  };
  spec: {
    kubernetesVersion: string;
    providerConfigRef?: {
      name: string;
      namespace?: string;
    };
    teamRef?: {
      name: string;
    };
    workers?: {
      replicas: number;
      machineTemplate?: {
        cpu?: number;
        memory?: string;
        diskSize?: string;
      };
    };
    networking?: {
      loadBalancerPool?: {
        start: string;
        end: string;
      };
    };
    workspaces?: {
      enabled?: boolean;
      defaultImage?: string;
      maxWorkspaces?: number;
      autoDeleteAfter?: string;
    };
    infrastructureOverride?: {
      harvester?: {
        namespace?: string;
        networkName?: string;
        imageName?: string;
      };
      nutanix?: {
        clusterUUID?: string;
        subnetUUID?: string;
        imageUUID?: string;
        storageContainerUUID?: string;
      };
      proxmox?: {
        node?: string;
        storage?: string;
        templateID?: number;
      };
    };
  };
  status?: {
    phase?: string;
    tenantNamespace?: string;
    controlPlaneReady?: boolean;
    infrastructureReady?: boolean;
    observedState?: {
      addons?: Array<{
        name: string;
        status: string;
        version?: string;
      }>;
    };
    conditions?: Array<{
      type: string;
      status: string;
      reason?: string;
      message?: string;
    }>;
  };
}

export interface ClusterListResponse {
  clusters: Cluster[];
}

export interface ClusterListOptions {
  namespace?: string;
  team?: string;
}

export interface CreateClusterRequest {
  name: string;
  namespace?: string;
  kubernetesVersion?: string;
  providerConfigRef: string;
  workerReplicas?: number;
  workerCPU?: number;
  workerMemory?: string;
  workerDiskSize?: string;
  loadBalancerStart: string;
  loadBalancerEnd: string;
  teamRef?: string;

  // Harvester-specific
  harvesterNamespace?: string;
  harvesterNetworkName?: string;
  harvesterImageName?: string;

  // Nutanix-specific
  nutanixClusterUUID?: string;
  nutanixSubnetUUID?: string;
  nutanixImageUUID?: string;
  nutanixStorageContainerUUID?: string;

  // Proxmox-specific
  proxmoxNode?: string;
  proxmoxStorage?: string;
  proxmoxTemplateID?: number;

  // Workspaces
  workspacesEnabled?: boolean;
}

export interface ScaleRequest {
  replicas: number;
}

export interface Node {
  name: string;
  status: string;
  roles: string[];
  version: string;
  internalIP: string;
  os: string;
  containerRuntime: string;
  cpu: string;
  memory: string;
  age: string;
}

export interface Addon {
  name: string;
  status: string;
  version?: string;
}

export interface ClusterEvent {
  type: string;
  reason: string;
  message: string;
  source: string;
  firstTimestamp: string;
  lastTimestamp: string;
  count: number;
}

export interface ManagementCluster {
  name: string;
  kubernetesVersion: string;
  phase: string;
  nodes: {
    total: number;
    ready: number;
  };
  systemNamespaces: Array<{
    namespace: string;
    running: number;
    total: number;
  }>;
  tenantClusters: number;
  tenantNamespaces: Array<{
    name: string;
    namespace: string;
    tenantNamespace: string;
    phase: string;
  }>;
}

export interface ManagementNode {
  name: string;
  status: string;
  roles: string[];
  version: string;
  internalIP: string;
  os: string;
  containerRuntime: string;
  cpu: string;
  memory: string;
  age: string;
}

export interface ManagementPod {
  name: string;
  namespace: string;
  status: string;
  ready: string;
  restarts: number;
  age: string;
}
