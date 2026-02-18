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
  TextField,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
  Checkbox,
  MenuItem,
  makeStyles,
} from '@material-ui/core';
import AddIcon from '@material-ui/icons/Add';
import EditIcon from '@material-ui/icons/Edit';
import DeleteIcon from '@material-ui/icons/Delete';
import { Progress, EmptyState } from '@backstage/core-components';
import { useRegistryApi } from '../../hooks/useRegistryApi';
import type { ModuleVariable } from '../../api/types/environments';

const useStyles = makeStyles(theme => ({
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(2),
  },
  maskedValue: {
    fontFamily: 'monospace',
    color: theme.palette.text.disabled,
  },
  varValue: {
    fontFamily: 'monospace',
    fontSize: '0.85rem',
    maxWidth: 300,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
}));

interface ModuleVariablesEditorProps {
  envId: string;
  moduleId: string;
}

export function ModuleVariablesEditor({
  envId,
  moduleId,
}: ModuleVariablesEditorProps) {
  const classes = useStyles();
  const api = useRegistryApi();

  const [variables, setVariables] = useState<ModuleVariable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editKey, setEditKey] = useState('');
  const [editValue, setEditValue] = useState('');
  const [editSensitive, setEditSensitive] = useState(false);
  const [editHcl, setEditHcl] = useState(false);
  const [editCategory, setEditCategory] = useState<'terraform' | 'env'>('terraform');
  const [editDescription, setEditDescription] = useState('');
  const [editSecretRef, setEditSecretRef] = useState('');
  const [editingExisting, setEditingExisting] = useState(false);

  const fetchVariables = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.listModuleVariables(envId, moduleId);
      setVariables(data.variables);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load variables',
      );
    } finally {
      setLoading(false);
    }
  }, [api, envId, moduleId]);

  useEffect(() => {
    fetchVariables();
  }, [fetchVariables]);

  const openAddDialog = () => {
    setEditKey('');
    setEditValue('');
    setEditSensitive(false);
    setEditHcl(false);
    setEditCategory('terraform');
    setEditDescription('');
    setEditSecretRef('');
    setEditingExisting(false);
    setEditOpen(true);
  };

  const openEditDialog = (v: ModuleVariable) => {
    setEditKey(v.key);
    setEditValue(v.value ?? '');
    setEditSensitive(v.sensitive);
    setEditHcl(v.hcl);
    setEditCategory(v.category);
    setEditDescription(v.description ?? '');
    setEditSecretRef(v.secret_ref ?? '');
    setEditingExisting(true);
    setEditOpen(true);
  };

  const handleSave = async () => {
    try {
      const updated: ModuleVariable[] = editingExisting
        ? variables.map(v =>
            v.key === editKey && v.category === editCategory
              ? {
                  ...v,
                  value: editSensitive ? null : editValue,
                  sensitive: editSensitive,
                  hcl: editHcl,
                  description: editDescription || null,
                  secret_ref: editSensitive ? editSecretRef || null : null,
                }
              : v,
          )
        : [
            ...variables,
            {
              id: '',
              module_id: moduleId,
              key: editKey,
              value: editSensitive ? null : editValue,
              sensitive: editSensitive,
              hcl: editHcl,
              category: editCategory,
              description: editDescription || null,
              secret_ref: editSensitive ? editSecretRef || null : null,
            },
          ];

      await api.updateModuleVariables(envId, moduleId, updated);
      setEditOpen(false);
      fetchVariables();
    } catch {
      // Silent
    }
  };

  const handleDelete = async (key: string, category?: string) => {
    try {
      await api.deleteModuleVariable(envId, moduleId, key, category);
      fetchVariables();
    } catch {
      // Silent
    }
  };

  if (loading) return <Progress />;

  if (error) {
    return (
      <EmptyState
        title="Failed to load variables"
        description={error}
        missing="data"
        action={
          <Button variant="outlined" onClick={fetchVariables}>
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <>
      <Box className={classes.header}>
        <Typography variant="subtitle1">
          Variables ({variables.length})
        </Typography>
        <Button
          variant="outlined"
          size="small"
          startIcon={<AddIcon />}
          onClick={openAddDialog}
        >
          Add Variable
        </Button>
      </Box>

      {variables.length === 0 ? (
        <EmptyState
          title="No variables configured"
          description="Add Terraform variables and environment variables for this module."
          missing="data"
          action={
            <Button
              variant="contained"
              color="primary"
              onClick={openAddDialog}
            >
              Add Variable
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
                <TableCell>Flags</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {variables.map(v => (
                <TableRow key={`${v.category}-${v.key}`}>
                  <TableCell>
                    <code>{v.key}</code>
                  </TableCell>
                  <TableCell>
                    {v.sensitive ? (
                      <span className={classes.maskedValue}>
                        {v.secret_ref
                          ? `secret:${v.secret_ref}`
                          : '********'}
                      </span>
                    ) : (
                      <span className={classes.varValue}>
                        {v.value || '-'}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={v.category}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    {v.sensitive && (
                      <Chip label="sensitive" size="small" color="secondary" />
                    )}
                    {v.hcl && (
                      <Chip
                        label="HCL"
                        size="small"
                        variant="outlined"
                        style={{ marginLeft: 4 }}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <IconButton
                      size="small"
                      onClick={() => openEditDialog(v)}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleDelete(v.key, v.category)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
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
          {editingExisting ? 'Edit Variable' : 'Add Variable'}
        </DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            variant="outlined"
            label="Key"
            value={editKey}
            onChange={e => setEditKey(e.target.value)}
            margin="normal"
            size="small"
            disabled={editingExisting}
            placeholder="e.g. vpc_cidr, AWS_REGION"
          />
          <TextField
            select
            fullWidth
            variant="outlined"
            label="Category"
            value={editCategory}
            onChange={e =>
              setEditCategory(e.target.value as 'terraform' | 'env')
            }
            margin="normal"
            size="small"
            disabled={editingExisting}
          >
            <MenuItem value="terraform">Terraform (TF_VAR_*)</MenuItem>
            <MenuItem value="env">Environment Variable</MenuItem>
          </TextField>
          <FormControlLabel
            control={
              <Checkbox
                checked={editSensitive}
                onChange={e => setEditSensitive(e.target.checked)}
              />
            }
            label="Sensitive (value will be masked)"
          />
          {editSensitive ? (
            <TextField
              fullWidth
              variant="outlined"
              label="Secret Reference"
              value={editSecretRef}
              onChange={e => setEditSecretRef(e.target.value)}
              margin="normal"
              size="small"
              placeholder="namespace/secret-name:key"
              helperText="K8s Secret reference (PeaaS) or CI secret name (BYOC)"
            />
          ) : (
            <TextField
              fullWidth
              variant="outlined"
              label="Value"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              margin="normal"
              size="small"
              multiline
              rows={3}
            />
          )}
          <FormControlLabel
            control={
              <Checkbox
                checked={editHcl}
                onChange={e => setEditHcl(e.target.checked)}
              />
            }
            label="HCL expression (interpret value as HCL)"
          />
          <TextField
            fullWidth
            variant="outlined"
            label="Description (optional)"
            value={editDescription}
            onChange={e => setEditDescription(e.target.value)}
            margin="normal"
            size="small"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleSave}
            disabled={!editKey}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
