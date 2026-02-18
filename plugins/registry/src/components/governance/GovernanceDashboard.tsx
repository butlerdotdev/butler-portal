// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  makeStyles,
} from '@material-ui/core';
import CheckIcon from '@material-ui/icons/Check';
import CloseIcon from '@material-ui/icons/Close';
import WarningIcon from '@material-ui/icons/Warning';
import PolicyIcon from '@material-ui/icons/Policy';
import { useNavigate } from 'react-router-dom';
import { Progress, EmptyState } from '@backstage/core-components';
import { useRegistryApi } from '../../hooks/useRegistryApi';
import { useRegistryTeam } from '../../hooks/useRegistryTeam';
import { hasMinRole } from '@internal/plugin-registry-common';
import type {
  GovernanceSummary,
  PendingApproval,
  StalenessAlert,
  AuditEntry,
} from '../../api/types/governance';

const useStyles = makeStyles(theme => ({
  summaryCard: {
    textAlign: 'center',
  },
  summaryValue: {
    fontSize: '2rem',
    fontWeight: 700,
  },
  section: {
    marginTop: theme.spacing(3),
  },
  actionButtons: {
    display: 'flex',
    gap: theme.spacing(1),
  },
  stalenessWarning: {
    color: theme.palette.warning.main,
    verticalAlign: 'middle',
    marginRight: theme.spacing(0.5),
    fontSize: '1rem',
  },
  clickableRow: {
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
  },
}));

