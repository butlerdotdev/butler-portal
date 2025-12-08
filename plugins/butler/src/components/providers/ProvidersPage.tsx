// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState, useCallback } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import {
  Table,
  TableColumn,
  Progress,
  EmptyState,
} from '@backstage/core-components';
import {
  Grid,
  Typography,
  Button,
  Box,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  Divider,
  makeStyles,
} from '@material-ui/core';
import AddIcon from '@material-ui/icons/Add';
import RefreshIcon from '@material-ui/icons/Refresh';

import { butlerApiRef } from '../../api/ButlerApi';
import { StatusBadge } from '../StatusBadge/StatusBadge';
import type { Provider } from '../../api/types/providers';

const useStyles = makeStyles(theme => ({
  headerActions: {
    display: 'flex',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(2),
  },
  providerLink: {
    textDecoration: 'none',
    color: 'inherit',
    fontWeight: 600,
    cursor: 'pointer',
    '&:hover': {
      textDecoration: 'underline',
    },
  },
  typeChip: {
    textTransform: 'capitalize',
  },
  dialogField: {
    padding: theme.spacing(0.5, 0),
  },
  dialogLabel: {
    color: theme.palette.text.secondary,
    fontWeight: 500,
  },
  dialogValue: {
    fontWeight: 400,
  },
  validatedBadge: {
    color: '#4caf50',
  },
  notValidatedBadge: {
    color: theme.palette.text.secondary,
  },
}));

function getProviderTypeColor(
  provider: string,
): 'primary' | 'secondary' | 'default' {
  switch (provider?.toLowerCase()) {
    case 'harvester':
      return 'primary';
    case 'nutanix':
      return 'secondary';
    case 'proxmox':
      return 'default';
    default:
      return 'default';
  }
}

function getProviderStatus(provider: Provider): string {
  if (provider.status?.validated === true) {
    return 'Ready';
  }
  if (provider.status?.validated === false) {
    return 'Failed';
  }
  // Check conditions
  const readyCondition = provider.status?.conditions?.find(
    c => c.type === 'Ready',
  );
  if (readyCondition) {
    return readyCondition.status === 'True' ? 'Ready' : 'Failed';
  }
  return 'Unknown';
}

interface ProviderRow {
  id: string;
  name: string;
  namespace: string;
  type: string;
  status: string;
  validated: boolean | undefined;
  lastValidation: string;
  provider: Provider;
}

