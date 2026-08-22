/*
 * Copyright 2026 The Butler Authors.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ButlerApiClient } from './ButlerApiClient';

// Minimal fetch double: records the URL and init of every call and
// answers with a canned JSON body.
function makeClient(body: unknown = {}) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchApi = {
    fetch: jest.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        json: async () => body,
      } as unknown as Response;
    }),
  };
  const discoveryApi = {
    getBaseUrl: jest.fn(async () => 'http://portal/api/butler'),
  };
  const client = new ButlerApiClient({ discoveryApi, fetchApi });
  return { client, calls };
}

describe('ButlerApiClient routes', () => {
  it('lists branches through the server query-parameter route', async () => {
    const { client, calls } = makeClient([]);
    await client.listBranches('butlerdotdev', 'tenant-live');
    expect(calls[0].url).toBe(
      'http://portal/api/butler/gitops/repos/branches?repo=butlerdotdev%2Ftenant-live',
    );
  });

  it('encodes nested group repository names', async () => {
    const { client, calls } = makeClient([]);
    await client.listBranches('group/subgroup', 'repo');
    expect(calls[0].url).toContain('repo=group%2Fsubgroup%2Frepo');
  });

  it('reads platform configuration from /admin/config', async () => {
    const { client, calls } = makeClient({
      multiTenancy: { mode: 'Optional' },
      defaultNamespace: 'butler-tenants',
      status: null,
    });
    const config = await client.getPlatformConfig();
    expect(calls[0].url).toBe('http://portal/api/butler/admin/config');
    expect(config.multiTenancy?.mode).toBe('Optional');
  });

  it('sends the team header only when a team context is set', async () => {
    const { client, calls } = makeClient({ clusters: [] });
    await client.listClusters();
    expect(
      (calls[0].init?.headers as Record<string, string>)['X-Butler-Team'],
    ).toBeUndefined();
    client.setTeamContext('alpha');
    await client.listClusters();
    expect(
      (calls[1].init?.headers as Record<string, string>)['X-Butler-Team'],
    ).toBe('alpha');
  });
});
