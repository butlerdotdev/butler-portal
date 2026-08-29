// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { upstreamPath } from '../router';

describe('upstreamPath', () => {
  it('prefixes the router path with /api', () => {
    expect(upstreamPath('/teams', '/teams')).toBe('/api/teams');
  });

  it('carries the query string to the server', () => {
    expect(
      upstreamPath('/admin/audit', '/admin/audit?limit=25&offset=50'),
    ).toBe('/api/admin/audit?limit=25&offset=50');
    expect(
      upstreamPath(
        '/gitops/repos/branches',
        '/gitops/repos/branches?repo=a%2Fb',
      ),
    ).toBe('/api/gitops/repos/branches?repo=a%2Fb');
  });

  it('leaves a bare path untouched', () => {
    expect(
      upstreamPath('/clusters/ns/name/nodes', '/clusters/ns/name/nodes'),
    ).toBe('/api/clusters/ns/name/nodes');
  });
});
