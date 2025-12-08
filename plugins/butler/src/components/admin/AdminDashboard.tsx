// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import React, { useEffect, useState, useCallback } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import {
  InfoCard,
  Progress,
  EmptyState,
  Link,
} from '@backstage/core-components';
import {
  Grid,
  Typography,
  makeStyles,
  List,
  ListItem,
  ListItemText,
  Avatar,
  Divider,
  Box,
  Card as MuiCard,
  CardContent,
  CardActions,
  Button,
} from '@material-ui/core';
import GroupIcon from '@material-ui/icons/Group';
import CloudIcon from '@material-ui/icons/Cloud';
import PeopleIcon from '@material-ui/icons/People';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import ErrorIcon from '@material-ui/icons/Error';
import HourglassEmptyIcon from '@material-ui/icons/HourglassEmpty';
import AddIcon from '@material-ui/icons/Add';
import PersonAddIcon from '@material-ui/icons/PersonAdd';
import SettingsInputComponentIcon from '@material-ui/icons/SettingsInputComponent';
import { butlerApiRef } from '../../api/ButlerApi';
import type { Cluster } from '../../api/types/clusters';
import type { TeamInfo } from '../../api/types/teams';
import { StatusBadge } from '../StatusBadge/StatusBadge';

const useStyles = makeStyles(theme => ({
  statCard: {
    textAlign: 'center',
    padding: theme.spacing(2),
  },
  statValue: {
    fontSize: '2.5rem',
    fontWeight: 700,
    lineHeight: 1.2,
  },
  statLabel: {
    color: theme.palette.text.secondary,
    marginTop: theme.spacing(0.5),
  },
  healthRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: theme.spacing(2),
    marginTop: theme.spacing(1),
  },
  healthItem: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
  },
  healthOk: {
    color: theme.palette.success?.main || '#4caf50',
  },
  healthWarning: {
    color: theme.palette.warning?.main || '#ff9800',
  },
  healthError: {
    color: theme.palette.error?.main || '#f44336',
  },
  quickAction: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    cursor: 'pointer',
    transition: 'box-shadow 0.2s',
    '&:hover': {
      boxShadow: theme.shadows[4],
    },
  },
  quickActionIcon: {
    fontSize: '2rem',
    marginBottom: theme.spacing(1),
    color: theme.palette.primary.main,
  },
  teamAvatar: {
    backgroundColor: theme.palette.primary.main,
    width: 32,
    height: 32,
    fontSize: '0.875rem',
  },
}));

interface DashboardData {
  teams: TeamInfo[];
  clusters: Cluster[];
  users: any;
  management: any;
}

