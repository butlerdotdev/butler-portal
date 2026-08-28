// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { ButlerApiClient } from './ButlerApiClient';

type FetchCall = { url: string; init: RequestInit | undefined };

function makeClient(responder: (url: string) => Partial<Response>) {
  const calls: FetchCall[] = [];
  const fetchFn = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return responder(url) as Response;
  });
  const client = new ButlerApiClient({
    discoveryApi: { getBaseUrl: async () => 'http://localhost/api/butler' },
    fetchApi: { fetch: fetchFn as unknown as typeof fetch },
  });
  return { client, calls };
}

function jsonResponse(body: unknown, status = 200): Partial<Response> {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe('ButlerApiClient cluster detail reads', () => {
  it('fetches machine requests from the machines path', async () => {
    const { client, calls } = makeClient(() =>
      jsonResponse({ machineRequests: [{ metadata: { name: 'm-1' } }] }),
    );
    const result = await client.getClusterMachineRequests('ns', 'c1');
    expect(calls[0].url).toBe(
      'http://localhost/api/butler/clusters/ns/c1/machines',
    );
    expect(result.machineRequests).toHaveLength(1);
  });

  it('fetches load balancer requests from the load-balancers path', async () => {
    const { client, calls } = makeClient(() =>
      jsonResponse({ loadBalancerRequests: [] }),
    );
    const result = await client.getClusterLoadBalancerRequests('ns', 'c1');
    expect(calls[0].url).toBe(
      'http://localhost/api/butler/clusters/ns/c1/load-balancers',
    );
    expect(result.loadBalancerRequests).toEqual([]);
  });

  it('fetches the tenant control plane projection', async () => {
    const { client, calls } = makeClient(() =>
      jsonResponse({
        name: 'c1',
        namespace: 'tenant-c1',
        specVersion: 'v1.31.0',
        status: { phase: 'Ready', replicas: 2, readyReplicas: 2 },
      }),
    );
    const result = await client.getClusterTenantControlPlane('ns', 'c1');
    expect(calls[0].url).toBe(
      'http://localhost/api/butler/clusters/ns/c1/tenantcontrolplane',
    );
    expect(result.status?.readyReplicas).toBe(2);
  });

  it('exports YAML as text with a yaml Accept header', async () => {
    const yaml =
      'apiVersion: butler.butlerlabs.dev/v1alpha1\nkind: TenantCluster\n';
    const { client, calls } = makeClient(() => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => yaml,
      json: async () => {
        throw new Error('not json');
      },
    }));
    const result = await client.exportClusterYAML('ns', 'c1');
    expect(result).toBe(yaml);
    expect(calls[0].url).toBe(
      'http://localhost/api/butler/clusters/ns/c1/export',
    );
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Accept).toBe('application/x-yaml');
    expect(headers['Content-Type']).toBeUndefined();
  });

  it('sends the team context header on the text path', async () => {
    const { client, calls } = makeClient(() => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => 'kind: TenantCluster\n',
    }));
    client.setTeamContext('platform');
    await client.exportClusterYAML('ns', 'c1');
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers['X-Butler-Team']).toBe('platform');
  });

  it('throws the standard error shape when export fails', async () => {
    const { client } = makeClient(() =>
      jsonResponse({ error: 'cluster not found' }, 404),
    );
    await expect(client.exportClusterYAML('ns', 'missing')).rejects.toThrow(
      'Butler API error (404): cluster not found',
    );
  });
});

describe('ButlerApiClient team environments', () => {
  it('reads environments off the team, sorted by name', async () => {
    const { client, calls } = makeClient(() =>
      jsonResponse({
        name: 'platform',
        environments: [{ name: 'staging' }, { name: 'production' }],
      }),
    );

    const context = await client.getTeamClusterContext('platform');

    expect(calls[0].url).toBe('http://localhost/api/butler/teams/platform');
    expect(context.environments.map(e => e.name)).toEqual([
      'production',
      'staging',
    ]);
  });

  it('reads a raw spec when the response carries one', async () => {
    const { client } = makeClient(() =>
      jsonResponse({ spec: { environments: [{ name: 'dev' }] } }),
    );

    expect(
      (await client.getTeamClusterContext('platform')).environments,
    ).toEqual([{ name: 'dev' }]);
  });

  it('treats a team without the field as having none', async () => {
    const { client } = makeClient(() => jsonResponse({ name: 'platform' }));

    expect(
      (await client.getTeamClusterContext('platform')).environments,
    ).toEqual([]);
  });

  it('reads the team cluster defaults from the same call', async () => {
    const { client, calls } = makeClient(() =>
      jsonResponse({
        name: 'platform',
        environments: [{ name: 'dev' }],
        clusterDefaults: { kubernetesVersion: 'v1.31.0', workerCount: 3 },
      }),
    );

    const context = await client.getTeamClusterContext('platform');

    // One read, so the environments and the defaults cannot disagree.
    expect(calls).toHaveLength(1);
    expect(context.clusterDefaults).toEqual({
      kubernetesVersion: 'v1.31.0',
      workerCount: 3,
    });
  });

  it('escapes a team and environment name in the path', async () => {
    const { client, calls } = makeClient(() => jsonResponse({}));

    await client.deleteTeamEnvironment('a team', 'an/env');

    expect(calls[0].url).toBe(
      'http://localhost/api/butler/teams/a%20team/environments/an%2Fenv',
    );
    expect(calls[0].init?.method).toBe('DELETE');
  });

  it('sends the environment as a scope header, never in the body', async () => {
    const { client, calls } = makeClient(() =>
      jsonResponse({ metadata: { name: 'c1' } }),
    );

    await client.createCluster({ name: 'c1', providerConfigRef: 'p' } as any, {
      environment: 'production',
    });

    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers['X-Butler-Environment']).toBe('production');
    expect(JSON.parse(String(calls[0].init?.body))).not.toHaveProperty(
      'environment',
    );
  });

  it('omits the scope header when no environment is chosen', async () => {
    const { client, calls } = makeClient(() =>
      jsonResponse({ metadata: { name: 'c1' } }),
    );

    await client.createCluster({ name: 'c1', providerConfigRef: 'p' } as any);

    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers).not.toHaveProperty('X-Butler-Environment');
  });
});

