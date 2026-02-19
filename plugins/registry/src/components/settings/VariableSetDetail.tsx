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
  MenuItem,
  FormControlLabel,
  Checkbox,
  makeStyles,
} from '@material-ui/core';
import AddIcon from '@material-ui/icons/Add';
import DeleteIcon from '@material-ui/icons/Delete';
import EditIcon from '@material-ui/icons/Edit';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import { Progress, EmptyState } from '@backstage/core-components';
import { useParams, useNavigate } from 'react-router-dom';
import { useRegistryApi } from '../../hooks/useRegistryApi';
import type { VariableSet, VariableSetEntry, VariableCategory } from '../../api/types/variableSets';

const useStyles = makeStyles(theme => ({
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(2),
  },
  backButton: {
    marginRight: theme.spacing(1),
  },
  sensitiveValue: {
    fontStyle: 'italic',
    color: theme.palette.text.secondary,
  },
  field: {
    marginBottom: theme.spacing(2),
  },
}));

export function VariableSetDetail() {
  const classes = useStyles();
  const api = useRegistryApi();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [variableSet, setVariableSet] = useState<VariableSet | null>(null);
  const [entries, setEntries] = useState<VariableSetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<Partial<VariableSetEntry>>({});
  const [isNew, setIsNew] = useState(false);

  const fetchData = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const [vsData, entriesData] = await Promise.all([
        api.getVariableSet(id),
        api.listVariableSetEntries(id),
      ]);
      setVariableSet(vsData);
      setEntries(entriesData.entries);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load variable set',
      );
    } finally {
      setLoading(false);
    }
  }, [api, id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openNewEntry = () => {
    setEditEntry({
      key: '',
      value: '',
      sensitive: false,
      hcl: false,
      category: 'terraform',
      description: null,
      ci_secret_name: null,
    });
    setIsNew(true);
    setEditOpen(true);
  };

  const openEditEntry = (entry: VariableSetEntry) => {
    setEditEntry({ ...entry });
    setIsNew(false);
    setEditOpen(true);
  };

  const handleSaveEntry = async () => {
    if (!id || !editEntry.key) return;
    try {
      const updated = isNew
        ? [...entries, editEntry as VariableSetEntry]
        : entries.map(e => (e.key === editEntry.key && e.category === editEntry.category ? editEntry as VariableSetEntry : e));
      await api.updateVariableSetEntries(id, updated);
      setEditOpen(false);
      fetchData();
    } catch {
      // Could show snackbar
    }
  };

  const handleDeleteEntry = async (key: string) => {
    if (!id) return;
    try {
      await api.deleteVariableSetEntry(id, key);
      fetchData();
    } catch {
      // Could show snackbar
    }
  };

  if (loading) return <Progress />;

  if (error || !variableSet) {
    return (
      <EmptyState
        title="Failed to load variable set"
        description={error ?? 'Not found'}
        missing="data"
        action={
          <Button variant="outlined" onClick={fetchData}>
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <Box>
      <Box className={classes.header}>
        <Box display="flex" alignItems="center">
          <IconButton
            className={classes.backButton}
            onClick={() => navigate('..')}
            size="small"
          >
            <ArrowBackIcon />
          </IconButton>
          <Box>
            <Typography variant="h6">{variableSet.name}</Typography>
            {variableSet.description && (
              <Typography variant="body2" color="textSecondary">
                {variableSet.description}
              </Typography>
            )}
          </Box>
        </Box>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={openNewEntry}
        >
          Add Entry
        </Button>
      </Box>

      {entries.length === 0 ? (
        <EmptyState
          title="No entries"
          description="Add variables to this set."
          missing="data"
          action={
            <Button variant="contained" color="primary" onClick={openNewEntry}>
              Add Entry
            </Button>
          }
        />
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Key</TableCell>
                <TableCell>Value</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Sensitive</TableCell>
                <TableCell>HCL</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map(entry => (
                <TableRow key={`${entry.key}-${entry.category}`}>
                  <TableCell>
                    <Typography variant="body2">
                      <code>{entry.key}</code>
                    </Typography>
                    {entry.description && (
                      <Typography variant="caption" color="textSecondary">
                        {entry.description}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {entry.sensitive ? (
                      <Typography className={classes.sensitiveValue}>
                        {entry.ci_secret_name
                          ? `CI secret: ${entry.ci_secret_name}`
                          : '(sensitive)'}
                      </Typography>
                    ) : (
                      <code>{entry.value ?? ''}</code>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip label={entry.category} size="small" />
                  </TableCell>
                  <TableCell>
                    {entry.sensitive && (
                      <Chip label="Yes" size="small" color="secondary" />
                    )}
                  </TableCell>
                  <TableCell>
                    {entry.hcl && <Chip label="HCL" size="small" />}
                  </TableCell>
                  <TableCell>
                    <Tooltip title="Edit">
                      <IconButton
                        size="small"
                        onClick={() => openEditEntry(entry)}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        onClick={() => handleDeleteEntry(entry.key)}
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
        open={editOpen}
        onClose={() => setEditOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {isNew ? 'Add Entry' : `Edit: ${editEntry.key}`}
        </DialogTitle>
        <DialogContent>
          <TextField
            className={classes.field}
            fullWidth
            variant="outlined"
            label="Key"
            value={editEntry.key ?? ''}
            onChange={e =>
              setEditEntry(prev => ({ ...prev, key: e.target.value }))
            }
            margin="normal"
            disabled={!isNew}
            required
          />
          <TextField
            className={classes.field}
            fullWidth
            variant="outlined"
            label="Category"
            value={editEntry.category ?? 'terraform'}
            onChange={e =>
              setEditEntry(prev => ({
                ...prev,
                category: e.target.value as VariableCategory,
              }))
            }
            margin="normal"
            select
          >
            <MenuItem value="terraform">Terraform</MenuItem>
            <MenuItem value="env">Environment</MenuItem>
          </TextField>
          <FormControlLabel
            control={
              <Checkbox
                checked={editEntry.sensitive ?? false}
                onChange={e =>
                  setEditEntry(prev => ({
                    ...prev,
                    sensitive: e.target.checked,
                  }))
                }
              />
            }
            label="Sensitive"
          />
          {editEntry.sensitive ? (
            <TextField
              className={classes.field}
              fullWidth
              variant="outlined"
              label="CI Secret Name"
              value={editEntry.ci_secret_name ?? ''}
              onChange={e =>
                setEditEntry(prev => ({
                  ...prev,
                  ci_secret_name: e.target.value,
                }))
              }
              margin="normal"
              placeholder="e.g. AWS_SECRET_ACCESS_KEY"
              helperText="Name of the secret in your CI system"
            />
          ) : (
            <TextField
              className={classes.field}
              fullWidth
              variant="outlined"
              label="Value"
              value={editEntry.value ?? ''}
              onChange={e =>
                setEditEntry(prev => ({ ...prev, value: e.target.value }))
              }
              margin="normal"
              multiline
              rows={2}
            />
          )}
          <FormControlLabel
            control={
              <Checkbox
                checked={editEntry.hcl ?? false}
                onChange={e =>
                  setEditEntry(prev => ({ ...prev, hcl: e.target.checked }))
                }
              />
            }
            label="HCL expression"
          />
          <TextField
            className={classes.field}
            fullWidth
            variant="outlined"
            label="Description"
            value={editEntry.description ?? ''}
            onChange={e =>
              setEditEntry(prev => ({
                ...prev,
                description: e.target.value || null,
              }))
            }
            margin="normal"
            placeholder="Optional description"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleSaveEntry}
            disabled={!editEntry.key}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
