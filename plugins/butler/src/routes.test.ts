// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import {
  rootRouteRef,
  teamRouteRef,
  clustersRouteRef,
  createClusterRouteRef,
  clusterDetailRouteRef,
  teamMembersRouteRef,
  teamSettingsRouteRef,
  adminRouteRef,
  adminClustersRouteRef,
  adminManagementRouteRef,
  adminTeamsRouteRef,
  adminTeamDetailRouteRef,
  adminUsersRouteRef,
  adminProvidersRouteRef,
  adminCreateProviderRouteRef,
  adminIdentityProvidersRouteRef,
  adminCreateIdentityProviderRouteRef,
  adminSettingsRouteRef,
} from './routes';

describe('routes', () => {
  it('defines the root route ref', () => {
    expect(rootRouteRef).toBeDefined();
  });

  it.each([
    [teamRouteRef, '/t/:team'],
    [clustersRouteRef, '/t/:team/clusters'],
    [createClusterRouteRef, '/t/:team/clusters/new'],
    [clusterDetailRouteRef, '/t/:team/clusters/:namespace/:name'],
    [teamMembersRouteRef, '/t/:team/members'],
    [teamSettingsRouteRef, '/t/:team/settings'],
    [adminRouteRef, '/admin'],
    [adminClustersRouteRef, '/admin/clusters'],
    [adminManagementRouteRef, '/admin/management'],
    [adminTeamsRouteRef, '/admin/teams'],
    [adminTeamDetailRouteRef, '/admin/teams/:teamName'],
    [adminUsersRouteRef, '/admin/users'],
    [adminProvidersRouteRef, '/admin/providers'],
    [adminCreateProviderRouteRef, '/admin/providers/create'],
    [adminIdentityProvidersRouteRef, '/admin/identity-providers'],
    [adminCreateIdentityProviderRouteRef, '/admin/identity-providers/create'],
    [adminSettingsRouteRef, '/admin/settings'],
  ])('sub-route %s has the expected path', (ref, path) => {
    expect(ref.path).toBe(path);
    expect(ref.parent).toBe(rootRouteRef);
  });
});
