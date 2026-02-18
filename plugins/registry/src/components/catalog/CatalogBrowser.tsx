// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useCallback } from 'react';
import {
  Grid,
  TextField,
  MenuItem,
  Box,
  Button,
  InputAdornment,
  Chip,
  Typography,
  Paper,
  makeStyles,
} from '@material-ui/core';
import SearchIcon from '@material-ui/icons/Search';
import AddIcon from '@material-ui/icons/Add';
import { Progress, EmptyState } from '@backstage/core-components';
import { useNavigate } from 'react-router-dom';
import { useRegistryApi } from '../../hooks/useRegistryApi';
import { useRegistryTeam } from '../../hooks/useRegistryTeam';
import { AdminCatalogView } from './AdminCatalogView';
import type { Artifact, ArtifactType, FacetCount } from '../../api/types/artifacts';
import { ArtifactCard } from './ArtifactCard';

const useStyles = makeStyles(theme => ({
  root: {
    display: 'flex',
    gap: theme.spacing(3),
  },
  sidebar: {
    width: 240,
    flexShrink: 0,
  },
  sidebarSection: {
    padding: theme.spacing(2),
    marginBottom: theme.spacing(2),
  },
  sidebarTitle: {
    fontWeight: 600,
    marginBottom: theme.spacing(1),
  },
  tagChip: {
    margin: theme.spacing(0.5),
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  toolbar: {
    display: 'flex',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(3),
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  searchField: {
    flex: 1,
    minWidth: 200,
  },
  filterField: {
    minWidth: 150,
  },
  registerButton: {
    marginLeft: 'auto',
  },
  loadMore: {
    display: 'flex',
    justifyContent: 'center',
    marginTop: theme.spacing(3),
  },
  activeFilters: {
    display: 'flex',
    gap: theme.spacing(1),
    flexWrap: 'wrap',
    marginBottom: theme.spacing(2),
  },
}));

const ARTIFACT_TYPES: Array<{ value: string; label: string }> = [
  { value: '', label: 'All Types' },
  { value: 'terraform-module', label: 'Terraform Module' },
  { value: 'terraform-provider', label: 'Terraform Provider' },
  { value: 'helm-chart', label: 'Helm Chart' },
  { value: 'opa-bundle', label: 'OPA Bundle' },
  { value: 'oci-artifact', label: 'OCI Artifact' },
];

const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'created_at', label: 'Newest' },
  { value: 'download_count', label: 'Most Downloads' },
  { value: 'updated_at', label: 'Recently Updated' },
  { value: 'name', label: 'Name' },
];

export function CatalogBrowser() {
  const { activeTeam, isPlatformAdmin } = useRegistryTeam();
  const isAdminMode = !activeTeam && isPlatformAdmin;

  if (isAdminMode) {
    return <AdminCatalogView />;
  }

  return <TeamCatalogBrowser />;
}

