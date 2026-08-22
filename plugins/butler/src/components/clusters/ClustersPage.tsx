// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import {
  Table,
  TableColumn,
  Progress,
  Link,
  EmptyState,
} from '@backstage/core-components';
import { Button, Typography } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import AddIcon from '@material-ui/icons/Add';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import RefreshIcon from '@material-ui/icons/Refresh';
import { butlerApiRef } from '../../api/ButlerApi';
import type { Cluster } from '../../api/types/clusters';
import { useButlerResource } from '../../hooks/useButlerResource';
import { useClusterWatch } from '../../hooks/useClusterWatch';
import { StatusBadge } from '../StatusBadge/StatusBadge';
import { useButlerRoutes } from '../../hooks/useButlerRoutes';

const useStyles = makeStyles(theme => ({
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(2),
  },
  actions: {
    display: 'flex',
    gap: theme.spacing(1),
  },
}));

function formatAge(timestamp: string | undefined): string {
  if (!timestamp) return 'Unknown';
  const created = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 1) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return `${diffMinutes}m`;
    }
    return `${diffHours}h`;
  }
  if (diffDays < 30) return `${diffDays}d`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo`;
}

function getProviderName(cluster: Cluster): string {
  return cluster.spec.providerConfigRef?.name || 'Default';
}

function getWorkerCount(cluster: Cluster): number {
  return cluster.spec.workers?.replicas ?? 0;
}

type ClusterRow = {
  id: string;
  name: string;
  namespace: string;
  provider: string;
  version: string;
  workers: number;
  phase: string;
  age: string;
};

function applyOverlay(
  base: Cluster[],
  updated: Map<string, Cluster>,
  deleted: Set<string>,
): Cluster[] {
  const key = (c: Cluster) => `${c.metadata.namespace}/${c.metadata.name}`;
  const seen = new Set<string>();
  const merged: Cluster[] = [];
  for (const c of base) {
    const k = key(c);
    if (deleted.has(k)) continue;
    seen.add(k);
    merged.push(updated.get(k) ?? c);
  }
  for (const [k, c] of updated) {
    if (!seen.has(k) && !deleted.has(k)) merged.push(c);
  }
  return merged;
}

export const ClustersPage = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const routes = useButlerRoutes();
  const { team } = useParams<{ team: string }>();
  const state = useButlerResource<Cluster[]>(
    async () => {
      const response = await api.listClusters({ team: team || undefined });
      return response.clusters || [];
    },
    { deps: [api, team] },
  );

  const { subscribe } = useClusterWatch();
  // Live events are layered over the fetched list: updates replace or
  // append (only for this team, since the server may broadcast every
  // cluster) and deletes hide. A refresh replaces the base list and the
  // overlay is rebuilt from later events.
  const [overlay, setOverlay] = useState<{
    updated: Map<string, Cluster>;
    deleted: Set<string>;
  }>({ updated: new Map(), deleted: new Set() });
  useEffect(
    () =>
      subscribe(event => {
        setOverlay(prev => {
          const updated = new Map(prev.updated);
          const deleted = new Set(prev.deleted);
          if (event.type === 'update') {
            const clusterTeam = event.cluster.spec?.teamRef?.name;
            if (team && clusterTeam && clusterTeam !== team) return prev;
            const key = `${event.cluster.metadata.namespace}/${event.cluster.metadata.name}`;
            updated.set(key, event.cluster);
            deleted.delete(key);
          } else {
            const key = `${event.namespace}/${event.name}`;
            deleted.add(key);
            updated.delete(key);
          }
          return { updated, deleted };
        });
      }),
    [subscribe, team],
  );

  if (state.status === 'loading') {
    return <Progress />;
  }

  if (state.status === 'error') {
    return (
      <EmptyState
        title="Failed to load clusters"
        description={state.error.message}
        missing="info"
      />
    );
  }

  const clusters = applyOverlay(state.data, overlay.updated, overlay.deleted);

  const columns: TableColumn<ClusterRow>[] = [
    {
      title: 'Name',
      field: 'name',
      render: (row: ClusterRow) => (
        <Link to={routes.clusterDetail({
            team: team ?? '',
            namespace: row.namespace,
            name: row.name,
          })}>
          {row.name}
        </Link>
      ),
    },
    {
      title: 'Namespace',
      field: 'namespace',
    },
    {
      title: 'Provider',
      field: 'provider',
    },
    {
      title: 'Version',
      field: 'version',
    },
    {
      title: 'Workers',
      field: 'workers',
      type: 'numeric',
    },
    {
      title: 'Phase',
      field: 'phase',
      render: (row: ClusterRow) => <StatusBadge status={row.phase} />,
    },
    {
      title: 'Age',
      field: 'age',
    },
  ];

  const data: ClusterRow[] = clusters.map(cluster => ({
    id: cluster.metadata.uid || `${cluster.metadata.namespace}/${cluster.metadata.name}`,
    name: cluster.metadata.name,
    namespace: cluster.metadata.namespace,
    provider: getProviderName(cluster),
    version: cluster.spec.kubernetesVersion,
    workers: getWorkerCount(cluster),
    phase: cluster.status?.phase || 'Unknown',
    age: formatAge(cluster.metadata.creationTimestamp),
  }));

  return (
    <div>
      <Button
        startIcon={<ArrowBackIcon />}
        component={RouterLink}
        to={routes.team({ team: team ?? '' })}
        style={{ textTransform: 'none', marginBottom: 16 }}
      >
        Back to Dashboard
      </Button>
      <div className={classes.header}>
        <Typography variant="h4">Clusters</Typography>
        <div className={classes.actions}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={() => state.refresh()}
          >
            Refresh
          </Button>
          <Button
            component={RouterLink}
            to={routes.createCluster({ team: team ?? '' })}
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
          >
            Create Cluster
          </Button>
        </div>
      </div>
      {clusters.length === 0 ? (
        <EmptyState
          title="No clusters found"
          description="Get started by creating your first tenant cluster."
          missing="content"
          action={
            <Button
              component={RouterLink}
              to={routes.createCluster({ team: team ?? '' })}
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
            >
              Create Cluster
            </Button>
          }
        />
      ) : (
        <Table<ClusterRow>
          title={`Tenant Clusters (${clusters.length})`}
          options={{
            search: true,
            paging: clusters.length > 20,
            pageSize: 20,
            padding: 'dense',
          }}
          columns={columns}
          data={data}
        />
      )}
    </div>
  );
};
