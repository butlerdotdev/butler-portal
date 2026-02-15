// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState, useCallback } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { Progress, EmptyState } from '@backstage/core-components';
import {
  Typography,
  Button,
  Box,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import { Alert } from '@material-ui/lab';
import AddIcon from '@material-ui/icons/Add';
import DeleteIcon from '@material-ui/icons/Delete';
import { butlerApiRef } from '@internal/plugin-butler';
import type { SSHKeyEntry } from '@internal/plugin-butler';

const useStyles = makeStyles(theme => ({
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(3),
  },
  fingerprint: {
    fontFamily: 'monospace',
    fontSize: '0.8rem',
  },
}));

export const SSHKeysSettings = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);

  const [keys, setKeys] = useState<SSHKeyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();

  // Add dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addPublicKey, setAddPublicKey] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Delete in-progress
  const [deletingFingerprint, setDeletingFingerprint] = useState<
    string | null
  >(null);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await api.listSSHKeys();
      setKeys(response.sshKeys || []);
    } catch (e) {
      // Treat 404 as empty — user has no keys yet
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('404') || msg.includes('Not Found')) {
        setKeys([]);
      } else {
        setError(e instanceof Error ? e : new Error(msg));
      }
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleAdd = async () => {
    if (!addName.trim() || !addPublicKey.trim()) {
      setAddError('Name and public key are required.');
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      await api.addSSHKey({
        name: addName.trim(),
        publicKey: addPublicKey.trim(),
      });
      setAddOpen(false);
      setAddName('');
      setAddPublicKey('');
      await fetchKeys();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to add SSH key.';
      if (msg.includes('user not found') || msg.includes('404')) {
        setAddError(
          'User profile not found. Your platform admin may need to create your user account before SSH keys can be stored.',
        );
      } else {
        setAddError(msg);
      }
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (fingerprint: string) => {
    setDeletingFingerprint(fingerprint);
    try {
      await api.removeSSHKey(fingerprint);
      await fetchKeys();
    } catch {
      // Silent
    } finally {
      setDeletingFingerprint(null);
    }
  };

  if (loading) {
    return <Progress />;
  }

  if (error) {
    return (
      <EmptyState
        title="Failed to load SSH keys"
        description={error.message}
        missing="info"
      />
    );
  }

  return (
    <div>
      <div className={classes.headerRow}>
        <div>
          <Typography variant="h5">SSH Keys</Typography>
          <Typography variant="body2" color="textSecondary">
            Manage SSH keys used to connect to your workspaces.
          </Typography>
        </div>
        <Button
          variant="contained"
          color="primary"
          size="small"
          startIcon={<AddIcon />}
          onClick={() => {
            setAddName('');
            setAddPublicKey('');
            setAddError(null);
            setAddOpen(true);
          }}
        >
          Add SSH Key
        </Button>
      </div>

      {keys.length === 0 ? (
        <EmptyState
          title="No SSH keys"
          description="Add an SSH public key to enable SSH access to your workspaces."
          missing="content"
          action={
            <Button
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
              onClick={() => {
                setAddName('');
                setAddPublicKey('');
                setAddError(null);
                setAddOpen(true);
              }}
            >
              Add SSH Key
            </Button>
          }
        />
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Fingerprint</TableCell>
                <TableCell>Added</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {keys.map(key => (
                <TableRow key={key.fingerprint}>
                  <TableCell>
                    <Typography variant="body2" style={{ fontWeight: 500 }}>
                      {key.name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      className={classes.fingerprint}
                    >
                      {key.fingerprint}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="textSecondary">
                      {key.addedAt
                        ? new Date(key.addedAt).toLocaleDateString()
                        : '-'}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      onClick={() => handleDelete(key.fingerprint)}
                      disabled={
                        deletingFingerprint === key.fingerprint
                      }
                      aria-label="delete key"
                    >
                      {deletingFingerprint === key.fingerprint ? (
                        <CircularProgress size={16} />
                      ) : (
                        <DeleteIcon
                          fontSize="small"
                          style={{ color: '#f44336' }}
                        />
                      )}
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Add SSH Key Dialog */}
      <Dialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Add SSH Key</DialogTitle>
        <DialogContent>
          <Box mt={1}>
            <TextField
              label="Name"
              value={addName}
              onChange={e => setAddName(e.target.value)}
              fullWidth
              variant="outlined"
              size="small"
              required
              placeholder="My Laptop"
            />
          </Box>
          <Box mt={2}>
            <Box mb={1}>
              <Button
                variant="outlined"
                size="small"
                component="label"
                style={{ textTransform: 'none' }}
              >
                Load from file
                <input
                  type="file"
                  accept=".pub"
                  hidden
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) {
                      file.text().then(text =>
                        setAddPublicKey(text.trim()),
                      );
                    }
                    e.target.value = '';
                  }}
                />
              </Button>
            </Box>
            <TextField
              label="Public Key"
              value={addPublicKey}
              onChange={e => setAddPublicKey(e.target.value)}
              fullWidth
              variant="outlined"
              size="small"
              required
              placeholder="ssh-ed25519 AAAA... user@host"
              multiline
              minRows={3}
              InputProps={{
                style: { fontFamily: 'monospace', fontSize: '0.85rem' },
              }}
            />
          </Box>
          {addError && (
            <Box mt={2}>
              <Alert severity="error">{addError}</Alert>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)} disabled={adding}>
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            color="primary"
            variant="contained"
            disabled={adding || !addName.trim() || !addPublicKey.trim()}
            startIcon={
              adding ? (
                <CircularProgress size={16} color="inherit" />
              ) : undefined
            }
          >
            {adding ? 'Adding...' : 'Add Key'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};
