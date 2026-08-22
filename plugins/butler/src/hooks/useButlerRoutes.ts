// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useMemo } from 'react';
import { useRouteRef } from '@backstage/core-plugin-api';
import { useLocation } from 'react-router-dom';
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
} from '../routes';

export interface ButlerRoutes {
  root: () => string;
  team: (params: { team: string }) => string;
  clusters: (params: { team: string }) => string;
  createCluster: (params: { team: string }) => string;
  clusterDetail: (params: {
    team: string;
    namespace: string;
    name: string;
  }) => string;
  teamMembers: (params: { team: string }) => string;
  teamSettings: (params: { team: string }) => string;
  admin: () => string;
  adminClusters: () => string;
  adminManagement: () => string;
  adminTeams: () => string;
  adminTeamDetail: (params: { teamName: string }) => string;
  adminUsers: () => string;
  adminProviders: () => string;
  adminCreateProvider: () => string;
  adminIdentityProviders: () => string;
  adminCreateIdentityProvider: () => string;
  adminSettings: () => string;
}

/**
 * Resolves every Butler route against wherever the host app mounted the
 * plugin, so components never need to know the mount path.
 */
export const useButlerRoutes = (): ButlerRoutes => {
  const root = useRouteRef(rootRouteRef);
  const team = useRouteRef(teamRouteRef);
  const clusters = useRouteRef(clustersRouteRef);
  const createCluster = useRouteRef(createClusterRouteRef);
  const clusterDetail = useRouteRef(clusterDetailRouteRef);
  const teamMembers = useRouteRef(teamMembersRouteRef);
  const teamSettings = useRouteRef(teamSettingsRouteRef);
  const admin = useRouteRef(adminRouteRef);
  const adminClusters = useRouteRef(adminClustersRouteRef);
  const adminManagement = useRouteRef(adminManagementRouteRef);
  const adminTeams = useRouteRef(adminTeamsRouteRef);
  const adminTeamDetail = useRouteRef(adminTeamDetailRouteRef);
  const adminUsers = useRouteRef(adminUsersRouteRef);
  const adminProviders = useRouteRef(adminProvidersRouteRef);
  const adminCreateProvider = useRouteRef(adminCreateProviderRouteRef);
  const adminIdentityProviders = useRouteRef(adminIdentityProvidersRouteRef);
  const adminCreateIdentityProvider = useRouteRef(
    adminCreateIdentityProviderRouteRef,
  );
  const adminSettings = useRouteRef(adminSettingsRouteRef);

  return useMemo(
    () => ({
      root: () => root(),
      team: params => team(params),
      clusters: params => clusters(params),
      createCluster: params => createCluster(params),
      clusterDetail: params => clusterDetail(params),
      teamMembers: params => teamMembers(params),
      teamSettings: params => teamSettings(params),
      admin: () => admin(),
      adminClusters: () => adminClusters(),
      adminManagement: () => adminManagement(),
      adminTeams: () => adminTeams(),
      adminTeamDetail: params => adminTeamDetail(params),
      adminUsers: () => adminUsers(),
      adminProviders: () => adminProviders(),
      adminCreateProvider: () => adminCreateProvider(),
      adminIdentityProviders: () => adminIdentityProviders(),
      adminCreateIdentityProvider: () => adminCreateIdentityProvider(),
      adminSettings: () => adminSettings(),
    }),
    [
      root,
      team,
      clusters,
      createCluster,
      clusterDetail,
      teamMembers,
      teamSettings,
      admin,
      adminClusters,
      adminManagement,
      adminTeams,
      adminTeamDetail,
      adminUsers,
      adminProviders,
      adminCreateProvider,
      adminIdentityProviders,
      adminCreateIdentityProvider,
      adminSettings,
    ],
  );
};

/**
 * True when the current URL is the admin dashboard or any page beneath it.
 */
export const useIsAdminRoute = (): boolean => {
  const location = useLocation();
  const adminPath = useRouteRef(adminRouteRef)();
  return (
    location.pathname === adminPath ||
    location.pathname.startsWith(`${adminPath}/`)
  );
};
