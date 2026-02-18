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
  inheritedChip: {
    marginLeft: theme.spacing(1),
  },
}));

interface ModuleBindingsProps {
  envId: string;
  moduleId: string;
}

export function ModuleBindings({ envId, moduleId }: ModuleBindingsProps) {
  const classes = useStyles();
  const api = useRegistryApi();

  const [modCiBindings, setModCiBindings] = useState<CloudIntegrationBinding[]>([]);
  const [modVsBindings, setModVsBindings] = useState<VariableSetBinding[]>([]);
  const [envCiBindings, setEnvCiBindings] = useState<CloudIntegrationBinding[]>([]);
  const [envVsBindings, setEnvVsBindings] = useState<VariableSetBinding[]>([]);
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
      const [modCi, modVs, eCi, eVs] = await Promise.all([
        api.listModuleCloudIntegrations(envId, moduleId),
        api.listModuleVariableSets(envId, moduleId),
        api.listEnvCloudIntegrations(envId),
        api.listEnvVariableSets(envId),
      ]);
      setModCiBindings(modCi.bindings);
      setModVsBindings(modVs.bindings);
      setEnvCiBindings(eCi.bindings);
      setEnvVsBindings(eVs.bindings);
    } catch {
      // Silent
    }
  }, [api, envId, moduleId]);

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
      await api.bindCloudIntegrationToModule(envId, moduleId, selectedCiId, ciPriority);
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
      await api.unbindCloudIntegrationFromModule(envId, moduleId, bindingId);
      fetchBindings();
    } catch {
      // Silent
    }
  };

  const handleBindVs = async () => {
    try {
      await api.bindVariableSetToModule(envId, moduleId, selectedVsId, vsPriority);
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
      await api.unbindVariableSetFromModule(envId, moduleId, bindingId);
      fetchBindings();
    } catch {
      // Silent
    }
  };

  // Determine effective bindings: module-level overrides env-level
  const hasModuleCi = modCiBindings.length > 0;
  const hasModuleVs = modVsBindings.length > 0;

  const effectiveCi = hasModuleCi ? modCiBindings : envCiBindings;
  const effectiveVs = hasModuleVs ? modVsBindings : envVsBindings;

  const availableCi = allIntegrations.filter(
    ci => !modCiBindings.some(b => b.cloud_integration_id === ci.id),
  );
  const availableVs = allVariableSets.filter(
    vs => !modVsBindings.some(b => b.variable_set_id === vs.id),
  );

  return (
    <>
      {/* Cloud Integrations */}
      <Box className={classes.section}>
        <Box className={classes.sectionHeader}>
          <Typography variant="subtitle1" className={classes.sectionTitle}>
            Cloud Integrations
            {!hasModuleCi && envCiBindings.length > 0 && (
              <Chip
                label="Inherited from environment"
                size="small"
                variant="outlined"
                className={classes.inheritedChip}
              />
            )}
          </Typography>
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setBindCiOpen(true)}
            disabled={availableCi.length === 0}
          >
            Override
          </Button>
        </Box>
        {effectiveCi.length === 0 ? (
          <Typography variant="body2" color="textSecondary">
            No cloud integrations configured.
          </Typography>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Provider</TableCell>
                  <TableCell>Priority</TableCell>
                  <TableCell>Source</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {effectiveCi.map(b => (
                  <TableRow key={b.id}>
                    <TableCell>{b.integration_name}</TableCell>
                    <TableCell>
                      <ProviderIcon provider={b.provider} />
                    </TableCell>
                    <TableCell>{b.priority}</TableCell>
                    <TableCell>
                      <Chip
                        label={hasModuleCi ? 'Module' : 'Environment'}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      {hasModuleCi && (
                        <Tooltip title="Remove override">
                          <IconButton
                            size="small"
                            onClick={() => handleUnbindCi(b.id)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
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
            {!hasModuleVs && envVsBindings.length > 0 && (
              <Chip
                label="Inherited from environment"
                size="small"
                variant="outlined"
                className={classes.inheritedChip}
              />
            )}
          </Typography>
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setBindVsOpen(true)}
            disabled={availableVs.length === 0}
          >
            Override
          </Button>
        </Box>
        {effectiveVs.length === 0 ? (
          <Typography variant="body2" color="textSecondary">
            No variable sets configured.
          </Typography>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Priority</TableCell>
                  <TableCell>Source</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {effectiveVs.map(b => (
                  <TableRow key={b.id}>
                    <TableCell>{b.set_name}</TableCell>
                    <TableCell>{b.priority}</TableCell>
                    <TableCell>
                      <Chip
                        label={hasModuleVs ? 'Module' : 'Environment'}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      {hasModuleVs && (
                        <Tooltip title="Remove override">
                          <IconButton
                            size="small"
                            onClick={() => handleUnbindVs(b.id)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
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
        <DialogTitle>Bind Cloud Integration to Module</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="textSecondary" gutterBottom>
            Adding a module-level binding overrides environment-level bindings.
          </Typography>
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
        <DialogTitle>Bind Variable Set to Module</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="textSecondary" gutterBottom>
            Adding a module-level binding overrides environment-level bindings.
          </Typography>
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
