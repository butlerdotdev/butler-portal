// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import {
  Progress,
  EmptyState,
  Table,
  TableColumn,
} from '@backstage/core-components';
import {
  Typography,
  Button,
  Chip,
  Box,
  IconButton,
  Menu,
  MenuItem,
  CircularProgress,
  Tooltip,
  TextField,
  Snackbar,
  SnackbarContent,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import { Alert } from '@material-ui/lab';
import AddIcon from '@material-ui/icons/Add';
import RefreshIcon from '@material-ui/icons/Refresh';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import LinkIcon from '@material-ui/icons/Link';
import LinkOffIcon from '@material-ui/icons/LinkOff';
import FileCopyIcon from '@material-ui/icons/FileCopy';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';
import DeleteIcon from '@material-ui/icons/Delete';
import SyncIcon from '@material-ui/icons/Sync';
import {
  butlerApiRef,
  StatusBadge,
  WorkspaceTerminalDialog,
} from '@internal/plugin-butler';
import type { Workspace, Cluster } from '@internal/plugin-butler';
import { useWorkspaceTeam } from '../../hooks/useWorkspaceTeam';
import { VSCodeIcon, JetBrainsIcon, NeovimIcon } from '../icons/EditorIcons';
import { CreateWorkspaceDialog } from '../workspace/CreateWorkspaceDialog';
import { DeleteWorkspaceDialog } from '../workspace/DeleteWorkspaceDialog';

const useStyles = makeStyles(theme => ({
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(2),
  },
  headerTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  countChip: {
    fontSize: '0.75rem',
  },
  connectedChip: {
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(76, 175, 80, 0.15)'
        : 'rgba(76, 175, 80, 0.1)',
    color: theme.palette.type === 'dark' ? '#81c784' : '#2e7d32',
    fontWeight: 500,
  },
  disconnectedChip: {
    fontWeight: 500,
  },
}));

type WorkspaceRow = {
  id: string;
  name: string;
  cluster: string;
  clusterNamespace: string;
  clusterName: string;
  owner: string;
  image: string;
  phase: string;
  sshEndpoint: string;
  connected: boolean;
  age: string;
  raw: Workspace;
};

const formatAge = (timestamp?: string): string => {
  if (!timestamp) return '-';
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  if (diffMs < 0) return '0s';

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
};

const parseSSHEndpoint = (
  endpoint: string,
): { host: string; port: string } => {
  const parts = endpoint.split(':');
  return { host: parts[0], port: parts.length > 1 ? parts[1] : '2222' };
};

