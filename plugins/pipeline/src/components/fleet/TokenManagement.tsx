// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useCallback } from 'react';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Button,
  IconButton,
  Tooltip,
  Typography,
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Paper,
  MenuItem,
  TableContainer,
} from '@material-ui/core';
import { makeStyles, Theme, createStyles } from '@material-ui/core/styles';
import AddIcon from '@material-ui/icons/Add';
import DeleteIcon from '@material-ui/icons/Delete';
import FileCopyIcon from '@material-ui/icons/FileCopy';
import RefreshIcon from '@material-ui/icons/Refresh';
import { Progress, WarningPanel, InfoCard } from '@backstage/core-components';
import { usePipelineApi } from '../../hooks/usePipelineApi';
import { usePipelineTeam } from '../../hooks/usePipelineTeam';
import { hasMinRole } from '@internal/plugin-pipeline-common';
import type { FleetToken } from '../../api/types/fleet';

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    toolbar: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: theme.spacing(2),
    },
    tokenDisplay: {
      padding: theme.spacing(2),
      backgroundColor: theme.palette.type === 'dark' ? '#1e1e1e' : '#f5f5f5',
      borderRadius: theme.shape.borderRadius,
      fontFamily: 'monospace',
      fontSize: '0.85rem',
      wordBreak: 'break-all',
      marginTop: theme.spacing(2),
    },
    revokedRow: {
      opacity: 0.5,
    },
    prefix: {
      fontFamily: 'monospace',
      fontSize: '0.85rem',
    },
    warning: {
      color: theme.palette.warning?.main ?? '#ff9800',
      marginTop: theme.spacing(1),
    },
  }),
);

