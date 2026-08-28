// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { Provider } from '../api/types/providers';
import {
  EMPTY_PROVIDER_FORM,
  buildCreateProviderRequest,
  buildUpdateProviderRequest,
  describeValidation,
  parsePoolRefs,
  providerReadiness,
  providerToForm,
  validateProviderForm,
} from './providerRequest';

const harvesterLive: Provider = {
  metadata: { name: 'harvester', namespace: 'butler-system' },
  spec: {
    provider: 'harvester',
    credentialsRef: { name: 'harvester-credentials', key: 'kubeconfig' },
    harvester: {
      namespace: 'default',
      networkName: 'default/vlan40-workloads',
    },
    network: {
      mode: 'ipam',
      subnet: '10.40.0.0/22',
      gateway: '10.40.0.1',
      dnsServers: ['10.40.0.1'],
      poolRefs: [{ name: 'vlan40-underlay', priority: 1 }],
      loadBalancer: { defaultPoolSize: 4, allocationMode: 'static' },
      quotaPerTenant: { maxNodeIPs: 10, maxLoadBalancerIPs: 8 },
    },
  },
  status: {
    validated: true,
    ready: true,
    lastProbeTime: '2026-08-28T16:33:35Z',
  },
};

describe('buildCreateProviderRequest', () => {
  it('sends only what was filled, plus the type and name', () => {
    const req = buildCreateProviderRequest({
      ...EMPTY_PROVIDER_FORM,
      name: 'lab',
      provider: 'nutanix',
      nutanixEndpoint: ' pc.lab ',
      nutanixUsername: 'admin',
      nutanixPassword: 'p',
    });
    expect(req).toEqual({
      name: 'lab',
      namespace: 'butler-system',
      provider: 'nutanix',
      nutanixEndpoint: 'pc.lab',
      nutanixPort: 9440,
      nutanixUsername: 'admin',
      nutanixPassword: 'p',
    });
  });

  it('carries the ipam network, pools, quota, scope and limits when set', () => {
    const req = buildCreateProviderRequest({
      ...EMPTY_PROVIDER_FORM,
      name: 'h',
      harvesterKubeconfig: 'k',
      networkMode: 'ipam',
      networkSubnet: '10.99.0.0/24',
      networkGateway: '10.99.0.1',
      networkDnsServers: '10.99.0.1, 10.99.0.2',
      poolRefs: 'vlan40-underlay:1, spare',
      lbDefaultPoolSize: '4',
      quotaMaxNodeIPs: '10',
      scopeType: 'team',
      scopeTeamRef: 'platform-engineering',
      maxClustersPerTeam: '3',
    });
    expect(req.networkMode).toBe('ipam');
    expect(req.networkDnsServers).toEqual(['10.99.0.1', '10.99.0.2']);
    expect(req.poolRefs).toEqual([
      { name: 'vlan40-underlay', priority: 1 },
      { name: 'spare' },
    ]);
    expect(req.lbDefaultPoolSize).toBe(4);
    expect(req.quotaMaxNodeIPs).toBe(10);
    expect(req.quotaMaxLoadBalancerIPs).toBeUndefined();
    expect(req.scopeType).toBe('team');
    expect(req.scopeTeamRef).toBe('platform-engineering');
    expect(req.maxClustersPerTeam).toBe(3);
  });

  it('drops ipam-only network fields when the mode is cloud', () => {
    const req = buildCreateProviderRequest({
      ...EMPTY_PROVIDER_FORM,
      name: 'a',
      provider: 'aws',
      awsRegion: 'eu-west-1',
      awsAccessKeyId: 'AKIA',
      awsSecretAccessKey: 's',
      networkMode: 'cloud',
      networkSubnet: '10.0.0.0/16',
      poolRefs: 'x',
    });
    expect(req.networkMode).toBe('cloud');
    expect(req.networkSubnet).toBeUndefined();
    expect(req.poolRefs).toBeUndefined();
  });
});

