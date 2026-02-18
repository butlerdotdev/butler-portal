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
  Switch,
  FormControlLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Divider,
  makeStyles,
} from '@material-ui/core';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import DeleteIcon from '@material-ui/icons/Delete';
import AddIcon from '@material-ui/icons/Add';
import { useNavigate, useParams } from 'react-router-dom';
import { Progress, EmptyState } from '@backstage/core-components';
import { useRegistryApi } from '../../hooks/useRegistryApi';
import { PolicyBindingDialog } from './PolicyBindingDialog';
import type {
  EnforcementLevel,
  PolicyBinding,
  CreatePolicyBindingRequest,
} from '../../api/types/policies';

const useStyles = makeStyles(theme => ({
  root: {
    maxWidth: 800,
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(3),
  },
  field: {
    marginBottom: theme.spacing(2),
  },
  rulesSection: {
    padding: theme.spacing(2),
    marginBottom: theme.spacing(3),
  },
  ruleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing(1, 0),
  },
  bindingsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(1),
    marginTop: theme.spacing(3),
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: theme.spacing(1),
    marginTop: theme.spacing(3),
  },
}));

const ENFORCEMENT_OPTIONS: Array<{ value: EnforcementLevel; label: string }> = [
  { value: 'block', label: 'Block' },
  { value: 'warn', label: 'Warn' },
  { value: 'audit', label: 'Audit' },
];

const SCAN_GRADES = ['A', 'B', 'C', 'D'];