export const ProvidersPage = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);

  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Detail dialog state
  const [detailProvider, setDetailProvider] = useState<Provider | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const loadProviders = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.listProviders();
      setProviders(response.providers ?? []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load providers',
      );
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  const handleOpenDetail = (provider: Provider) => {
    setDetailProvider(provider);
    setDetailOpen(true);
  };

  const handleCloseDetail = () => {
    setDetailOpen(false);
    setDetailProvider(null);
  };

  const columns: TableColumn<ProviderRow>[] = [
    {
      title: 'Name',
      field: 'name',
      render: (row: ProviderRow) => (
        <Typography
          variant="body2"
          className={classes.providerLink}
          onClick={() => handleOpenDetail(row.provider)}
        >
          {row.name}
        </Typography>
      ),
    },
    {
      title: 'Namespace',
      field: 'namespace',
    },
    {
      title: 'Type',
      field: 'type',
      render: (row: ProviderRow) => (
        <Chip
          size="small"
          label={row.type}
          color={getProviderTypeColor(row.type)}
          className={classes.typeChip}
        />
      ),
    },
    {
      title: 'Status',
      field: 'status',
      render: (row: ProviderRow) => <StatusBadge status={row.status} />,
    },
    {
      title: 'Last Validated',
      field: 'lastValidation',
      render: (row: ProviderRow) => (
        <Typography variant="body2">
          {row.lastValidation || '-'}
        </Typography>
      ),
    },
  ];

  const tableData: ProviderRow[] = providers.map(p => ({
    id: `${p.metadata.namespace}/${p.metadata.name}`,
    name: p.metadata.name,
    namespace: p.metadata.namespace,
    type: p.spec.provider,
    status: getProviderStatus(p),
    validated: p.status?.validated,
    lastValidation: p.status?.lastValidationTime
      ? new Date(p.status.lastValidationTime).toLocaleString()
      : '',
    provider: p,
  }));

  if (loading) {
    return <Progress />;
  }

  if (error) {
    return (
      <Box p={2}>
        <Typography color="error" variant="h6">
          Failed to load providers
        </Typography>
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      </Box>
    );
  }

  return (
    <>
      <Grid container spacing={3}>
        {/* Actions */}
        <Grid item xs={12}>
          <Box className={classes.headerActions}>
            <Button
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
              component={RouterLink}
              to="/butler/admin/providers/create"
            >
              Create Provider
            </Button>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={loadProviders}
            >
              Refresh
            </Button>
          </Box>
        </Grid>

        {/* Providers Table */}
        <Grid item xs={12}>
          {providers.length === 0 ? (
            <EmptyState
              title="No providers configured"
              description="Configure an infrastructure provider to start provisioning clusters."
              missing="content"
              action={
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<AddIcon />}
                  component={RouterLink}
                  to="/butler/admin/providers/create"
                >
                  Create Provider
                </Button>
              }
            />
          ) : (
            <Table
              columns={columns}
              data={tableData}
              title={`Providers (${providers.length})`}
              options={{
                paging: tableData.length > 20,
                pageSize: 20,
                search: tableData.length > 5,
                padding: 'dense',
              }}
            />
          )}
        </Grid>
      </Grid>

      {/* Provider Detail Dialog */}
      <Dialog
          open={detailOpen}
          onClose={handleCloseDetail}
          maxWidth="sm"
          fullWidth
        >
          {detailProvider && (
            <>
              <DialogTitle>
                {detailProvider.metadata.name}
              </DialogTitle>
              <DialogContent>
                <List disablePadding>
                  <ListItem disableGutters className={classes.dialogField}>
                    <ListItemText
                      primary={
                        <Typography
                          variant="caption"
                          className={classes.dialogLabel}
                        >
                          Name
                        </Typography>
                      }
                      secondary={
                        <Typography
                          variant="body1"
                          className={classes.dialogValue}
                        >
                          {detailProvider.metadata.name}
                        </Typography>
                      }
                    />
                  </ListItem>
                  <Divider />
                  <ListItem disableGutters className={classes.dialogField}>
                    <ListItemText
                      primary={
                        <Typography
                          variant="caption"
                          className={classes.dialogLabel}
                        >
                          Namespace
                        </Typography>
                      }
                      secondary={
                        <Typography
                          variant="body1"
                          className={classes.dialogValue}
                        >
                          {detailProvider.metadata.namespace}
                        </Typography>
                      }
                    />
                  </ListItem>
                  <Divider />
                  <ListItem disableGutters className={classes.dialogField}>
                    <ListItemText
                      primary={
                        <Typography
                          variant="caption"
                          className={classes.dialogLabel}
                        >
                          Provider Type
                        </Typography>
                      }
                      secondary={
                        <Chip
                          size="small"
                          label={detailProvider.spec.provider}
                          color={getProviderTypeColor(
                            detailProvider.spec.provider,
                          )}
                          className={classes.typeChip}
                        />
                      }
                    />
                  </ListItem>
                  <Divider />
                  <ListItem disableGutters className={classes.dialogField}>
                    <ListItemText
                      primary={
                        <Typography
                          variant="caption"
                          className={classes.dialogLabel}
                        >
                          Validated
                        </Typography>
                      }
                      secondary={
                        <StatusBadge
                          status={getProviderStatus(detailProvider)}
                        />
                      }
                    />
                  </ListItem>
                  {detailProvider.status?.lastValidationTime && (
                    <>
                      <Divider />
                      <ListItem
                        disableGutters
                        className={classes.dialogField}
                      >
                        <ListItemText
                          primary={
                            <Typography
                              variant="caption"
                              className={classes.dialogLabel}
                            >
                              Last Validated
                            </Typography>
                          }
                          secondary={
                            <Typography
                              variant="body1"
                              className={classes.dialogValue}
                            >
                              {new Date(
                                detailProvider.status.lastValidationTime,
                              ).toLocaleString()}
                            </Typography>
                          }
                        />
                      </ListItem>
                    </>
                  )}
                  {detailProvider.spec.credentialsRef && (
                    <>
                      <Divider />
                      <ListItem
                        disableGutters
                        className={classes.dialogField}
                      >
                        <ListItemText
                          primary={
                            <Typography
                              variant="caption"
                              className={classes.dialogLabel}
                            >
                              Credentials Secret
                            </Typography>
                          }
                          secondary={
                            <Typography
                              variant="body1"
                              className={classes.dialogValue}
                            >
                              {detailProvider.spec.credentialsRef.namespace
                                ? `${detailProvider.spec.credentialsRef.namespace}/`
                                : ''}
                              {detailProvider.spec.credentialsRef.name}
                            </Typography>
                          }
                        />
                      </ListItem>
                    </>
                  )}
                  {/* Nutanix-specific */}
                  {detailProvider.spec.nutanix?.endpoint && (
                    <>
                      <Divider />
                      <ListItem
                        disableGutters
                        className={classes.dialogField}
                      >
                        <ListItemText
                          primary={
                            <Typography
                              variant="caption"
                              className={classes.dialogLabel}
                            >
                              Nutanix Endpoint
                            </Typography>
                          }
                          secondary={
                            <Typography
                              variant="body1"
                              className={classes.dialogValue}
                            >
                              {detailProvider.spec.nutanix.endpoint}
                              {detailProvider.spec.nutanix.port
                                ? `:${detailProvider.spec.nutanix.port}`
                                : ''}
                            </Typography>
                          }
                        />
                      </ListItem>
                    </>
                  )}
                  {/* Proxmox-specific */}
                  {detailProvider.spec.proxmox?.endpoint && (
                    <>
                      <Divider />
                      <ListItem
                        disableGutters
                        className={classes.dialogField}
                      >
                        <ListItemText
                          primary={
                            <Typography
                              variant="caption"
                              className={classes.dialogLabel}
                            >
                              Proxmox Endpoint
                            </Typography>
                          }
                          secondary={
                            <Typography
                              variant="body1"
                              className={classes.dialogValue}
                            >
                              {detailProvider.spec.proxmox.endpoint}
                            </Typography>
                          }
                        />
                      </ListItem>
                    </>
                  )}
                  {/* Conditions */}
                  {detailProvider.status?.conditions &&
                    detailProvider.status.conditions.length > 0 && (
                      <>
                        <Divider />
                        <ListItem
                          disableGutters
                          className={classes.dialogField}
                        >
                          <ListItemText
                            primary={
                              <Typography
                                variant="caption"
                                className={classes.dialogLabel}
                              >
                                Conditions
                              </Typography>
                            }
                            secondary={
                              <Box mt={0.5}>
                                {detailProvider.status.conditions.map(
                                  (cond, idx) => (
                                    <Box key={idx} mb={0.5}>
                                      <StatusBadge
                                        status={
                                          cond.status === 'True'
                                            ? 'Ready'
                                            : 'Failed'
                                        }
                                      />
                                      {cond.message && (
                                        <Typography
                                          variant="caption"
                                          display="block"
                                          color="textSecondary"
                                        >
                                          {cond.message}
                                        </Typography>
                                      )}
                                    </Box>
                                  ),
                                )}
                              </Box>
                            }
                          />
                        </ListItem>
                      </>
                    )}
                </List>
              </DialogContent>
              <DialogActions>
                <Button onClick={handleCloseDetail}>Close</Button>
              </DialogActions>
            </>
          )}
      </Dialog>
    </>
  );
};
