// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Link as RouterLink } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import {
  InfoCard,
  Table,
  TableColumn,
  Progress,
  EmptyState,
} from '@backstage/core-components';
import {
  Grid,
  Typography,
  Button,
  Box,
  Card as MuiCard,
  CardContent,
  makeStyles,
} from '@material-ui/core';
import AddIcon from '@material-ui/icons/Add';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import ListIcon from '@material-ui/icons/List';
import SettingsIcon from '@material-ui/icons/Settings';
import CloudIcon from '@material-ui/icons/Cloud';

import { butlerApiRef } from '../../api/ButlerApi';
import { StatusBadge } from '../StatusBadge/StatusBadge';
import type { Cluster } from '../../api/types/clusters';

const useStyles = makeStyles(theme => ({
  statCard: {
    textAlign: 'center',
    padding: theme.spacing(2),
  },
  statValue: {
    fontSize: '2rem',
    fontWeight: 700,
    lineHeight: 1.2,
  },
  statLabel: {
    color: theme.palette.text.secondary,
    marginTop: theme.spacing(0.5),
  },
  statIcon: {
    fontSize: '1.75rem',
    marginBottom: theme.spacing(0.5),
    color: theme.palette.text.secondary,
  },
  actions: {
    display: 'flex',
    gap: theme.spacing(1.5),
    flexWrap: 'wrap',
  },
  actionButton: {
    textTransform: 'none',
  },
  headerActions: {
    display: 'flex',
    gap: theme.spacing(1),
    alignItems: 'center',
  },
}));

