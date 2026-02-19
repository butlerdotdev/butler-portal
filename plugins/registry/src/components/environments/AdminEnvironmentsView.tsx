// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  TextField,
  MenuItem,
  Grid,
  Paper,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  makeStyles,
} from '@material-ui/core';
import SearchIcon from '@material-ui/icons/Search';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import AddIcon from '@material-ui/icons/Add';
import LockIcon from '@material-ui/icons/Lock';
import { Progress, EmptyState } from '@backstage/core-components';
import { useRegistryApi } from '../../hooks/useRegistryApi';
import { useRegistryTeam } from '../../hooks/useRegistryTeam';
import { TeamEnvironmentCard } from './TeamEnvironmentCard';
import type { TeamSummary } from './TeamEnvironmentCard';
import type { Environment } from '../../api/types/environments';

const useStyles = makeStyles(theme => ({
  summaryBar: {
    display: 'flex',
    gap: theme.spacing(4),
    padding: theme.spacing(2, 3),
    marginBottom: theme.spacing(2),
  },
  summaryItem: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  summaryValue: {
    fontSize: '1.5rem',
    fontWeight: 700,
    lineHeight: 1,
  },
  summaryLabel: {
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
    marginTop: 2,
  },
  toolbar: {
    display: 'flex',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(2),
    alignItems: 'center',
  },
  searchField: {
    minWidth: 260,
  },
  drillHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(2),
  },
  clickableRow: {
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
  },
  lockIcon: {
    fontSize: '1rem',
    verticalAlign: 'middle',
    marginLeft: theme.spacing(0.5),
    color: theme.palette.warning.main,
  },
  noResults: {
    textAlign: 'center' as const,
    padding: theme.spacing(6),
    color: theme.palette.text.secondary,
  },
}));

function statusColor(status: string): 'default' | 'primary' | 'secondary' {
  switch (status) {
    case 'active':
      return 'primary';
    case 'paused':
      return 'default';
    case 'archived':
      return 'secondary';
    default:
      return 'default';
  }
}

