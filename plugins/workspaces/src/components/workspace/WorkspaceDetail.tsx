// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import { Progress, EmptyState } from '@backstage/core-components';
import {
  Typography,
  Button,
  Box,
  Grid,
  Card,
  CardContent,
  Chip,
  IconButton,
  Tooltip,
  CircularProgress,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import { Alert } from '@material-ui/lab';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import LinkIcon from '@material-ui/icons/Link';
import LinkOffIcon from '@material-ui/icons/LinkOff';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import DeleteIcon from '@material-ui/icons/Delete';
import FileCopyIcon from '@material-ui/icons/FileCopy';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';
import RefreshIcon from '@material-ui/icons/Refresh';
import SyncIcon from '@material-ui/icons/Sync';
import {
  butlerApiRef,
  StatusBadge,
  WorkspaceTerminalDialog,
} from '@internal/plugin-butler';
import type { Workspace, WorkspaceMetrics } from '@internal/plugin-butler';
import { VSCodeIcon, JetBrainsIcon, NeovimIcon } from '../icons/EditorIcons';
import { DeleteWorkspaceDialog } from './DeleteWorkspaceDialog';

const useStyles = makeStyles(theme => ({
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing(3),
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
  },
  infoCard: {
    height: '100%',
  },
  metricValue: {
    fontFamily: 'monospace',
    fontSize: '1.5rem',
    fontWeight: 600,
  },
  metricLabel: {
    color: theme.palette.text.secondary,
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  sshBox: {
    padding: theme.spacing(1.5, 2),
    borderRadius: theme.shape.borderRadius,
    backgroundColor: theme.palette.background.default,
    border: `1px solid ${theme.palette.divider}`,
    fontFamily: 'monospace',
    fontSize: '0.85rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  section: {
    marginTop: theme.spacing(3),
  },
  editorButton: {
    textTransform: 'none',
  },
}));

const parseSSHEndpoint = (
  endpoint: string,
): { host: string; port: string } => {
  const parts = endpoint.split(':');
  return { host: parts[0], port: parts.length > 1 ? parts[1] : '2222' };
};

const formatAge = (timestamp?: string): string => {
  if (!timestamp) return '-';
  const diffMs = Date.now() - new Date(timestamp).getTime();
  if (diffMs < 0) return '0s';
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

export const WorkspaceDetail = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const navigate = useNavigate();
  const { cluster, namespace, name } = useParams<{
    cluster: string;
    namespace: string;
    name: string;
  }>();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [metrics, setMetrics] = useState<WorkspaceMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();
  const [actionInProgress, setActionInProgress] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Delete
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Terminal
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalCommand, setTerminalCommand] = useState<string | undefined>();

  // Stable terminal target — avoids creating a new object on every render
  const terminalTarget = useMemo(
    () =>
      workspace
        ? { name: workspace.metadata.name, podName: workspace.status?.podName }
        : null,
    [workspace?.metadata.name, workspace?.status?.podName],
  );

  const fetchData = useCallback(async () => {
    if (!namespace || !cluster || !name) return;
    try {
      const ws = await api.getWorkspace(namespace, cluster, name);
      setWorkspace(ws);

      if (ws.status?.phase === 'Running' && ws.status?.podName) {
        try {
          const m = await api.getWorkspaceMetrics(namespace, cluster, name);
          setMetrics(m);
        } catch {
          setMetrics(null);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [api, namespace, cluster, name]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 15-second polling
  useEffect(() => {
    if (!namespace || !cluster || !name) return;
    const interval = setInterval(() => {
      api
        .getWorkspace(namespace, cluster, name)
        .then(ws => {
          setWorkspace(ws);
          if (ws.status?.phase === 'Running' && ws.status?.podName) {
            api
              .getWorkspaceMetrics(namespace, cluster, name)
              .then(m => setMetrics(m))
              .catch(() => {});
          }
        })
        .catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, [api, namespace, cluster, name]);

  const handleConnect = async () => {
    if (!namespace || !cluster || !name) return;
    setActionInProgress(true);
    try {
      await api.connectWorkspace(namespace, cluster, name);
      await fetchData();
    } catch {
      // Silent
    } finally {
      setActionInProgress(false);
    }
  };

  const handleDisconnect = async () => {
    if (!namespace || !cluster || !name) return;
    setActionInProgress(true);
    try {
      await api.disconnectWorkspace(namespace, cluster, name);
      await fetchData();
    } catch {
      // Silent
    } finally {
      setActionInProgress(false);
    }
  };

  const handleStart = async () => {
    if (!namespace || !cluster || !name) return;
    setActionInProgress(true);
    try {
      await api.startWorkspace(namespace, cluster, name);
      await fetchData();
    } catch {
      // Silent
    } finally {
      setActionInProgress(false);
    }
  };

  const handleDelete = async () => {
    if (!namespace || !cluster || !name) return;
    setDeleting(true);
    try {
      await api.deleteWorkspace(namespace, cluster, name);
      navigate('/workspaces');
    } catch {
      setDeleting(false);
    }
  };

  const handleSyncSSHKeys = async () => {
    if (!namespace || !cluster || !name) return;
    setActionInProgress(true);
    try {
      const result = await api.syncWorkspaceSSHKeys(namespace, cluster, name);
      setNotice(result.message);
      setTimeout(() => setNotice(null), 5000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to sync SSH keys';
      setNotice(msg);
      setTimeout(() => setNotice(null), 5000);
    } finally {
      setActionInProgress(false);
    }
  };

  const handleCopySSH = () => {
    if (!workspace?.status?.sshEndpoint) return;
    const { host, port } = parseSSHEndpoint(workspace.status.sshEndpoint);
    navigator.clipboard.writeText(`ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p ${port} dev@${host}`);
    setNotice('SSH command copied');
    setTimeout(() => setNotice(null), 2000);
  };

  const handleCopySSHConfig = () => {
    if (!workspace?.status?.sshEndpoint || !name) return;
    const { host, port } = parseSSHEndpoint(workspace.status.sshEndpoint);
    const config = `Host butler-ws-${name}
  HostName ${host}
  Port ${port}
  User dev
  StrictHostKeyChecking no
  UserKnownHostsFile /dev/null`;
    navigator.clipboard.writeText(config);
    setNotice('SSH config copied');
    setTimeout(() => setNotice(null), 2000);
  };

  const handleOpenVSCode = () => {
    if (!workspace?.status?.sshEndpoint || !name) return;
    const { host, port } = parseSSHEndpoint(workspace.status.sshEndpoint);
    const repos = workspace.spec.repositories;
    const folder =
      repos && repos.length > 1
        ? '/workspace/workspace.code-workspace'
        : '/workspace';
    // Use direct user@host:port format — supported by VS Code Remote SSH 0.90+
    const sshTarget = `dev@${host}:${port}`;
    window.location.href = `vscode://vscode-remote/ssh-remote+${sshTarget}${folder}`;
    setNotice('Opening VS Code Remote SSH... If prompted, accept the host fingerprint.');
    setTimeout(() => setNotice(null), 4000);
  };

  const handleOpenJetBrains = () => {
    if (!workspace?.status?.sshEndpoint) return;
    const { host, port } = parseSSHEndpoint(workspace.status.sshEndpoint);
    window.location.href = `jetbrains-gateway://connect#host=${host}&port=${port}&user=dev&type=ssh&deploy=true&projectPath=/workspace`;
    setNotice('Opening JetBrains Gateway...');
    setTimeout(() => setNotice(null), 4000);
  };

  const handleOpenNeovim = () => {
    if (workspace?.status?.phase !== 'Running') {
      setNotice('Workspace must be running to open a terminal.');
      setTimeout(() => setNotice(null), 4000);
      return;
    }
    setTerminalCommand('cd /workspace && nvim .');
    setTerminalOpen(true);
  };

  const handleOpenTerminal = () => {
    if (workspace?.status?.phase !== 'Running') {
      setNotice('Workspace must be running to open a terminal.');
      setTimeout(() => setNotice(null), 4000);
      return;
    }
    setTerminalCommand(undefined);
    setTerminalOpen(true);
  };

  if (loading) {
    return <Progress />;
  }

  if (error || !workspace) {
    return (
      <EmptyState
        title="Workspace not found"
        description={error?.message || 'The requested workspace could not be loaded.'}
        missing="info"
        action={
          <Button
            variant="outlined"
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate('/workspaces')}
          >
            Back to Dashboard
          </Button>
        }
      />
    );
  }

  const phase = workspace.status?.phase || 'Pending';
  const connected = workspace.status?.connected || false;
  const sshEndpoint = workspace.status?.sshEndpoint;

  return (
    <div>
      {/* Header */}
      <div className={classes.header}>
        <div className={classes.headerLeft}>
          <IconButton size="small" onClick={() => navigate('/workspaces')}>
            <ArrowBackIcon />
          </IconButton>
          <div>
            <Box display="flex" alignItems="center" style={{ gap: 8 }}>
              <Typography variant="h5">{name}</Typography>
              <StatusBadge status={phase} />
              {connected && (
                <Chip
                  label="Connected"
                  size="small"
                  style={{
                    backgroundColor: 'rgba(76, 175, 80, 0.1)',
                    color: '#2e7d32',
                    fontWeight: 500,
                  }}
                />
              )}
            </Box>
            <Typography variant="body2" color="textSecondary">
              Cluster: {cluster} &middot; Age:{' '}
              {formatAge(workspace.metadata.creationTimestamp)}
            </Typography>
          </div>
        </div>
        <Box display="flex" style={{ gap: 8 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={() => {
              setLoading(true);
              fetchData();
            }}
          >
            Refresh
          </Button>
          {phase === 'Running' && !connected && (
            <Button
              variant="contained"
              color="primary"
              size="small"
              disabled={actionInProgress}
              onClick={handleConnect}
              startIcon={
                actionInProgress ? (
                  <CircularProgress size={14} />
                ) : (
                  <LinkIcon />
                )
              }
            >
              Connect
            </Button>
          )}
          {connected && (
            <Button
              variant="outlined"
              size="small"
              disabled={actionInProgress}
              onClick={handleDisconnect}
              startIcon={
                actionInProgress ? (
                  <CircularProgress size={14} />
                ) : (
                  <LinkOffIcon />
                )
              }
            >
              Disconnect
            </Button>
          )}
          {phase === 'Stopped' && (
            <Button
              variant="contained"
              color="primary"
              size="small"
              disabled={actionInProgress}
              onClick={handleStart}
              startIcon={
                actionInProgress ? (
                  <CircularProgress size={14} />
                ) : (
                  <PlayArrowIcon />
                )
              }
            >
              Start
            </Button>
          )}
          {phase === 'Running' && (
            <Button
              variant="outlined"
              size="small"
              disabled={actionInProgress}
              onClick={handleSyncSSHKeys}
              startIcon={
                actionInProgress ? (
                  <CircularProgress size={14} />
                ) : (
                  <SyncIcon />
                )
              }
            >
              Sync SSH Keys
            </Button>
          )}
          <Button
            variant="outlined"
            size="small"
            startIcon={<DeleteIcon />}
            style={{ color: '#f44336', borderColor: '#f44336' }}
            onClick={() => setDeleteOpen(true)}
          >
            Delete
          </Button>
        </Box>
      </div>

      {notice && (
        <Box mb={2}>
          <Alert severity="info" onClose={() => setNotice(null)}>
            {notice}
          </Alert>
        </Box>
      )}

      {/* Info Cards */}
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={3}>
          <Card variant="outlined" className={classes.infoCard}>
            <CardContent>
              <Typography className={classes.metricLabel}>Image</Typography>
              <Typography variant="body2" noWrap style={{ marginTop: 4 }}>
                {workspace.spec.image}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card variant="outlined" className={classes.infoCard}>
            <CardContent>
              <Typography className={classes.metricLabel}>Owner</Typography>
              <Typography variant="body2" style={{ marginTop: 4 }}>
                {workspace.spec.owner}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card variant="outlined" className={classes.infoCard}>
            <CardContent>
              <Typography className={classes.metricLabel}>
                Resources
              </Typography>
              <Typography variant="body2" style={{ marginTop: 4 }}>
                CPU: {workspace.spec.resources?.cpu || '2'} &middot; Memory:{' '}
                {workspace.spec.resources?.memory || '4Gi'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card variant="outlined" className={classes.infoCard}>
            <CardContent>
              <Typography className={classes.metricLabel}>
                Auto-Stop
              </Typography>
              <Typography variant="body2" style={{ marginTop: 4 }}>
                {workspace.spec.autoStopAfter || 'Default'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Metrics */}
      {metrics && (
        <div className={classes.section}>
          <Typography variant="h6" gutterBottom>
            Metrics
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={6} sm={3}>
              <Card variant="outlined">
                <CardContent>
                  <Typography className={classes.metricLabel}>CPU</Typography>
                  <Typography className={classes.metricValue}>
                    {metrics.cpu}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Card variant="outlined">
                <CardContent>
                  <Typography className={classes.metricLabel}>
                    Memory
                  </Typography>
                  <Typography className={classes.metricValue}>
                    {metrics.memory}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Card variant="outlined">
                <CardContent>
                  <Typography className={classes.metricLabel}>
                    Storage
                  </Typography>
                  <Typography className={classes.metricValue}>
                    {metrics.storage || '-'}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Card variant="outlined">
                <CardContent>
                  <Typography className={classes.metricLabel}>
                    Uptime
                  </Typography>
                  <Typography className={classes.metricValue}>
                    {metrics.uptime}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </div>
      )}

      {/* SSH */}
      {sshEndpoint && (
        <div className={classes.section}>
          <Typography variant="h6" gutterBottom>
            SSH Access
          </Typography>
          <div className={classes.sshBox}>
            <span>
              ssh -p {parseSSHEndpoint(sshEndpoint).port} dev@
              {parseSSHEndpoint(sshEndpoint).host}
            </span>
            <Box display="flex" style={{ gap: 4 }}>
              <Tooltip title="Copy SSH command">
                <IconButton size="small" onClick={handleCopySSH}>
                  <FileCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Copy SSH config">
                <IconButton size="small" onClick={handleCopySSHConfig}>
                  <FileCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </div>
        </div>
      )}

      {/* Editors */}
      {connected && sshEndpoint && (
        <div className={classes.section}>
          <Typography variant="h6" gutterBottom>
            Open in Editor
          </Typography>
          <Box display="flex" style={{ gap: 12 }}>
            <Button
              variant="outlined"
              size="small"
              className={classes.editorButton}
              onClick={handleOpenVSCode}
              startIcon={<VSCodeIcon style={{ color: '#007ACC' }} />}
            >
              VS Code
            </Button>
            <Button
              variant="outlined"
              size="small"
              className={classes.editorButton}
              onClick={handleOpenJetBrains}
              startIcon={<JetBrainsIcon />}
            >
              JetBrains Gateway
            </Button>
            <Button
              variant="outlined"
              size="small"
              className={classes.editorButton}
              onClick={handleOpenNeovim}
              startIcon={<NeovimIcon style={{ color: '#57A143' }} />}
            >
              Neovim (Terminal)
            </Button>
            <Button
              variant="outlined"
              size="small"
              className={classes.editorButton}
              onClick={handleOpenTerminal}
              startIcon={<OpenInNewIcon />}
            >
              Terminal
            </Button>
          </Box>
        </div>
      )}

      {/* Repositories */}
      {(workspace.spec.repository || workspace.spec.repositories) && (
        <div className={classes.section}>
          <Typography variant="h6" gutterBottom>
            Repositories
          </Typography>
          {workspace.spec.repositories?.map((repo, idx) => (
            <Box key={idx} mb={1}>
              <Typography variant="body2" style={{ fontFamily: 'monospace' }}>
                {repo.url}
                {repo.branch ? ` (${repo.branch})` : ''}
              </Typography>
            </Box>
          ))}
          {workspace.spec.repository && !workspace.spec.repositories && (
            <Typography variant="body2" style={{ fontFamily: 'monospace' }}>
              {workspace.spec.repository.url}
              {workspace.spec.repository.branch
                ? ` (${workspace.spec.repository.branch})`
                : ''}
            </Typography>
          )}
        </div>
      )}

      {/* Dialogs */}
      <DeleteWorkspaceDialog
        open={deleteOpen}
        name={name || null}
        connected={connected}
        deleting={deleting}
        onDelete={handleDelete}
        onClose={() => setDeleteOpen(false)}
      />

      <WorkspaceTerminalDialog
        open={terminalOpen}
        target={terminalTarget}
        clusterNamespace={namespace || ''}
        clusterName={cluster || ''}
        initialCommand={terminalCommand}
        onClose={() => {
          setTerminalOpen(false);
          setTerminalCommand(undefined);
        }}
      />
    </div>
  );
};
