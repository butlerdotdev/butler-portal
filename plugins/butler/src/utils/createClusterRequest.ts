// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type {
  ControlPlaneResourcesRequest,
  CreateClusterRequest,
} from '../api/types/clusters';
import type { ImageInfo } from '../api/types/providers';
import { requiresManualAddresses, type NetworkMode } from './clusterDefaults';

/**
 * Everything the create form holds, as strings where the control is a
 * text input, so "unset" stays distinguishable from zero.
 */
export interface CreateClusterFormValues {
  name: string;
  namespace: string;
  kubernetesVersion: string;
  providerConfigRef: string;
  workerReplicas: number;
  workerCPU: number;
  workerMemory: string;
  workerDiskSize: string;
  loadBalancerStart: string;
  loadBalancerEnd: string;
  harvesterNamespace: string;
  harvesterNetworkName: string;
  harvesterImageName: string;
  nutanixClusterUUID: string;
  nutanixSubnetUUID: string;
  nutanixImageUUID: string;
  nutanixStorageContainerUUID: string;
  proxmoxNode: string;
  proxmoxStorage: string;
  proxmoxTemplateID: string;
  workspacesEnabled: boolean;
  ingressEnabled: boolean;
  timeServers: string;
  cpApiServerCpuRequest: string;
  cpApiServerMemoryRequest: string;
  cpApiServerCpuLimit: string;
  cpApiServerMemoryLimit: string;
  cpControllerManagerCpuRequest: string;
  cpControllerManagerMemoryRequest: string;
  cpControllerManagerCpuLimit: string;
  cpControllerManagerMemoryLimit: string;
  cpSchedulerCpuRequest: string;
  cpSchedulerMemoryRequest: string;
  cpSchedulerCpuLimit: string;
  cpSchedulerMemoryLimit: string;
}

export interface BuildCreateClusterOptions {
  form: CreateClusterFormValues;
  providerType: string;
  networkMode: NetworkMode;
  /** The caller asked to name addresses instead of letting IPAM allocate. */
  overrideAllocation: boolean;
  team?: string;
  /** Images the provider offered, used to derive the OS of the chosen one. */
  images?: ImageInfo[];
}

function quantities(
  cpu: string,
  memory: string,
): { cpu?: string; memory?: string } | undefined {
  const out: { cpu?: string; memory?: string } = {};
  if (cpu.trim()) out.cpu = cpu.trim();
  if (memory.trim()) out.memory = memory.trim();
  return Object.keys(out).length > 0 ? out : undefined;
}

function component(
  cpuRequest: string,
  memoryRequest: string,
  cpuLimit: string,
  memoryLimit: string,
) {
  const requests = quantities(cpuRequest, memoryRequest);
  const limits = quantities(cpuLimit, memoryLimit);
  if (!requests && !limits) return undefined;
  return { ...(requests && { requests }), ...(limits && { limits }) };
}

function controlPlaneResources(
  form: CreateClusterFormValues,
): ControlPlaneResourcesRequest | undefined {
  const apiServer = component(
    form.cpApiServerCpuRequest,
    form.cpApiServerMemoryRequest,
    form.cpApiServerCpuLimit,
    form.cpApiServerMemoryLimit,
  );
  const controllerManager = component(
    form.cpControllerManagerCpuRequest,
    form.cpControllerManagerMemoryRequest,
    form.cpControllerManagerCpuLimit,
    form.cpControllerManagerMemoryLimit,
  );
  const scheduler = component(
    form.cpSchedulerCpuRequest,
    form.cpSchedulerMemoryRequest,
    form.cpSchedulerCpuLimit,
    form.cpSchedulerMemoryLimit,
  );
  if (!apiServer && !controllerManager && !scheduler) return undefined;
  return {
    ...(apiServer && { apiServer }),
    ...(controllerManager && { controllerManager }),
    ...(scheduler && { scheduler }),
  };
}

/**
 * The form's values as the request butler-server accepts.
 *
 * Only fields the server reads are sent. The console additionally sends
 * `lbPoolSize`, `cloudProvider`, `awsSubnet` and `schematicID`, none of
 * which exist on the server's request struct, so they are dropped here
 * rather than reproduced: a control that changes nothing is worse than
 * an absent one.
 *
 * The environment is deliberately absent: it is not a body field at all.
 * It travels as a request scope header that the server turns into a
 * label, so the caller passes it alongside this request.
 */
export function buildCreateClusterRequest(
  options: BuildCreateClusterOptions,
): CreateClusterRequest {
  const { form, providerType, networkMode, overrideAllocation, images } =
    options;

  const request: CreateClusterRequest = {
    name: form.name.trim(),
    kubernetesVersion: form.kubernetesVersion,
    providerConfigRef: form.providerConfigRef,
    workerReplicas: form.workerReplicas,
    workerCPU: form.workerCPU,
    workerMemory: form.workerMemory,
    workerDiskSize: form.workerDiskSize,
  };

  if (form.namespace.trim()) request.namespace = form.namespace.trim();
  if (options.team) request.teamRef = options.team;

  // Addresses only when this deployment actually expects the caller to
  // name them. Sending an empty range where the platform allocates would
  // read as a request for nothing rather than a request to allocate.
  if (requiresManualAddresses(networkMode, overrideAllocation)) {
    request.loadBalancerStart = form.loadBalancerStart.trim();
    request.loadBalancerEnd = form.loadBalancerEnd.trim();
  }

  if (providerType === 'harvester') {
    if (form.harvesterNamespace.trim()) {
      request.harvesterNamespace = form.harvesterNamespace.trim();
    }
    request.harvesterNetworkName = form.harvesterNetworkName;
    request.harvesterImageName = form.harvesterImageName;
  } else if (providerType === 'nutanix') {
    request.nutanixClusterUUID = form.nutanixClusterUUID;
    request.nutanixSubnetUUID = form.nutanixSubnetUUID;
    if (form.nutanixImageUUID) request.nutanixImageUUID = form.nutanixImageUUID;
    if (form.nutanixStorageContainerUUID) {
      request.nutanixStorageContainerUUID = form.nutanixStorageContainerUUID;
    }
  } else if (providerType === 'proxmox') {
    request.proxmoxNode = form.proxmoxNode;
    request.proxmoxStorage = form.proxmoxStorage;
    const template = parseInt(form.proxmoxTemplateID, 10);
    if (Number.isFinite(template) && template > 0) {
      request.proxmoxTemplateID = template;
    }
  }

  // The OS is a property of the image that was picked, not a separate
  // choice, so it is read back off that image.
  const selectedImageId =
    providerType === 'harvester'
      ? form.harvesterImageName
      : providerType === 'nutanix'
      ? form.nutanixImageUUID
      : '';
  if (selectedImageId) {
    const image = images?.find(candidate => candidate.id === selectedImageId);
    if (image?.os) request.osType = image.os;
  }

  if (form.workspacesEnabled) request.workspacesEnabled = true;
  // Only ever sent to turn ingress off; the server installs it otherwise.
  if (!form.ingressEnabled) request.ingressEnabled = false;

  const servers = form.timeServers
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean);
  if (servers.length > 0) request.timeServers = servers;

  const resources = controlPlaneResources(form);
  if (resources) request.controlPlaneResources = resources;

  return request;
}
