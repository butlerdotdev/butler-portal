// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Grid,
  Paper,
  InputAdornment,
  Chip,
  makeStyles,
} from '@material-ui/core';
import SearchIcon from '@material-ui/icons/Search';
import AddIcon from '@material-ui/icons/Add';
import PublicIcon from '@material-ui/icons/Public';
import { Progress, EmptyState } from '@backstage/core-components';
import { useNavigate } from 'react-router-dom';
import { useRegistryApi } from '../../hooks/useRegistryApi';
import { useRegistryTeam } from '../../hooks/useRegistryTeam';
import { ArtifactCard } from './ArtifactCard';
import { TeamArtifactCard } from './TeamArtifactCard';
import type { TeamArtifactSummary } from './TeamArtifactCard';
import { PlatformCatalogBrowser } from './PlatformCatalogBrowser';
import type { Artifact } from '../../api/types/artifacts';

const PLATFORM_KEY = '__platform__';

const useStyles = makeStyles(theme => ({
  platformSection: {
    padding: theme.spacing(2.5, 3),
    marginBottom: theme.spacing(3),
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(3),
    cursor: 'pointer',
    transition: 'box-shadow 0.2s ease',
    '&:hover': {
      boxShadow: theme.shadows[3],
    },
  },
  platformIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  platformStats: {
    display: 'flex',
    gap: theme.spacing(2),
    marginLeft: 'auto',
    alignItems: 'center',
  },
  statChip: {
    fontVariantNumeric: 'tabular-nums',
  },
  sectionTitle: {
    fontWeight: 600,
    marginBottom: theme.spacing(1.5),
    marginTop: theme.spacing(1),
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
  noResults: {
    textAlign: 'center' as const,
    padding: theme.spacing(6),
    color: theme.palette.text.secondary,
  },
}));

export function AdminCatalogView() {
  const classes = useStyles();
  const api = useRegistryApi();
  const navigate = useNavigate();
  const { teams } = useRegistryTeam();

  const [allArtifacts, setAllArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // null = overview, PLATFORM_KEY = platform drill-down, string = team drill-down
  const [selectedView, setSelectedView] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchAllArtifacts = useCallback(async () => {
    try {
      setLoading(true);
      const collected: Artifact[] = [];
      let cursor: string | undefined;
      do {
        const result = await api.listArtifacts({ limit: 200, cursor });
        collected.push(...result.items);
        cursor = result.nextCursor ?? undefined;
      } while (cursor);
      setAllArtifacts(collected);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load artifacts');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchAllArtifacts();
  }, [fetchAllArtifacts]);

  // Separate platform vs team artifacts
  const platformArtifacts = useMemo(
    () => allArtifacts.filter(a => !a.team),
    [allArtifacts],
  );

  const teamArtifacts = useMemo(
    () => allArtifacts.filter(a => !!a.team),
    [allArtifacts],
  );

  // Group team artifacts by team
  const teamGroups = useMemo(() => {
    const groups = new Map<string, Artifact[]>();
    for (const artifact of teamArtifacts) {
      const list = groups.get(artifact.team!);
      if (list) {
        list.push(artifact);
      } else {
        groups.set(artifact.team!, [artifact]);
      }
    }
    return groups;
  }, [teamArtifacts]);

  // Build team summaries — include ALL known teams
  const teamSummaries = useMemo<TeamArtifactSummary[]>(() => {
    const allTeamNames = new Set<string>();
    for (const team of teamGroups.keys()) allTeamNames.add(team);
    for (const t of teams) allTeamNames.add(t);

    return Array.from(allTeamNames)
      .map(team => {
        const artifacts = teamGroups.get(team) ?? [];
        const typeBreakdown: Record<string, number> = {};
        for (const a of artifacts) {
          typeBreakdown[a.type] = (typeBreakdown[a.type] ?? 0) + 1;
        }
        return { team, artifactCount: artifacts.length, typeBreakdown };
      })
      .sort((a, b) => a.team.localeCompare(b.team));
  }, [teamGroups, teams]);

  // Filter teams by search
  const filteredTeams = useMemo(() => {
    if (!searchTerm) return teamSummaries;
    const term = searchTerm.toLowerCase();
    return teamSummaries.filter(t => t.team.toLowerCase().includes(term));
  }, [teamSummaries, searchTerm]);

  // Platform type breakdown for the banner
  const platformTypeBreakdown = useMemo(() => {
    const breakdown: Record<string, number> = {};
    for (const a of platformArtifacts) {
      breakdown[a.type] = (breakdown[a.type] ?? 0) + 1;
    }
    return breakdown;
  }, [platformArtifacts]);

  if (loading) return <Progress />;

  if (error) {
    return (
      <EmptyState
        title="Failed to load artifacts"
        description={error}
        missing="data"
        action={
          <Button variant="outlined" onClick={fetchAllArtifacts}>
            Retry
          </Button>
        }
      />
    );
  }

  // ── Drill-down: platform faceted browser ──
  if (selectedView === PLATFORM_KEY) {
    return (
      <PlatformCatalogBrowser
        allPlatformArtifacts={platformArtifacts}
        onBack={() => setSelectedView(null)}
      />
    );
  }

  // ── Drill-down: team artifacts ──
  if (selectedView) {
    const artifacts = teamGroups.get(selectedView) ?? [];

    return (
      <>
        <Box style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Button size="small" onClick={() => setSelectedView(null)}>
            &larr; Back
          </Button>
          <Typography variant="h6">{selectedView}</Typography>
          <Chip
            label={`${artifacts.length} artifact${artifacts.length !== 1 ? 's' : ''}`}
            size="small"
            variant="outlined"
          />
          <Box style={{ flex: 1 }} />
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={() => navigate('register')}
          >
            Register Artifact
          </Button>
        </Box>

        {artifacts.length === 0 ? (
          <EmptyState
            title="No artifacts"
            description={`No artifacts registered for ${selectedView} yet.`}
            missing="data"
            action={
              <Button
                variant="contained"
                color="primary"
                onClick={() => navigate('register')}
              >
                Register Artifact
              </Button>
            }
          />
        ) : (
          <Grid container spacing={2}>
            {artifacts.map(artifact => (
              <Grid item xs={12} sm={6} md={4} key={artifact.id}>
                <ArtifactCard artifact={artifact} />
              </Grid>
            ))}
          </Grid>
        )}
      </>
    );
  }

  // ── Overview: Platform banner + Team cards ──
  return (
    <>
      {/* Platform Registry banner */}
      <Paper
        variant="outlined"
        className={classes.platformSection}
        onClick={() => setSelectedView(PLATFORM_KEY)}
      >
        <Box className={classes.platformIcon}>
          <PublicIcon style={{ color: '#2563eb', fontSize: 28 }} />
        </Box>
        <Box>
          <Typography variant="subtitle1" style={{ fontWeight: 600, lineHeight: 1.2 }}>
            Platform Registry
          </Typography>
          <Typography variant="caption" color="textSecondary">
            Shared artifacts visible to all teams
          </Typography>
        </Box>
        <Box className={classes.platformStats}>
          <Chip
            label={`${platformArtifacts.length} artifacts`}
            size="small"
            variant="outlined"
            className={classes.statChip}
          />
          {Object.entries(platformTypeBreakdown)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([type, count]) => (
              <Chip
                key={type}
                label={`${count} ${type.replace(/-/g, ' ')}`}
                size="small"
                className={classes.statChip}
              />
            ))}
        </Box>
      </Paper>

      {/* Team Registries section */}
      <Typography variant="subtitle1" className={classes.sectionTitle}>
        Team Registries
      </Typography>

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
        <Box style={{ flex: 1 }} />
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={() => navigate('register')}
        >
          Register Artifact
        </Button>
      </Box>

      {teamSummaries.length === 0 ? (
        <EmptyState
          title="No teams"
          description="No teams have been configured yet."
          missing="data"
        />
      ) : filteredTeams.length === 0 ? (
        <Typography className={classes.noResults}>
          No teams matching &quot;{searchTerm}&quot;
        </Typography>
      ) : (
        <Grid container spacing={2}>
          {filteredTeams.map(summary => (
            <Grid item xs={12} sm={6} md={4} key={summary.team}>
              <TeamArtifactCard
                summary={summary}
                onClick={() => setSelectedView(summary.team)}
              />
            </Grid>
          ))}
        </Grid>
      )}
    </>
  );
}