function formatAge(timestamp?: string): string {
  if (!timestamp) return '-';
  const created = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return `${diffMinutes}m`;
    }
    return `${diffHours}h`;
  }
  if (diffDays < 30) return `${diffDays}d`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo`;
}

interface ClusterRow {
  id: string;
  team: string;
  name: string;
  namespace: string;
  phase: string;
  version: string;
  workers: number;
  age: string;
}

const columns: TableColumn<ClusterRow>[] = [
  {
    title: 'Name',
    field: 'name',
    render: (row: ClusterRow) => (
      <RouterLink
        to={`/butler/t/${row.team}/clusters/${row.namespace}/${row.name}`}
        style={{ textDecoration: 'none', color: 'inherit', fontWeight: 600 }}
      >
        {row.name}
      </RouterLink>
    ),
  },
  {
    title: 'Phase',
    field: 'phase',
    render: (row: ClusterRow) => <StatusBadge status={row.phase} />,
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
    title: 'Age',
    field: 'age',
  },
];

export const DashboardPage = () => {
  const classes = useStyles();
  const { team } = useParams<{ team: string }>();
  const api = useApi(butlerApiRef);

  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!team) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await api.listClusters({ team });
        if (!cancelled) {
          setClusters(response.clusters ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Failed to load team clusters',
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [api, team]);

  if (!team) {
    return (
      <EmptyState
        title="No team selected"
        description="Navigate to a team to view its dashboard."
        missing="info"
      />
    );
  }

  const readyCount = clusters.filter(
    c => c.status?.phase?.toLowerCase() === 'ready',
  ).length;
  const provisioningCount = clusters.filter(
    c => c.status?.phase?.toLowerCase() === 'provisioning',
  ).length;
  const failedCount = clusters.filter(
    c => c.status?.phase?.toLowerCase() === 'failed',
  ).length;

  const tableData: ClusterRow[] = clusters
    .slice()
    .sort((a, b) => {
      const aTime = a.metadata.creationTimestamp || '';
      const bTime = b.metadata.creationTimestamp || '';
      return bTime.localeCompare(aTime);
    })
    .map(c => ({
      id: `${c.metadata.namespace}/${c.metadata.name}`,
      team: team || '',
      name: c.metadata.name,
      namespace: c.metadata.namespace,
      phase: c.status?.phase || 'Unknown',
      version: c.spec.kubernetesVersion || '-',
      workers: c.spec.workers?.replicas ?? 0,
      age: formatAge(c.metadata.creationTimestamp),
    }));

  if (loading) {
    return <Progress />;
  }

  if (error) {
    return (
      <Box p={2}>
        <Typography color="error" variant="h6">
          Failed to load dashboard
        </Typography>
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      </Box>
    );
  }

  return (
    <Grid container spacing={3}>
            <Grid item xs={12}>
              <Button
                startIcon={<ArrowBackIcon />}
                component={RouterLink}
                to="/butler"
                style={{ textTransform: 'none', marginBottom: 16 }}
              >
                Back to Overview
              </Button>
            </Grid>
            {/* Quick Action Buttons */}
            <Grid item xs={12}>
              <Box className={classes.actions}>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<AddIcon />}
                  className={classes.actionButton}
                  component={RouterLink}
                  to={`/butler/t/${team}/clusters/new`}
                >
                  Create Cluster
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<ListIcon />}
                  className={classes.actionButton}
                  component={RouterLink}
                  to={`/butler/t/${team}/clusters`}
                >
                  View All Clusters
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<SettingsIcon />}
                  className={classes.actionButton}
                  component={RouterLink}
                  to={`/butler/t/${team}/settings`}
                >
                  Team Settings
                </Button>
              </Box>
            </Grid>

            {/* Stat cards */}
            <Grid item xs={6} sm={3}>
              <MuiCard variant="outlined">
                <CardContent className={classes.statCard}>
                  <CloudIcon className={classes.statIcon} />
                  <Typography className={classes.statValue}>
                    {clusters.length}
                  </Typography>
                  <Typography variant="body2" className={classes.statLabel}>
                    Total Clusters
                  </Typography>
                </CardContent>
              </MuiCard>
            </Grid>
            <Grid item xs={6} sm={3}>
              <MuiCard variant="outlined">
                <CardContent className={classes.statCard}>
                  <Typography
                    className={classes.statValue}
                    style={{ color: '#4caf50' }}
                  >
                    {readyCount}
                  </Typography>
                  <Typography variant="body2" className={classes.statLabel}>
                    Ready
                  </Typography>
                </CardContent>
              </MuiCard>
            </Grid>
            <Grid item xs={6} sm={3}>
              <MuiCard variant="outlined">
                <CardContent className={classes.statCard}>
                  <Typography
                    className={classes.statValue}
                    style={{ color: '#2196f3' }}
                  >
                    {provisioningCount}
                  </Typography>
                  <Typography variant="body2" className={classes.statLabel}>
                    Provisioning
                  </Typography>
                </CardContent>
              </MuiCard>
            </Grid>
            <Grid item xs={6} sm={3}>
              <MuiCard variant="outlined">
                <CardContent className={classes.statCard}>
                  <Typography
                    className={classes.statValue}
                    style={{
                      color: failedCount > 0 ? '#f44336' : undefined,
                    }}
                  >
                    {failedCount}
                  </Typography>
                  <Typography variant="body2" className={classes.statLabel}>
                    Failed
                  </Typography>
                </CardContent>
              </MuiCard>
            </Grid>

            {/* Recent Clusters Table */}
            <Grid item xs={12}>
              {clusters.length === 0 ? (
                <EmptyState
                  title="No clusters yet"
                  description="This team does not have any clusters. Create one to get started."
                  missing="content"
                  action={
                    <Button
                      variant="contained"
                      color="primary"
                      startIcon={<AddIcon />}
                      component={RouterLink}
                      to={`/butler/t/${team}/clusters/new`}
                    >
                      Create Cluster
                    </Button>
                  }
                />
              ) : (
                <InfoCard title="Recent Clusters">
                  <Table
                    columns={columns}
                    data={tableData}
                    options={{
                      paging: tableData.length > 10,
                      pageSize: 10,
                      search: tableData.length > 5,
                      padding: 'dense',
                    }}
                  />
                </InfoCard>
              )}
            </Grid>
    </Grid>
  );
};