export function TokenManagement() {
  const classes = useStyles();
  const api = usePipelineApi();
  const { teams, activeTeam, activeRole, isPlatformAdmin } = usePipelineTeam();
  const isAdminMode = isPlatformAdmin && !activeTeam;
  const canManageTokens = isAdminMode || (!!activeRole && hasMinRole(activeRole, 'admin'));
  const [tokens, setTokens] = useState<FleetToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [tokenName, setTokenName] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadTokens = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.listFleetTokens();
      setTokens(result.items);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  const handleCreate = async () => {
    if (!tokenName.trim()) return;
    if (isAdminMode && !selectedTeam) return;
    setCreating(true);
    try {
      const result = await api.createFleetToken({
        name: tokenName.trim(),
        team: isAdminMode ? selectedTeam : undefined,
      });
      setNewToken(result.token || null);
      setTokenName('');
      setSelectedTeam('');
      loadTokens();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (token: FleetToken) => {
    if (!window.confirm(`Revoke token "${token.name}"? Agents using this token will lose access.`)) return;
    try {
      await api.revokeFleetToken(token.id);
      loadTokens();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCopy = () => {
    if (newToken) {
      navigator.clipboard.writeText(newToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (error) {
    // Admin role required — show a friendlier message than a warning panel
    if (error.message?.includes('Insufficient role') || error.message?.includes('FORBIDDEN')) {
      return (
        <InfoCard title="Fleet Tokens">
          <Typography color="textSecondary" align="center">
            Token management requires admin access.
          </Typography>
        </InfoCard>
      );
    }
    return <WarningPanel title="Failed to load tokens" message={error.message} />;
  }

  return (
    <InfoCard title="Fleet Tokens">
      <Box className={classes.toolbar}>
        <Typography variant="body2" color="textSecondary">
          {tokens.filter(t => !t.revoked_at).length} active token{tokens.filter(t => !t.revoked_at).length !== 1 ? 's' : ''}
        </Typography>
        <Box>
          <Tooltip title="Refresh">
            <IconButton onClick={loadTokens} size="small">
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          {canManageTokens && (
            <Button
              variant="contained"
              color="primary"
              size="small"
              startIcon={<AddIcon />}
              onClick={() => setCreateOpen(true)}
            >
              Create Token
            </Button>
          )}
        </Box>
      </Box>
      {loading ? (
        <Progress />
      ) : tokens.length === 0 ? (
        <Typography color="textSecondary" align="center">
          No tokens created yet. Create a token to authenticate fleet agents.
        </Typography>
      ) : (
        <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              {isAdminMode && <TableCell>Team</TableCell>}
              <TableCell>Prefix</TableCell>
              <TableCell>Created By</TableCell>
              <TableCell>Created</TableCell>
              <TableCell>Expires</TableCell>
              <TableCell>Status</TableCell>
              {canManageTokens && <TableCell align="right">Actions</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {tokens.map(token => (
              <TableRow
                key={token.id}
                hover
                className={token.revoked_at ? classes.revokedRow : undefined}
              >
                <TableCell>{token.name}</TableCell>
                {isAdminMode && <TableCell>{token.team}</TableCell>}
                <TableCell>
                  <span className={classes.prefix}>{token.token_prefix}...</span>
                </TableCell>
                <TableCell>{token.created_by}</TableCell>
                <TableCell>{new Date(token.created_at).toLocaleDateString()}</TableCell>
                <TableCell>
                  {token.expires_at
                    ? new Date(token.expires_at).toLocaleDateString()
                    : 'Never'}
                </TableCell>
                <TableCell>
                  {token.revoked_at ? (
                    <Typography variant="body2" color="error">Revoked</Typography>
                  ) : (
                    <Typography variant="body2" style={{ color: '#4caf50' }}>Active</Typography>
                  )}
                </TableCell>
                {canManageTokens && (
                  <TableCell align="right">
                    {!token.revoked_at && (
                      <Button
                        size="small"
                        color="secondary"
                        startIcon={<DeleteIcon />}
                        onClick={() => handleRevoke(token)}
                      >
                        Revoke
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </TableContainer>
      )}

      {/* Create Token Dialog */}
      <Dialog
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setNewToken(null);
          setCopied(false);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create Fleet Token</DialogTitle>
        <DialogContent>
          {newToken ? (
            <>
              <Typography variant="body1" gutterBottom>
                Token created successfully. Copy it now -- it will not be shown again.
              </Typography>
              <Paper className={classes.tokenDisplay}>{newToken}</Paper>
              <Button
                startIcon={<FileCopyIcon />}
                onClick={handleCopy}
                style={{ marginTop: 8 }}
              >
                {copied ? 'Copied!' : 'Copy to clipboard'}
              </Button>
              <Typography variant="body2" className={classes.warning}>
                Store this token securely. It cannot be retrieved after closing this dialog.
              </Typography>
            </>
          ) : (
            <>
              {isAdminMode && (
                <TextField
                  select
                  label="Team"
                  value={selectedTeam}
                  onChange={e => setSelectedTeam(e.target.value)}
                  fullWidth
                  variant="outlined"
                  size="small"
                  style={{ marginBottom: 16 }}
                  helperText="Admin mode: select which team this token belongs to"
                >
                  {teams.map(t => (
                    <MenuItem key={t} value={t}>{t}</MenuItem>
                  ))}
                </TextField>
              )}
              <TextField
                label="Token Name"
                value={tokenName}
                onChange={e => setTokenName(e.target.value)}
                fullWidth
                variant="outlined"
                size="small"
                placeholder="e.g. production-agents"
                autoFocus
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          {newToken ? (
            <Button
              onClick={() => {
                setCreateOpen(false);
                setNewToken(null);
                setCopied(false);
              }}
              color="primary"
            >
              Done
            </Button>
          ) : (
            <>
              <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button
                onClick={handleCreate}
                color="primary"
                variant="contained"
                disabled={creating || !tokenName.trim() || (isAdminMode && !selectedTeam)}
              >
                {creating ? 'Creating...' : 'Create'}
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>
    </InfoCard>
  );
}
