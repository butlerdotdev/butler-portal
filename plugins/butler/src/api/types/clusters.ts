// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

export interface Cluster {
  metadata: {
    name: string;
    namespace: string;
    uid?: string;
    resourceVersion?: string;
    creationTimestamp?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec: {
    kubernetesVersion: string;
    controlPlane?: {
      replicas?: number;
      resources?: Partial<
        Record<
          'apiServer' | 'controllerManager' | 'scheduler',
          {
            requests?: { cpu?: string; memory?: string };
            limits?: { cpu?: string; memory?: string };
          }
        >
      >;
    };
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
        os?: {
          type?: string;
          version?: string;
          talos?: {
            version?: string;
          };
        };
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
    controlPlaneEndpoint?: string;
    observedGeneration?: number;
    lastTransitionTime?: string;
    workerNodesReady?: number;
    workerNodesDesired?: number;
    observedState?: {
      kubernetesVersion?: string;
      workers?: {
        desired: number;
        ready: number;
        nodes?: string[];
      };
      addons?: Array<{
        name: string;
        status: string;
        version?: string;
        managedBy?: string;
      }>;
    };
    conditions?: Array<{
      type: string;
      status: string;
      reason?: string;
      message?: string;
      lastTransitionTime?: string;
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
  /**
   * Only sent when the caller supplies the range. A provider in `ipam`
   * mode allocates from a pool and a `cloud` provider owns addressing
   * outright, so in both cases there is nothing for the caller to name.
   */
  loadBalancerStart?: string;
  loadBalancerEnd?: string;
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

  /**
   * OS the worker machines run, taken from the selected image rather than
   * chosen separately. The server writes it to
   * `workers.machineTemplate.os.type`.
   */
  osType?: string;

  /**
   * Traefik. The server installs it unless this is explicitly false, so
   * the field is only ever sent to turn it off, and turning it off saves
   * a load balancer address.
   */
  ingressEnabled?: boolean;

  /** NTP servers for the worker nodes, overriding provider defaults. */
  timeServers?: string[];

  /** Optional control plane resource overrides. */
  controlPlaneResources?: ControlPlaneResourcesRequest;
}

export interface ResourceQuantitiesRequest {
  cpu?: string;
  memory?: string;
}

export interface ComponentResourcesRequest {
  requests?: ResourceQuantitiesRequest;
  limits?: ResourceQuantitiesRequest;
}

export interface ControlPlaneResourcesRequest {
  apiServer?: ComponentResourcesRequest;
  controllerManager?: ComponentResourcesRequest;
  scheduler?: ComponentResourcesRequest;
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

/** Fields butler-server accepts on PUT /clusters/{namespace}/{name}. */
export interface UpdateClusterRequest {
  /** Required: the server rejects an edit without it. */
  resourceVersion: string;
  kubernetesVersion?: string;
  controlPlane?: {
    replicas?: number;
    resources?: Record<string, unknown>;
  };
  workers?: {
    replicas?: number;
    machineTemplate?: Record<string, unknown>;
  };
  /** Platform admin only; the server refuses it for anyone else. */
  infrastructureOverride?: Record<string, unknown>;
  /** Required when taking control plane replicas from three to one. */
  acknowledgeDowngrade?: boolean;
}

/** An environment a team may place clusters in. */
// Environments belong to the team, not to the cluster. The canonical
// shape lives with the environment types; this re-export keeps existing
// cluster imports working without a second, drifting definition.
export type { TeamEnvironment } from './environments';
