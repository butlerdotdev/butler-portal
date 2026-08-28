// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import {
  createPlugin,
  createApiFactory,
  discoveryApiRef,
  fetchApiRef,
  createRoutableExtension,
} from '@backstage/core-plugin-api';
import { butlerApiRef } from './api/ButlerApi';
import { ButlerApiClient } from './api/ButlerApiClient';
import {
  rootRouteRef,
  teamRouteRef,
  clustersRouteRef,
  createClusterRouteRef,
  clusterDetailRouteRef,
  teamProvidersRouteRef,
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
  adminPoliciesRouteRef,
  adminPolicyRouteRef,
  adminCreateIdentityProviderRouteRef,
  adminSettingsRouteRef,
} from './routes';

export const butlerPlugin = createPlugin({
  id: 'butler',
  routes: {
    root: rootRouteRef,
    team: teamRouteRef,
    clusters: clustersRouteRef,
    createCluster: createClusterRouteRef,
    clusterDetail: clusterDetailRouteRef,
    teamProviders: teamProvidersRouteRef,
    teamMembers: teamMembersRouteRef,
    teamSettings: teamSettingsRouteRef,
    admin: adminRouteRef,
    adminClusters: adminClustersRouteRef,
    adminManagement: adminManagementRouteRef,
    adminTeams: adminTeamsRouteRef,
    adminTeamDetail: adminTeamDetailRouteRef,
    adminUsers: adminUsersRouteRef,
    adminProviders: adminProvidersRouteRef,
    adminCreateProvider: adminCreateProviderRouteRef,
    adminIdentityProviders: adminIdentityProvidersRouteRef,
    adminPolicies: adminPoliciesRouteRef,
    adminPolicy: adminPolicyRouteRef,
    adminCreateIdentityProvider: adminCreateIdentityProviderRouteRef,
    adminSettings: adminSettingsRouteRef,
  },
  apis: [
    createApiFactory({
      api: butlerApiRef,
      deps: { discoveryApi: discoveryApiRef, fetchApi: fetchApiRef },
      factory: ({ discoveryApi, fetchApi }) =>
        new ButlerApiClient({ discoveryApi, fetchApi }),
    }),
  ],
});

export const ButlerPage = butlerPlugin.provide(
  createRoutableExtension({
    name: 'ButlerPage',
    component: () =>
      import('./components/ButlerPage/ButlerPage').then(m => m.ButlerPage),
    mountPoint: rootRouteRef,
  }),
);
