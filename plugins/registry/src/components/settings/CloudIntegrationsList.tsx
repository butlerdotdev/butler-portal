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
  IconButton,
  Tooltip,
  makeStyles,
} from '@material-ui/core';
import AddIcon from '@material-ui/icons/Add';
import DeleteIcon from '@material-ui/icons/Delete';
import EditIcon from '@material-ui/icons/Edit';
import { Progress, EmptyState } from '@backstage/core-components';
import { useNavigate } from 'react-router-dom';
import { useRegistryApi } from '../../hooks/useRegistryApi';
import { ProviderIcon } from './ProviderIcon';
import type { CloudIntegration } from '../../api/types/cloudIntegrations';

const useStyles = makeStyles(theme => ({
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(2),
  },
  statusActive: {
    backgroundColor: theme.palette.success?.main ?? '#4caf50',
    color: '#fff',
  },
  statusDisabled: {
    backgroundColor: theme.palette.warning?.main ?? '#ff9800',
    color: '#fff',
  },
  statusError: {
    backgroundColor: theme.palette.error?.main ?? '#f44336',
    color: '#fff',
  },
}));

const STATUS_CLASS_MAP: Record<string, 'statusActive' | 'statusDisabled' | 'statusError'> = {
  active: 'statusActive',
  disabled: 'statusDisabled',
  error: 'statusError',
};

export function CloudIntegrationsList() {
  const classes = useStyles();
  const api = useRegistryApi();
  const navigate = useNavigate();

  const [integrations, setIntegrations] = useState<CloudIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchIntegrations = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.listCloudIntegrations();
      setIntegrations(data.integrations);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load cloud integrations',
      );
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  const handleDelete = async (id: string) => {
    try {
      await api.deleteCloudIntegration(id);
      fetchIntegrations();
    } catch {
      // Could show snackbar
    }
  };

  if (loading) return <Progress />;

  if (error) {
    return (
      <EmptyState
        title="Failed to load cloud integrations"
        description={error}
        missing="data"
        action={
          <Button variant="outlined" onClick={fetchIntegrations}>
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <>
      <Box className={classes.header}>
        <Typography variant="h6">Cloud Integrations</Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={() => navigate('cloud-integrations/create')}
        >
          New Integration
        </Button>
      </Box>

      {integrations.length === 0 ? (
        <EmptyState
          title="No cloud integrations"
          description="Create an integration to configure cloud provider authentication for your module runs."
          missing="data"
          action={
            <Button
              variant="contained"
              color="primary"
              onClick={() => navigate('cloud-integrations/create')}
            >
              New Integration
            </Button>
          }
        />
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Provider</TableCell>
                <TableCell>Auth Method</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {integrations.map(ci => (
                <TableRow key={ci.id}>
                  <TableCell>
                    <Typography variant="body2">{ci.name}</Typography>
                    {ci.description && (
                      <Typography variant="caption" color="textSecondary">
                        {ci.description}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <ProviderIcon provider={ci.provider} />
                  </TableCell>
                  <TableCell>
                    <Chip label={ci.auth_method} size="small" />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={ci.status}
                      size="small"
                      className={classes[STATUS_CLASS_MAP[ci.status] ?? 'statusActive']}
                    />
                  </TableCell>
                  <TableCell>
                    {new Date(ci.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Tooltip title="Edit">
                      <IconButton
                        size="small"
                        onClick={() => navigate(`cloud-integrations/${ci.id}`)}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        onClick={() => handleDelete(ci.id)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
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
