// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { butlerApiRef } from '../../api/ButlerApi';
import type { Cluster, ManagementCluster } from '../../api/types/clusters';
import type { TeamInfo } from '../../api/types/teams';
import { useButlerRoutes } from '../../hooks/useButlerRoutes';
import {
  ButlerChip,
  ButlerErrorState,
  ButlerGrid,
  ButlerLoading,
  ButlerPageHeader,
  ButlerStack,
  PlusIcon,
  ServerIcon,
} from '../ui';
import {
  ButlerDashboardStat,
  ButlerStatDots,
  ButlerStatGrid,
} from '../ui/ButlerDashboardStats';
import {
  ButlerList,
  ButlerListCard,
  ButlerListEmpty,
  ButlerListRow,
} from '../ui/ButlerListCard';
import { ButlerQuickAction } from '../ui/ButlerQuickAction';
import { ButlerAvatarTile } from '../ui/ButlerAvatarTile';
import {
  ArchiveIcon,
  TeamsIcon,
  UserAddIcon,
  UsersIcon,
} from '../ui/ButlerDashboardIcons';

// Console AdminDashboard counts these phases as provisioning.
const PROVISIONING_PHASES = ['provisioning', 'pending', 'scaling'];

interface DashboardData {
  teams: TeamInfo[];
  clusters: Cluster[];
  userCount: number;
  management: ManagementCluster | null;
}

/** Console `AdminDashboard`: whole-estate stats, teams list, quick actions. */
export const AdminDashboard = () => {
  const api = useApi(butlerApiRef);
  const routes = useButlerRoutes();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [teamsRes, clustersRes, usersRes, managementRes] =
        await Promise.allSettled([
          api.listAllTeams(),
          api.listClusters(),
          api.listUsers(),
          api.getManagement(),
        ]);

      if (
        teamsRes.status === 'rejected' &&
        clustersRes.status === 'rejected' &&
        usersRes.status === 'rejected'
      ) {
        const reason = teamsRes.reason;
        throw reason instanceof Error ? reason : new Error(String(reason));
      }

      setData({
        teams:
          teamsRes.status === 'fulfilled'
            ? (teamsRes.value.teams ?? []).filter(t => t && t.name)
            : [],
        clusters:
          clustersRes.status === 'fulfilled'
            ? clustersRes.value.clusters ?? []
            : [],
        userCount:
          usersRes.status === 'fulfilled'
            ? (usersRes.value?.users ?? []).length
            : 0,
        management:
          managementRes.status === 'fulfilled' ? managementRes.value : null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // The management cluster counts as one more cluster, as in the console.
  const stats = useMemo(() => {
    if (!data) return null;
    const { clusters, management } = data;
    const phase = (c: Cluster) => (c.status?.phase || '').toLowerCase();
    return {
      totalTeams: data.teams.length,
      totalClusters: clusters.length + (management ? 1 : 0),
      totalUsers: data.userCount,
      ready:
        clusters.filter(c => phase(c) === 'ready').length +
        (management?.phase?.toLowerCase() === 'ready' ? 1 : 0),
      provisioning: clusters.filter(c => PROVISIONING_PHASES.includes(phase(c)))
        .length,
      failed: clusters.filter(c => phase(c) === 'failed').length,
    };
  }, [data]);

  if (loading) {
    return <ButlerLoading />;
  }

  if (error || !data || !stats) {
    return (
      <ButlerErrorState
        message="Failed to load platform overview"
        detail={error ?? 'Unable to load platform data.'}
        onRetry={fetchData}
      />
    );
  }

  return (
    <ButlerStack>
      <ButlerPageHeader
        title="Platform Overview"
        subtitle="Monitor and manage all teams and resources"
      />

      <ButlerStatGrid>
        <ButlerDashboardStat
          label="Total Teams"
          value={stats.totalTeams}
          icon={<TeamsIcon />}
          iconTone="violet"
        />
        <ButlerDashboardStat
          label="Total Clusters"
          value={stats.totalClusters}
          icon={<ServerIcon size={24} />}
          iconTone="green"
        />
        <ButlerDashboardStat
          label="Total Users"
          value={stats.totalUsers}
          icon={<UsersIcon />}
          iconTone="blue"
        />
        <ButlerStatDots
          label="Cluster Health"
          items={[
            { tone: 'green', value: stats.ready, title: 'Ready' },
            {
              tone: 'yellow',
              value: stats.provisioning,
              title: 'Provisioning',
            },
            { tone: 'red', value: stats.failed, title: 'Failed' },
          ]}
        />
      </ButlerStatGrid>

      <ButlerListCard
        title="Teams"
        viewAllTo={routes.adminTeams()}
        viewAllTone="violet"
      >
        {data.teams.length === 0 ? (
          <ButlerListEmpty>No teams created yet</ButlerListEmpty>
        ) : (
          <ButlerList aria-label="Teams">
            {data.teams.slice(0, 5).map(team => {
              const displayName = team.displayName || team.name;
              const count = team.clusterCount ?? 0;
              return (
                <ButlerListRow
                  key={team.name}
                  to={routes.adminTeamDetail({ teamName: team.name })}
                  leading={<ButlerAvatarTile name={displayName} size={40} />}
                  primary={displayName}
                  secondary={`@${team.name}`}
                  trailing={
                    <ButlerChip>
                      {count} {count === 1 ? 'cluster' : 'clusters'}
                    </ButlerChip>
                  }
                />
              );
            })}
          </ButlerList>
        )}
      </ButlerListCard>

      <ButlerGrid columns={3} gap={16}>
        <ButlerQuickAction
          to={routes.adminTeams()}
          title="Create Team"
          description="Add a new team"
          icon={<PlusIcon size={20} />}
          tone="violet"
        />
        <ButlerQuickAction
          to={routes.adminUsers()}
          title="Invite User"
          description="Add users to platform"
          icon={<UserAddIcon />}
          tone="blue"
        />
        <ButlerQuickAction
          to={routes.adminProviders()}
          title="Manage Providers"
          description="Configure infrastructure"
          icon={<ArchiveIcon />}
          tone="green"
        />
      </ButlerGrid>
    </ButlerStack>
  );
};