export const WorkspaceDashboard = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const { activeTeam, userEmail, adminView } = useWorkspaceTeam();

  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();
  const [clusterFilter, setClusterFilter] = useState('');

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Actions menu
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuRow, setMenuRow] = useState<WorkspaceRow | null>(null);

  // Action in-progress
  const [actionInProgress, setActionInProgress] = useState<string | null>(
    null,
  );

  // Terminal
  const [terminalNotice, setTerminalNotice] = useState<string | null>(null);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalRow, setTerminalRow] = useState<WorkspaceRow | null>(null);
  const [terminalCommand, setTerminalCommand] = useState<string | undefined>();

  // Stable terminal target — avoids creating a new object on every render
  // which would cause WorkspaceTerminalDialog to reconnect the WebSocket.
  const terminalTarget = useMemo(
    () =>
      terminalRow
        ? { name: terminalRow.name, podName: terminalRow.raw.status?.podName }
        : null,
    [terminalRow],
  );

  // Snackbar toast
  const [toast, setToast] = useState<{
    open: boolean;
    message: string;
    action?: { label: string; onClick: () => void };
  }>({ open: false, message: '' });

  const fetchData = useCallback(async () => {
    if (!activeTeam) return;
    setLoading(true);
    setError(undefined);
    try {
      const clusterResponse = await api.listClusters({ team: activeTeam });
      const fetchedClusters = clusterResponse.clusters || [];
      setClusters(fetchedClusters);

      const allRows: WorkspaceRow[] = [];
      for (const cluster of fetchedClusters) {
        try {
          const wsResponse = await api.listWorkspaces(
            cluster.metadata.namespace,
            cluster.metadata.name,
          );
          for (const ws of wsResponse.workspaces || []) {
            allRows.push({
              id: `${cluster.metadata.name}/${ws.metadata.name}`,
              name: ws.metadata.name,
              cluster: cluster.metadata.name,
              clusterNamespace: cluster.metadata.namespace,
              clusterName: cluster.metadata.name,
              owner: ws.spec.owner,
              image: ws.spec.image,
              phase: ws.status?.phase || 'Pending',
              sshEndpoint: ws.status?.sshEndpoint || '',
              connected: ws.status?.connected || false,
              age: formatAge(ws.metadata.creationTimestamp),
              raw: ws,
            });
          }
        } catch {
          // Skip clusters that fail workspace listing
        }
      }

      // Filter to only the current user's workspaces (skip in admin view)
      const filtered =
        !adminView && userEmail
          ? allRows.filter(r => r.owner === userEmail)
          : allRows;
      setWorkspaces(filtered);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [api, activeTeam, userEmail, adminView]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 15-second polling
  useEffect(() => {
    if (!activeTeam) return;
    const interval = setInterval(() => {
      api
        .listClusters({ team: activeTeam })
        .then(async clusterResponse => {
          const fetchedClusters = clusterResponse.clusters || [];
          const allRows: WorkspaceRow[] = [];
          for (const cluster of fetchedClusters) {
            try {
              const wsResponse = await api.listWorkspaces(
                cluster.metadata.namespace,
                cluster.metadata.name,
              );
              for (const ws of wsResponse.workspaces || []) {
                allRows.push({
                  id: `${cluster.metadata.name}/${ws.metadata.name}`,
                  name: ws.metadata.name,
                  cluster: cluster.metadata.name,
                  clusterNamespace: cluster.metadata.namespace,
                  clusterName: cluster.metadata.name,
                  owner: ws.spec.owner,
                  image: ws.spec.image,
                  phase: ws.status?.phase || 'Pending',
                  sshEndpoint: ws.status?.sshEndpoint || '',
                  connected: ws.status?.connected || false,
                  age: formatAge(ws.metadata.creationTimestamp),
                  raw: ws,
                });
              }
            } catch {
              // Silent polling failure
            }
          }
          const filtered =
            !adminView && userEmail
              ? allRows.filter(r => r.owner === userEmail)
              : allRows;
          setWorkspaces(filtered);
        })
        .catch(() => {
          // Silent polling failure
        });
    }, 15000);
    return () => clearInterval(interval);
  }, [api, activeTeam, userEmail, adminView]);

  // Filtered workspaces by cluster
  const filteredWorkspaces = useMemo(
    () =>
      clusterFilter
        ? workspaces.filter(w => w.cluster === clusterFilter)
        : workspaces,
    [workspaces, clusterFilter],
  );

  // Stats
  const stats = useMemo(() => {
    const running = filteredWorkspaces.filter(w => w.phase === 'Running').length;
    const stopped = filteredWorkspaces.filter(w => w.phase === 'Stopped').length;
    return { running, stopped, total: filteredWorkspaces.length };
  }, [filteredWorkspaces]);

  // Handlers
  const handleMenuOpen = (
    event: React.MouseEvent<HTMLElement>,
    row: WorkspaceRow,
  ) => {
    setMenuAnchor(event.currentTarget);
    setMenuRow(row);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    setMenuRow(null);
  };

  const handleConnect = async (row: WorkspaceRow) => {
    setActionInProgress(row.id);
    try {
      await api.connectWorkspace(
        row.clusterNamespace,
        row.clusterName,
        row.name,
      );
      await fetchData();
    } catch {
      // Silent
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDisconnect = async (row: WorkspaceRow) => {
    setActionInProgress(row.id);
    try {
      await api.disconnectWorkspace(
        row.clusterNamespace,
        row.clusterName,
        row.name,
      );
      await fetchData();
    } catch {
      // Silent
    } finally {
      setActionInProgress(null);
    }
  };

  const handleStart = async (row: WorkspaceRow) => {
    setActionInProgress(row.id);
    try {
      await api.startWorkspace(
        row.clusterNamespace,
        row.clusterName,
        row.name,
      );
      await fetchData();
    } catch {
      // Silent
    } finally {
      setActionInProgress(null);
    }
  };

  const handleCopySSH = (row: WorkspaceRow) => {
    if (row.sshEndpoint) {
      const { host, port } = parseSSHEndpoint(row.sshEndpoint);
      navigator.clipboard.writeText(`ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p ${port} dev@${host}`);
      setToast({ open: true, message: 'SSH command copied to clipboard.' });
    }
  };

  const handleOpenVSCode = (row: WorkspaceRow) => {
    if (!row.sshEndpoint) return;
    const { host, port } = parseSSHEndpoint(row.sshEndpoint);
    const repos = row.raw.spec.repositories;
    const folder =
      repos && repos.length > 1
        ? '/workspace/workspace.code-workspace'
        : '/workspace';
    // Use direct user@host:port format — supported by VS Code Remote SSH 0.90+
    const sshTarget = `dev@${host}:${port}`;
    const uri = `vscode://vscode-remote/ssh-remote+${sshTarget}${folder}`;
    window.location.href = uri;

    setToast({
      open: true,
      message: 'Opening VS Code Remote SSH... If prompted, accept the host fingerprint.',
    });
  };

  const handleOpenJetBrains = (row: WorkspaceRow) => {
    if (!row.sshEndpoint) return;
    const { host, port } = parseSSHEndpoint(row.sshEndpoint);
    const uri = `jetbrains-gateway://connect#host=${host}&port=${port}&user=dev&type=ssh&deploy=true&projectPath=/workspace`;
    window.location.href = uri;
    setToast({ open: true, message: 'Opening JetBrains Gateway...' });
  };

  const handleOpenNeovim = (row: WorkspaceRow) => {
    if (!row.sshEndpoint) return;
    const { host, port } = parseSSHEndpoint(row.sshEndpoint);
    const cmd = `ssh -t -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p ${port} dev@${host} "cd /workspace && nvim ."`;
    navigator.clipboard.writeText(cmd);
    setToast({
      open: true,
      message: 'Neovim SSH command copied. Paste it in your terminal.',
    });
  };

  const handleOpenNeovimBrowser = (row: WorkspaceRow) => {
    setTerminalCommand('cd /workspace && nvim .');
    setTerminalRow(row);
    setTerminalOpen(true);
  };

  const handleCopySSHConfig = (row: WorkspaceRow) => {
    if (!row.sshEndpoint) return;
    const { host, port } = parseSSHEndpoint(row.sshEndpoint);
    const config = `Host butler-ws-${row.name}
  HostName ${host}
  Port ${port}
  User dev
  StrictHostKeyChecking no
  UserKnownHostsFile /dev/null`;
    navigator.clipboard.writeText(config);
    setToast({ open: true, message: 'SSH config copied to clipboard.' });
  };

  const handleTerminal = (row: WorkspaceRow) => {
    if (row.phase !== 'Running') {
      setTerminalNotice('Workspace must be running to open a terminal.');
      setTimeout(() => setTerminalNotice(null), 4000);
      return;
    }
    setTerminalCommand(undefined);
    setTerminalRow(row);
    setTerminalOpen(true);
  };

  const handleSyncSSHKeys = async (row: WorkspaceRow) => {
    setActionInProgress(row.id);
    try {
      const result = await api.syncWorkspaceSSHKeys(
        row.clusterNamespace,
        row.clusterName,
        row.name,
      );
      setTerminalNotice(result.message);
      setTimeout(() => setTerminalNotice(null), 5000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to sync SSH keys';
      setTerminalNotice(msg);
      setTimeout(() => setTerminalNotice(null), 5000);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleOpenDelete = (row: WorkspaceRow) => {
    setDeleteTarget(row);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteWorkspace(
        deleteTarget.clusterNamespace,
        deleteTarget.clusterName,
        deleteTarget.name,
      );
      setDeleteOpen(false);
      setDeleteTarget(null);
      await fetchData();
    } catch {
      // Silent
    } finally {
      setDeleting(false);
    }
  };

  const handleCreateSuccess = () => {
    setCreateOpen(false);
    fetchData();
  };

  if (loading) {
    return <Progress />;
  }

  if (error) {
    return (
      <EmptyState
        title="Failed to load workspaces"
        description={error.message}
        missing="info"
      />
    );
  }

  const columns: TableColumn<WorkspaceRow>[] = [
    {
      title: 'Name',
      field: 'name',
      render: (row: WorkspaceRow) => (
        <Typography
          variant="body2"
          style={{ fontWeight: 500, cursor: 'pointer' }}
          color="primary"
          component={RouterLink}
          to={`/workspaces/workspace/${row.clusterName}/${row.clusterNamespace}/${row.name}`}
        >
          {row.name}
        </Typography>
      ),
    },
    ...(adminView
      ? [
          {
            title: 'Owner',
            field: 'owner' as const,
          },
        ]
      : []),
    {
      title: 'Cluster',
      field: 'cluster',
    },
    {
      title: 'Image',
      field: 'image',
      render: (row: WorkspaceRow) => (
        <Typography variant="body2" noWrap style={{ maxWidth: 200 }}>
          {row.image}
        </Typography>
      ),
    },
    {
      title: 'Phase',
      field: 'phase',
      render: (row: WorkspaceRow) => <StatusBadge status={row.phase} />,
    },
    {
      title: 'SSH',
      field: 'sshEndpoint',
      render: (row: WorkspaceRow) => {
        if (!row.sshEndpoint) {
          return (
            <Typography variant="body2" color="textSecondary">
              -
            </Typography>
          );
        }
        const { host, port } = parseSSHEndpoint(row.sshEndpoint);
        return (
          <Typography
            variant="body2"
            noWrap
            style={{
              maxWidth: 240,
              fontFamily: 'monospace',
              fontSize: '0.8rem',
            }}
          >
            ssh -p {port} dev@{host}
          </Typography>
        );
      },
    },
    {
      title: 'Connected',
      field: 'connected',
      render: (row: WorkspaceRow) =>
        row.connected ? (
          <Chip
            label="Yes"
            size="small"
            className={classes.connectedChip}
          />
        ) : (
          <Chip
            label="No"
            size="small"
            variant="outlined"
            className={classes.disconnectedChip}
          />
        ),
    },
    { title: 'Age', field: 'age' },
    {
      title: 'Actions',
      field: 'id',
      width: '240px',
      render: (row: WorkspaceRow) => (
        <Box display="flex" style={{ gap: 4 }} alignItems="center">
          {row.connected && row.sshEndpoint && (
            <>
              <Tooltip title="Open in VS Code">
                <IconButton
                  size="small"
                  onClick={() => handleOpenVSCode(row)}
                  style={{ color: '#007ACC' }}
                >
                  <VSCodeIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Open in JetBrains Gateway">
                <IconButton
                  size="small"
                  onClick={() => handleOpenJetBrains(row)}
                >
                  <JetBrainsIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Open Neovim in Terminal">
                <IconButton
                  size="small"
                  onClick={() => handleOpenNeovim(row)}
                  style={{ color: '#57A143' }}
                >
                  <NeovimIcon />
                </IconButton>
              </Tooltip>
            </>
          )}
          {row.phase === 'Running' && !row.connected && (
            <Button
              size="small"
              variant="outlined"
              color="primary"
              disabled={actionInProgress === row.id}
              onClick={() => handleConnect(row)}
              startIcon={
                actionInProgress === row.id ? (
                  <CircularProgress size={14} />
                ) : (
                  <LinkIcon />
                )
              }
              style={{ textTransform: 'none', fontSize: '0.75rem' }}
            >
              Connect
            </Button>
          )}
          {row.connected && (
            <Button
              size="small"
              variant="outlined"
              disabled={actionInProgress === row.id}
              onClick={() => handleDisconnect(row)}
              startIcon={
                actionInProgress === row.id ? (
                  <CircularProgress size={14} />
                ) : (
                  <LinkOffIcon />
                )
              }
              style={{ textTransform: 'none', fontSize: '0.75rem' }}
            >
              Disconnect
            </Button>
          )}
          {row.phase === 'Stopped' && (
            <Button
              size="small"
              variant="outlined"
              color="primary"
              disabled={actionInProgress === row.id}
              onClick={() => handleStart(row)}
              startIcon={
                actionInProgress === row.id ? (
                  <CircularProgress size={14} />
                ) : (
                  <PlayArrowIcon />
                )
              }
              style={{ textTransform: 'none', fontSize: '0.75rem' }}
            >
              Start
            </Button>
          )}
          <IconButton
            size="small"
            onClick={e => handleMenuOpen(e, row)}
            aria-label="more actions"
          >
            <MoreVertIcon fontSize="small" />
          </IconButton>
        </Box>
      ),
    },
  ];

  return (
    <div>
      <div className={classes.headerRow}>
        <div className={classes.headerTitle}>
          <Typography variant="h5">
            {adminView ? 'All Workspaces' : 'My Workspaces'}
          </Typography>
          <Chip
            label={`${stats.total}`}
            size="small"
            color="default"
            className={classes.countChip}
          />
          {stats.running > 0 && (
            <Chip
              label={`${stats.running} running`}
              size="small"
              className={classes.connectedChip}
            />
          )}
        </div>
        <Box display="flex" style={{ gap: 8 }} alignItems="center">
          {clusters.length > 1 && (
            <TextField
              select
              label="Cluster"
              value={clusterFilter}
              onChange={e => setClusterFilter(e.target.value)}
              variant="outlined"
              size="small"
              style={{ minWidth: 150 }}
              SelectProps={{ displayEmpty: true }}
              InputLabelProps={{ shrink: true }}
            >
              <MenuItem value="">All Clusters</MenuItem>
              {clusters.map(c => (
                <MenuItem key={c.metadata.name} value={c.metadata.name}>
                  {c.metadata.name}
                </MenuItem>
              ))}
            </TextField>
          )}
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={fetchData}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            color="primary"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setCreateOpen(true)}
          >
            Create Workspace
          </Button>
        </Box>
      </div>

      {terminalNotice && (
        <Box mb={2}>
          <Alert severity="info" onClose={() => setTerminalNotice(null)}>
            {terminalNotice}
          </Alert>
        </Box>
      )}

      {filteredWorkspaces.length === 0 ? (
        <EmptyState
          title="No workspaces yet"
          description="Create a workspace to start developing in a cloud environment."
          missing="content"
          action={
            <Button
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
              onClick={() => setCreateOpen(true)}
            >
              Create Workspace
            </Button>
          }
        />
      ) : (
        <Table<WorkspaceRow>
          title={`Workspaces (${filteredWorkspaces.length})`}
          options={{
            search: true,
            paging: filteredWorkspaces.length > 20,
            padding: 'dense',
            pageSize: 20,
          }}
          columns={columns}
          data={filteredWorkspaces}
        />
      )}

      {/* Actions menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {menuRow && !menuRow.connected && menuRow.phase === 'Running' && (
          <MenuItem
            onClick={() => {
              const row = menuRow;
              handleMenuClose();
              handleConnect(row);
            }}
          >
            <LinkIcon fontSize="small" style={{ marginRight: 8 }} />
            Connect
          </MenuItem>
        )}
        {menuRow && menuRow.connected && (
          <MenuItem
            onClick={() => {
              const row = menuRow;
              handleMenuClose();
              handleDisconnect(row);
            }}
          >
            <LinkOffIcon fontSize="small" style={{ marginRight: 8 }} />
            Disconnect
          </MenuItem>
        )}
        {menuRow && menuRow.phase === 'Stopped' && (
          <MenuItem
            onClick={() => {
              const row = menuRow;
              handleMenuClose();
              handleStart(row);
            }}
          >
            <PlayArrowIcon fontSize="small" style={{ marginRight: 8 }} />
            Start
          </MenuItem>
        )}
        {menuRow && menuRow.sshEndpoint && (
          <MenuItem
            onClick={() => {
              const row = menuRow;
              handleMenuClose();
              handleOpenVSCode(row);
            }}
          >
            <VSCodeIcon
              style={{
                marginRight: 8,
                fontSize: '1.1rem',
                color: '#007ACC',
              }}
            />
            Open in VS Code
          </MenuItem>
        )}
        {menuRow && menuRow.sshEndpoint && (
          <MenuItem
            onClick={() => {
              const row = menuRow;
              handleMenuClose();
              handleOpenJetBrains(row);
            }}
          >
            <JetBrainsIcon
              style={{ marginRight: 8, fontSize: '1.1rem' }}
            />
            Open in JetBrains Gateway
          </MenuItem>
        )}
        {menuRow && menuRow.sshEndpoint && (
          <MenuItem
            onClick={() => {
              const row = menuRow;
              handleMenuClose();
              handleOpenNeovim(row);
            }}
          >
            <NeovimIcon
              style={{
                marginRight: 8,
                fontSize: '1.1rem',
                color: '#57A143',
              }}
            />
            Open Neovim (Local)
          </MenuItem>
        )}
        {menuRow && menuRow.phase === 'Running' && (
          <MenuItem
            onClick={() => {
              const row = menuRow;
              handleMenuClose();
              handleOpenNeovimBrowser(row);
            }}
          >
            <NeovimIcon
              style={{
                marginRight: 8,
                fontSize: '1.1rem',
                color: '#57A143',
              }}
            />
            Open Neovim (Browser)
          </MenuItem>
        )}
        {menuRow && menuRow.sshEndpoint && (
          <MenuItem
            onClick={() => {
              const row = menuRow;
              handleMenuClose();
              handleCopySSH(row);
            }}
          >
            <FileCopyIcon fontSize="small" style={{ marginRight: 8 }} />
            Copy SSH Command
          </MenuItem>
        )}
        {menuRow && menuRow.sshEndpoint && (
          <MenuItem
            onClick={() => {
              const row = menuRow;
              handleMenuClose();
              handleCopySSHConfig(row);
            }}
          >
            <FileCopyIcon fontSize="small" style={{ marginRight: 8 }} />
            Copy SSH Config
          </MenuItem>
        )}
        {menuRow && menuRow.phase === 'Running' && (
          <MenuItem
            onClick={() => {
              const row = menuRow;
              handleMenuClose();
              if (row) handleSyncSSHKeys(row);
            }}
          >
            <SyncIcon fontSize="small" style={{ marginRight: 8 }} />
            Sync SSH Keys
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            const row = menuRow;
            handleMenuClose();
            if (row) handleTerminal(row);
          }}
        >
          <OpenInNewIcon fontSize="small" style={{ marginRight: 8 }} />
          Terminal
        </MenuItem>
        <MenuItem
          onClick={() => {
            const row = menuRow;
            handleMenuClose();
            if (row) handleOpenDelete(row);
          }}
        >
          <DeleteIcon
            fontSize="small"
            style={{ marginRight: 8, color: '#f44336' }}
          />
          <Typography variant="inherit" color="secondary">
            Delete
          </Typography>
        </MenuItem>
      </Menu>

      {/* Dialogs */}
      <CreateWorkspaceDialog
        open={createOpen}
        clusters={clusters}
        api={api}
        onSuccess={handleCreateSuccess}
        onClose={() => setCreateOpen(false)}
      />

      <DeleteWorkspaceDialog
        open={deleteOpen}
        name={deleteTarget?.name ?? null}
        connected={deleteTarget?.connected ?? false}
        deleting={deleting}
        onDelete={handleDelete}
        onClose={() => {
          setDeleteOpen(false);
          setDeleteTarget(null);
        }}
      />

      <WorkspaceTerminalDialog
        open={terminalOpen}
        target={terminalTarget}
        clusterNamespace={terminalRow?.clusterNamespace ?? ''}
        clusterName={terminalRow?.clusterName ?? ''}
        initialCommand={terminalCommand}
        onClose={() => {
          setTerminalOpen(false);
          setTerminalRow(null);
          setTerminalCommand(undefined);
        }}
      />

      <Snackbar
        open={toast.open}
        autoHideDuration={6000}
        onClose={() => setToast(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <SnackbarContent
          message={toast.message}
          action={
            toast.action ? (
              <Button
                color="secondary"
                size="small"
                onClick={toast.action.onClick}
              >
                {toast.action.label}
              </Button>
            ) : undefined
          }
        />
      </Snackbar>
    </div>
  );
};