export function AdminEnvironmentsView() {
  const classes = useStyles();
  const navigate = useNavigate();
  const api = useRegistryApi();
  const { teams } = useRegistryTeam();

  const [allEnvironments, setAllEnvironments] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const fetchAllEnvironments = useCallback(async () => {
    try {
      setLoading(true);
      const environments: Environment[] = [];
      let cursor: string | undefined;

      do {
        const response = await api.listEnvironments({
          status: statusFilter || undefined,
          limit: 200,
          cursor,
        });
        environments.push(...response.items);
        cursor = response.nextCursor ?? undefined;
      } while (cursor);

      setAllEnvironments(environments);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load environments',
      );
    } finally {
      setLoading(false);
    }
  }, [api, statusFilter]);

  useEffect(() => {
    fetchAllEnvironments();
  }, [fetchAllEnvironments]);

  // Group environments by team
  const teamGroups = useMemo(() => {
    const groups = new Map<string, Environment[]>();
    for (const env of allEnvironments) {
      const team = env.team || '__no_team__';
      const list = groups.get(team);
      if (list) {
        list.push(env);
      } else {
        groups.set(team, [env]);
      }
    }
    return groups;
  }, [allEnvironments]);

  // Build team summaries — include ALL known teams, even those with 0 environments
  const teamSummaries = useMemo<TeamSummary[]>(() => {
    const allTeamNames = new Set<string>();
    // Add teams from environment data
    for (const team of teamGroups.keys()) {
      if (team !== '__no_team__') allTeamNames.add(team);
    }
    // Add teams from the team picker (covers teams with 0 environments)
    for (const t of teams) {
      allTeamNames.add(t);
    }

    return Array.from(allTeamNames)
      .map(team => {
        const envs = teamGroups.get(team) ?? [];
        return {
          team,
          environmentCount: envs.length,
          moduleCount: envs.reduce((sum, e) => sum + e.module_count, 0),
          resourceCount: envs.reduce((sum, e) => sum + e.total_resources, 0),
          activeCount: envs.filter(e => e.status === 'active').length,
          pausedCount: envs.filter(e => e.status === 'paused').length,
          archivedCount: envs.filter(e => e.status === 'archived').length,
          lockedCount: envs.filter(e => e.locked).length,
        };
      })
      .sort((a, b) => a.team.localeCompare(b.team));
  }, [teamGroups, teams]);

  // Filter teams by search
  const filteredTeams = useMemo(() => {
    if (!searchTerm) return teamSummaries;
    const term = searchTerm.toLowerCase();
    return teamSummaries.filter(t =>
      t.team.toLowerCase().includes(term),
    );
  }, [teamSummaries, searchTerm]);

  // Summary totals
  const totals = useMemo(() => {
    const active = allEnvironments.filter(e => e.status === 'active').length;
    const locked = allEnvironments.filter(e => e.locked).length;
    return {
      teams: teamGroups.size,
      environments: allEnvironments.length,
      active,
      locked,
    };
  }, [allEnvironments, teamGroups]);

  if (loading) return <Progress />;

  if (error) {
    return (
      <EmptyState
        title="Failed to load environments"
        description={error}
        missing="data"
        action={
          <Button variant="outlined" onClick={fetchAllEnvironments}>
            Retry
          </Button>
        }
      />
    );
  }

  // ── Drill-down: selected team's environments ──
  if (selectedTeam) {
    const teamEnvs = teamGroups.get(selectedTeam) ?? [];

    return (
      <>
        <Box className={classes.drillHeader}>
          <IconButton size="small" onClick={() => setSelectedTeam(null)}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6">
            {selectedTeam}
          </Typography>
          <Chip
            label={`${teamEnvs.length} environment${teamEnvs.length !== 1 ? 's' : ''}`}
            size="small"
            variant="outlined"
          />
          <Box style={{ marginLeft: 'auto' }}>
            <Button
              variant="contained"
              color="primary"
              size="small"
              startIcon={<AddIcon />}
              onClick={() => navigate(`create?team=${encodeURIComponent(selectedTeam)}`)}
            >
              New Environment
            </Button>
          </Box>
        </Box>

        {teamEnvs.length === 0 ? (
          <EmptyState
            title="No environments"
            description={`No environments yet for ${selectedTeam}. Create one to get started.`}
            missing="data"
            action={
              <Button
                variant="contained"
                color="primary"
                onClick={() => navigate(`create?team=${encodeURIComponent(selectedTeam)}`)}
              >
                New Environment
              </Button>
            }
          />
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Modules</TableCell>
                  <TableCell>Total Resources</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Last Run</TableCell>
                  <TableCell>Created</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {teamEnvs.map(env => (
                  <TableRow
                    key={env.id}
                    className={classes.clickableRow}
                    onClick={() => navigate(env.id)}
                  >
                    <TableCell>
                      <Typography variant="body2">
                        {env.name}
                        {env.locked && <LockIcon className={classes.lockIcon} />}
                      </Typography>
                      {env.description && (
                        <Typography variant="caption" color="textSecondary">
                          {env.description}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>{env.module_count}</TableCell>
                    <TableCell>{env.total_resources}</TableCell>
                    <TableCell>
                      <Chip
                        label={env.status}
                        size="small"
                        color={statusColor(env.status)}
                      />
                    </TableCell>
                    <TableCell>
                      {env.last_run_at
                        ? new Date(env.last_run_at).toLocaleDateString()
                        : '-'}
                    </TableCell>
                    <TableCell>
                      {new Date(env.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </>
    );
  }

  // ── Team cards grid ──
  return (
    <>
      {/* Summary banner */}
      <Paper variant="outlined" className={classes.summaryBar}>
        <Box className={classes.summaryItem}>
          <Typography className={classes.summaryValue}>{totals.teams}</Typography>
          <Typography className={classes.summaryLabel}>Teams</Typography>
        </Box>
        <Box className={classes.summaryItem}>
          <Typography className={classes.summaryValue}>{totals.environments}</Typography>
          <Typography className={classes.summaryLabel}>Environments</Typography>
        </Box>
        <Box className={classes.summaryItem}>
          <Typography className={classes.summaryValue}>{totals.active}</Typography>
          <Typography className={classes.summaryLabel}>Active</Typography>
        </Box>
        {totals.locked > 0 && (
          <Box className={classes.summaryItem}>
            <Typography className={classes.summaryValue} style={{ color: '#f59e0b' }}>
              {totals.locked}
            </Typography>
            <Typography className={classes.summaryLabel}>Locked</Typography>
          </Box>
        )}
      </Paper>

      {/* Toolbar */}
      <Box className={classes.toolbar}>
        <TextField
          className={classes.searchField}
          variant="outlined"
          size="small"
          placeholder="Search teams..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="disabled" />
              </InputAdornment>
            ),
          }}
        />
        <TextField
          select
          variant="outlined"
          size="small"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          label="Status"
          style={{ minWidth: 150 }}
        >
          <MenuItem value="">All</MenuItem>
          <MenuItem value="active">Active</MenuItem>
          <MenuItem value="paused">Paused</MenuItem>
          <MenuItem value="archived">Archived</MenuItem>
        </TextField>
      </Box>

      {/* Team cards */}
      {teamSummaries.length === 0 ? (
        <EmptyState
          title="No teams"
          description="No teams have been configured yet."
          missing="data"
        />
      ) : filteredTeams.length === 0 ? (
        <Typography className={classes.noResults}>
          No teams matching "{searchTerm}"
        </Typography>
      ) : (
        <Grid container spacing={2}>
          {filteredTeams.map(summary => (
            <Grid item xs={12} sm={6} md={4} key={summary.team}>
              <TeamEnvironmentCard
                summary={summary}
                onClick={() => setSelectedTeam(summary.team)}
              />
            </Grid>
          ))}
        </Grid>
      )}
    </>
  );
}
