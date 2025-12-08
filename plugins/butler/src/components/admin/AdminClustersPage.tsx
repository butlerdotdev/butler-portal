// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState, useCallback } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import {
  Table,
  TableColumn,
  InfoCard,
  Progress,
  EmptyState,
  Link,
} from '@backstage/core-components';
import {
  Typography,
  Button,
  Box,
  Chip,
  makeStyles,
} from '@material-ui/core';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import RefreshIcon from '@material-ui/icons/Refresh';
import StorageIcon from '@material-ui/icons/Storage';
import { butlerApiRef } from '../../api/ButlerApi';
import type { Cluster, ManagementCluster } from '../../api/types/clusters';
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
  mgmtCard: {
    marginBottom: theme.spacing(3),
  },
  mgmtContent: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
  },
  mgmtIcon: {
    fontSize: '3rem',
    color: theme.palette.primary.main,
  },
  mgmtStats: {
    display: 'flex',
    gap: theme.spacing(3),
    marginTop: theme.spacing(1),
  },
  mgmtStat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
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

type ClusterRow = {
  id: string;
  name: string;
  namespace: string;
  team: string;
  provider: string;
  version: string;
  workers: number;
  phase: string;
  age: string;
};

export const AdminClustersPage = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [management, setManagement] = useState<ManagementCluster | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [clustersRes, mgmtRes] = await Promise.allSettled([
        api.listClusters(),
        api.getManagement(),
      ]);

      if (clustersRes.status === 'fulfilled') {
        setClusters(clustersRes.value.clusters || []);
      } else {
        throw clustersRes.reason;
      }

      if (mgmtRes.status === 'fulfilled') {
        setManagement(mgmtRes.value);
      }
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
        <Link to={`../../t/${row.team}/clusters/${row.namespace}/${row.name}`}>
          {row.name}
        </Link>
      ),
    },
    {
      title: 'Team',
      field: 'team',
      render: (row: ClusterRow) => (
        <Chip label={row.team} size="small" variant="outlined" />
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
    id:
      cluster.metadata.uid ||
      `${cluster.metadata.namespace}/${cluster.metadata.name}`,
    name: cluster.metadata.name,
    namespace: cluster.metadata.namespace,
    team: cluster.spec.teamRef?.name || cluster.metadata.namespace,
    provider: cluster.spec.providerConfigRef?.name || 'Default',
    version: cluster.spec.kubernetesVersion,
    workers: cluster.spec.workers?.replicas ?? 0,
    phase: cluster.status?.phase || 'Unknown',
    age: formatAge(cluster.metadata.creationTimestamp),
  }));

  return (
    <div>
      <Button
        startIcon={<ArrowBackIcon />}
        component={RouterLink}
        to="/butler/admin"
        style={{ textTransform: 'none', marginBottom: 16 }}
      >
        Back to Admin
      </Button>
      <div className={classes.header}>
        <Typography variant="h4">All Clusters</Typography>
        <div className={classes.actions}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={fetchData}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Management Cluster Card */}
      {management && (
        <div className={classes.mgmtCard}>
          <InfoCard
            title="Management Cluster"
            action={
              <Link to="/butler/admin/management" style={{ textDecoration: 'none' }}>
                <Button size="small" color="primary">
                  View Details
                </Button>
              </Link>
            }
          >
            <div className={classes.mgmtContent}>
              <StorageIcon className={classes.mgmtIcon} />
              <div>
                <Typography variant="h6">{management.name}</Typography>
                <Box display="flex" alignItems="center" gridGap={8} mt={0.5}>
                  <StatusBadge status={management.phase} />
                  <Typography variant="body2" color="textSecondary">
                    Kubernetes {management.kubernetesVersion}
                  </Typography>
                </Box>
                <div className={classes.mgmtStats}>
                  <div className={classes.mgmtStat}>
                    <Typography variant="h6">
                      {management.nodes.ready}/{management.nodes.total}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      Nodes Ready
                    </Typography>
                  </div>
                  <div className={classes.mgmtStat}>
                    <Typography variant="h6">
                      {management.tenantClusters}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      Tenant Clusters
                    </Typography>
                  </div>
                  <div className={classes.mgmtStat}>
                    <Typography variant="h6">
                      {management.systemNamespaces?.length || 0}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      System Namespaces
                    </Typography>
                  </div>
                </div>
              </div>
            </div>
          </InfoCard>
        </div>
      )}

      {/* Tenant Clusters Table */}
      {clusters.length === 0 ? (
        <EmptyState
          title="No tenant clusters found"
          description="No clusters have been created across any team."
          missing="content"
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
