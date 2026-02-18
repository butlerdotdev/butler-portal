// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Typography,
  makeStyles,
} from '@material-ui/core';
import type {
  PolicyScopeType,
  CreatePolicyBindingRequest,
} from '../../api/types/policies';

const useStyles = makeStyles(theme => ({
  field: {
    marginBottom: theme.spacing(2),
  },
}));

interface PolicyBindingDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreatePolicyBindingRequest) => Promise<void>;
}

const SCOPE_TYPES: Array<{ value: PolicyScopeType; label: string }> = [
  { value: 'global', label: 'Global' },
  { value: 'team', label: 'Team' },
  { value: 'namespace', label: 'Namespace' },
  { value: 'artifact', label: 'Artifact' },
];

export function PolicyBindingDialog({
  open,
  onClose,
  onSubmit,
}: PolicyBindingDialogProps) {
  const classes = useStyles();
  const [scopeType, setScopeType] = useState<PolicyScopeType>('global');
  const [scopeValue, setScopeValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsScopeValue = scopeType !== 'global';
  const isValid = !needsScopeValue || scopeValue.trim().length > 0;

  const handleSubmit = async () => {
    if (!isValid) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        scope_type: scopeType,
        scope_value: needsScopeValue ? scopeValue.trim() : undefined,
      });
      setScopeType('global');
      setScopeValue('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create binding');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setScopeType('global');
    setScopeValue('');
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Policy Binding</DialogTitle>
      <DialogContent>
        {error && (
          <Typography color="error" variant="body2" gutterBottom>
            {error}
          </Typography>
        )}
        <TextField
          className={classes.field}
          fullWidth
          select
          variant="outlined"
          label="Scope Type"
          value={scopeType}
          onChange={e => {
            setScopeType(e.target.value as PolicyScopeType);
            setScopeValue('');
          }}
          margin="normal"
        >
          {SCOPE_TYPES.map(st => (
            <MenuItem key={st.value} value={st.value}>
              {st.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          className={classes.field}
          fullWidth
          variant="outlined"
          label="Scope Value"
          value={scopeValue}
          onChange={e => setScopeValue(e.target.value)}
          disabled={!needsScopeValue}
          helperText={
            needsScopeValue
              ? `Enter the ${scopeType} name to bind this policy to`
              : 'Global scope applies to all artifacts'
          }
          margin="normal"
          required={needsScopeValue}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          variant="contained"
          color="primary"
          onClick={handleSubmit}
          disabled={!isValid || saving}
        >
          {saving ? 'Creating...' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
