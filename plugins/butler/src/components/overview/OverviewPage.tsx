// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import React, { useEffect, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { Link as RouterLink } from 'react-router-dom';
import {
  InfoCard,
  Progress,
  EmptyState,
  StatusOK,
  StatusError,
  StatusRunning,
  StatusPending,
} from '@backstage/core-components';
import {
  Grid,
  Typography,
  Card as MuiCard,
  CardContent,
  CardActions,
  Button,
  Box,
  Chip,
  makeStyles,
} from '@material-ui/core';
import GroupIcon from '@material-ui/icons/Group';
import CloudIcon from '@material-ui/icons/Cloud';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import ErrorIcon from '@material-ui/icons/Error';
import SettingsIcon from '@material-ui/icons/Settings';
import StorageIcon from '@material-ui/icons/Storage';
import PersonIcon from '@material-ui/icons/Person';

import { butlerApiRef } from '../../api/ButlerApi';
import { useTeamContext } from '../../hooks/useTeamContext';
import type { TeamInfo } from '../../api/types/teams';
import type { Cluster } from '../../api/types/clusters';

const useStyles = makeStyles(theme => ({
  statCard: {
    textAlign: 'center',
    padding: theme.spacing(3),
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
  statIcon: {
    fontSize: '2rem',
    marginBottom: theme.spacing(1),
    color: theme.palette.text.secondary,
  },
  teamCard: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    transition: 'box-shadow 0.2s ease-in-out',
    '&:hover': {
      boxShadow: theme.shadows[4],
    },
  },
  teamCardContent: {
    flexGrow: 1,
  },
  teamName: {
    fontWeight: 600,
  },
  teamMeta: {
    color: theme.palette.text.secondary,
    marginTop: theme.spacing(0.5),
  },
  roleChip: {
    marginTop: theme.spacing(1),
  },
  quickLink: {
    textTransform: 'none',
    justifyContent: 'flex-start',
    padding: theme.spacing(1.5, 2),
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
  },
  quickLinkIcon: {
    marginRight: theme.spacing(1.5),
    color: theme.palette.text.secondary,
  },
  errorBox: {
    padding: theme.spacing(2),
    color: theme.palette.error.main,
  },
}));

interface PlatformStats {
  totalTeams: number;
  totalClusters: number;
  readyClusters: number;
  failedClusters: number;
}

function computeStats(teams: TeamInfo[], clusters: Cluster[]): PlatformStats {
  const readyClusters = clusters.filter(
    c => c.status?.phase?.toLowerCase() === 'ready',
  ).length;
  const failedClusters = clusters.filter(
    c => c.status?.phase?.toLowerCase() === 'failed',
  ).length;

  return {
    totalTeams: teams.length,
    totalClusters: clusters.length,
    readyClusters,
    failedClusters,
  };
}

function StatCard({
  icon,
  value,
  label,
  color,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  color?: string;
}) {
  const classes = useStyles();
  return (
    <MuiCard variant="outlined">
      <CardContent className={classes.statCard}>
        {icon}
        <Typography
          className={classes.statValue}
          style={color ? { color } : undefined}
        >
          {value}
        </Typography>
        <Typography variant="body2" className={classes.statLabel}>
          {label}
        </Typography>
      </CardContent>
    </MuiCard>
  );
}

