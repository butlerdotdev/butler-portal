// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  TextField,
  MenuItem,
  makeStyles,
} from '@material-ui/core';
import AddIcon from '@material-ui/icons/Add';
import { Progress, EmptyState } from '@backstage/core-components';
import { useNavigate } from 'react-router-dom';
import { useRegistryApi } from '../../hooks/useRegistryApi';
import { useRegistryTeam } from '../../hooks/useRegistryTeam';
import { hasMinRole } from '@internal/plugin-registry-common';
import type { Project } from '../../api/types/projects';

const useStyles = makeStyles(theme => ({
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(2),
  },
  toolbar: {
    display: 'flex',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(2),
  },
  clickableRow: {
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
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

export function ProjectsList() {
  const { activeTeam, isPlatformAdmin } = useRegistryTeam();
  const isAdminMode = !activeTeam && isPlatformAdmin;

  // Admin mode shows the same view for projects (no separate admin view yet)
  if (isAdminMode) {
    return <TeamProjectsList />;
  }

  return <TeamProjectsList />;
}

function TeamProjectsList() {
  const classes = useStyles();
  const navigate = useNavigate();
  const api = useRegistryApi();
  const { activeRole } = useRegistryTeam();
  const canCreate = hasMinRole(activeRole, 'operator');

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.listProjects(
        statusFilter ? { status: statusFilter } : undefined,
      );
      setProjects(data.items);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load projects',
      );
    } finally {
      setLoading(false);
    }
  }, [api, statusFilter]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  if (loading) return <Progress />;

  if (error) {
    return (
      <EmptyState
        title="Failed to load projects"
        description={error}
        missing="data"
        action={
          <Button variant="outlined" onClick={fetchProjects}>
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <>
      <Box className={classes.header}>
        <Typography variant="h6">Projects</Typography>
        {canCreate && (
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={() => navigate('create')}
          >
            New Project
          </Button>
        )}
      </Box>

      <Box className={classes.toolbar}>
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

      {projects.length === 0 ? (
        <EmptyState
          title="No projects"
          description="Create a project to organize modules and environments together."
          missing="data"
          action={
            canCreate ? (
              <Button
                variant="contained"
                color="primary"
                onClick={() => navigate('create')}
              >
                New Project
              </Button>
            ) : undefined
          }
        />
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Modules</TableCell>
                <TableCell>Environments</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Last Run</TableCell>
                <TableCell>Created</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {projects.map(project => (
                <TableRow
                  key={project.id}
                  className={classes.clickableRow}
                  onClick={() => navigate(project.id)}
                >
                  <TableCell>
                    <Typography variant="body2">
                      {project.name}
                    </Typography>
                    {project.description && (
                      <Typography variant="caption" color="textSecondary">
                        {project.description}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{project.module_count}</TableCell>
                  <TableCell>
                    {project.environments
                      ? project.environments.length
                      : 0}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={project.status}
                      size="small"
                      color={statusColor(project.status)}
                    />
                  </TableCell>
                  <TableCell>
                    {project.last_run_at
                      ? new Date(project.last_run_at).toLocaleDateString()
                      : '-'}
                  </TableCell>
                  <TableCell>
                    {new Date(project.created_at).toLocaleDateString()}
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
