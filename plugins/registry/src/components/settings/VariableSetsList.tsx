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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControlLabel,
  Checkbox,
  makeStyles,
} from '@material-ui/core';
import AddIcon from '@material-ui/icons/Add';
import DeleteIcon from '@material-ui/icons/Delete';
import EditIcon from '@material-ui/icons/Edit';
import { Progress, EmptyState } from '@backstage/core-components';
import { useNavigate } from 'react-router-dom';
import { useRegistryApi } from '../../hooks/useRegistryApi';
import type { VariableSet } from '../../api/types/variableSets';

const useStyles = makeStyles(theme => ({
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(2),
  },
}));

export function VariableSetsList() {
  const classes = useStyles();
  const api = useRegistryApi();
  const navigate = useNavigate();

  const [sets, setSets] = useState<VariableSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newAutoAttach, setNewAutoAttach] = useState(false);

  const fetchSets = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.listVariableSets();
      setSets(data.variableSets);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load variable sets',
      );
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchSets();
  }, [fetchSets]);

  const handleCreate = async () => {
    try {
      await api.createVariableSet({
        name: newName,
        description: newDescription || undefined,
        auto_attach: newAutoAttach,
      });
      setCreateOpen(false);
      setNewName('');
      setNewDescription('');
      setNewAutoAttach(false);
      fetchSets();
    } catch {
      // Could show snackbar
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteVariableSet(id);
      fetchSets();
    } catch {
      // Could show snackbar
    }
  };

  if (loading) return <Progress />;

  if (error) {
    return (
      <EmptyState
        title="Failed to load variable sets"
        description={error}
        missing="data"
        action={
          <Button variant="outlined" onClick={fetchSets}>
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <>
      <Box className={classes.header}>
        <Typography variant="h6">Variable Sets</Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={() => setCreateOpen(true)}
        >
          New Variable Set
        </Button>
      </Box>

      {sets.length === 0 ? (
        <EmptyState
          title="No variable sets"
          description="Create a variable set to share variables across environments and modules."
          missing="data"
          action={
            <Button
              variant="contained"
              color="primary"
              onClick={() => setCreateOpen(true)}
            >
              New Variable Set
            </Button>
          }
        />
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Entries</TableCell>
                <TableCell>Auto-attach</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sets.map(vs => (
                <TableRow key={vs.id}>
                  <TableCell>
                    <Typography variant="body2">{vs.name}</Typography>
                    {vs.description && (
                      <Typography variant="caption" color="textSecondary">
                        {vs.description}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{vs.entry_count}</TableCell>
                  <TableCell>
                    {vs.auto_attach ? (
                      <Chip label="Yes" size="small" color="primary" />
                    ) : (
                      <Chip label="No" size="small" variant="outlined" />
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip label={vs.status} size="small" />
                  </TableCell>
                  <TableCell>
                    {new Date(vs.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Tooltip title="Edit entries">
                      <IconButton
                        size="small"
                        onClick={() => navigate(`variable-sets/${vs.id}`)}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        onClick={() => handleDelete(vs.id)}
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

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create Variable Set</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            variant="outlined"
            label="Name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            margin="normal"
            placeholder="e.g. common-tags"
            required
          />
          <TextField
            fullWidth
            variant="outlined"
            label="Description"
            value={newDescription}
            onChange={e => setNewDescription(e.target.value)}
            margin="normal"
            placeholder="Optional description"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={newAutoAttach}
                onChange={e => setNewAutoAttach(e.target.checked)}
              />
            }
            label="Auto-attach to all environments in team"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleCreate}
            disabled={!newName}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