describe('validateProviderForm', () => {
  it('knows the admission rule for ipam pools', () => {
    const errors = validateProviderForm(
      {
        ...EMPTY_PROVIDER_FORM,
        name: 'h',
        harvesterKubeconfig: 'k',
        networkMode: 'ipam',
      },
      'create',
    );
    expect(errors.poolRefs).toMatch(/at least one network pool/);
  });

  it('requires the credential each type needs', () => {
    expect(
      validateProviderForm({ ...EMPTY_PROVIDER_FORM, name: 'h' }, 'create'),
    ).toHaveProperty('harvesterKubeconfig');
    expect(
      validateProviderForm(
        {
          ...EMPTY_PROVIDER_FORM,
          name: 'p',
          provider: 'proxmox',
          proxmoxEndpoint: 'e',
        },
        'create',
      ),
    ).toHaveProperty('proxmoxUsername');
    expect(
      validateProviderForm(
        {
          ...EMPTY_PROVIDER_FORM,
          name: 'g',
          provider: 'gcp',
          gcpProjectId: 'p',
          gcpRegion: 'r',
        },
        'create',
      ),
    ).toHaveProperty('gcpServiceAccount');
  });

  it('does not demand credentials on edit', () => {
    expect(validateProviderForm(providerToForm(harvesterLive), 'edit')).toEqual(
      {},
    );
  });
});

describe('buildUpdateProviderRequest', () => {
  it('sends nothing for an unchanged form', () => {
    expect(
      buildUpdateProviderRequest(providerToForm(harvesterLive), harvesterLive),
    ).toEqual({});
  });

  it('sends only the fields that changed', () => {
    const form = {
      ...providerToForm(harvesterLive),
      networkDnsServers: '10.40.0.1, 10.40.0.2',
      maxClustersPerTeam: '5',
    };
    expect(buildUpdateProviderRequest(form, harvesterLive)).toEqual({
      networkDnsServers: ['10.40.0.1', '10.40.0.2'],
      maxClustersPerTeam: 5,
    });
  });

  it('sends a credential only when one was typed, and never the scope', () => {
    const form = {
      ...providerToForm(harvesterLive),
      harvesterKubeconfig: 'new-kubeconfig',
      scopeType: 'team' as const,
      scopeTeamRef: 'x',
    };
    const req = buildUpdateProviderRequest(form, harvesterLive);
    expect(req.harvesterKubeconfig).toBe('new-kubeconfig');
    expect(req).not.toHaveProperty('scopeType');
    expect(req).not.toHaveProperty('scopeTeamRef');
    expect(req).not.toHaveProperty('name');
  });

  it('carries the explicit CA removal', () => {
    const nutanix: Provider = {
      metadata: { name: 'n', namespace: 'butler-system' },
      spec: { provider: 'nutanix', nutanix: { endpoint: 'pc', port: 9440 } },
    };
    expect(
      buildUpdateProviderRequest(
        { ...providerToForm(nutanix), removeCABundle: true },
        nutanix,
      ),
    ).toEqual({
      removeCABundle: true,
    });
  });
});

describe('parsePoolRefs', () => {
  it('reads names with optional priorities', () => {
    expect(parsePoolRefs('a:1, b, c:3')).toEqual([
      { name: 'a', priority: 1 },
      { name: 'b' },
      { name: 'c', priority: 3 },
    ]);
    expect(parsePoolRefs('')).toEqual([]);
  });
});

describe('describeValidation', () => {
  it('names the failing stage', () => {
    expect(
      describeValidation({ valid: false, category: 'auth', message: '401' })
        .headline,
    ).toBe('Credentials refused');
    expect(
      describeValidation({
        valid: false,
        category: 'network',
        message: 'refused',
      }).headline,
    ).toBe('Endpoint unreachable');
    expect(describeValidation({ valid: false, message: 'x' }).headline).toBe(
      'Not reachable',
    );
    expect(
      describeValidation({ valid: true, message: 'Connected (v1.33)' }),
    ).toEqual({
      headline: 'Reachable',
      detail: 'Connected (v1.33)',
    });
  });
});

describe('providerReadiness', () => {
  it('keeps readiness apart from reachability', () => {
    const r = providerReadiness(harvesterLive);
    expect(r.headline).toBe('Ready');
    expect(r.detail).toMatch(/run Validate to confirm/i);
    expect(
      providerReadiness({ ...harvesterLive, status: undefined }).headline,
    ).toBe('Not probed');
    expect(
      providerReadiness({
        ...harvesterLive,
        status: {
          ready: false,
          conditions: [
            {
              type: 'CredentialsValid',
              status: 'False',
              reason: 'x',
              message: 'secret missing',
            },
          ],
        },
      }).detail,
    ).toBe('secret missing');
  });
});
