// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Grid,
  TextField,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Typography,
  Box,
} from '@material-ui/core';
import { makeStyles, Theme, createStyles } from '@material-ui/core/styles';
import SearchIcon from '@material-ui/icons/Search';
import AddIcon from '@material-ui/icons/Add';
import { Pagination } from '@material-ui/lab';
import { Progress, EmptyState } from '@backstage/core-components';
import { usePipelineApi } from '../../hooks/usePipelineApi';
import { usePipelineTeam } from '../../hooks/usePipelineTeam';
import type { Pipeline, PipelineStatus } from '../../api/types/pipelines';
import { PipelineCard } from './PipelineCard';

const PAGE_SIZE = 12;

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    toolbar: {
      display: 'flex',
      alignItems: 'center',
      gap: theme.spacing(2),
      marginBottom: theme.spacing(3),
    },
    search: {
      flex: 1,
      maxWidth: 400,
    },
    statusFilter: {
      minWidth: 140,
    },
    createButton: {
      marginLeft: 'auto',
    },
    pagination: {
      display: 'flex',
      justifyContent: 'center',
      marginTop: theme.spacing(3),
    },
    emptyContainer: {
      marginTop: theme.spacing(4),
    },
  }),
);

export function PipelineList() {
  const classes = useStyles();
  const navigate = useNavigate();
  const api = usePipelineApi();
  const { activeTeam } = usePipelineTeam();

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PipelineStatus | ''>('');
  const [page, setPage] = useState(1);

  const loadPipelines = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cursor =
        page > 1 ? String((page - 1) * PAGE_SIZE) : undefined;
      const result = await api.listPipelines({
        search: search || undefined,
        status: statusFilter || undefined,
        limit: PAGE_SIZE,
        cursor,
      });
      setPipelines(result.items);
      setTotalCount(result.totalCount);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [api, search, statusFilter, page]);

  useEffect(() => {
    loadPipelines();
  }, [loadPipelines]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, activeTeam]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  if (loading && pipelines.length === 0) {
    return <Progress />;
  }

  return (
    <div>
      <Box className={classes.toolbar}>
        <TextField
          className={classes.search}
          variant="outlined"
          size="small"
          placeholder="Search pipelines..."
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
        <FormControl
          variant="outlined"
          size="small"
          className={classes.statusFilter}
        >
          <InputLabel>Status</InputLabel>
          <Select
            value={statusFilter}
            onChange={e =>
              setStatusFilter(e.target.value as PipelineStatus | '')
            }
            label="Status"
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="archived">Archived</MenuItem>
          </Select>
        </FormControl>
        <Button
          className={classes.createButton}
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={() => navigate('create')}
        >
          Create Pipeline
        </Button>
      </Box>

      {error && (
        <Typography color="error" gutterBottom>
          Failed to load pipelines: {error.message}
        </Typography>
      )}

      {!loading && pipelines.length === 0 && (
        <div className={classes.emptyContainer}>
          <EmptyState
            title="No pipelines found"
            description={
              search || statusFilter
                ? 'Try adjusting your search or filter criteria.'
                : 'Get started by creating your first pipeline.'
            }
            missing="content"
            action={
              !search && !statusFilter ? (
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<AddIcon />}
                  onClick={() => navigate('create')}
                >
                  Create Pipeline
                </Button>
              ) : undefined
            }
          />
        </div>
      )}

      <Grid container spacing={3}>
        {pipelines.map(pipeline => (
          <Grid item xs={12} sm={6} md={4} key={pipeline.id}>
            <PipelineCard pipeline={pipeline} />
          </Grid>
        ))}
      </Grid>

      {totalPages > 1 && (
        <div className={classes.pagination}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={(_event, value) => setPage(value)}
            color="primary"
          />
        </div>
      )}
    </div>
  );
}
