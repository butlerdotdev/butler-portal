// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Chip,
  Button,
  IconButton,
  Tooltip,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@material-ui/core';
import { makeStyles, Theme, createStyles } from '@material-ui/core/styles';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import RefreshIcon from '@material-ui/icons/Refresh';
import DeleteIcon from '@material-ui/icons/Delete';
import EditIcon from '@material-ui/icons/Edit';
import AddIcon from '@material-ui/icons/Add';
import ClearIcon from '@material-ui/icons/Clear';
import HistoryIcon from '@material-ui/icons/History';
import VisibilityIcon from '@material-ui/icons/Visibility';
import { Progress, WarningPanel, InfoCard } from '@backstage/core-components';
import { useParams, useNavigate } from 'react-router-dom';
import { usePipelineApi } from '../../hooks/usePipelineApi';
import { usePipelineTeam } from '../../hooks/usePipelineTeam';
import { hasMinRole } from '@internal/plugin-pipeline-common';
import type { FleetGroup, FleetAgent, ManagedConfigVersion } from '../../api/types/fleet';
import { ConfigEditor } from '../builder/ConfigEditor';
import { ValidateButton } from '../builder/ValidateButton';
import type { PipelineDag } from '../../api/types/pipelines';

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: theme.spacing(3),
    },
    headerLeft: {
      display: 'flex',
      alignItems: 'center',
      gap: theme.spacing(2),
    },
    headerActions: {
      display: 'flex',
      alignItems: 'center',
      gap: theme.spacing(1),
    },
    detailsGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      gap: theme.spacing(2),
      padding: theme.spacing(2),
    },
    detailItem: {
      display: 'flex',
      flexDirection: 'column',
    },
    detailLabel: {
      fontSize: '0.75rem',
      fontWeight: 600,
      color: theme.palette.text.secondary,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      marginBottom: theme.spacing(0.5),
    },
    detailValue: {
      fontSize: '0.875rem',
    },
    labelsContainer: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: theme.spacing(1),
      padding: theme.spacing(0, 2, 2, 2),
    },
    configContainer: {
      padding: theme.spacing(2),
    },
    configStatus: {
      display: 'flex',
      alignItems: 'center',
      gap: theme.spacing(1),
      marginBottom: theme.spacing(2),
    },
    configActions: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: theme.spacing(1),
      marginBottom: theme.spacing(2),
    },
    hashCode: {
      fontFamily: 'monospace',
      fontSize: '0.85rem',
    },
    section: {
      marginBottom: theme.spacing(3),
    },
    online: {
      backgroundColor: theme.palette.success?.main ?? '#4caf50',
      color: '#fff',
    },
    offline: {
      backgroundColor: theme.palette.error?.main ?? '#f44336',
      color: '#fff',
    },
    pending: {
      backgroundColor: theme.palette.warning?.main ?? '#ff9800',
      color: '#fff',
    },
    stale: {
      backgroundColor: theme.palette.grey[500],
      color: '#fff',
    },
    versionConfigBlock: {
      backgroundColor: theme.palette.type === 'dark' ? '#1e1e1e' : '#f5f5f5',
      borderRadius: theme.shape.borderRadius,
      padding: theme.spacing(2),
      fontFamily: 'monospace',
      fontSize: '0.85rem',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-all',
      maxHeight: 500,
      overflow: 'auto',
    },
  }),
);

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function GroupDetailPage() {
  const classes = useStyles();
  const api = usePipelineApi();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { activeTeam, activeRole, isPlatformAdmin } = usePipelineTeam();
  const isAdminMode = isPlatformAdmin && !activeTeam;
  const canEdit =
    isAdminMode || (!!activeRole && hasMinRole(activeRole, 'operator'));

  const [group, setGroup] = useState<FleetGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Config editing state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorInitialDag, setEditorInitialDag] = useState<PipelineDag | undefined>();
  const [editorCurrentDag, setEditorCurrentDag] = useState<PipelineDag | undefined>();
  const [configVersions, setConfigVersions] = useState<ManagedConfigVersion[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [viewingConfig, setViewingConfig] = useState<ManagedConfigVersion | null>(null);

  const loadGroup = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const result = await api.getFleetGroup(id);
      setGroup(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [api, id]);

  useEffect(() => {
    loadGroup();
  }, [loadGroup]);

  const handleDelete = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      await api.deleteFleetGroup(id);
      navigate('../..', { relative: 'path' });
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const handleOpenEditor = async () => {
    if (!group) return;
    const config = await api.getGroupConfig(group.id);
    if (config) {
      setEditorInitialDag(config.dag);
    } else {
      setEditorInitialDag(undefined);
    }
    setEditorOpen(true);
  };

  const handleSaveConfig = useCallback(
    async (dag: PipelineDag, changeSummary?: string) => {
      if (!group) return;
      await api.saveGroupConfig(group.id, {
        dag,
        change_summary: changeSummary,
      });
      setEditorOpen(false);
      loadGroup();
    },
    [api, group, loadGroup],
  );

  const handleDeleteConfig = async () => {
    if (!group) return;
    if (!window.confirm('Remove managed config for this group? Agents will stop receiving this config.')) return;
    try {
      await api.deleteGroupConfig(group.id);
      loadGroup();
    } catch (err) {
      alert(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleShowVersions = async () => {
    if (!group) return;
    try {
      const result = await api.listGroupConfigVersions(group.id);
      setConfigVersions(Array.isArray(result) ? result : (result as any).items ?? []);
      setShowVersions(true);
    } catch (err) {
      alert(`Failed to load versions: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'online':
        return classes.online;
      case 'offline':
        return classes.offline;
      case 'pending':
        return classes.pending;
      case 'stale':
        return classes.stale;
      default:
        return '';
    }
  };

  if (loading) {
    return <Progress />;
  }

  if (error) {
    return (
      <WarningPanel title="Failed to load group" message={error.message} />
    );
  }

  if (!group) {
    return <WarningPanel title="Group not found" message={`No group found with ID "${id}".`} />;
  }

  // If the config editor is open, show it fullscreen
  if (editorOpen) {
    return (
      <div>
        <Box className={classes.header}>
          <Box className={classes.headerLeft}>
            <Tooltip title="Back to Group Detail">
              <IconButton onClick={() => setEditorOpen(false)}>
                <ArrowBackIcon />
              </IconButton>
            </Tooltip>
            <Typography variant="h5">
              Edit Config: {group.name}
            </Typography>
          </Box>
        </Box>
        <ConfigEditor
          initialDag={editorInitialDag}
          onSave={handleSaveConfig}
          onDagChange={setEditorCurrentDag}
          title={`${group.name} group configuration`}
          toolbarActions={
            <ValidateButton getDag={() => editorCurrentDag} />
          }
        />
      </div>
    );
  }

  const selectorEntries = group.label_selector
    ? Object.entries(group.label_selector)
    : [];
  const hasManagedConfig = !!group.managedConfig;
  const agents = group.agents ?? [];

  return (
    <div>
      {/* Header */}
      <Box className={classes.header}>
        <Box className={classes.headerLeft}>
          <Tooltip title="Back to Fleet">
            <IconButton onClick={() => navigate('../..', { relative: 'path' })}>
              <ArrowBackIcon />
            </IconButton>
          </Tooltip>
          <Typography variant="h5">{group.name}</Typography>
          <Chip
            label={`${agents.length} agent${agents.length !== 1 ? 's' : ''}`}
            size="small"
            variant="outlined"
          />
        </Box>
        <Box className={classes.headerActions}>
          <Tooltip title="Refresh">
            <IconButton onClick={loadGroup} size="small">
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          {canEdit && (
            <Button
              variant="outlined"
              color="secondary"
              size="small"
              startIcon={<DeleteIcon />}
              onClick={() => setDeleteDialogOpen(true)}
            >
              Delete
            </Button>
          )}
        </Box>
      </Box>

      {/* Group Details */}
      <div className={classes.section}>
        <InfoCard title="Group Details">
          <Box className={classes.detailsGrid}>
            <div className={classes.detailItem}>
              <Typography className={classes.detailLabel}>Name</Typography>
              <Typography className={classes.detailValue}>{group.name}</Typography>
            </div>
            <div className={classes.detailItem}>
              <Typography className={classes.detailLabel}>Team</Typography>
              <Typography className={classes.detailValue}>{group.team}</Typography>
            </div>
            <div className={classes.detailItem}>
              <Typography className={classes.detailLabel}>Description</Typography>
              <Typography className={classes.detailValue}>
                {group.description || '--'}
              </Typography>
            </div>
            <div className={classes.detailItem}>
              <Typography className={classes.detailLabel}>Created By</Typography>
              <Typography className={classes.detailValue}>{group.created_by}</Typography>
            </div>
            <div className={classes.detailItem}>
              <Typography className={classes.detailLabel}>Created At</Typography>
              <Typography className={classes.detailValue}>
                {new Date(group.created_at).toLocaleString()}
              </Typography>
            </div>
          </Box>
          <Box px={2} pb={2}>
            <Typography className={classes.detailLabel}>Label Selector</Typography>
            <Box className={classes.labelsContainer}>
              {selectorEntries.length > 0 ? (
                selectorEntries.map(([key, value]) => (
                  <Chip key={key} label={`${key}=${value}`} variant="outlined" size="small" />
                ))
              ) : (
                <Typography color="textSecondary">
                  No label selector (matches all agents)
                </Typography>
              )}
            </Box>
          </Box>
        </InfoCard>
      </div>

      {/* Configuration Section */}
      <div className={classes.section}>
        <InfoCard title="Configuration">
          <Box className={classes.configContainer}>
            {/* Status line */}
            <Box className={classes.configStatus}>
              {hasManagedConfig ? (
                <>
                  <Chip
                    label={`Group config v${group.managedConfig!.version}`}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                  <Typography variant="body2" color="textSecondary">
                    Hash: <code className={classes.hashCode}>
                      {group.managedConfig!.config_hash.slice(0, 12)}
                    </code>
                    {' '}| {formatTimeAgo(group.managedConfig!.created_at)} by {group.managedConfig!.created_by}
                  </Typography>
                </>
              ) : (
                <Typography variant="body2" color="textSecondary">
                  No managed config for this group. Create one or promote from an agent.
                </Typography>
              )}
            </Box>

            {/* Action buttons */}
            {canEdit && (
              <Box className={classes.configActions}>
                {hasManagedConfig && (
                  <Button
                    variant="contained"
                    color="primary"
                    size="small"
                    startIcon={<EditIcon />}
                    onClick={handleOpenEditor}
                  >
                    Edit Config
                  </Button>
                )}
                {!hasManagedConfig && (
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={handleOpenEditor}
                  >
                    Create Config
                  </Button>
                )}
                {hasManagedConfig && (
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<HistoryIcon />}
                    onClick={handleShowVersions}
                  >
                    Version History
                  </Button>
                )}
                {hasManagedConfig && (
                  <Button
                    variant="outlined"
                    color="secondary"
                    size="small"
                    startIcon={<ClearIcon />}
                    onClick={handleDeleteConfig}
                  >
                    Remove Config
                  </Button>
                )}
              </Box>
            )}
          </Box>
        </InfoCard>
      </div>

      {/* Matched Agents */}
      <div className={classes.section}>
        <InfoCard title="Matched Agents">
          {agents.length > 0 ? (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Agent ID</TableCell>
                    <TableCell>Hostname</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>IP Address</TableCell>
                    <TableCell>Last Heartbeat</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {agents.map((agent: FleetAgent) => (
                    <TableRow
                      key={agent.id}
                      hover
                      style={{ cursor: 'pointer' }}
                      onClick={() => navigate(`../agents/${agent.id}`, { relative: 'path' })}
                    >
                      <TableCell>{agent.agent_id}</TableCell>
                      <TableCell>{agent.hostname || '--'}</TableCell>
                      <TableCell>
                        <Chip
                          label={agent.status}
                          size="small"
                          className={getStatusClass(agent.status)}
                        />
                      </TableCell>
                      <TableCell>{agent.ip_address || '--'}</TableCell>
                      <TableCell>{formatTimeAgo(agent.last_heartbeat_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Box p={2}>
              <Typography color="textSecondary">
                No agents match this group's label selector.
              </Typography>
            </Box>
          )}
        </InfoCard>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Delete Group</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete group{' '}
            <strong>{group.name}</strong>? Any managed configs for this group
            will also be deleted.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button
            onClick={handleDelete}
            color="secondary"
            variant="contained"
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Version History Dialog */}
      <Dialog
        open={showVersions}
        onClose={() => setShowVersions(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Config Version History</DialogTitle>
        <DialogContent>
          {configVersions.length === 0 ? (
            <Typography color="textSecondary">No versions found.</Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Version</TableCell>
                    <TableCell>Author</TableCell>
                    <TableCell>Timestamp</TableCell>
                    <TableCell>Summary</TableCell>
                    <TableCell>Hash</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {configVersions.map(v => (
                    <TableRow key={v.id} hover>
                      <TableCell>
                        <Typography variant="body2" style={{ fontWeight: 600 }}>
                          v{v.version}
                        </Typography>
                      </TableCell>
                      <TableCell>{v.created_by}</TableCell>
                      <TableCell>
                        {new Date(v.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>{v.change_summary || '--'}</TableCell>
                      <TableCell>
                        <code className={classes.hashCode}>
                          {v.config_hash.slice(0, 12)}
                        </code>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<VisibilityIcon />}
                          onClick={() => setViewingConfig(v)}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowVersions(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* View Config Dialog */}
      <Dialog
        open={!!viewingConfig}
        onClose={() => setViewingConfig(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Version {viewingConfig?.version} Configuration
        </DialogTitle>
        <DialogContent>
          {viewingConfig && (
            <pre className={classes.versionConfigBlock}>
              {viewingConfig.vector_config}
            </pre>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewingConfig(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