export const AdminDashboard = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [teamsRes, clustersRes, usersRes, managementRes] =
        await Promise.allSettled([
          api.getTeams(),
          api.listClusters(),
          api.listUsers(),
          api.getManagement(),
        ]);

      setData({
        teams:
          teamsRes.status === 'fulfilled' ? teamsRes.value.teams || [] : [],
        clusters:
          clustersRes.status === 'fulfilled'
            ? clustersRes.value.clusters || []
            : [],
        users: usersRes.status === 'fulfilled' ? usersRes.value : { users: [] },
        management:
          managementRes.status === 'fulfilled' ? managementRes.value : null,
      });
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
        title="Failed to load dashboard"
        description={error.message}
        missing="info"
      />
    );
  }

  if (!data) {
    return (
      <EmptyState
        title="No data available"
        description="Unable to load platform data."
        missing="info"
      />
    );
  }

  const { teams, clusters, users } = data;
  const userList = users?.users || [];

  const readyClusters = clusters.filter(
    c => c.status?.phase?.toLowerCase() === 'ready',
  );
  const provisioningClusters = clusters.filter(c =>
    ['provisioning', 'installing', 'pending'].includes(
      c.status?.phase?.toLowerCase() || '',
    ),
  );
  const failedClusters = clusters.filter(
    c => c.status?.phase?.toLowerCase() === 'failed',
  );

  const recentTeams = [...teams]
    .sort((a, b) => b.clusterCount - a.clusterCount)
    .slice(0, 8);

  return (
    <div>
      <Typography variant="h4" gutterBottom>
        Platform Administration
      </Typography>

      {/* Stat Cards */}
      <Grid container spacing={3}>
        <Grid item xs={12} sm={6} md={3}>
          <InfoCard title="">
            <div className={classes.statCard}>
              <GroupIcon style={{ fontSize: '2rem', color: '#1976d2' }} />
              <Typography className={classes.statValue}>
                {teams.length}
              </Typography>
              <Typography className={classes.statLabel}>Total Teams</Typography>
            </div>
          </InfoCard>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <InfoCard title="">
            <div className={classes.statCard}>
              <CloudIcon style={{ fontSize: '2rem', color: '#388e3c' }} />
              <Typography className={classes.statValue}>
                {clusters.length}
              </Typography>
              <Typography className={classes.statLabel}>
                Total Clusters
              </Typography>
            </div>
          </InfoCard>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <InfoCard title="">
            <div className={classes.statCard}>
              <PeopleIcon style={{ fontSize: '2rem', color: '#f57c00' }} />
              <Typography className={classes.statValue}>
                {userList.length}
              </Typography>
              <Typography className={classes.statLabel}>Total Users</Typography>
            </div>
          </InfoCard>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <InfoCard title="">
            <div className={classes.statCard}>
              <Typography variant="subtitle2" gutterBottom>
                Cluster Health
              </Typography>
              <div className={classes.healthRow}>
                <div className={classes.healthItem}>
                  <CheckCircleIcon
                    fontSize="small"
                    className={classes.healthOk}
                  />
                  <Typography variant="body2">
                    {readyClusters.length} Ready
                  </Typography>
                </div>
                <div className={classes.healthItem}>
                  <HourglassEmptyIcon
                    fontSize="small"
                    className={classes.healthWarning}
                  />
                  <Typography variant="body2">
                    {provisioningClusters.length} In Progress
                  </Typography>
                </div>
                <div className={classes.healthItem}>
                  <ErrorIcon
                    fontSize="small"
                    className={classes.healthError}
                  />
                  <Typography variant="body2">
                    {failedClusters.length} Failed
                  </Typography>
                </div>
              </div>
            </div>
          </InfoCard>
        </Grid>
      </Grid>

      <Box mt={3}>
        <Grid container spacing={3}>
          {/* Recent Teams */}
          <Grid item xs={12} md={8}>
            <InfoCard title="Teams">
              {recentTeams.length === 0 ? (
                <Typography color="textSecondary" align="center">
                  No teams created yet.
                </Typography>
              ) : (
                <List disablePadding>
                  {recentTeams.map((team, index) => (
                    <React.Fragment key={team.name}>
                      {index > 0 && <Divider component="li" />}
                      <Link to={`../admin/teams/${team.name}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                      <ListItem button>
                        <Avatar className={classes.teamAvatar}>
                          {team.displayName?.charAt(0)?.toUpperCase() ||
                            team.name.charAt(0).toUpperCase()}
                        </Avatar>
                        <ListItemText
                          primary={team.displayName || team.name}
                          secondary={`${team.clusterCount} cluster${team.clusterCount !== 1 ? 's' : ''}`}
                          style={{ marginLeft: 12 }}
                        />
                        <StatusBadge status={team.role === 'admin' ? 'Ready' : 'Active'} />
                      </ListItem>
                      </Link>
                    </React.Fragment>
                  ))}
                </List>
              )}
            </InfoCard>
          </Grid>

          {/* Quick Actions */}
          <Grid item xs={12} md={4}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <MuiCard className={classes.quickAction}>
                  <CardContent>
                    <AddIcon className={classes.quickActionIcon} />
                    <Typography variant="h6">Create Team</Typography>
                    <Typography variant="body2" color="textSecondary">
                      Set up a new team with namespace and resource quotas.
                    </Typography>
                  </CardContent>
                  <CardActions>
                    <Link to="/butler/admin/teams" style={{ textDecoration: 'none' }}>
                      <Button size="small" color="primary">
                        Go to Teams
                      </Button>
                    </Link>
                  </CardActions>
                </MuiCard>
              </Grid>
              <Grid item xs={12}>
                <MuiCard className={classes.quickAction}>
                  <CardContent>
                    <PersonAddIcon className={classes.quickActionIcon} />
                    <Typography variant="h6">Invite User</Typography>
                    <Typography variant="body2" color="textSecondary">
                      Add a new user to the platform and assign team
                      membership.
                    </Typography>
                  </CardContent>
                  <CardActions>
                    <Link to="/butler/admin/users" style={{ textDecoration: 'none' }}>
                      <Button size="small" color="primary">
                        Go to Users
                      </Button>
                    </Link>
                  </CardActions>
                </MuiCard>
              </Grid>
              <Grid item xs={12}>
                <MuiCard className={classes.quickAction}>
                  <CardContent>
                    <SettingsInputComponentIcon
                      className={classes.quickActionIcon}
                    />
                    <Typography variant="h6">Manage Providers</Typography>
                    <Typography variant="body2" color="textSecondary">
                      Configure infrastructure providers for cluster
                      provisioning.
                    </Typography>
                  </CardContent>
                  <CardActions>
                    <Link to="/butler/admin/providers" style={{ textDecoration: 'none' }}>
                      <Button size="small" color="primary">
                        Go to Providers
                      </Button>
                    </Link>
                  </CardActions>
                </MuiCard>
              </Grid>
            </Grid>
          </Grid>
        </Grid>
      </Box>
    </div>
  );
};
