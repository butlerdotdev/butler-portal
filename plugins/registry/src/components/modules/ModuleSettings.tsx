// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  MenuItem,
  Paper,
  Chip,
  FormControlLabel,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  makeStyles,
} from '@material-ui/core';
import DeleteIcon from '@material-ui/icons/Delete';
import { Progress } from '@backstage/core-components';
import { usePermission } from '@backstage/plugin-permission-react';
import {
  registryEnvironmentUpdatePermission,
  registryEnvironmentLockPermission,
} from '@internal/plugin-registry-common';
import { useRegistryApi } from '../../hooks/useRegistryApi';
import { ModuleBindings } from './ModuleBindings';
import { ResolvedVariablesViewer } from './ResolvedVariablesViewer';
import type {
  EnvironmentModule,
  ModuleDependency,
} from '../../api/types/environments';

const useStyles = makeStyles(theme => ({
  section: {
    marginBottom: theme.spacing(3),
  },
  sectionTitle: {
    fontWeight: 600,
    marginBottom: theme.spacing(1),
  },
  fieldRow: {
    display: 'flex',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(2),
    flexWrap: 'wrap',
  },
  saveButton: {
    marginTop: theme.spacing(2),
  },
  depRow: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    padding: theme.spacing(1),
  },
}));

interface ModuleSettingsProps {
  envId: string;
  moduleId: string;
  mod: EnvironmentModule;
  onRefresh: () => void;
}

