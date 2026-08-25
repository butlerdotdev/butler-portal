// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';
import { butlerTokens, rgb } from '../../theme';
import { butlerApiRef } from '../../api/ButlerApi';
import type { Cluster } from '../../api/types/clusters';
import { useButlerRoutes } from '../../hooks/useButlerRoutes';
import { useCanOperateTeam } from '../../hooks/useCanOperateTeam';
import {
  ButlerButton,
  ButlerDashboardStat,
  ButlerEmptyState,
  ButlerErrorState,
  ButlerList,
  ButlerListCard,
  ButlerListRow,
  ButlerLoading,
  ButlerPageHeader,
  ButlerStack,
  ButlerStatGrid,
  ButlerStatusBadge,
  PlusIcon,
  ServerIcon,
} from '../ui';

// Console DashboardPage counts these phases as "Provisioning".
const PROVISIONING_PHASES = [
  'provisioning',
  'pending',
  'scaling',
  'installing',
];

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  return {
    dot: {
      width: 10,
      height: 10,
      borderRadius: '50%',
      flexShrink: 0,
    },
    dotGreen: { backgroundColor: rgb(p.green[500]) },
    dotYellow: { backgroundColor: rgb(p.yellow[500]) },
    dotRed: { backgroundColor: rgb(p.red[500]) },
    emptyIcon: { color: rgb(p.neutral[600]), marginBottom: 16 },
    emptyBlock: {
      padding: '48px 20px',
      textAlign: 'center',
    },
    emptyTitle: {
      margin: 0,
      fontSize: 18,
      lineHeight: '28px',
      fontWeight: 500,
      color: rgb(p.neutral[300]),
    },
    emptyText: {
      margin: '8px 0 16px',
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.subtle,
    },
  };
});

function phaseDot(
  phase: string | undefined,
): 'dotGreen' | 'dotRed' | 'dotYellow' {
  const key = (phase || '').toLowerCase();
  if (key === 'ready') return 'dotGreen';
  if (key === 'failed') return 'dotRed';
  return 'dotYellow';
}

function workersLabel(count: number): string {
  return `${count} worker${count === 1 ? '' : 's'}`;
}

/** Console team `DashboardPage`: stats, recent clusters and the create CTA. */
export const DashboardPage = () => {
  const classes = useStyles();
  const { team } = useParams<{ team: string }>();
  const api = useApi(butlerApiRef);
  const routes = useButlerRoutes();

  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const retry = useCallback(() => setReloadKey(k => k + 1), []);

  useEffect(() => {
    if (!team) return undefined;

    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .listClusters({ team })
      .then(response => {
        if (!cancelled) setClusters(response.clusters ?? []);
      })
      .catch(err => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load team clusters',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [api, team, reloadKey]);

  const stats = useMemo(() => {
    const phase = (c: Cluster) => (c.status?.phase || '').toLowerCase();
    return {
      total: clusters.length,
      ready: clusters.filter(c => phase(c) === 'ready').length,
      provisioning: clusters.filter(c => PROVISIONING_PHASES.includes(phase(c)))
        .length,
      failed: clusters.filter(c => phase(c) === 'failed').length,
    };
  }, [clusters]);

  const recentClusters = useMemo(
    () =>
      [...clusters]
        .sort((a, b) => {
          const aTime = new Date(a.metadata.creationTimestamp || 0).getTime();
          const bTime = new Date(b.metadata.creationTimestamp || 0).getTime();
          return bTime - aTime;
        })
        .slice(0, 5),
    [clusters],
  );

  if (!team) {
    return (
      <ButlerEmptyState
        title="No team selected"
        description="Select a team to view its dashboard."
      />
    );
  }

  if (loading) {
    return <ButlerLoading />;
  }

  if (error) {
    return (
      <ButlerErrorState
        message="Failed to load dashboard"
        detail={error}
        onRetry={retry}
      />
    );
  }

  const createPath = routes.createCluster({ team });
  // Viewers cannot create clusters, so the action is not offered to them.
  const canOperate = useCanOperateTeam(team);

  return (
    <ButlerStack>
      <ButlerPageHeader
        title="Dashboard"
        subtitle="Overview of your Kubernetes clusters"
      />

      <ButlerStatGrid>
        <ButlerDashboardStat label="Total Clusters" value={stats.total} />
        <ButlerDashboardStat label="Ready" value={stats.ready} tone="green" />
        <ButlerDashboardStat
          label="Provisioning"
          value={stats.provisioning}
          tone="yellow"
        />
        <ButlerDashboardStat label="Failed" value={stats.failed} tone="red" />
      </ButlerStatGrid>

      <ButlerListCard
        title="Recent Clusters"
        viewAllTo={routes.clusters({ team })}
      >
        {recentClusters.length === 0 ? (
          <div className={classes.emptyBlock}>
            <ServerIcon size={48} className={classes.emptyIcon} />
            <h3 className={classes.emptyTitle}>No clusters yet</h3>
            <p className={classes.emptyText}>
              Get started by creating your first Kubernetes cluster.
            </p>
            {canOperate && (
              <ButlerButton component={RouterLink} to={createPath}>
                Create Cluster
              </ButlerButton>
            )}
          </div>
        ) : (
          <ButlerList aria-label="Recent clusters">
            {recentClusters.map(cluster => {
              const workers = cluster.spec.workers?.replicas ?? 0;
              return (
                <ButlerListRow
                  key={`${cluster.metadata.namespace}/${cluster.metadata.name}`}
                  to={routes.clusterDetail({
                    team,
                    namespace: cluster.metadata.namespace,
                    name: cluster.metadata.name,
                  })}
                  leading={
                    <span
                      className={`${classes.dot} ${
                        classes[phaseDot(cluster.status?.phase)]
                      }`}
                      aria-hidden
                    />
                  }
                  primary={cluster.metadata.name}
                  secondary={`${
                    cluster.spec.kubernetesVersion
                  } • ${workersLabel(workers)}`}
                  trailing={
                    <ButlerStatusBadge
                      status={cluster.status?.phase || 'Unknown'}
                    />
                  }
                />
              );
            })}
          </ButlerList>
        )}
      </ButlerListCard>

      {recentClusters.length > 0 && canOperate && (
        <div>
          <ButlerButton
            component={RouterLink}
            to={createPath}
            startIcon={<PlusIcon />}
          >
            Create Cluster
          </ButlerButton>
        </div>
      )}
    </ButlerStack>
  );
};