export const OverviewPage = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const { teams: userTeams, isAdmin } = useTeamContext();

  const [allTeams, setAllTeams] = useState<TeamInfo[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [teamsResponse, clustersResponse] = await Promise.all([
          api.listAllTeams(),
          api.listClusters(),
        ]);

        if (cancelled) return;

        setAllTeams(teamsResponse.teams ?? []);
        setClusters(clustersResponse.clusters ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load platform data',
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
  }, [api]);

  if (loading) {
    return <Progress />;
  }

  if (error) {
    return (
      <Box className={classes.errorBox}>
        <Typography variant="h6">Failed to load overview</Typography>
        <Typography variant="body2">{error}</Typography>
      </Box>
    );
  }

  const stats = computeStats(allTeams, clusters);

  return (
        <Grid container spacing={3}>
          {/* Stat cards */}
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              icon={<GroupIcon className={classes.statIcon} />}
              value={stats.totalTeams}
              label="Total Teams"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              icon={<CloudIcon className={classes.statIcon} />}
              value={stats.totalClusters}
              label="Total Clusters"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              icon={<CheckCircleIcon className={classes.statIcon} />}
              value={stats.readyClusters}
              label="Ready Clusters"
              color="#4caf50"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              icon={<ErrorIcon className={classes.statIcon} />}
              value={stats.failedClusters}
              label="Failed Clusters"
              color={stats.failedClusters > 0 ? '#f44336' : undefined}
            />
          </Grid>

          {/* Your Teams */}
          {userTeams.length > 0 && (
            <Grid item xs={12}>
              <InfoCard title="Your Teams">
                <Grid container spacing={2}>
                  {userTeams.map(team => (
                    <Grid item xs={12} sm={6} md={4} key={team.name}>
                      <MuiCard variant="outlined" className={classes.teamCard}>
                        <CardContent className={classes.teamCardContent}>
                          <Typography
                            variant="h6"
                            className={classes.teamName}
                          >
                            {team.displayName || team.name}
                          </Typography>
                          <Typography
                            variant="body2"
                            className={classes.teamMeta}
                          >
                            {team.clusterCount}{' '}
                            {team.clusterCount === 1 ? 'cluster' : 'clusters'}
                          </Typography>
                          <Chip
                            size="small"
                            label={team.role}
                            color={
                              team.role === 'admin' ? 'secondary' : 'default'
                            }
                            className={classes.roleChip}
                          />
                        </CardContent>
                        <CardActions>
                          <Button
                            size="small"
                            color="primary"
                            component={RouterLink}
                            to={`/butler/t/${team.name}`}
                          >
                            Open Dashboard
                          </Button>
                          <Button
                            size="small"
                            component={RouterLink}
                            to={`/butler/t/${team.name}/clusters`}
                          >
                            View Clusters
                          </Button>
                        </CardActions>
                      </MuiCard>
                    </Grid>
                  ))}
                </Grid>
              </InfoCard>
            </Grid>
          )}

          {userTeams.length === 0 && (
            <Grid item xs={12}>
              <EmptyState
                title="No team memberships"
                description="You are not a member of any teams yet. Contact a platform administrator to get access."
                missing="info"
              />
            </Grid>
          )}

          {/* Admin Quick Links */}
          {isAdmin && (
            <Grid item xs={12} md={6}>
              <InfoCard title="Admin Quick Links">
                <Box display="flex" flexDirection="column">
                  <Button
                    className={classes.quickLink}
                    component={RouterLink}
                    to="/butler/admin/providers"
                  >
                    <StorageIcon className={classes.quickLinkIcon} />
                    <Box>
                      <Typography variant="body1">
                        Infrastructure Providers
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        Manage Harvester, Nutanix, and Proxmox providers
                      </Typography>
                    </Box>
                  </Button>
                  <Button
                    className={classes.quickLink}
                    component={RouterLink}
                    to="/butler/admin/identity-providers"
                  >
                    <PersonIcon className={classes.quickLinkIcon} />
                    <Box>
                      <Typography variant="body1">
                        Identity Providers
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        Configure OIDC and SSO authentication
                      </Typography>
                    </Box>
                  </Button>
                  <Button
                    className={classes.quickLink}
                    component={RouterLink}
                    to="/butler/admin/management"
                  >
                    <SettingsIcon className={classes.quickLinkIcon} />
                    <Box>
                      <Typography variant="body1">
                        Management Cluster
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        View management cluster health and components
                      </Typography>
                    </Box>
                  </Button>
                </Box>
              </InfoCard>
            </Grid>
          )}

          {/* Cluster Status Overview */}
          {clusters.length > 0 && (
            <Grid item xs={12} md={isAdmin ? 6 : 12}>
              <InfoCard title="Cluster Status Breakdown">
                <Box display="flex" flexDirection="column" gridGap={8}>
                  {(() => {
                    const phaseCounts: Record<string, number> = {};
                    clusters.forEach(c => {
                      const phase = c.status?.phase || 'Unknown';
                      phaseCounts[phase] = (phaseCounts[phase] || 0) + 1;
                    });
                    return Object.entries(phaseCounts)
                      .sort(([, a], [, b]) => b - a)
                      .map(([phase, count]) => (
                        <Box
                          key={phase}
                          display="flex"
                          alignItems="center"
                          justifyContent="space-between"
                          paddingY={0.5}
                        >
                          <Box display="flex" alignItems="center">
                            {phase.toLowerCase() === 'ready' && (
                              <StatusOK>{phase}</StatusOK>
                            )}
                            {phase.toLowerCase() === 'failed' && (
                              <StatusError>{phase}</StatusError>
                            )}
                            {phase.toLowerCase() === 'provisioning' && (
                              <StatusRunning>{phase}</StatusRunning>
                            )}
                            {phase.toLowerCase() === 'pending' && (
                              <StatusPending>{phase}</StatusPending>
                            )}
                            {!['ready', 'failed', 'provisioning', 'pending'].includes(
                              phase.toLowerCase(),
                            ) && (
                              <Typography variant="body2">{phase}</Typography>
                            )}
                          </Box>
                          <Chip size="small" label={count} />
                        </Box>
                      ));
                  })()}
                </Box>
              </InfoCard>
            </Grid>
          )}
        </Grid>
  );
};