export function GovernanceDashboard() {
  const classes = useStyles();
  const api = useRegistryApi();
  const navigate = useNavigate();
  const { activeRole } = useRegistryTeam();
  const canApprove = hasMinRole(activeRole, 'operator');
  const canManagePolicies = hasMinRole(activeRole, 'admin');

  const [summary, setSummary] = useState<GovernanceSummary | null>(null);
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [stalenessAlerts, setStalenessAlerts] = useState<StalenessAlert[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [auditCursor, setAuditCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    action: 'approve' | 'reject';
    approval: PendingApproval | null;
  }>({ open: false, action: 'approve', approval: null });
  const [comment, setComment] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [summaryData, approvalsData, stalenessData, auditData] = await Promise.all([
        api.getGovernanceSummary(),
        api.listPendingApprovals(),
        api.getStalenessAlerts(),
        api.getAuditLog({ limit: 20 }),
      ]);
      setSummary(summaryData);
      setApprovals(approvalsData.items ?? []);
      setStalenessAlerts(stalenessData.alerts ?? []);
      setAuditLog(auditData.items ?? []);
      setAuditCursor(auditData.nextCursor);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load governance data',
      );
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const loadMoreAudit = async () => {
    if (!auditCursor) return;
    try {
      const data = await api.getAuditLog({ cursor: auditCursor, limit: 20 });
      setAuditLog(prev => [...prev, ...(data.items ?? [])]);
      setAuditCursor(data.nextCursor);
    } catch {
      // Silent — audit pagination failure is non-critical
    }
  };

  const handleAction = async () => {
    const { action, approval } = confirmDialog;
    if (!approval) return;

    try {
      if (action === 'approve') {
        await api.approveVersion(
          approval.artifact_namespace,
          approval.artifact_name,
          approval.version,
          comment || undefined,
        );
      } else {
        await api.rejectVersion(
          approval.artifact_namespace,
          approval.artifact_name,
          approval.version,
          comment || undefined,
        );
      }
      setConfirmDialog({ open: false, action: 'approve', approval: null });
      setComment('');
      setActionError(null);
      fetchData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    }
  };

  if (loading) return <Progress />;

  if (error) {
    return (
      <EmptyState
        title="Failed to load governance data"
        description={error}
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
    <>
      {canManagePolicies && (
        <Box display="flex" justifyContent="flex-end" mb={2}>
          <Button
            variant="outlined"
            color="primary"
            startIcon={<PolicyIcon />}
            onClick={() => navigate('policies')}
          >
            Manage Policies
          </Button>
        </Box>
      )}
      {summary && (
        <Grid container spacing={2}>
          <Grid item xs={6} sm={3}>
            <Card variant="outlined" className={classes.summaryCard}>
              <CardContent>
                <Typography className={classes.summaryValue}>
                  {summary.pendingApprovals}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  Pending Approvals
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Card variant="outlined" className={classes.summaryCard}>
              <CardContent>
                <Typography className={classes.summaryValue}>
                  {summary.approvedVersions}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  Approved Versions
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Card variant="outlined" className={classes.summaryCard}>
              <CardContent>
                <Typography className={classes.summaryValue}>
                  {summary.rejectedVersions}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  Rejected Versions
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Card variant="outlined" className={classes.summaryCard}>
              <CardContent>
                <Typography className={classes.summaryValue}>
                  {summary.totalArtifacts}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  Total Artifacts
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Pending Approvals */}
      <Box className={classes.section}>
        <Typography variant="h6" gutterBottom>
          Pending Approvals
        </Typography>
        {approvals.length === 0 ? (
          <EmptyState
            title="No pending approvals"
            description="All versions have been reviewed."
            missing="data"
          />
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Artifact</TableCell>
                  <TableCell>Version</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Published By</TableCell>
                  <TableCell>Created</TableCell>
                  {canApprove && <TableCell>Actions</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {approvals.map(a => (
                  <TableRow key={a.id}>
                    <TableCell>
                      {a.artifact_namespace}/{a.artifact_name}
                    </TableCell>
                    <TableCell>{a.version}</TableCell>
                    <TableCell>{a.artifact_type}</TableCell>
                    <TableCell>{a.published_by || '-'}</TableCell>
                    <TableCell>
                      {new Date(a.created_at).toLocaleDateString()}
                    </TableCell>
                    {canApprove && (
                      <TableCell>
                        <Box className={classes.actionButtons}>
                          <Button
                            size="small"
                            variant="contained"
                            color="primary"
                            startIcon={<CheckIcon />}
                            onClick={() =>
                              setConfirmDialog({
                                open: true,
                                action: 'approve',
                                approval: a,
                              })
                            }
                          >
                            Approve
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            color="secondary"
                            startIcon={<CloseIcon />}
                            onClick={() =>
                              setConfirmDialog({
                                open: true,
                                action: 'reject',
                                approval: a,
                              })
                            }
                          >
                            Reject
                          </Button>
                        </Box>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>

      {/* Staleness Alerts */}
      {stalenessAlerts.length > 0 && (
        <Box className={classes.section}>
          <Typography variant="h6" gutterBottom>
            <WarningIcon className={classes.stalenessWarning} />
            Stale Artifacts ({stalenessAlerts.length})
          </Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Artifact</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Last Updated</TableCell>
                  <TableCell>Days Stale</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {stalenessAlerts.map(alert => (
                  <TableRow key={alert.artifactId}>
                    <TableCell>
                      {alert.namespace}/{alert.name}
                    </TableCell>
                    <TableCell>
                      <Chip label={alert.type} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      {new Date(alert.lastUpdated).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={`${alert.daysSinceUpdate}d`}
                        size="small"
                        color={alert.daysSinceUpdate > 180 ? 'secondary' : 'default'}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* Audit Log */}
      <Box className={classes.section}>
        <Typography variant="h6" gutterBottom>
          Audit Log
        </Typography>
        {auditLog.length === 0 ? (
          <Typography variant="body2" color="textSecondary">
            No audit events recorded yet.
          </Typography>
        ) : (
          <>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Actor</TableCell>
                    <TableCell>Action</TableCell>
                    <TableCell>Resource</TableCell>
                    <TableCell>Time</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {auditLog.map(entry => (
                    <TableRow key={entry.id}>
                      <TableCell>{entry.actor}</TableCell>
                      <TableCell>
                        <Chip label={entry.action} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell>
                        {entry.resource_namespace && entry.resource_name
                          ? `${entry.resource_namespace}/${entry.resource_name}`
                          : entry.resource_name || entry.resource_id || '-'}
                        {entry.version && ` v${entry.version}`}
                      </TableCell>
                      <TableCell>
                        {new Date(entry.occurred_at).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {auditCursor && (
              <Box mt={2} textAlign="center">
                <Button variant="outlined" size="small" onClick={loadMoreAudit}>
                  Load More
                </Button>
              </Box>
            )}
          </>
        )}
      </Box>

      <Dialog
        open={confirmDialog.open}
        onClose={() =>
          setConfirmDialog({ open: false, action: 'approve', approval: null })
        }
      >
        <DialogTitle>
          {confirmDialog.action === 'approve' ? 'Approve' : 'Reject'} Version
        </DialogTitle>
        <DialogContent>
          {confirmDialog.approval && (
            <Typography gutterBottom>
              {confirmDialog.approval.artifact_namespace}/
              {confirmDialog.approval.artifact_name} v
              {confirmDialog.approval.version}
            </Typography>
          )}
          {actionError && (
            <Typography color="error" variant="body2" gutterBottom>
              {actionError}
            </Typography>
          )}
          <TextField
            fullWidth
            multiline
            rows={3}
            variant="outlined"
            label="Comment (optional)"
            value={comment}
            onChange={e => setComment(e.target.value)}
            margin="normal"
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() =>
              setConfirmDialog({
                open: false,
                action: 'approve',
                approval: null,
              })
            }
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color={confirmDialog.action === 'approve' ? 'primary' : 'secondary'}
            onClick={handleAction}
          >
            {confirmDialog.action === 'approve' ? 'Approve' : 'Reject'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
