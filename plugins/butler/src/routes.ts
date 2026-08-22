// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { createRouteRef, createSubRouteRef } from '@backstage/core-plugin-api';

export const rootRouteRef = createRouteRef({ id: 'butler' });

export const teamRouteRef = createSubRouteRef({
  id: 'butler.team',
  path: '/t/:team',
  parent: rootRouteRef,
});

export const clustersRouteRef = createSubRouteRef({
  id: 'butler.team.clusters',
  path: '/t/:team/clusters',
  parent: rootRouteRef,
});

export const createClusterRouteRef = createSubRouteRef({
  id: 'butler.team.clusters.create',
  path: '/t/:team/clusters/new',
  parent: rootRouteRef,
});

export const clusterDetailRouteRef = createSubRouteRef({
  id: 'butler.team.clusters.detail',
  path: '/t/:team/clusters/:namespace/:name',
  parent: rootRouteRef,
});

export const teamMembersRouteRef = createSubRouteRef({
  id: 'butler.team.members',
  path: '/t/:team/members',
  parent: rootRouteRef,
});

export const teamSettingsRouteRef = createSubRouteRef({
  id: 'butler.team.settings',
  path: '/t/:team/settings',
  parent: rootRouteRef,
});

export const adminRouteRef = createSubRouteRef({
  id: 'butler.admin',
  path: '/admin',
  parent: rootRouteRef,
});

export const adminClustersRouteRef = createSubRouteRef({
  id: 'butler.admin.clusters',
  path: '/admin/clusters',
  parent: rootRouteRef,
});

export const adminManagementRouteRef = createSubRouteRef({
  id: 'butler.admin.management',
  path: '/admin/management',
  parent: rootRouteRef,
});

export const adminTeamsRouteRef = createSubRouteRef({
  id: 'butler.admin.teams',
  path: '/admin/teams',
  parent: rootRouteRef,
});

export const adminTeamDetailRouteRef = createSubRouteRef({
  id: 'butler.admin.teams.detail',
  path: '/admin/teams/:teamName',
  parent: rootRouteRef,
});

export const adminUsersRouteRef = createSubRouteRef({
  id: 'butler.admin.users',
  path: '/admin/users',
  parent: rootRouteRef,
});

export const adminProvidersRouteRef = createSubRouteRef({
  id: 'butler.admin.providers',
  path: '/admin/providers',
  parent: rootRouteRef,
});

export const adminCreateProviderRouteRef = createSubRouteRef({
  id: 'butler.admin.providers.create',
  path: '/admin/providers/create',
  parent: rootRouteRef,
});

export const adminIdentityProvidersRouteRef = createSubRouteRef({
  id: 'butler.admin.identity-providers',
  path: '/admin/identity-providers',
  parent: rootRouteRef,
});

export const adminCreateIdentityProviderRouteRef = createSubRouteRef({
  id: 'butler.admin.identity-providers.create',
  path: '/admin/identity-providers/create',
  parent: rootRouteRef,
});

export const adminSettingsRouteRef = createSubRouteRef({
  id: 'butler.admin.settings',
  path: '/admin/settings',
  parent: rootRouteRef,
});
