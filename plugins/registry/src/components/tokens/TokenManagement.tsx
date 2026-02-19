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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Chip,
  makeStyles,
} from '@material-ui/core';
import AddIcon from '@material-ui/icons/Add';
import DeleteIcon from '@material-ui/icons/Delete';
import FileCopyIcon from '@material-ui/icons/FileCopy';
import { Progress, EmptyState } from '@backstage/core-components';
import { useRegistryApi } from '../../hooks/useRegistryApi';
import { useRegistryTeam } from '../../hooks/useRegistryTeam';
import { hasMinRole } from '@internal/plugin-registry-common';
import { AdminTokensView } from './AdminTokensView';
import type { RegistryToken, TokenScope } from '../../api/types/tokens';

const useStyles = makeStyles(theme => ({
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(2),
  },
  tokenDisplay: {
    backgroundColor: theme.palette.background.default,
    padding: theme.spacing(2),
    borderRadius: theme.shape.borderRadius,
    fontFamily: 'monospace',
    wordBreak: 'break-all',
    marginTop: theme.spacing(1),
  },
  revokedRow: {
    opacity: 0.5,
  },
}));

export function TokenManagement() {
  const classes = useStyles();
  const api = useRegistryApi();
  const { activeTeam, activeRole, isPlatformAdmin } = useRegistryTeam();
  const isAdminMode = !activeTeam && isPlatformAdmin;
  const canManageTokens = hasMinRole(activeRole, 'admin');

  const [tokens, setTokens] = useState<RegistryToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [tokenName, setTokenName] = useState('');
  const [scopes, setScopes] = useState<Set<TokenScope>>(new Set(['read']));

  const fetchTokens = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.listTokens();
      setTokens(data.tokens);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tokens');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  const handleCreate = async () => {
    try {
      const result = await api.createToken({
        name: tokenName,
        scopes: Array.from(scopes),
      });
      setNewToken(result.secretValue);
      setTokenName('');
      setScopes(new Set(['read']));
      fetchTokens();
    } catch (err) {
      // Keep dialog open on error
    }
  };

  const handleRevoke = async (tokenId: string) => {
    try {
      await api.revokeToken(tokenId);
      fetchTokens();
    } catch (err) {
      // Silent — could show snackbar
    }
  };

  const toggleScope = (scope: TokenScope) => {
    setScopes(prev => {
      const next = new Set(prev);
      if (next.has(scope)) {
        next.delete(scope);
      } else {
        next.add(scope);
      }
      return next;
    });
  };

  if (isAdminMode) {
    return <AdminTokensView />;
  }

  if (loading) return <Progress />;

  if (error) {
    return (
      <EmptyState
        title="Failed to load tokens"
        description={error}
        missing="data"
        action={
          <Button variant="outlined" onClick={fetchTokens}>
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <>
      <Box className={classes.header}>
        <Typography variant="h6">Registry Tokens</Typography>
        {canManageTokens && (
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={() => {
              setNewToken(null);
              setCreateOpen(true);
            }}
          >
            Create Token
          </Button>
        )}
      </Box>

      {tokens.length === 0 ? (
        <EmptyState
          title="No registry tokens"
          description={canManageTokens
            ? 'Create a registry token to authenticate CLI and CI tools against the artifact registry.'
            : 'No registry tokens have been created yet. Contact a team admin to create one.'}
          missing="data"
          action={canManageTokens ? (
            <Button
              variant="contained"
              color="primary"
              onClick={() => setCreateOpen(true)}
            >
              Create Token
            </Button>
          ) : undefined}
        />
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Prefix</TableCell>
                <TableCell>Scopes</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Last Used</TableCell>
                <TableCell>Expires</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tokens.map(token => (
                <TableRow
                  key={token.id}
                  className={token.revoked_at ? classes.revokedRow : undefined}
                >
                  <TableCell>{token.name}</TableCell>
                  <TableCell>
                    <code>{token.token_prefix}...</code>
                  </TableCell>
                  <TableCell>
                    {token.scopes.map(s => (
                      <Chip key={s} label={s} size="small" style={{ marginRight: 4 }} />
                    ))}
                  </TableCell>
                  <TableCell>
                    {new Date(token.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {token.last_used_at
                      ? new Date(token.last_used_at).toLocaleDateString()
                      : 'Never'}
                  </TableCell>
                  <TableCell>
                    {token.expires_at
                      ? new Date(token.expires_at).toLocaleDateString()
                      : 'Never'}
                  </TableCell>
                  <TableCell>
                    {!token.revoked_at && canManageTokens && (
                      <Button
                        size="small"
                        color="secondary"
                        startIcon={<DeleteIcon />}
                        onClick={() => handleRevoke(token.id)}
                      >
                        Revoke
                      </Button>
                    )}
                    {token.revoked_at && (
                      <Chip label="Revoked" size="small" color="secondary" />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {newToken ? 'Token Created' : 'Create API Token'}
        </DialogTitle>
        <DialogContent>
          {newToken ? (
            <>
              <Typography gutterBottom>
                Copy this token now. It will not be shown again.
              </Typography>
              <Box className={classes.tokenDisplay}>{newToken}</Box>
              <Button
                size="small"
                startIcon={<FileCopyIcon />}
                onClick={() => navigator.clipboard.writeText(newToken)}
                style={{ marginTop: 8 }}
              >
                Copy to Clipboard
              </Button>
            </>
          ) : (
            <>
              <TextField
                fullWidth
                variant="outlined"
                label="Token Name"
                value={tokenName}
                onChange={e => setTokenName(e.target.value)}
                margin="normal"
                placeholder="e.g. CI Pipeline Token"
              />
              <Typography
                variant="subtitle2"
                style={{ marginTop: 16, marginBottom: 8 }}
              >
                Scopes
              </Typography>
              <FormGroup row>
                {(['read', 'write', 'admin'] as TokenScope[]).map(scope => (
                  <FormControlLabel
                    key={scope}
                    control={
                      <Checkbox
                        checked={scopes.has(scope)}
                        onChange={() => toggleScope(scope)}
                      />
                    }
                    label={scope}
                  />
                ))}
              </FormGroup>
            </>
          )}
        </DialogContent>
        <DialogActions>
          {newToken ? (
            <Button onClick={() => setCreateOpen(false)}>Done</Button>
          ) : (
            <>
              <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button
                variant="contained"
                color="primary"
                onClick={handleCreate}
                disabled={!tokenName || scopes.size === 0}
              >
                Create
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
}
