// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import {
  buildCreateClusterRequest,
  type CreateClusterFormValues,
} from './createClusterRequest';
import {
  providerNetworkMode,
  requiresManualAddresses,
  resolveClusterDefaults,
} from './clusterDefaults';

const form: CreateClusterFormValues = {
  name: 'e2e-demo',
  namespace: '',
  kubernetesVersion: 'v1.32.2',
  providerConfigRef: 'harvester',
  workerReplicas: 3,
  workerCPU: 4,
  workerMemory: '8Gi',
  workerDiskSize: '50Gi',
  loadBalancerStart: '',
  loadBalancerEnd: '',
  harvesterNamespace: 'default',
  harvesterNetworkName: 'lab-vlan-40',
  harvesterImageName: 'img-talos',
  nutanixClusterUUID: '',
  nutanixSubnetUUID: '',
  nutanixImageUUID: '',
  nutanixStorageContainerUUID: '',
  proxmoxNode: '',
  proxmoxStorage: '',
  proxmoxTemplateID: '',
  workspacesEnabled: false,
  ingressEnabled: true,
  timeServers: '',
  cpApiServerCpuRequest: '',
  cpApiServerMemoryRequest: '',
  cpApiServerCpuLimit: '',
  cpApiServerMemoryLimit: '',
  cpControllerManagerCpuRequest: '',
  cpControllerManagerMemoryRequest: '',
  cpControllerManagerCpuLimit: '',
  cpControllerManagerMemoryLimit: '',
  cpSchedulerCpuRequest: '',
  cpSchedulerMemoryRequest: '',
  cpSchedulerCpuLimit: '',
  cpSchedulerMemoryLimit: '',
};

const base = {
  form,
  providerType: 'harvester',
  networkMode: 'ipam' as const,
  overrideAllocation: false,
};

