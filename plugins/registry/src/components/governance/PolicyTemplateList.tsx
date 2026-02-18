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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  makeStyles,
} from '@material-ui/core';
import AddIcon from '@material-ui/icons/Add';
import DeleteIcon from '@material-ui/icons/Delete';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import { useNavigate } from 'react-router-dom';
import { Progress, EmptyState } from '@backstage/core-components';
import { useRegistryApi } from '../../hooks/useRegistryApi';
import { useRegistryTeam } from '../../hooks/useRegistryTeam';
import { hasMinRole } from '@internal/plugin-registry-common';
import type { PolicyTemplate, EnforcementLevel } from '../../api/types/policies';

const useStyles = makeStyles(theme => ({
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(2),
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  clickableRow: {
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
  },
  blockChip: {
    backgroundColor: theme.palette.error.main,
    color: theme.palette.error.contrastText,
  },
  warnChip: {
    backgroundColor: theme.palette.warning.main,
    color: theme.palette.warning.contrastText,
  },
  auditChip: {
    backgroundColor: theme.palette.grey[500],
    color: theme.palette.common.white,
  },
}));

function enforcementChipClass(
  level: EnforcementLevel,
  classes: ReturnType<typeof useStyles>,
): string {
  switch (level) {
    case 'block':
      return classes.blockChip;
    case 'warn':
      return classes.warnChip;
    case 'audit':
      return classes.auditChip;
    default:
      return '';
  }
}

function summarizeRules(rules: PolicyTemplate['rules']): string {
  const parts: string[] = [];
  if (rules.requiredScanGrade) {
    parts.push(`scan grade ${rules.requiredScanGrade}`);
  }
  if (rules.minApprovers !== undefined && rules.minApprovers > 0) {
    parts.push(
      `${rules.minApprovers} approver${rules.minApprovers > 1 ? 's' : ''}`,
    );
  }
  if (rules.requirePassingTests) {
    parts.push('tests required');
  }
  if (rules.requirePassingValidate) {
    parts.push('validate required');
  }
  if (rules.preventSelfApproval) {
    parts.push('no self-approval');
  }
  if (rules.autoApprovePatches) {
    parts.push('auto-approve patches');
  }
  return parts.length > 0 ? parts.join(', ') : 'No rules configured';
}

export function PolicyTemplateList() {
  const classes = useStyles();
  const api = useRegistryApi();
  const navigate = useNavigate();
  const { activeRole } = useRegistryTeam();
  const canManage = hasMinRole(activeRole, 'admin');

  const [policies, setPolicies] = useState<PolicyTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    policy: PolicyTemplate | null;
  }>({ open: false, policy: null });

  const fetchPolicies = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.listPolicies();
      setPolicies(data.policies ?? []);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load policies',
      );
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies]);

  const handleDelete = async () => {
    if (!deleteDialog.policy) return;
    try {
      await api.deletePolicy(deleteDialog.policy.id);
      setDeleteDialog({ open: false, policy: null });
      fetchPolicies();
    } catch {
      // Keep dialog open on error
    }
  };

  if (loading) return <Progress />;

  if (error) {
    return (
      <EmptyState
        title="Failed to load policies"
        description={error}
        missing="data"
        action={
          <Button variant="outlined" onClick={fetchPolicies}>
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <>
      <Box className={classes.header}>
        <Box className={classes.headerLeft}>
          <IconButton size="small" onClick={() => navigate('governance')}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6">Policy Templates</Typography>
        </Box>
        {canManage && (
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={() => navigate('governance/policies/create')}
          >
            Create Policy
          </Button>
        )}
      </Box>

      {policies.length === 0 ? (
        <EmptyState
          title="No policy templates"
          description={
            canManage
              ? 'Create a policy template to define governance rules for your artifacts.'
              : 'No policy templates have been defined. Contact an admin to create one.'
          }
          missing="data"
          action={
            canManage ? (
              <Button
                variant="contained"
                color="primary"
                onClick={() => navigate('governance/policies/create')}
              >
                Create Policy
              </Button>
            ) : undefined
          }
        />
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Enforcement</TableCell>
                <TableCell>Rules</TableCell>
                <TableCell>Team</TableCell>
                <TableCell>Created By</TableCell>
                {canManage && <TableCell>Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {policies.map(policy => (
                <TableRow
                  key={policy.id}
                  className={classes.clickableRow}
                  onClick={() =>
                    navigate(`governance/policies/${policy.id}`)
                  }
                >
                  <TableCell>
                    <Typography variant="body2">{policy.name}</Typography>
                    {policy.description && (
                      <Typography variant="caption" color="textSecondary">
                        {policy.description}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={policy.enforcement_level}
                      size="small"
                      className={enforcementChipClass(
                        policy.enforcement_level,
                        classes,
                      )}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {summarizeRules(policy.rules)}
                    </Typography>
                  </TableCell>
                  <TableCell>{policy.team || 'Global'}</TableCell>
                  <TableCell>{policy.created_by || '-'}</TableCell>
                  {canManage && (
                    <TableCell>
                      <IconButton
                        size="small"
                        onClick={e => {
                          e.stopPropagation();
                          setDeleteDialog({ open: true, policy });
                        }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ open: false, policy: null })}
      >
        <DialogTitle>Delete Policy Template</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the policy template{' '}
            <strong>{deleteDialog.policy?.name}</strong>? This action cannot
            be undone and will remove all associated bindings.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setDeleteDialog({ open: false, policy: null })}
          >
            Cancel
          </Button>
          <Button variant="contained" color="secondary" onClick={handleDelete}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
