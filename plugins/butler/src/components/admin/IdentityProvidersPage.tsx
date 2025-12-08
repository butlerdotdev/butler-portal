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
  Link,
} from '@backstage/core-components';
import {
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  Box,
  makeStyles,
} from '@material-ui/core';
import AddIcon from '@material-ui/icons/Add';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import RefreshIcon from '@material-ui/icons/Refresh';
import DeleteIcon from '@material-ui/icons/Delete';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import { butlerApiRef } from '../../api/ButlerApi';
import type { IdentityProvider } from '../../api/types/identity-providers';
import { StatusBadge } from '../StatusBadge/StatusBadge';

const useStyles = makeStyles(theme => ({
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(2),
  },
  actions: {
    display: 'flex',
    gap: theme.spacing(1),
  },
  rowActions: {
    display: 'flex',
    gap: theme.spacing(1),
  },
  validationResult: {
    marginTop: theme.spacing(2),
    padding: theme.spacing(2),
    borderRadius: theme.shape.borderRadius,
  },
  validSuccess: {
    backgroundColor: 'rgba(76, 175, 80, 0.08)',
    border: '1px solid rgba(76, 175, 80, 0.3)',
  },
  validError: {
    backgroundColor: 'rgba(244, 67, 54, 0.08)',
    border: '1px solid rgba(244, 67, 54, 0.3)',
  },
}));

type IdPRow = {
  id: string;
  name: string;
  displayName: string;
  type: string;
  issuerURL: string;
  phase: string;
};

export const IdentityProvidersPage = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const [providers, setProviders] = useState<IdentityProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();

  // Delete dialog state
  const [deleteTarget, setDeleteTarget] = useState<IdentityProvider | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  // Validate state
  const [validating, setValidating] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<{
    name: string;
    valid: boolean;
    message: string;
  } | null>(null);

  const fetchProviders = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await api.listIdentityProviders();
      setProviders(response.identityProviders || []);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteIdentityProvider(deleteTarget.metadata.name);
      setDeleteTarget(null);
      fetchProviders();
    } catch (e) {
      // Could show error in dialog
      setDeleting(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleValidate = async (name: string) => {
    setValidating(name);
    setValidationResult(null);
    try {
      const result = await api.validateIdentityProvider(name);
      setValidationResult({
        name,
        valid: result.valid,
        message: result.message,
      });
    } catch (e) {
      setValidationResult({
        name,
        valid: false,
        message: e instanceof Error ? e.message : 'Validation failed.',
      });
    } finally {
      setValidating(null);
    }
  };

  if (loading) {
    return <Progress />;
  }

  if (error) {
    return (
      <EmptyState
        title="Failed to load identity providers"
        description={error.message}
        missing="info"
      />
    );
  }

  const columns: TableColumn<IdPRow>[] = [
    {
      title: 'Name',
      field: 'name',
    },
    {
      title: 'Display Name',
      field: 'displayName',
    },
    {
      title: 'Type',
      field: 'type',
      render: (row: IdPRow) => (
        <Chip
          label={row.type.toUpperCase()}
          size="small"
          variant="outlined"
        />
      ),
    },
    {
      title: 'Issuer URL',
      field: 'issuerURL',
      render: (row: IdPRow) => (
        <Typography variant="body2" noWrap style={{ maxWidth: 300 }}>
          {row.issuerURL}
        </Typography>
      ),
    },
    {
      title: 'Status',
      field: 'phase',
      render: (row: IdPRow) => <StatusBadge status={row.phase} />,
    },
    {
      title: 'Actions',
      field: 'id',
      render: (row: IdPRow) => {
        const provider = providers.find(
          p => p.metadata.name === row.name,
        );
        return (
          <div className={classes.rowActions}>
            <Button
              size="small"
              color="primary"
              startIcon={<CheckCircleIcon />}
              onClick={() => handleValidate(row.name)}
              disabled={validating === row.name}
            >
              {validating === row.name ? 'Validating...' : 'Validate'}
            </Button>
            <Button
              size="small"
              color="secondary"
              startIcon={<DeleteIcon />}
              onClick={() => provider && setDeleteTarget(provider)}
            >
              Delete
            </Button>
          </div>
        );
      },
    },
  ];

  const data: IdPRow[] = providers.map(provider => ({
    id: provider.metadata.name,
    name: provider.metadata.name,
    displayName: provider.spec.displayName || provider.metadata.name,
    type: provider.spec.type,
    issuerURL: provider.spec.oidc?.issuerURL || 'N/A',
    phase: provider.status?.phase || 'Unknown',
  }));

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
        <Typography variant="h4">Identity Providers</Typography>
        <div className={classes.actions}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={fetchProviders}
          >
            Refresh
          </Button>
          <Link to="./create" style={{ textDecoration: 'none' }}>
            <Button
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
            >
              Add Provider
            </Button>
          </Link>
        </div>
      </div>

      {/* Validation Result Banner */}
      {validationResult && (
        <Box
          className={`${classes.validationResult} ${
            validationResult.valid
              ? classes.validSuccess
              : classes.validError
          }`}
          mb={2}
        >
          <Typography
            variant="subtitle2"
            color={validationResult.valid ? 'primary' : 'error'}
          >
            Validation Result for "{validationResult.name}"
          </Typography>
          <Typography variant="body2">{validationResult.message}</Typography>
        </Box>
      )}

      {providers.length === 0 ? (
        <EmptyState
          title="No identity providers configured"
          description="Add an identity provider to enable SSO authentication for your platform."
          missing="content"
          action={
            <Link to="./create" style={{ textDecoration: 'none' }}>
              <Button
                variant="contained"
                color="primary"
                startIcon={<AddIcon />}
              >
                Add Provider
              </Button>
            </Link>
          }
        />
      ) : (
        <Table<IdPRow>
          title={`Identity Providers (${providers.length})`}
          options={{
            search: true,
            paging: providers.length > 20,
            pageSize: 20,
            padding: 'dense',
          }}
          columns={columns}
          data={data}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Delete Identity Provider</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the identity provider{' '}
            <strong>
              {deleteTarget?.spec.displayName || deleteTarget?.metadata.name}
            </strong>
            ?
          </Typography>
          <Typography
            variant="body2"
            color="error"
            style={{ marginTop: 8 }}
          >
            This action cannot be undone. Users authenticating through this
            provider will no longer be able to log in.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setDeleteTarget(null)}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDelete}
            color="secondary"
            variant="contained"
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};
