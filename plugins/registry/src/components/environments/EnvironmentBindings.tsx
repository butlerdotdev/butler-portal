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
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  makeStyles,
} from '@material-ui/core';
import AddIcon from '@material-ui/icons/Add';
import DeleteIcon from '@material-ui/icons/Delete';
import { useRegistryApi } from '../../hooks/useRegistryApi';
import { ProviderIcon } from '../settings/ProviderIcon';
import type { CloudIntegrationBinding } from '../../api/types/cloudIntegrations';
import type { VariableSetBinding } from '../../api/types/variableSets';
import type { CloudIntegration } from '../../api/types/cloudIntegrations';
import type { VariableSet } from '../../api/types/variableSets';

const useStyles = makeStyles(theme => ({
  section: {
    marginBottom: theme.spacing(3),
  },
  sectionTitle: {
    fontWeight: 600,
    marginBottom: theme.spacing(1),
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(1),
  },
}));

interface EnvironmentBindingsProps {
  envId: string;
}

export function EnvironmentBindings({ envId }: EnvironmentBindingsProps) {
  const classes = useStyles();
  const api = useRegistryApi();

  const [ciBindings, setCiBindings] = useState<CloudIntegrationBinding[]>([]);
  const [vsBindings, setVsBindings] = useState<VariableSetBinding[]>([]);
  const [allIntegrations, setAllIntegrations] = useState<CloudIntegration[]>([]);
  const [allVariableSets, setAllVariableSets] = useState<VariableSet[]>([]);
  const [bindCiOpen, setBindCiOpen] = useState(false);
  const [bindVsOpen, setBindVsOpen] = useState(false);
  const [selectedCiId, setSelectedCiId] = useState('');
  const [selectedVsId, setSelectedVsId] = useState('');
  const [ciPriority, setCiPriority] = useState(0);
  const [vsPriority, setVsPriority] = useState(0);

  const fetchBindings = useCallback(async () => {
    try {
      const [ci, vs] = await Promise.all([
        api.listEnvCloudIntegrations(envId),
        api.listEnvVariableSets(envId),
      ]);
      setCiBindings(ci.bindings);
      setVsBindings(vs.bindings);
    } catch {
      // Silent
    }
  }, [api, envId]);

  const fetchAvailable = useCallback(async () => {
    try {
      const [ci, vs] = await Promise.all([
        api.listCloudIntegrations(),
        api.listVariableSets(),
      ]);
      setAllIntegrations(ci.integrations);
      setAllVariableSets(vs.variableSets);
    } catch {
      // Silent
    }
  }, [api]);

  useEffect(() => {
    fetchBindings();
    fetchAvailable();
  }, [fetchBindings, fetchAvailable]);

  const handleBindCi = async () => {
    try {
      await api.bindCloudIntegrationToEnv(envId, selectedCiId, ciPriority);
      setBindCiOpen(false);
      setSelectedCiId('');
      setCiPriority(0);
      fetchBindings();
    } catch {
      // Could show snackbar
    }
  };

  const handleUnbindCi = async (bindingId: string) => {
    try {
      await api.unbindCloudIntegrationFromEnv(envId, bindingId);
      fetchBindings();
    } catch {
      // Silent
    }
  };

  const handleBindVs = async () => {
    try {
      await api.bindVariableSetToEnv(envId, selectedVsId, vsPriority);
      setBindVsOpen(false);
      setSelectedVsId('');
      setVsPriority(0);
      fetchBindings();
    } catch {
      // Could show snackbar
    }
  };

  const handleUnbindVs = async (bindingId: string) => {
    try {
      await api.unbindVariableSetFromEnv(envId, bindingId);
      fetchBindings();
    } catch {
      // Silent
    }
  };

  // Filter out already-bound items
  const availableCi = allIntegrations.filter(
    ci => !ciBindings.some(b => b.cloud_integration_id === ci.id),
  );
  const availableVs = allVariableSets.filter(
    vs => !vsBindings.some(b => b.variable_set_id === vs.id),
  );

  return (
    <>
      {/* Cloud Integrations */}
      <Box className={classes.section}>
        <Box className={classes.sectionHeader}>
          <Typography variant="subtitle1" className={classes.sectionTitle}>
            Cloud Integrations
          </Typography>
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setBindCiOpen(true)}
            disabled={availableCi.length === 0}
          >
            Bind Integration
          </Button>
        </Box>
        {ciBindings.length === 0 ? (
          <Typography variant="body2" color="textSecondary">
            No cloud integrations bound. Modules will not have cloud provider authentication.
          </Typography>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Provider</TableCell>
                  <TableCell>Auth Method</TableCell>
                  <TableCell>Priority</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {ciBindings.map(b => (
                  <TableRow key={b.id}>
                    <TableCell>{b.integration_name}</TableCell>
                    <TableCell>
                      <ProviderIcon provider={b.provider} />
                    </TableCell>
                    <TableCell>{b.auth_method}</TableCell>
                    <TableCell>{b.priority}</TableCell>
                    <TableCell>
                      <Tooltip title="Unbind">
                        <IconButton
                          size="small"
                          onClick={() => handleUnbindCi(b.id)}
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
      </Box>

      {/* Variable Sets */}
      <Box className={classes.section}>
        <Box className={classes.sectionHeader}>
          <Typography variant="subtitle1" className={classes.sectionTitle}>
            Variable Sets
          </Typography>
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setBindVsOpen(true)}
            disabled={availableVs.length === 0}
          >
            Bind Variable Set
          </Button>
        </Box>
        {vsBindings.length === 0 ? (
          <Typography variant="body2" color="textSecondary">
            No variable sets bound.
          </Typography>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Priority</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {vsBindings.map(b => (
                  <TableRow key={b.id}>
                    <TableCell>{b.set_name}</TableCell>
                    <TableCell>{b.priority}</TableCell>
                    <TableCell>
                      <Tooltip title="Unbind">
                        <IconButton
                          size="small"
                          onClick={() => handleUnbindVs(b.id)}
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
      </Box>

      {/* Bind Cloud Integration Dialog */}
      <Dialog
        open={bindCiOpen}
        onClose={() => setBindCiOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Bind Cloud Integration</DialogTitle>
        <DialogContent>
          <TextField
            select
            fullWidth
            variant="outlined"
            label="Integration"
            value={selectedCiId}
            onChange={e => setSelectedCiId(e.target.value)}
            margin="normal"
          >
            {availableCi.map(ci => (
              <MenuItem key={ci.id} value={ci.id}>
                {ci.name} ({ci.provider} / {ci.auth_method})
              </MenuItem>
            ))}
          </TextField>
          <TextField
            fullWidth
            variant="outlined"
            label="Priority"
            type="number"
            value={ciPriority}
            onChange={e => setCiPriority(Number(e.target.value))}
            margin="normal"
            helperText="Higher priority overrides lower. Default: 0"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBindCiOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleBindCi}
            disabled={!selectedCiId}
          >
            Bind
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bind Variable Set Dialog */}
      <Dialog
        open={bindVsOpen}
        onClose={() => setBindVsOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Bind Variable Set</DialogTitle>
        <DialogContent>
          <TextField
            select
            fullWidth
            variant="outlined"
            label="Variable Set"
            value={selectedVsId}
            onChange={e => setSelectedVsId(e.target.value)}
            margin="normal"
          >
            {availableVs.map(vs => (
              <MenuItem key={vs.id} value={vs.id}>
                {vs.name} ({vs.entry_count} entries)
              </MenuItem>
            ))}
          </TextField>
          <TextField
            fullWidth
            variant="outlined"
            label="Priority"
            type="number"
            value={vsPriority}
            onChange={e => setVsPriority(Number(e.target.value))}
            margin="normal"
            helperText="Higher priority overrides lower. Default: 0"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBindVsOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleBindVs}
            disabled={!selectedVsId}
          >
            Bind
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
