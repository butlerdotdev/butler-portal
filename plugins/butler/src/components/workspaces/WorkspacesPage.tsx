// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState, useCallback } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import {
  Table,
  TableColumn,
  Progress,
  EmptyState,
} from '@backstage/core-components';
import {
  Typography,
  Button,
  Chip,
  Box,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import RefreshIcon from '@material-ui/icons/Refresh';
import { butlerApiRef } from '../../api/ButlerApi';
import { StatusBadge } from '../StatusBadge/StatusBadge';

const useStyles = makeStyles(theme => ({
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(3),
  },
  headerTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  countChip: {
    fontSize: '0.75rem',
  },
  clusterLink: {
    color: theme.palette.primary.main,
    textDecoration: 'none',
    '&:hover': {
      textDecoration: 'underline',
    },
  },
}));

type WorkspaceRow = {
  id: string;
  name: string;
  cluster: string;
  clusterNamespace: string;
  owner: string;
  image: string;
  phase: string;
  connected: boolean;
  age: string;
};

function formatAge(timestamp?: string): string {
  if (!timestamp) return 'N/A';
  const now = Date.now();
  const created = new Date(timestamp).getTime();
  const diffMs = now - created;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}

export const WorkspacesPage = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const { team } = useParams<{ team: string }>();

  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();

  const fetchData = useCallback(async () => {
    if (!team) return;
    setLoading(true);
    setError(undefined);
    try {
      // Get all clusters for the team, then fetch workspaces for each
      const clusterResponse = await api.listClusters({ team });
      const clusters = clusterResponse.clusters || [];

      const allRows: WorkspaceRow[] = [];
      for (const cluster of clusters) {
        try {
          const wsResponse = await api.listWorkspaces(
            cluster.metadata.namespace,
            cluster.metadata.name,
          );
          for (const ws of wsResponse.workspaces || []) {
            allRows.push({
              id: `${ws.metadata.namespace}/${ws.metadata.name}`,
              name: ws.metadata.name,
              cluster: cluster.metadata.name,
              clusterNamespace: cluster.metadata.namespace,
              owner: ws.spec.owner,
              image: ws.spec.image.split('/').pop() || ws.spec.image,
              phase: ws.status?.phase || 'Unknown',
              connected: ws.status?.connected || false,
              age: formatAge(ws.metadata.creationTimestamp),
            });
          }
        } catch {
          // Skip clusters that fail workspace listing (workspaces may not be enabled)
        }
      }

      setWorkspaces(allRows);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [api, team]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return <Progress />;
  }

  if (error) {
    return (
      <EmptyState
        title="Failed to load workspaces"
        description={error.message}
        missing="info"
      />
    );
  }

  const columns: TableColumn<WorkspaceRow>[] = [
    {
      title: 'Name',
      field: 'name',
      render: (row: WorkspaceRow) => (
        <Typography variant="body2" style={{ fontWeight: 500 }}>
          {row.name}
        </Typography>
      ),
    },
    {
      title: 'Cluster',
      field: 'cluster',
      render: (row: WorkspaceRow) => (
        <RouterLink
          to={`/butler/t/${team}/clusters/${row.clusterNamespace}/${row.cluster}`}
          className={classes.clusterLink}
        >
          {row.cluster}
        </RouterLink>
      ),
    },
    { title: 'Owner', field: 'owner' },
    { title: 'Image', field: 'image' },
    {
      title: 'Phase',
      field: 'phase',
      render: (row: WorkspaceRow) => <StatusBadge status={row.phase} />,
    },
    {
      title: 'Connected',
      field: 'connected',
      render: (row: WorkspaceRow) => (
        <Chip
          label={row.connected ? 'Yes' : 'No'}
          size="small"
          color={row.connected ? 'primary' : 'default'}
          variant="outlined"
        />
      ),
    },
    { title: 'Age', field: 'age' },
  ];

  return (
    <div>
      <div className={classes.headerRow}>
        <div className={classes.headerTitle}>
          <Typography variant="h4">Workspaces</Typography>
          <Chip
            label={`${workspaces.length}`}
            size="small"
            color="default"
            className={classes.countChip}
          />
        </div>
        <Button
          variant="outlined"
          size="small"
          startIcon={<RefreshIcon />}
          onClick={fetchData}
        >
          Refresh
        </Button>
      </div>

      <Typography variant="body2" color="textSecondary" gutterBottom>
        Cloud development environments across all your clusters.
      </Typography>

      <Box mt={2}>
        {workspaces.length === 0 ? (
          <EmptyState
            title="No workspaces"
            description="Create a workspace from a cluster's Workspaces tab to get started with cloud development environments."
            missing="content"
          />
        ) : (
          <Table<WorkspaceRow>
            title={`All Workspaces (${workspaces.length})`}
            options={{
              search: true,
              paging: workspaces.length > 20,
              pageSize: 20,
              padding: 'dense',
            }}
            columns={columns}
            data={workspaces}
          />
        )}
      </Box>
    </div>
  );
};
