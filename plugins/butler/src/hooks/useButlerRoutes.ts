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
  teamEnvironmentsRouteRef,
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
  adminNetworksRouteRef,
  adminNetworkPoolRouteRef,
  adminObservabilityRouteRef,
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
  teamEnvironments: (params: { team: string }) => string;
  teamProviders: (params: { team: string }) => string;
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
  adminPolicies: () => string;
  adminPolicy: (params: { name: string }) => string;
  adminCreateIdentityProvider: () => string;
  adminSettings: () => string;
  adminNetworks: () => string;
  adminNetworkPool: (params: { namespace: string; name: string }) => string;
  adminObservability: () => string;
}

/**
 * Hosts may register the page as `/butler` or as `/butler/*`, and the
 * route system hands the registered string back verbatim, wildcard
 * included. Links must never carry it.
 */
export function normalizeMountPath(path: string): string {
  return path.replace(/\/\*(?=\/|$)/g, '') || '/';
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
  const teamEnvironments = useRouteRef(teamEnvironmentsRouteRef);
  const teamProviders = useRouteRef(teamProvidersRouteRef);
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
  const adminPolicies = useRouteRef(adminPoliciesRouteRef);
  const adminPolicy = useRouteRef(adminPolicyRouteRef);
  const adminCreateIdentityProvider = useRouteRef(
    adminCreateIdentityProviderRouteRef,
  );
  const adminSettings = useRouteRef(adminSettingsRouteRef);
  const adminNetworks = useRouteRef(adminNetworksRouteRef);
  const adminNetworkPool = useRouteRef(adminNetworkPoolRouteRef);
  const adminObservability = useRouteRef(adminObservabilityRouteRef);

  return useMemo(
    () => ({
      root: () => normalizeMountPath(root()),
      team: params => normalizeMountPath(team(params)),
      clusters: params => normalizeMountPath(clusters(params)),
      createCluster: params => normalizeMountPath(createCluster(params)),
      clusterDetail: params => normalizeMountPath(clusterDetail(params)),
      teamEnvironments: params => normalizeMountPath(teamEnvironments(params)),
      teamProviders: params => normalizeMountPath(teamProviders(params)),
      teamMembers: params => normalizeMountPath(teamMembers(params)),
      teamSettings: params => normalizeMountPath(teamSettings(params)),
      admin: () => normalizeMountPath(admin()),
      adminClusters: () => normalizeMountPath(adminClusters()),
      adminManagement: () => normalizeMountPath(adminManagement()),
      adminTeams: () => normalizeMountPath(adminTeams()),
      adminTeamDetail: params => normalizeMountPath(adminTeamDetail(params)),
      adminUsers: () => normalizeMountPath(adminUsers()),
      adminProviders: () => normalizeMountPath(adminProviders()),
      adminCreateProvider: () => normalizeMountPath(adminCreateProvider()),
      adminIdentityProviders: () =>
        normalizeMountPath(adminIdentityProviders()),
      adminPolicies: () => normalizeMountPath(adminPolicies()),
      adminPolicy: params => normalizeMountPath(adminPolicy(params)),
      adminCreateIdentityProvider: () =>
        normalizeMountPath(adminCreateIdentityProvider()),
      adminSettings: () => normalizeMountPath(adminSettings()),
      adminNetworks: () => normalizeMountPath(adminNetworks()),
      adminNetworkPool: params => normalizeMountPath(adminNetworkPool(params)),
      adminObservability: () => normalizeMountPath(adminObservability()),
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
      adminPolicies,
      adminPolicy,
      adminCreateIdentityProvider,
      adminSettings,
      adminNetworks,
      adminNetworkPool,
      adminObservability,
      teamEnvironments,
      teamProviders,
    ],
  );
};

/**
 * True when the current URL is the admin dashboard or any page beneath it.
 */
export const useIsAdminRoute = (): boolean => {
  const location = useLocation();
  const adminPath = normalizeMountPath(useRouteRef(adminRouteRef)());
  return (
    location.pathname === adminPath ||
    location.pathname.startsWith(`${adminPath}/`)
  );
};
