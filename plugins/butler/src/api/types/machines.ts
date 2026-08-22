// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

// Field names mirror butler-api v1alpha1 MachineRequest and
// LoadBalancerRequest; the server returns the raw CR objects.

export interface ObjectMetaSummary {
  name: string;
  namespace?: string;
  labels?: Record<string, string>;
  creationTimestamp?: string;
  deletionTimestamp?: string;
}

export interface ProviderReference {
  name: string;
  namespace?: string;
}

export interface ResourceCondition {
  type: string;
  status: string;
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
}

export type MachineRole = 'control-plane' | 'worker';

export type MachinePhase =
  | 'Pending'
  | 'Creating'
  | 'Running'
  | 'Failed'
  | 'Deleting'
  | 'Deleted'
  | 'Unknown';

export interface MachineDiskSpec {
  sizeGB: number;
  storageClass?: string;
}

export interface MachineRequestSpec {
  providerRef: ProviderReference;
  machineName: string;
  role: MachineRole;
  cpu: number;
  memoryMB: number;
  diskGB: number;
  extraDisks?: MachineDiskSpec[];
  image?: string;
  labels?: Record<string, string>;
}

export interface MachineRequestStatus {
  phase?: MachinePhase;
  providerID?: string;
  ipAddress?: string;
  ipAddresses?: string[];
  macAddress?: string;
  failureReason?: string;
  failureMessage?: string;
  conditions?: ResourceCondition[];
  lastUpdated?: string;
  observedGeneration?: number;
}

export interface MachineRequest {
  apiVersion?: string;
  kind?: string;
  metadata: ObjectMetaSummary;
  spec?: MachineRequestSpec;
  status?: MachineRequestStatus;
}

export interface MachineRequestListResponse {
  machineRequests: MachineRequest[];
}

export type LoadBalancerPhase =
  | 'Pending'
  | 'Creating'
  | 'Ready'
  | 'Failed'
  | 'Deleting';

export interface LoadBalancerTarget {
  ip?: string;
  instanceID?: string;
  instanceName?: string;
}

export interface LoadBalancerRequestSpec {
  clusterName: string;
  providerConfigRef: ProviderReference;
  port?: number;
  healthCheckPort?: number;
  targets?: LoadBalancerTarget[];
}

export interface LoadBalancerRequestStatus {
  phase?: LoadBalancerPhase;
  endpoint?: string;
  resourceID?: string;
  failureReason?: string;
  failureMessage?: string;
  registeredTargets?: number;
  conditions?: ResourceCondition[];
  lastUpdated?: string;
  observedGeneration?: number;
}

export interface LoadBalancerRequest {
  apiVersion?: string;
  kind?: string;
  metadata: ObjectMetaSummary;
  spec?: LoadBalancerRequestSpec;
  status?: LoadBalancerRequestStatus;
}

export interface LoadBalancerRequestListResponse {
  loadBalancerRequests: LoadBalancerRequest[];
}
