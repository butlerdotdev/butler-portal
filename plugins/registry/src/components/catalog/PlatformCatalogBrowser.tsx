// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useMemo } from 'react';
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
  IconButton,
  makeStyles,
} from '@material-ui/core';
import SearchIcon from '@material-ui/icons/Search';
import AddIcon from '@material-ui/icons/Add';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import PublicIcon from '@material-ui/icons/Public';
import { EmptyState } from '@backstage/core-components';
import { useNavigate } from 'react-router-dom';
import type { Artifact } from '../../api/types/artifacts';
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
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(2),
  },
  toolbar: {
    display: 'flex',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(3),
    flexWrap: 'wrap' as const,
    alignItems: 'center',
  },
  searchField: {
    flex: 1,
    minWidth: 200,
  },
  filterField: {
    minWidth: 150,
  },
  activeFilters: {
    display: 'flex',
    gap: theme.spacing(1),
    flexWrap: 'wrap' as const,
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

interface PlatformCatalogBrowserProps {
  allPlatformArtifacts: Artifact[];
  onBack: () => void;
}

export function PlatformCatalogBrowser({
  allPlatformArtifacts,
  onBack,
}: PlatformCatalogBrowserProps) {
  const classes = useStyles();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');

  // Compute facets from all platform artifacts
  const { tagFacets, categoryFacets } = useMemo(() => {
    const tagMap = new Map<string, number>();
    const catMap = new Map<string, number>();
    for (const a of allPlatformArtifacts) {
      for (const tag of a.tags) {
        tagMap.set(tag, (tagMap.get(tag) ?? 0) + 1);
      }
      if (a.category) {
        catMap.set(a.category, (catMap.get(a.category) ?? 0) + 1);
      }
    }
    return {
      tagFacets: Array.from(tagMap, ([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      categoryFacets: Array.from(catMap, ([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
    };
  }, [allPlatformArtifacts]);

  // Apply filters
  const filteredArtifacts = useMemo(() => {
    let result = allPlatformArtifacts;

    if (typeFilter) {
      result = result.filter(a => a.type === typeFilter);
    }
    if (selectedCategory) {
      result = result.filter(a => a.category === selectedCategory);
    }
    if (selectedTags.length > 0) {
      result = result.filter(a =>
        selectedTags.every(t => a.tags.includes(t)),
      );
    }
    if (search) {
      const term = search.toLowerCase();
      result = result.filter(
        a =>
          a.name.toLowerCase().includes(term) ||
          (a.description?.toLowerCase().includes(term) ?? false),
      );
    }

    return [...result].sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'download_count':
          return b.download_count - a.download_count;
        case 'updated_at':
          return b.updated_at.localeCompare(a.updated_at);
        case 'created_at':
        default:
          return b.created_at.localeCompare(a.created_at);
      }
    });
  }, [allPlatformArtifacts, search, typeFilter, sortBy, selectedTags, selectedCategory]);

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag],
    );
  };

  const hasActiveFilters = selectedTags.length > 0 || !!selectedCategory;

  return (
    <>
      <Box className={classes.header}>
        <IconButton size="small" onClick={onBack}>
          <ArrowBackIcon />
        </IconButton>
        <PublicIcon style={{ color: '#2563eb' }} />
        <Typography variant="h6">Platform Registry</Typography>
        <Chip
          label={`${allPlatformArtifacts.length} artifact${allPlatformArtifacts.length !== 1 ? 's' : ''}`}
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

      {allPlatformArtifacts.length === 0 ? (
        <EmptyState
          title="No platform artifacts"
          description="Register shared artifacts that are visible to all teams."
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
                <Button
                  size="small"
                  onClick={() => {
                    setSelectedTags([]);
                    setSelectedCategory('');
                  }}
                >
                  Clear Filters
                </Button>
              </Box>
            )}

            {filteredArtifacts.length === 0 ? (
              <EmptyState
                title="No artifacts found"
                description={
                  search || typeFilter || hasActiveFilters
                    ? 'Try adjusting your filters.'
                    : 'No platform artifacts registered yet.'
                }
                missing="data"
                action={
                  !search && !typeFilter && !hasActiveFilters ? (
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={() => navigate('register')}
                    >
                      Register Artifact
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <Grid container spacing={2}>
                {filteredArtifacts.map(artifact => (
                  <Grid item xs={12} sm={6} md={4} key={artifact.id}>
                    <ArtifactCard artifact={artifact} />
                  </Grid>
                ))}
              </Grid>
            )}
          </Box>
        </Box>
      )}
    </>
  );
}