function TeamCatalogBrowser() {
  const classes = useStyles();
  const navigate = useNavigate();
  const api = useRegistryApi();

  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // Facets
  const [tagFacets, setTagFacets] = useState<FacetCount[]>([]);
  const [categoryFacets, setCategoryFacets] = useState<FacetCount[]>([]);

  const fetchFacets = useCallback(async () => {
    try {
      const facets = await api.getArtifactFacets();
      setTagFacets(facets.tags);
      setCategoryFacets(facets.categories);
    } catch {
      // Facets are non-critical — silently ignore
    }
  }, [api]);

  useEffect(() => {
    fetchFacets();
  }, [fetchFacets]);

  const fetchArtifacts = useCallback(
    async (cursor?: string) => {
      try {
        if (!cursor) setLoading(true);
        const sortOrder = sortBy === 'name' ? 'asc' as const : 'desc' as const;
        const result = await api.listArtifacts({
          search: search || undefined,
          type: (typeFilter as ArtifactType) || undefined,
          sortBy,
          sortOrder,
          tags: selectedTags.length > 0 ? selectedTags : undefined,
          category: selectedCategory || undefined,
          cursor,
          limit: 24,
        });
        if (cursor) {
          setArtifacts(prev => [...prev, ...result.items]);
        } else {
          setArtifacts(result.items);
        }
        setNextCursor(result.nextCursor);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load artifacts');
      } finally {
        setLoading(false);
      }
    },
    [api, search, typeFilter, sortBy, selectedTags, selectedCategory],
  );

  useEffect(() => {
    const timer = setTimeout(() => fetchArtifacts(), 300);
    return () => clearTimeout(timer);
  }, [fetchArtifacts]);

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag],
    );
  };

  const hasActiveFilters = selectedTags.length > 0 || selectedCategory;

  if (loading && artifacts.length === 0) {
    return <Progress />;
  }

  if (error) {
    return (
      <EmptyState
        title="Failed to load artifacts"
        description={error}
        missing="data"
        action={
          <Button variant="outlined" onClick={() => fetchArtifacts()}>
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <Box className={classes.root}>
      {(tagFacets.length > 0 || categoryFacets.length > 0) && (
        <Box className={classes.sidebar}>
          {categoryFacets.length > 0 && (
            <Paper variant="outlined" className={classes.sidebarSection}>
              <Typography variant="subtitle2" className={classes.sidebarTitle}>
                Categories
              </Typography>
              <TextField
                select
                fullWidth
                variant="outlined"
                size="small"
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
              >
                <MenuItem value="">All Categories</MenuItem>
                {categoryFacets.map(c => (
                  <MenuItem key={c.name} value={c.name}>
                    {c.name} ({c.count})
                  </MenuItem>
                ))}
              </TextField>
            </Paper>
          )}
          {tagFacets.length > 0 && (
            <Paper variant="outlined" className={classes.sidebarSection}>
              <Typography variant="subtitle2" className={classes.sidebarTitle}>
                Tags
              </Typography>
              {tagFacets.map(t => (
                <Chip
                  key={t.name}
                  label={`${t.name} (${t.count})`}
                  size="small"
                  className={classes.tagChip}
                  color={selectedTags.includes(t.name) ? 'primary' : 'default'}
                  onClick={() => toggleTag(t.name)}
                  clickable
                />
              ))}
            </Paper>
          )}
        </Box>
      )}

      <Box className={classes.content}>
        <Box className={classes.toolbar}>
          <TextField
            className={classes.searchField}
            variant="outlined"
            size="small"
            placeholder="Search artifacts..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />
          <TextField
            className={classes.filterField}
            select
            variant="outlined"
            size="small"
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            label="Type"
          >
            {ARTIFACT_TYPES.map(t => (
              <MenuItem key={t.value} value={t.value}>
                {t.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            className={classes.filterField}
            select
            variant="outlined"
            size="small"
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            label="Sort"
          >
            {SORT_OPTIONS.map(s => (
              <MenuItem key={s.value} value={s.value}>
                {s.label}
              </MenuItem>
            ))}
          </TextField>
          <Button
            className={classes.registerButton}
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={() => navigate('register')}
          >
            Register Artifact
          </Button>
        </Box>

        {hasActiveFilters && (
          <Box className={classes.activeFilters}>
            {selectedTags.map(tag => (
              <Chip
                key={tag}
                label={tag}
                size="small"
                onDelete={() => toggleTag(tag)}
                color="primary"
              />
            ))}
            {selectedCategory && (
              <Chip
                label={selectedCategory}
                size="small"
                onDelete={() => setSelectedCategory('')}
                color="secondary"
              />
            )}
            <Button size="small" onClick={() => { setSelectedTags([]); setSelectedCategory(''); }}>
              Clear Filters
            </Button>
          </Box>
        )}

        {artifacts.length === 0 ? (
          <EmptyState
            title="No artifacts found"
            description="Register your first artifact to get started."
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
          <>
            <Grid container spacing={2}>
              {artifacts.map(artifact => (
                <Grid item xs={12} sm={6} md={4} key={artifact.id}>
                  <ArtifactCard artifact={artifact} />
                </Grid>
              ))}
            </Grid>
            {nextCursor && (
              <Box className={classes.loadMore}>
                <Button
                  variant="outlined"
                  onClick={() => fetchArtifacts(nextCursor)}
                >
                  Load More
                </Button>
              </Box>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}