describe('ButlerApiClient error shapes', () => {
  it('keeps the single field a webhook denial names', async () => {
    const { client } = makeClient(() => ({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => ({
        error: 'webhook denied',
        field: 'spec.providerConfigRef.name',
        message: 'admission webhook denied the request: Not found: "nope"',
      }),
      text: async () => '',
    }));

    await expect(
      client.createCluster({ name: 'c', providerConfigRef: 'nope' } as any),
    ).rejects.toMatchObject({
      status: 403,
      fieldErrors: [
        {
          field: 'spec.providerConfigRef.name',
          reason: expect.stringContaining('Not found'),
        },
      ],
    });
  });

  it('still reads a list of field errors when the server sends one', async () => {
    const { client } = makeClient(() => ({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({
        message: 'invalid',
        errors: [{ field: 'name', reason: 'name is required' }],
      }),
      text: async () => '',
    }));

    await expect(
      client.createCluster({ name: '', providerConfigRef: 'p' } as any),
    ).rejects.toMatchObject({
      fieldErrors: [{ field: 'name', reason: 'name is required' }],
    });
  });
});

describe('ButlerApiClient team providers', () => {
  it('reads the team-scoped list from the team route', async () => {
    const { client, calls } = makeClient(() =>
      jsonResponse({ providers: [{ metadata: { name: 'p' } }] }),
    );

    const res = await client.listTeamProviders('a team');

    expect(calls[0].url).toBe(
      'http://localhost/api/butler/teams/a%20team/providers',
    );
    expect(res.providers).toHaveLength(1);
  });

  it('removes a team provider through the team route', async () => {
    const { client, calls } = makeClient(() => jsonResponse({}));

    await client.deleteTeamProvider('platform', 'butler-system', 'pe/x');

    expect(calls[0].url).toBe(
      'http://localhost/api/butler/teams/platform/providers/butler-system/pe%2Fx',
    );
    expect(calls[0].init?.method).toBe('DELETE');
  });
});

describe('ButlerApiClient policy-aware option lists', () => {
  it('scopes an option read to the environment the cluster will use', async () => {
    const { client, calls } = makeClient(() => jsonResponse({ images: [] }));

    await client.listProviderImages('ns', 'p', { environment: 'production' });

    const headers = calls[0].init?.headers as Record<string, string>;
    expect(calls[0].url).toBe(
      'http://localhost/api/butler/providers/ns/p/images',
    );
    expect(headers['X-Butler-Environment']).toBe('production');
  });

  it('sends no environment header when none is given', async () => {
    const { client, calls } = makeClient(() => jsonResponse({ networks: [] }));

    await client.listProviderNetworks('ns', 'p');

    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers).not.toHaveProperty('X-Butler-Environment');
  });

  it('reads Nutanix clusters and storage containers with their policy', async () => {
    const { client, calls } = makeClient(url =>
      url.endsWith('/clusters')
        ? jsonResponse({
            clusters: [{ id: 'c', name: 'c' }],
            policy: { name: 'p', mode: 'pin' },
          })
        : jsonResponse({ storageContainers: [] }),
    );

    const clusters = await client.listProviderClusters('ns', 'p', {
      environment: 'e',
    });
    await client.listProviderStorageContainers('ns', 'p');

    expect(clusters.policy?.name).toBe('p');
    expect(calls[0].url).toBe(
      'http://localhost/api/butler/providers/ns/p/clusters',
    );
    expect(calls[1].url).toBe(
      'http://localhost/api/butler/providers/ns/p/storage-containers',
    );
  });

  it('reads policies from the admin route', async () => {
    const { client, calls } = makeClient(url =>
      url.endsWith('/admin/policies')
        ? jsonResponse({ policies: [], count: 0 })
        : jsonResponse({ metadata: { name: 'a b' }, spec: { scope: {} } }),
    );

    await client.listPolicies();
    await client.getPolicy('a b');

    expect(calls[0].url).toBe('http://localhost/api/butler/admin/policies');
    expect(calls[1].url).toBe(
      'http://localhost/api/butler/admin/policies/a%20b',
    );
  });
});
