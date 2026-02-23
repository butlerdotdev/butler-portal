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
  MenuItem,
  TextField,
} from '@material-ui/core';
import { makeStyles, Theme, createStyles } from '@material-ui/core/styles';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import RefreshIcon from '@material-ui/icons/Refresh';
import DeleteIcon from '@material-ui/icons/Delete';
import EditIcon from '@material-ui/icons/Edit';
import PublishIcon from '@material-ui/icons/Publish';
import AddIcon from '@material-ui/icons/Add';
import ClearIcon from '@material-ui/icons/Clear';
import GetAppIcon from '@material-ui/icons/GetApp';
import HistoryIcon from '@material-ui/icons/History';
import VisibilityIcon from '@material-ui/icons/Visibility';
import { Progress, WarningPanel, InfoCard } from '@backstage/core-components';
import { useParams, useNavigate } from 'react-router-dom';
import { usePipelineApi } from '../../hooks/usePipelineApi';
import { usePipelineTeam } from '../../hooks/usePipelineTeam';
import { hasMinRole } from '@internal/plugin-pipeline-common';
import type { FleetAgent, ManagedConfigVersion } from '../../api/types/fleet';
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
    metadataGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      gap: theme.spacing(2),
      padding: theme.spacing(2),
    },
    metadataItem: {
      display: 'flex',
      flexDirection: 'column',
    },
    metadataLabel: {
      fontSize: '0.75rem',
      fontWeight: 600,
      color: theme.palette.text.secondary,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      marginBottom: theme.spacing(0.5),
    },
    metadataValue: {
      fontSize: '0.875rem',
    },
    labelsContainer: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: theme.spacing(1),
      padding: theme.spacing(2),
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
    configSyncContainer: {
      padding: theme.spacing(2),
    },
    configSyncGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      gap: theme.spacing(2),
    },
    hashCode: {
      fontFamily: 'monospace',
      fontSize: '0.85rem',
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
    syncApplied: { color: theme.palette.success?.main ?? '#4caf50' },
    syncRejected: { color: theme.palette.error?.main ?? '#f44336' },
    syncUnchanged: { color: theme.palette.text.secondary },
    syncError: {
      color: theme.palette.error?.main ?? '#f44336',
      marginTop: theme.spacing(1),
      fontSize: '0.85rem',
      fontFamily: 'monospace',
    },
    section: {
      marginBottom: theme.spacing(3),
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

export function AgentDetailPage() {
  const classes = useStyles();
  const api = usePipelineApi();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { activeTeam, activeRole, isPlatformAdmin } = usePipelineTeam();
  const isAdminMode = isPlatformAdmin && !activeTeam;
  const canDelete =
    isAdminMode || (!!activeRole && hasMinRole(activeRole, 'admin'));
  const canEdit =
    isAdminMode || (!!activeRole && hasMinRole(activeRole, 'operator'));

  const [agent, setAgent] = useState<FleetAgent | null>(null);
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

  // Promote dialog state
  const [promoteDialogOpen, setPromoteDialogOpen] = useState(false);
  const [promoteGroupId, setPromoteGroupId] = useState('');
  const [promoting, setPromoting] = useState(false);
  const [matchingGroups, setMatchingGroups] = useState<Array<{ id: string; name: string }>>([]);

  const loadAgent = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const result = await api.getFleetAgent(id);
      setAgent(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [api, id]);

  useEffect(() => {
    loadAgent();
  }, [loadAgent]);

  // Auto-refresh every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadAgent();
    }, 15000);
    return () => clearInterval(interval);
  }, [loadAgent]);

  const handleDelete = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      await api.deleteFleetAgent(id);
      navigate('../..', { relative: 'path' });
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const handleImportFromRegistration = async () => {
    if (!agent) return;
    try {
      await api.importAgentConfig(agent.id);
      loadAgent();
    } catch (err) {
      alert(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleOpenEditor = async () => {
    if (!agent) return;
    // Load existing managed config DAG if available
    const config = await api.getAgentConfig(agent.id);
    if (config) {
      setEditorInitialDag(config.dag);
    } else {
      setEditorInitialDag(undefined);
    }
    setEditorOpen(true);
  };

  const handleSaveConfig = useCallback(
    async (dag: PipelineDag, changeSummary?: string) => {
      if (!agent) return;
      await api.saveAgentConfig(agent.id, {
        dag,
        change_summary: changeSummary,
      });
      setEditorOpen(false);
      loadAgent();
    },
    [api, agent, loadAgent],
  );

  const handleDeleteConfig = async () => {
    if (!agent) return;
    if (!window.confirm('Remove managed config? The agent will fall back to group config.')) return;
    try {
      await api.deleteAgentConfig(agent.id);
      loadAgent();
    } catch (err) {
      alert(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleOpenPromote = async () => {
    if (!agent) return;
    // Load matching groups for the promote picker
    const groups = agent.matchingGroups ?? [];
    // Also load all groups to give the operator a full list
    try {
      const allGroups = await api.listFleetGroups();
      setMatchingGroups(allGroups.items.map(g => ({ id: g.id, name: g.name })));
    } catch {
      setMatchingGroups(groups.map(g => ({ id: g.id, name: g.name })));
    }
    setPromoteGroupId('');
    setPromoteDialogOpen(true);
  };

  const handlePromote = async () => {
    if (!agent || !promoteGroupId) return;
    setPromoting(true);
    try {
      await api.promoteAgentConfig(agent.id, promoteGroupId);
      setPromoteDialogOpen(false);
      loadAgent();
    } catch (err) {
      alert(`Promote failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPromoting(false);
    }
  };

  const handleShowVersions = async () => {
    if (!agent) return;
    try {
      const result = await api.listAgentConfigVersions(agent.id);
      // The API returns { items: [...] }
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
      <WarningPanel title="Failed to load agent" message={error.message} />
    );
  }

  if (!agent) {
    return <WarningPanel title="Agent not found" message={`No agent found with ID "${id}".`} />;
  }

  // If the config editor is open, show it fullscreen
  if (editorOpen) {
    return (
      <div>
        <Box className={classes.header}>
          <Box className={classes.headerLeft}>
            <Tooltip title="Back to Agent Detail">
              <IconButton onClick={() => setEditorOpen(false)}>
                <ArrowBackIcon />
              </IconButton>
            </Tooltip>
            <Typography variant="h5">
              Edit Config: {agent.agent_id}
            </Typography>
          </Box>
        </Box>
        <ConfigEditor
          initialDag={editorInitialDag}
          onSave={handleSaveConfig}
          onDagChange={setEditorCurrentDag}
          title={`${agent.agent_id} configuration`}
          toolbarActions={
            <ValidateButton getDag={() => editorCurrentDag} />
          }
        />
      </div>
    );
  }

  const labels = agent.labels ?? {};
  const labelEntries = Object.entries(labels);
  const syncResult = agent.config_sync_result;
  const hasManagedConfig = !!agent.managedConfig;
  const hasRegistrationConfig = !!agent.vector_config_content;

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
          <Typography variant="h5">{agent.agent_id}</Typography>
          <Chip
            label={agent.status}
            size="small"
            className={getStatusClass(agent.status)}
          />
        </Box>
        <Box className={classes.headerActions}>
          <Tooltip title="Refresh">
            <IconButton onClick={loadAgent} size="small">
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          {canDelete && (
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

      {/* Metadata Section */}
      <div className={classes.section}>
        <InfoCard title="Agent Details">
          <Box className={classes.metadataGrid}>
            <div className={classes.metadataItem}>
              <Typography className={classes.metadataLabel}>
                Agent ID
              </Typography>
              <Typography className={classes.metadataValue}>
                {agent.agent_id}
              </Typography>
            </div>
            <div className={classes.metadataItem}>
              <Typography className={classes.metadataLabel}>Team</Typography>
              <Typography className={classes.metadataValue}>
                {agent.team}
              </Typography>
            </div>
            <div className={classes.metadataItem}>
              <Typography className={classes.metadataLabel}>
                Hostname
              </Typography>
              <Typography className={classes.metadataValue}>
                {agent.hostname || '--'}
              </Typography>
            </div>
            <div className={classes.metadataItem}>
              <Typography className={classes.metadataLabel}>
                IP Address
              </Typography>
              <Typography className={classes.metadataValue}>
                {agent.ip_address || '--'}
              </Typography>
            </div>
            <div className={classes.metadataItem}>
              <Typography className={classes.metadataLabel}>
                OS / Arch
              </Typography>
              <Typography className={classes.metadataValue}>
                {agent.os && agent.arch
                  ? `${agent.os}/${agent.arch}`
                  : '--'}
              </Typography>
            </div>
            <div className={classes.metadataItem}>
              <Typography className={classes.metadataLabel}>
                Vector Version
              </Typography>
              <Typography className={classes.metadataValue}>
                {agent.vector_version || '--'}
              </Typography>
            </div>
            <div className={classes.metadataItem}>
              <Typography className={classes.metadataLabel}>
                Config Path
              </Typography>
              <Typography className={classes.metadataValue}>
                {agent.vector_config_path || '--'}
              </Typography>
            </div>
            <div className={classes.metadataItem}>
              <Typography className={classes.metadataLabel}>
                Registered At
              </Typography>
              <Typography className={classes.metadataValue}>
                {new Date(agent.registered_at).toLocaleString()}
              </Typography>
            </div>
            <div className={classes.metadataItem}>
              <Typography className={classes.metadataLabel}>
                Last Heartbeat
              </Typography>
              <Typography className={classes.metadataValue}>
                {formatTimeAgo(agent.last_heartbeat_at)}
              </Typography>
            </div>
          </Box>
        </InfoCard>
      </div>

      {/* Labels Section */}
      <div className={classes.section}>
        <InfoCard title="Labels">
          <Box className={classes.labelsContainer}>
            {labelEntries.length > 0 ? (
              labelEntries.map(([key, value]) => (
                <Chip key={key} label={`${key}=${value}`} variant="outlined" size="small" />
              ))
            ) : (
              <Typography color="textSecondary">No labels</Typography>
            )}
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
                    label={`Agent config v${agent.managedConfig!.version}`}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                  <Typography variant="body2" color="textSecondary">
                    Hash: <code className={classes.hashCode}>
                      {agent.managedConfig!.config_hash.slice(0, 12)}
                    </code>
                    {' '}| {formatTimeAgo(agent.managedConfig!.created_at)} by {agent.managedConfig!.created_by}
                  </Typography>
                </>
              ) : (
                <Typography variant="body2" color="textSecondary">
                  No managed config.
                  {hasRegistrationConfig
                    ? ' The agent reported a config on registration that can be imported.'
                    : ' Create a new config or wait for a group config to apply.'}
                </Typography>
              )}
            </Box>

            {/* Action buttons */}
            {canEdit && (
              <Box className={classes.configActions}>
                {!hasManagedConfig && hasRegistrationConfig && (
                  <Button
                    variant="contained"
                    color="primary"
                    size="small"
                    startIcon={<GetAppIcon />}
                    onClick={handleImportFromRegistration}
                  >
                    Import from Registration
                  </Button>
                )}
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
                    startIcon={<PublishIcon />}
                    onClick={handleOpenPromote}
                  >
                    Promote to Group
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

      {/* Config Sync Section */}
      <div className={classes.section}>
        <InfoCard title="Config Sync">
          <Box className={classes.configSyncContainer}>
            <Box className={classes.configSyncGrid}>
              <div className={classes.metadataItem}>
                <Typography className={classes.metadataLabel}>
                  Current Config Hash
                </Typography>
                <Typography className={classes.metadataValue}>
                  <code className={classes.hashCode}>
                    {agent.current_config_hash
                      ? agent.current_config_hash.slice(0, 12)
                      : '--'}
                  </code>
                </Typography>
              </div>
              <div className={classes.metadataItem}>
                <Typography className={classes.metadataLabel}>
                  Sync Status
                </Typography>
                {syncResult ? (
                  <Typography
                    className={
                      syncResult.status === 'applied'
                        ? classes.syncApplied
                        : syncResult.status === 'rejected'
                          ? classes.syncRejected
                          : classes.syncUnchanged
                    }
                  >
                    {syncResult.status}
                  </Typography>
                ) : (
                  <Typography color="textSecondary">--</Typography>
                )}
              </div>
              {syncResult?.error && (
                <div className={classes.metadataItem}>
                  <Typography className={classes.metadataLabel}>
                    Sync Error
                  </Typography>
                  <Typography className={classes.syncError}>
                    {syncResult.error}
                  </Typography>
                </div>
              )}
              {syncResult?.appliedAt && (
                <div className={classes.metadataItem}>
                  <Typography className={classes.metadataLabel}>
                    Applied At
                  </Typography>
                  <Typography className={classes.metadataValue}>
                    {formatTimeAgo(syncResult.appliedAt)}
                  </Typography>
                </div>
              )}
            </Box>
          </Box>
        </InfoCard>
      </div>

      {/* Group Membership Section */}
      <div className={classes.section}>
        <InfoCard title="Group Membership">
          <Box className={classes.labelsContainer}>
            {agent.matchingGroups && agent.matchingGroups.length > 0 ? (
              agent.matchingGroups.map(group => (
                <Chip
                  key={group.id}
                  label={group.name}
                  variant="outlined"
                  size="small"
                  clickable
                  onClick={() => navigate(`../groups/${group.id}`, { relative: 'path' })}
                />
              ))
            ) : (
              <Typography color="textSecondary">
                No matching groups. Agent labels don't match any group selectors.
              </Typography>
            )}
          </Box>
        </InfoCard>
      </div>

      {/* Active Deployments Section */}
      <div className={classes.section}>
        <InfoCard title="Active Deployments">
          {agent.activeDeployments && agent.activeDeployments.length > 0 ? (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Pipeline</TableCell>
                    <TableCell>Target</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Deployed By</TableCell>
                    <TableCell>Deployed At</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {agent.activeDeployments.map(dep => (
                    <TableRow key={dep.id} hover>
                      <TableCell>{dep.pipeline_name}</TableCell>
                      <TableCell>
                        <Chip
                          label={dep.target_type}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>{dep.type}</TableCell>
                      <TableCell>{dep.deployed_by}</TableCell>
                      <TableCell>
                        {new Date(dep.deployed_at).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Box p={2}>
              <Typography color="textSecondary">
                No active deployments. Deploy a pipeline to this agent or a matching group.
              </Typography>
            </Box>
          )}
        </InfoCard>
      </div>

      {/* Errors Section */}
      {agent.errors && agent.errors.length > 0 && (
        <div className={classes.section}>
          <InfoCard title="Recent Errors">
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Timestamp</TableCell>
                    <TableCell>Message</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {agent.errors.map((err, index) => (
                    <TableRow key={index}>
                      <TableCell style={{ whiteSpace: 'nowrap' }}>
                        {formatTimeAgo(err.timestamp)}
                      </TableCell>
                      <TableCell>{err.message}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </InfoCard>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Delete Agent</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete agent{' '}
            <strong>{agent.agent_id}</strong>? This action cannot be undone. The
            agent will need to re-register to appear again.
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

      {/* Promote to Group Dialog */}
      <Dialog
        open={promoteDialogOpen}
        onClose={() => !promoting && setPromoteDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Promote Config to Group</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>
            Copy <strong>{agent.agent_id}</strong>'s managed config (v
            {agent.managedConfig?.version}) to a group. All agents in the group
            will receive this config on their next poll.
          </Typography>
          <TextField
            select
            fullWidth
            label="Target Group"
            value={promoteGroupId}
            onChange={e => setPromoteGroupId(e.target.value)}
            margin="dense"
            disabled={promoting}
          >
            {matchingGroups.map(g => (
              <MenuItem key={g.id} value={g.id}>
                {g.name}
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setPromoteDialogOpen(false)}
            disabled={promoting}
          >
            Cancel
          </Button>
          <Button
            onClick={handlePromote}
            color="primary"
            variant="contained"
            disabled={promoting || !promoteGroupId}
          >
            {promoting ? 'Promoting...' : 'Promote'}
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