describe('buildCreateClusterRequest', () => {
  it('never sends fields the server has no place for', () => {
    const request = buildCreateClusterRequest(base) as unknown as Record<
      string,
      unknown
    >;

    // The console sends all four; the server's request struct has none.
    expect(request).not.toHaveProperty('lbPoolSize');
    expect(request).not.toHaveProperty('cloudProvider');
    expect(request).not.toHaveProperty('awsSubnet');
    expect(request).not.toHaveProperty('schematicID');
    // The environment is a request scope, never a body field.
    expect(request).not.toHaveProperty('environment');
  });

  it('omits the address range when the platform allocates it', () => {
    const request = buildCreateClusterRequest(base);

    expect(request.loadBalancerStart).toBeUndefined();
    expect(request.loadBalancerEnd).toBeUndefined();
  });

  it('sends the range when the caller overrides allocation', () => {
    const request = buildCreateClusterRequest({
      ...base,
      overrideAllocation: true,
      form: {
        ...form,
        loadBalancerStart: ' 10.40.2.10 ',
        loadBalancerEnd: '10.40.2.19',
      },
    });

    expect(request.loadBalancerStart).toBe('10.40.2.10');
    expect(request.loadBalancerEnd).toBe('10.40.2.19');
  });

  it('omits the range entirely for a cloud provider', () => {
    const request = buildCreateClusterRequest({
      ...base,
      networkMode: 'cloud',
      overrideAllocation: true,
      form: {
        ...form,
        loadBalancerStart: '1.2.3.4',
        loadBalancerEnd: '1.2.3.9',
      },
    });

    expect(request.loadBalancerStart).toBeUndefined();
  });

  it('requires the range when the provider does not allocate', () => {
    const request = buildCreateClusterRequest({
      ...base,
      networkMode: 'manual',
      form: {
        ...form,
        loadBalancerStart: '10.0.0.1',
        loadBalancerEnd: '10.0.0.9',
      },
    });

    expect(request.loadBalancerStart).toBe('10.0.0.1');
  });

  it('takes the OS from the chosen image rather than a separate field', () => {
    const request = buildCreateClusterRequest({
      ...base,
      images: [
        { id: 'img-talos', name: 'Talos 1.10', os: 'talos' },
        { id: 'img-other', name: 'Rocky 9', os: 'rocky' },
      ],
    });

    expect(request.osType).toBe('talos');
  });

  it('leaves the OS unset when the image does not declare one', () => {
    const request = buildCreateClusterRequest({
      ...base,
      images: [{ id: 'img-talos', name: 'Talos 1.10' }],
    });

    expect(request.osType).toBeUndefined();
  });

  it('sends ingress only to turn it off', () => {
    expect(buildCreateClusterRequest(base).ingressEnabled).toBeUndefined();
    expect(
      buildCreateClusterRequest({
        ...base,
        form: { ...form, ingressEnabled: false },
      }).ingressEnabled,
    ).toBe(false);
  });

  it('splits time servers and drops the empty entries', () => {
    const request = buildCreateClusterRequest({
      ...base,
      form: { ...form, timeServers: ' pool.ntp.org , , time.cloudflare.com ' },
    });

    expect(request.timeServers).toEqual([
      'pool.ntp.org',
      'time.cloudflare.com',
    ]);
  });

  it('omits time servers when the field is blank', () => {
    expect(buildCreateClusterRequest(base).timeServers).toBeUndefined();
  });

  it('nests only the control plane components that were filled in', () => {
    const request = buildCreateClusterRequest({
      ...base,
      form: {
        ...form,
        cpApiServerCpuRequest: '500m',
        cpApiServerMemoryLimit: '2Gi',
        cpSchedulerCpuRequest: '100m',
      },
    });

    expect(request.controlPlaneResources).toEqual({
      apiServer: { requests: { cpu: '500m' }, limits: { memory: '2Gi' } },
      scheduler: { requests: { cpu: '100m' } },
    });
    expect(request.controlPlaneResources?.controllerManager).toBeUndefined();
  });

  it('omits control plane resources when nothing was overridden', () => {
    expect(
      buildCreateClusterRequest(base).controlPlaneResources,
    ).toBeUndefined();
  });

  it('sends only the chosen provider family fields', () => {
    const harvester = buildCreateClusterRequest(base);
    expect(harvester.harvesterNetworkName).toBe('lab-vlan-40');
    expect(harvester.nutanixClusterUUID).toBeUndefined();
    expect(harvester.proxmoxNode).toBeUndefined();

    const proxmox = buildCreateClusterRequest({
      ...base,
      providerType: 'proxmox',
      form: {
        ...form,
        proxmoxNode: 'pve1',
        proxmoxStorage: 'local-lvm',
        proxmoxTemplateID: '9000',
      },
    });
    expect(proxmox.proxmoxTemplateID).toBe(9000);
    expect(proxmox.harvesterNetworkName).toBeUndefined();
  });

  it('drops a template id that is not a positive number', () => {
    const request = buildCreateClusterRequest({
      ...base,
      providerType: 'proxmox',
      form: {
        ...form,
        proxmoxNode: 'pve1',
        proxmoxStorage: 's',
        proxmoxTemplateID: 'abc',
      },
    });

    expect(request.proxmoxTemplateID).toBeUndefined();
  });

  it('carries the team so the server scopes the cluster to it', () => {
    expect(
      buildCreateClusterRequest({ ...base, team: 'platform' }).teamRef,
    ).toBe('platform');
  });
});

describe('resolveClusterDefaults', () => {
  it('lets an environment narrow what the team set', () => {
    const { values, sources } = resolveClusterDefaults(
      { kubernetesVersion: 'v1.31.0', workerCount: 3, workerMemoryGi: 8 },
      { workerCount: 1 },
    );

    expect(values.kubernetesVersion).toBe('v1.31.0');
    expect(values.workerReplicas).toBe(1);
    expect(sources.kubernetesVersion).toBe('team');
    expect(sources.workerReplicas).toBe('environment');
  });

  it('turns gibibyte numbers into the quantities the server expects', () => {
    const { values } = resolveClusterDefaults(
      { workerMemoryGi: 16, workerDiskGi: 100 },
      undefined,
    );

    expect(values.workerMemory).toBe('16Gi');
    expect(values.workerDiskSize).toBe('100Gi');
  });

  it('reports nothing when neither layer sets anything', () => {
    const { values, sources } = resolveClusterDefaults(undefined, undefined);

    expect(values).toEqual({});
    expect(sources).toEqual({});
  });
});

describe('network mode', () => {
  it('reads the provider mode', () => {
    expect(providerNetworkMode('ipam')).toBe('ipam');
    expect(providerNetworkMode('cloud')).toBe('cloud');
    expect(providerNetworkMode(undefined)).toBe('manual');
    expect(providerNetworkMode('something-else')).toBe('manual');
  });

  it('only asks for addresses where the caller must supply them', () => {
    expect(requiresManualAddresses('ipam', false)).toBe(false);
    expect(requiresManualAddresses('ipam', true)).toBe(true);
    expect(requiresManualAddresses('cloud', true)).toBe(false);
    expect(requiresManualAddresses('manual', false)).toBe(true);
  });
});
