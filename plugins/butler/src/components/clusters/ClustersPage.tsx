// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState, useCallback } from 'react';
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
import { StatusBadge } from '../StatusBadge/StatusBadge';

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

export const ClustersPage = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const { team } = useParams<{ team: string }>();
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();

  const fetchClusters = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await api.listClusters({ team: team || undefined });
      setClusters(response.clusters || []);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [api, team]);

  useEffect(() => {
    fetchClusters();
  }, [fetchClusters]);

  if (loading) {
    return <Progress />;
  }

  if (error) {
    return (
      <EmptyState
        title="Failed to load clusters"
        description={error.message}
        missing="info"
      />
    );
  }

  const columns: TableColumn<ClusterRow>[] = [
    {
      title: 'Name',
      field: 'name',
      render: (row: ClusterRow) => (
        <Link to={`/butler/t/${team}/clusters/${row.namespace}/${row.name}`}>
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
        to={`/butler/t/${team}`}
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
            onClick={fetchClusters}
          >
            Refresh
          </Button>
          <Button
            component={RouterLink}
            to={`/butler/t/${team}/clusters/new`}
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
              to={`/butler/t/${team}/clusters/new`}
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