export function ModuleSettings({
  envId,
  moduleId,
  mod,
  onRefresh,
}: ModuleSettingsProps) {
  const classes = useStyles();
  const api = useRegistryApi();

  // Permissions
  const { allowed: canUpdate } = usePermission({ permission: registryEnvironmentUpdatePermission });
  const { allowed: canForceUnlock } = usePermission({ permission: registryEnvironmentLockPermission });

  // Editable fields
  const [pinnedVersion, setPinnedVersion] = useState(mod.pinned_version ?? '');
  const [execMode, setExecMode] = useState(mod.execution_mode);
  const [tfVersion, setTfVersion] = useState(mod.tf_version ?? '');
  const [autoPlan, setAutoPlan] = useState(mod.auto_plan_on_module_update);
  const [saving, setSaving] = useState(false);

  // Dependencies
  const [deps, setDeps] = useState<ModuleDependency[]>([]);
  const [allModules, setAllModules] = useState<EnvironmentModule[]>([]);
  const [depsLoading, setDepsLoading] = useState(true);
  const [newDepId, setNewDepId] = useState('');

  const fetchDeps = useCallback(async () => {
    try {
      setDepsLoading(true);
      const [depsData, modulesData] = await Promise.all([
        api.getModuleDependencies(envId, moduleId),
        api.listEnvironmentModules(envId),
      ]);
      setDeps(depsData.dependencies);
      setAllModules(modulesData.modules.filter(m => m.id !== moduleId));
    } catch {
      // Silent
    } finally {
      setDepsLoading(false);
    }
  }, [api, envId, moduleId]);

  useEffect(() => {
    fetchDeps();
  }, [fetchDeps]);

  const handleSaveSettings = async () => {
    try {
      setSaving(true);
      await api.updateModule(envId, moduleId, {
        pinned_version: pinnedVersion.trim() || undefined,
        execution_mode: execMode,
        tf_version: tfVersion.trim() || undefined,
        auto_plan_on_module_update: autoPlan,
      });
      onRefresh();
    } catch {
      // Silent
    } finally {
      setSaving(false);
    }
  };

  const handleAddDep = async () => {
    if (!newDepId) return;
    try {
      const existingIds = deps.map(d => d.depends_on_id);
      await api.setModuleDependencies(envId, moduleId, {
        dependencies: [
          ...existingIds.map(id => ({ depends_on_id: id })),
          { depends_on_id: newDepId },
        ],
      });
      setNewDepId('');
      fetchDeps();
    } catch {
      // Silent — may be a cycle error shown via snackbar
    }
  };

  const handleRemoveDep = async (depId: string) => {
    try {
      const remaining = deps
        .filter(d => d.depends_on_id !== depId)
        .map(d => ({ depends_on_id: d.depends_on_id }));
      await api.setModuleDependencies(envId, moduleId, {
        dependencies: remaining,
      });
      fetchDeps();
    } catch {
      // Silent
    }
  };

  const handleForceUnlock = async () => {
    try {
      await api.forceUnlockModule(envId, moduleId);
      onRefresh();
    } catch {
      // Silent
    }
  };

  const availableForDep = allModules.filter(
    m => !deps.some(d => d.depends_on_id === m.id),
  );

  return (
    <>
      {/* General Settings */}
      <Box className={classes.section}>
        <Typography variant="subtitle1" className={classes.sectionTitle}>
          General
        </Typography>
        <Box className={classes.fieldRow}>
          <TextField
            variant="outlined"
            label="Pinned Version"
            value={pinnedVersion}
            onChange={e => setPinnedVersion(e.target.value)}
            size="small"
            style={{ minWidth: 200 }}
            placeholder="Leave empty for latest"
            helperText="Exact (1.2.3) or constraint (~> 1.2)"
          />
          <TextField
            select
            variant="outlined"
            label="Execution Mode"
            value={execMode}
            onChange={e =>
              setExecMode(e.target.value as 'byoc' | 'peaas')
            }
            size="small"
            style={{ minWidth: 200 }}
          >
            <MenuItem value="byoc">BYOC</MenuItem>
            <MenuItem value="peaas">PeaaS</MenuItem>
          </TextField>
          <TextField
            variant="outlined"
            label="Terraform Version"
            value={tfVersion}
            onChange={e => setTfVersion(e.target.value)}
            size="small"
            style={{ minWidth: 150 }}
            placeholder="e.g. 1.9.0"
          />
        </Box>
        <FormControlLabel
          control={
            <Switch
              checked={autoPlan}
              onChange={e => setAutoPlan(e.target.checked)}
            />
          }
          label="Auto-plan on module version update"
        />
        <Box>
          <Button
            variant="contained"
            color="primary"
            size="small"
            onClick={handleSaveSettings}
            disabled={saving || !canUpdate}
            className={classes.saveButton}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </Box>
      </Box>

      {/* Dependencies */}
      <Box className={classes.section}>
        <Typography variant="subtitle1" className={classes.sectionTitle}>
          Dependencies ({deps.length})
        </Typography>
        {depsLoading ? (
          <Progress />
        ) : (
          <>
            {deps.length > 0 && (
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Depends On</TableCell>
                      <TableCell>Output Mapping</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {deps.map(dep => (
                      <TableRow key={dep.depends_on_id}>
                        <TableCell>{dep.depends_on_name}</TableCell>
                        <TableCell>
                          {dep.output_mapping && dep.output_mapping.length > 0
                            ? dep.output_mapping.map(m => (
                                <Chip
                                  key={m.upstream_output}
                                  label={`${m.upstream_output} -> ${m.downstream_variable}`}
                                  size="small"
                                  variant="outlined"
                                  style={{ margin: 2 }}
                                />
                              ))
                            : '-'}
                        </TableCell>
                        <TableCell>
                          <IconButton
                            size="small"
                            onClick={() =>
                              handleRemoveDep(dep.depends_on_id)
                            }
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

            {availableForDep.length > 0 && (
              <Box display="flex" style={{ gap: 8 }} mt={1}>
                <TextField
                  select
                  variant="outlined"
                  size="small"
                  label="Add dependency"
                  value={newDepId}
                  onChange={e => setNewDepId(e.target.value)}
                  style={{ minWidth: 200 }}
                >
                  {availableForDep.map(m => (
                    <MenuItem key={m.id} value={m.id}>
                      {m.name}
                    </MenuItem>
                  ))}
                </TextField>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={handleAddDep}
                  disabled={!newDepId}
                >
                  Add
                </Button>
              </Box>
            )}
          </>
        )}
      </Box>

      {/* Cloud Integrations & Variable Sets */}
      <ModuleBindings envId={envId} moduleId={moduleId} />

      {/* Resolved Variables Preview */}
      <ResolvedVariablesViewer envId={envId} moduleId={moduleId} />

      {/* State Backend */}
      <Box className={classes.section}>
        <Typography variant="subtitle1" className={classes.sectionTitle}>
          State Backend
        </Typography>
        <Paper variant="outlined" style={{ padding: 16 }}>
          {mod.state_backend ? (
            <>
              <Typography variant="body2">
                Type: <strong>{mod.state_backend.type}</strong>
              </Typography>
              {mod.state_backend.type === 'pg' && (
                <Typography variant="caption" color="textSecondary">
                  Platform-managed PostgreSQL state
                </Typography>
              )}
              {mod.state_backend.config && (
                <Box mt={1}>
                  <Typography
                    variant="caption"
                    component="pre"
                    style={{
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {JSON.stringify(mod.state_backend.config, null, 2)}
                  </Typography>
                </Box>
              )}
            </>
          ) : (
            <Typography variant="body2" color="textSecondary">
              No state backend configured. Configure one before running applies.
            </Typography>
          )}
        </Paper>
      </Box>

      {/* Admin Actions */}
      <Box className={classes.section}>
        <Typography variant="subtitle1" className={classes.sectionTitle}>
          Admin Actions
        </Typography>
        <Button
          variant="outlined"
          color="secondary"
          size="small"
          onClick={handleForceUnlock}
          disabled={!canForceUnlock}
        >
          Force Unlock State
        </Button>
        <Typography variant="caption" color="textSecondary" display="block" style={{ marginTop: 4 }}>
          Use only if Terraform state is stuck locked after a crash. This action is audit-logged.
        </Typography>
      </Box>
    </>
  );
}
