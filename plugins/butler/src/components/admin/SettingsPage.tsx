// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState, useCallback } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import {
  InfoCard,
  Progress,
  EmptyState,
} from '@backstage/core-components';
import {
  Grid,
  Typography,
  Button,
  Divider,
  Chip,
  Box,
  makeStyles,
} from '@material-ui/core';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import RefreshIcon from '@material-ui/icons/Refresh';
import { butlerApiRef } from '../../api/ButlerApi';
import type { ManagementCluster } from '../../api/types/clusters';
import { StatusBadge } from '../StatusBadge/StatusBadge';

const useStyles = makeStyles(theme => ({
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(2),
  },
  settingRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing(1.5, 0),
  },
  settingLabel: {
    fontWeight: 600,
    color: theme.palette.text.secondary,
    minWidth: 200,
  },
  settingValue: {
    textAlign: 'right',
  },
  sectionDescription: {
    marginBottom: theme.spacing(2),
    color: theme.palette.text.secondary,
  },
}));

interface PlatformConfig {
  mode?: string;
  version?: string;
  hostname?: string;
  defaultProvider?: string;
  gitProvider?: {
    type?: string;
    configured?: boolean;
  };
  teamLimits?: {
    maxTeams?: number;
    maxClustersPerTeam?: number;
    maxNodesPerCluster?: number;
    maxTotalNodes?: number;
  };
}

export const SettingsPage = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const [management, setManagement] = useState<ManagementCluster | null>(
    null,
  );
  const [config, setConfig] = useState<PlatformConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [mgmtRes, configRes] = await Promise.allSettled([
        api.getManagement(),
        api.getSettings().catch(() => null),
      ]);

      if (mgmtRes.status === 'fulfilled') {
        setManagement(mgmtRes.value);
      }

      if (configRes.status === 'fulfilled' && configRes.value) {
        setConfig(configRes.value);
      } else {
        // Derive config from management data if settings endpoint is not available
        setConfig({
          version:
            mgmtRes.status === 'fulfilled'
              ? mgmtRes.value?.kubernetesVersion
              : undefined,
          mode: 'Multi-Tenant',
        });
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
        title="Failed to load settings"
        description={error.message}
        missing="info"
      />
    );
  }

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
        <Typography variant="h4">Platform Settings</Typography>
        <Button
          variant="outlined"
          size="small"
          startIcon={<RefreshIcon />}
          onClick={fetchData}
        >
          Refresh
        </Button>
      </div>

      <Grid container spacing={3}>
        {/* Platform Info */}
        <Grid item xs={12} md={6}>
          <InfoCard title="Platform Information">
            <Typography
              variant="body2"
              className={classes.sectionDescription}
            >
              Core platform configuration and version information.
            </Typography>

            <div className={classes.settingRow}>
              <Typography className={classes.settingLabel}>
                Platform
              </Typography>
              <Typography>Butler</Typography>
            </div>
            <Divider />

            {config?.version && (
              <>
                <div className={classes.settingRow}>
                  <Typography className={classes.settingLabel}>
                    Kubernetes Version
                  </Typography>
                  <Typography>{config.version}</Typography>
                </div>
                <Divider />
              </>
            )}

            <div className={classes.settingRow}>
              <Typography className={classes.settingLabel}>
                Mode
              </Typography>
              <Chip
                label={config?.mode || 'Multi-Tenant'}
                size="small"
                color="primary"
                variant="outlined"
              />
            </div>
            <Divider />

            {management && (
              <>
                <div className={classes.settingRow}>
                  <Typography className={classes.settingLabel}>
                    Management Cluster
                  </Typography>
                  <Box display="flex" alignItems="center" gridGap={8}>
                    <Typography>{management.name}</Typography>
                    <StatusBadge status={management.phase} />
                  </Box>
                </div>
                <Divider />

                <div className={classes.settingRow}>
                  <Typography className={classes.settingLabel}>
                    Nodes
                  </Typography>
                  <Typography>
                    {management.nodes.ready}/{management.nodes.total} Ready
                  </Typography>
                </div>
                <Divider />

                <div className={classes.settingRow}>
                  <Typography className={classes.settingLabel}>
                    Tenant Clusters
                  </Typography>
                  <Typography>{management.tenantClusters}</Typography>
                </div>
              </>
            )}

            {config?.hostname && (
              <>
                <Divider />
                <div className={classes.settingRow}>
                  <Typography className={classes.settingLabel}>
                    Hostname Pattern
                  </Typography>
                  <Typography variant="body2">{config.hostname}</Typography>
                </div>
              </>
            )}
          </InfoCard>
        </Grid>

        {/* Default Provider Configuration */}
        <Grid item xs={12} md={6}>
          <InfoCard title="Default Provider Configuration">
            <Typography
              variant="body2"
              className={classes.sectionDescription}
            >
              The default infrastructure provider used when teams do not
              specify their own.
            </Typography>

            <div className={classes.settingRow}>
              <Typography className={classes.settingLabel}>
                Default Provider
              </Typography>
              <Typography>
                {config?.defaultProvider || 'Not configured'}
              </Typography>
            </div>
            <Divider />

            <div className={classes.settingRow}>
              <Typography className={classes.settingLabel}>
                Git Provider
              </Typography>
              {config?.gitProvider?.configured ? (
                <Chip
                  label={`${config.gitProvider.type || 'Git'} - Configured`}
                  size="small"
                  color="primary"
                  variant="outlined"
                />
              ) : (
                <Typography color="textSecondary">
                  Not configured
                </Typography>
              )}
            </div>
          </InfoCard>
        </Grid>

        {/* Team Limits */}
        <Grid item xs={12}>
          <InfoCard title="Team Limits">
            <Typography
              variant="body2"
              className={classes.sectionDescription}
            >
              Default resource limits applied to teams. Individual teams may
              have custom quotas that override these defaults.
            </Typography>

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <div className={classes.settingRow}>
                  <Typography className={classes.settingLabel}>
                    Max Teams
                  </Typography>
                  <Typography>
                    {config?.teamLimits?.maxTeams ?? 'Unlimited'}
                  </Typography>
                </div>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <div className={classes.settingRow}>
                  <Typography className={classes.settingLabel}>
                    Max Clusters/Team
                  </Typography>
                  <Typography>
                    {config?.teamLimits?.maxClustersPerTeam ?? 'Unlimited'}
                  </Typography>
                </div>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <div className={classes.settingRow}>
                  <Typography className={classes.settingLabel}>
                    Max Nodes/Cluster
                  </Typography>
                  <Typography>
                    {config?.teamLimits?.maxNodesPerCluster ?? 'Unlimited'}
                  </Typography>
                </div>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <div className={classes.settingRow}>
                  <Typography className={classes.settingLabel}>
                    Max Total Nodes
                  </Typography>
                  <Typography>
                    {config?.teamLimits?.maxTotalNodes ?? 'Unlimited'}
                  </Typography>
                </div>
              </Grid>
            </Grid>
          </InfoCard>
        </Grid>
      </Grid>
    </div>
  );
};
