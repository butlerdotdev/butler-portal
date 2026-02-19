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
import LockIcon from '@material-ui/icons/Lock';
import { Progress, EmptyState } from '@backstage/core-components';
import { useNavigate } from 'react-router-dom';
import { useRegistryApi } from '../../hooks/useRegistryApi';
import { useRegistryTeam } from '../../hooks/useRegistryTeam';
import { AdminEnvironmentsView } from './AdminEnvironmentsView';
import type { Environment } from '../../api/types/environments';

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
  lockIcon: {
    fontSize: '1rem',
    verticalAlign: 'middle',
    marginLeft: theme.spacing(0.5),
    color: theme.palette.warning.main,
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

export function EnvironmentsList() {
  const { activeTeam, isPlatformAdmin } = useRegistryTeam();
  const isAdminMode = !activeTeam && isPlatformAdmin;

  if (isAdminMode) {
    return <AdminEnvironmentsView />;
  }

  return <TeamEnvironmentsList />;
}

function TeamEnvironmentsList() {
  const classes = useStyles();
  const navigate = useNavigate();
  const api = useRegistryApi();

  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  const fetchEnvironments = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.listEnvironments(
        statusFilter ? { status: statusFilter } : undefined,
      );
      setEnvironments(data.items);
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
    fetchEnvironments();
  }, [fetchEnvironments]);

  if (loading) return <Progress />;

  if (error) {
    return (
      <EmptyState
        title="Failed to load environments"
        description={error}
        missing="data"
        action={
          <Button variant="outlined" onClick={fetchEnvironments}>
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <>
      <Box className={classes.header}>
        <Typography variant="h6">Environments</Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={() => navigate('create')}
        >
          New Environment
        </Button>
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

      {environments.length === 0 ? (
        <EmptyState
          title="No environments"
          description="Create an environment to start deploying infrastructure modules."
          missing="data"
          action={
            <Button
              variant="contained"
              color="primary"
              onClick={() => navigate('create')}
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
              {environments.map(env => (
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