export function PolicyTemplateEditor() {
  const classes = useStyles();
  const api = useRegistryApi();
  const navigate = useNavigate();
  const { id: policyId } = useParams<{ id?: string }>();
  const isEdit = Boolean(policyId) && policyId !== 'create';

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [enforcementLevel, setEnforcementLevel] =
    useState<EnforcementLevel>('warn');
  const [team, setTeam] = useState('');

  // Rules
  const [minApprovers, setMinApprovers] = useState(0);
  const [requiredScanGrade, setRequiredScanGrade] = useState('');
  const [requirePassingTests, setRequirePassingTests] = useState(false);
  const [requirePassingValidate, setRequirePassingValidate] = useState(false);
  const [preventSelfApproval, setPreventSelfApproval] = useState(false);
  const [autoApprovePatches, setAutoApprovePatches] = useState(false);

  // Bindings
  const [bindings, setBindings] = useState<PolicyBinding[]>([]);
  const [bindingDialogOpen, setBindingDialogOpen] = useState(false);

  const fetchPolicy = useCallback(async () => {
    if (!isEdit || !policyId) return;
    try {
      setLoading(true);
      const [policy, bindingsData] = await Promise.all([
        api.getPolicy(policyId),
        api.listPolicyBindings(policyId),
      ]);
      setName(policy.name);
      setDescription(policy.description ?? '');
      setEnforcementLevel(policy.enforcement_level);
      setTeam(policy.team ?? '');
      setMinApprovers(policy.rules.minApprovers ?? 0);
      setRequiredScanGrade(policy.rules.requiredScanGrade ?? '');
      setRequirePassingTests(policy.rules.requirePassingTests ?? false);
      setRequirePassingValidate(policy.rules.requirePassingValidate ?? false);
      setPreventSelfApproval(policy.rules.preventSelfApproval ?? false);
      setAutoApprovePatches(policy.rules.autoApprovePatches ?? false);
      setBindings(bindingsData.bindings ?? []);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load policy',
      );
    } finally {
      setLoading(false);
    }
  }, [api, policyId, isEdit]);

  useEffect(() => {
    fetchPolicy();
  }, [fetchPolicy]);

  const buildRules = () => {
    const rules: Record<string, unknown> = {};
    if (minApprovers > 0) rules.minApprovers = minApprovers;
    if (requiredScanGrade) rules.requiredScanGrade = requiredScanGrade;
    if (requirePassingTests) rules.requirePassingTests = true;
    if (requirePassingValidate) rules.requirePassingValidate = true;
    if (preventSelfApproval) rules.preventSelfApproval = true;
    if (autoApprovePatches) rules.autoApprovePatches = true;
    return rules;
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const data = {
        name,
        description: description || undefined,
        enforcement_level: enforcementLevel,
        rules: buildRules(),
        team: team || undefined,
      };
      if (isEdit && policyId) {
        await api.updatePolicy(policyId, data);
      } else {
        await api.createPolicy(data);
      }
      navigate('governance/policies');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save policy');
      setSaving(false);
    }
  };

  const handleAddBinding = async (data: CreatePolicyBindingRequest) => {
    if (!policyId) return;
    await api.createPolicyBinding(policyId, data);
    const updated = await api.listPolicyBindings(policyId);
    setBindings(updated.bindings ?? []);
  };

  const handleDeleteBinding = async (bindingId: string) => {
    if (!policyId) return;
    try {
      await api.deletePolicyBinding(policyId, bindingId);
      setBindings(prev => prev.filter(b => b.id !== bindingId));
    } catch {
      // Silent failure — could add snackbar
    }
  };

  if (loading) return <Progress />;

  if (error && isEdit && !name) {
    return (
      <EmptyState
        title="Failed to load policy"
        description={error}
        missing="data"
        action={
          <Button variant="outlined" onClick={fetchPolicy}>
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <Box className={classes.root}>
      <Box className={classes.header}>
        <IconButton
          size="small"
          onClick={() => navigate('governance/policies')}
        >
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5">
          {isEdit ? 'Edit Policy Template' : 'Create Policy Template'}
        </Typography>
      </Box>

      {error && (
        <Typography color="error" variant="body2" gutterBottom>
          {error}
        </Typography>
      )}

      <TextField
        className={classes.field}
        fullWidth
        variant="outlined"
        label="Name"
        value={name}
        onChange={e => setName(e.target.value)}
        required
        placeholder="e.g. production-strict"
      />

      <TextField
        className={classes.field}
        fullWidth
        variant="outlined"
        label="Description"
        value={description}
        onChange={e => setDescription(e.target.value)}
        multiline
        rows={3}
        placeholder="Optional description of this policy template"
      />

      <TextField
        className={classes.field}
        fullWidth
        select
        variant="outlined"
        label="Enforcement Level"
        value={enforcementLevel}
        onChange={e =>
          setEnforcementLevel(e.target.value as EnforcementLevel)
        }
      >
        {ENFORCEMENT_OPTIONS.map(opt => (
          <MenuItem key={opt.value} value={opt.value}>
            {opt.label}
          </MenuItem>
        ))}
      </TextField>

      <TextField
        className={classes.field}
        fullWidth
        variant="outlined"
        label="Team (optional)"
        value={team}
        onChange={e => setTeam(e.target.value)}
        placeholder="Leave empty for a global policy"
        helperText="Restrict this policy to a specific team, or leave empty for global scope"
      />

      {/* Rules Section */}
      <Paper variant="outlined" className={classes.rulesSection}>
        <Typography variant="subtitle1" gutterBottom>
          Rules
        </Typography>
        <Divider />

        <Box className={classes.ruleRow}>
          <Typography variant="body2">Minimum Approvers</Typography>
          <TextField
            variant="outlined"
            size="small"
            type="number"
            value={minApprovers}
            onChange={e =>
              setMinApprovers(Math.max(0, parseInt(e.target.value, 10) || 0))
            }
            inputProps={{ min: 0, max: 10, style: { width: 60 } }}
          />
        </Box>

        <Box className={classes.ruleRow}>
          <Typography variant="body2">Required Scan Grade</Typography>
          <TextField
            variant="outlined"
            size="small"
            select
            value={requiredScanGrade}
            onChange={e => setRequiredScanGrade(e.target.value)}
            style={{ minWidth: 100 }}
          >
            <MenuItem value="">None</MenuItem>
            {SCAN_GRADES.map(g => (
              <MenuItem key={g} value={g}>
                {g}
              </MenuItem>
            ))}
          </TextField>
        </Box>

        <Box className={classes.ruleRow}>
          <Typography variant="body2">Require Passing Tests</Typography>
          <FormControlLabel
            control={
              <Switch
                checked={requirePassingTests}
                onChange={e => setRequirePassingTests(e.target.checked)}
                color="primary"
              />
            }
            label=""
          />
        </Box>

        <Box className={classes.ruleRow}>
          <Typography variant="body2">Require Passing Validate</Typography>
          <FormControlLabel
            control={
              <Switch
                checked={requirePassingValidate}
                onChange={e => setRequirePassingValidate(e.target.checked)}
                color="primary"
              />
            }
            label=""
          />
        </Box>

        <Box className={classes.ruleRow}>
          <Typography variant="body2">Prevent Self-Approval</Typography>
          <FormControlLabel
            control={
              <Switch
                checked={preventSelfApproval}
                onChange={e => setPreventSelfApproval(e.target.checked)}
                color="primary"
              />
            }
            label=""
          />
        </Box>

        <Box className={classes.ruleRow}>
          <Typography variant="body2">Auto-Approve Patches</Typography>
          <FormControlLabel
            control={
              <Switch
                checked={autoApprovePatches}
                onChange={e => setAutoApprovePatches(e.target.checked)}
                color="primary"
              />
            }
            label=""
          />
        </Box>
      </Paper>

      {/* Bindings Section (only for edit mode) */}
      {isEdit && policyId && (
        <>
          <Box className={classes.bindingsHeader}>
            <Typography variant="subtitle1">Bindings</Typography>
            <Button
              size="small"
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => setBindingDialogOpen(true)}
            >
              Add Binding
            </Button>
          </Box>
          {bindings.length === 0 ? (
            <Typography variant="body2" color="textSecondary">
              No bindings configured. Add a binding to apply this policy to
              specific scopes.
            </Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Scope Type</TableCell>
                    <TableCell>Scope Value</TableCell>
                    <TableCell>Created By</TableCell>
                    <TableCell>Created</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {bindings.map(binding => (
                    <TableRow key={binding.id}>
                      <TableCell>{binding.scope_type}</TableCell>
                      <TableCell>{binding.scope_value || '-'}</TableCell>
                      <TableCell>{binding.created_by || '-'}</TableCell>
                      <TableCell>
                        {new Date(binding.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <IconButton
                          size="small"
                          onClick={() => handleDeleteBinding(binding.id)}
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

          <PolicyBindingDialog
            open={bindingDialogOpen}
            onClose={() => setBindingDialogOpen(false)}
            onSubmit={handleAddBinding}
          />
        </>
      )}

      {/* Actions */}
      <Box className={classes.actions}>
        <Button onClick={() => navigate('governance/policies')}>Cancel</Button>
        <Button
          variant="contained"
          color="primary"
          onClick={handleSave}
          disabled={!name || saving}
        >
          {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
        </Button>
      </Box>
    </Box>
  );
}
