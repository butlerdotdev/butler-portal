// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import {
  Progress,
  EmptyState,
  Table,
  TableColumn,
} from '@backstage/core-components';
import {
  Grid,
  Typography,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Box,
  IconButton,
  Menu,
  CircularProgress,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import { Alert } from '@material-ui/lab';
import AddIcon from '@material-ui/icons/Add';
import DeleteIcon from '@material-ui/icons/Delete';
import RefreshIcon from '@material-ui/icons/Refresh';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import LinkIcon from '@material-ui/icons/Link';
import LinkOffIcon from '@material-ui/icons/LinkOff';
import FileCopyIcon from '@material-ui/icons/FileCopy';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';
import { butlerApiRef } from '../../api/ButlerApi';
import type {
  Workspace,
  WorkspaceImage,
  WorkspaceTemplate,
  CreateWorkspaceRequest,
} from '../../api/types/workspaces';
import { StatusBadge } from '../StatusBadge/StatusBadge';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface WorkspacesTabProps {
  clusterNamespace: string;
  clusterName: string;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const useStyles = makeStyles(theme => ({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(4),
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(2),
  },
  sectionTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  sectionCount: {
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
  templateCard: {
    cursor: 'pointer',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    '&:hover': {
      borderColor: theme.palette.primary.main,
    },
  },
  templateCardSelected: {
    borderColor: theme.palette.primary.main,
    boxShadow: `0 0 0 1px ${theme.palette.primary.main}`,
  },
  templateIcon: {
    fontSize: '2rem',
    marginBottom: theme.spacing(1),
  },
  formSection: {
    marginTop: theme.spacing(2),
  },
  sshInfoBox: {
    padding: theme.spacing(1.5, 2),
    borderRadius: theme.shape.borderRadius,
    backgroundColor: theme.palette.background.default,
    border: `1px solid ${theme.palette.divider}`,
    marginTop: theme.spacing(2),
  },
}));

// ---------------------------------------------------------------------------
// Row type for the table
// ---------------------------------------------------------------------------

type WorkspaceRow = {
  id: string;
  name: string;
  owner: string;
  image: string;
  phase: string;
  sshEndpoint: string;
  connected: boolean;
  age: string;
  raw: Workspace;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

const AUTO_STOP_OPTIONS = [
  { value: '4h', label: '4 hours' },
  { value: '8h', label: '8 hours' },
  { value: '12h', label: '12 hours' },
  { value: '24h', label: '24 hours' },
  { value: '', label: 'Never' },
];

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const WorkspacesTab = ({
  clusterNamespace,
  clusterName,
}: WorkspacesTabProps) => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);

  // Data state
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);

  // Delete dialog state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Actions menu anchor
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuRow, setMenuRow] = useState<WorkspaceRow | null>(null);

  // Action in-progress tracking
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // --------------------------------------------------------------------------
  // Data fetching
  // --------------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await api.listWorkspaces(clusterNamespace, clusterName);
      setWorkspaces(response.workspaces || []);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [api, clusterNamespace, clusterName]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 30-second polling
  useEffect(() => {
    const interval = setInterval(() => {
      api
        .listWorkspaces(clusterNamespace, clusterName)
        .then(response => {
          setWorkspaces(response.workspaces || []);
        })
        .catch(() => {
          // Silent polling failure
        });
    }, 30000);
    return () => clearInterval(interval);
  }, [api, clusterNamespace, clusterName]);

  // --------------------------------------------------------------------------
  // Derived state
  // --------------------------------------------------------------------------

  const rows: WorkspaceRow[] = useMemo(() => {
    return workspaces.map(ws => ({
      id: ws.metadata.uid || ws.metadata.name,
      name: ws.metadata.name,
      owner: ws.spec.owner,
      image: ws.spec.image,
      phase: ws.status?.phase || 'Pending',
      sshEndpoint: ws.status?.sshEndpoint || '',
      connected: ws.status?.connected || false,
      age: formatAge(ws.metadata.creationTimestamp),
      raw: ws,
    }));
  }, [workspaces]);

  // --------------------------------------------------------------------------
  // Handlers
  // --------------------------------------------------------------------------

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
      await api.connectWorkspace(clusterNamespace, clusterName, row.name);
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
      await api.disconnectWorkspace(clusterNamespace, clusterName, row.name);
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
      await api.startWorkspace(clusterNamespace, clusterName, row.name);
      await fetchData();
    } catch {
      // Silent
    } finally {
      setActionInProgress(null);
    }
  };

  const handleCopySSH = (row: WorkspaceRow) => {
    if (row.sshEndpoint) {
      navigator.clipboard.writeText(row.sshEndpoint);
    }
  };

  const handleTerminal = (_row: WorkspaceRow) => {
    const team = api.getTeamContext();
    if (team) {
      window.open(
        `/butler/t/${team}/clusters/${clusterNamespace}/${clusterName}`,
        '_blank',
      );
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
        clusterNamespace,
        clusterName,
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

  // --------------------------------------------------------------------------
  // Render: loading/error
  // --------------------------------------------------------------------------

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

  // --------------------------------------------------------------------------
  // Table columns
  // --------------------------------------------------------------------------

  const columns: TableColumn<WorkspaceRow>[] = [
    {
      title: 'Name',
      field: 'name',
      render: (row: WorkspaceRow) => (
        <Typography variant="body2" style={{ fontWeight: 500 }}>
          {row.name}
        </Typography>
      ),
    },
    { title: 'Owner', field: 'owner' },
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
      title: 'SSH Endpoint',
      field: 'sshEndpoint',
      render: (row: WorkspaceRow) =>
        row.sshEndpoint ? (
          <Typography variant="body2" noWrap style={{ maxWidth: 200 }}>
            {row.sshEndpoint}
          </Typography>
        ) : (
          <Typography variant="body2" color="textSecondary">
            -
          </Typography>
        ),
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
      width: '80px',
      render: (row: WorkspaceRow) => (
        <IconButton
          size="small"
          onClick={e => handleMenuOpen(e, row)}
          aria-label="workspace actions"
          disabled={actionInProgress === row.id}
        >
          {actionInProgress === row.id ? (
            <CircularProgress size={18} />
          ) : (
            <MoreVertIcon />
          )}
        </IconButton>
      ),
    },
  ];

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  return (
    <div className={classes.root}>
      <div>
        <div className={classes.headerRow}>
          <div className={classes.sectionTitle}>
            <Typography variant="h6">Workspaces</Typography>
            <Chip
              label={`${workspaces.length}`}
              size="small"
              color="default"
              className={classes.sectionCount}
            />
          </div>
          <Box display="flex" style={{ gap: 8 }}>
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

        {workspaces.length === 0 ? (
          <EmptyState
            title="No workspaces"
            description="Create a workspace to start developing on this cluster."
            missing="content"
          />
        ) : (
          <Table<WorkspaceRow>
            title={`Workspaces (${workspaces.length})`}
            options={{
              search: false,
              paging: workspaces.length > 10,
              padding: 'dense',
              pageSize: 10,
            }}
            columns={columns}
            data={rows}
          />
        )}
      </div>

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
              handleCopySSH(row);
            }}
          >
            <FileCopyIcon fontSize="small" style={{ marginRight: 8 }} />
            Copy SSH Command
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

      {/* ================================================================= */}
      {/* DIALOGS                                                           */}
      {/* ================================================================= */}

      {/* Create Workspace Dialog */}
      <CreateWorkspaceDialog
        open={createOpen}
        clusterNamespace={clusterNamespace}
        clusterName={clusterName}
        api={api}
        onSuccess={handleCreateSuccess}
        onClose={() => setCreateOpen(false)}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteWorkspaceDialog
        open={deleteOpen}
        row={deleteTarget}
        deleting={deleting}
        onDelete={handleDelete}
        onClose={() => {
          setDeleteOpen(false);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Create Workspace Dialog
// ---------------------------------------------------------------------------

function CreateWorkspaceDialog({
  open,
  clusterNamespace,
  clusterName,
  api,
  onSuccess,
  onClose,
}: {
  open: boolean;
  clusterNamespace: string;
  clusterName: string;
  api: any;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const classes = useStyles();

  // Template and image catalogs
  const [templates, setTemplates] = useState<WorkspaceTemplate[]>([]);
  const [images, setImages] = useState<WorkspaceImage[]>([]);
  const [loadingCatalogs, setLoadingCatalogs] = useState(false);

  // Form state
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [image, setImage] = useState('');
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [repositoryBranch, setRepositoryBranch] = useState('');
  const [dotfilesRepo, setDotfilesRepo] = useState('');
  const [cpu, setCpu] = useState('2');
  const [memory, setMemory] = useState('4Gi');
  const [storageSize, setStorageSize] = useState('10Gi');
  const [autoStopAfter, setAutoStopAfter] = useState('8h');

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Load catalogs when dialog opens
  useEffect(() => {
    if (!open) return;
    setLoadingCatalogs(true);
    Promise.all([
      api.listWorkspaceTemplates().catch(() => ({ templates: [] })),
      api.listWorkspaceImages().catch(() => ({ images: [] })),
    ])
      .then(([tplResponse, imgResponse]) => {
        setTemplates(tplResponse.templates || []);
        setImages(imgResponse.images || []);
      })
      .finally(() => setLoadingCatalogs(false));
  }, [open, api]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedTemplate(null);
      setName('');
      setImage('');
      setRepositoryUrl('');
      setRepositoryBranch('');
      setDotfilesRepo('');
      setCpu('2');
      setMemory('4Gi');
      setStorageSize('10Gi');
      setAutoStopAfter('8h');
      setCreateError(null);
    }
  }, [open]);

  const handleSelectTemplate = (template: WorkspaceTemplate) => {
    const tplName = template.metadata.name;
    if (selectedTemplate === tplName) {
      setSelectedTemplate(null);
      return;
    }
    setSelectedTemplate(tplName);

    // Pre-fill form fields from template
    const t = template.spec.template;
    setImage(t.image || '');
    if (t.repository) {
      setRepositoryUrl(t.repository.url || '');
      setRepositoryBranch(t.repository.branch || '');
    } else {
      setRepositoryUrl('');
      setRepositoryBranch('');
    }
    if (t.dotfiles) {
      setDotfilesRepo(t.dotfiles.repository || '');
    } else {
      setDotfilesRepo('');
    }
    if (t.resources) {
      setCpu(t.resources.cpu || '2');
      setMemory(t.resources.memory || '4Gi');
    } else {
      setCpu('2');
      setMemory('4Gi');
    }
    setStorageSize(t.storageSize || '10Gi');
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      setCreateError('Name is required.');
      return;
    }
    if (!image.trim()) {
      setCreateError('Image is required.');
      return;
    }

    setCreating(true);
    setCreateError(null);
    try {
      const data: CreateWorkspaceRequest = {
        name: name.trim(),
        image: image.trim(),
      };

      if (repositoryUrl.trim()) {
        data.repository = {
          url: repositoryUrl.trim(),
          branch: repositoryBranch.trim() || undefined,
        };
      }

      if (dotfilesRepo.trim()) {
        data.dotfiles = {
          repository: dotfilesRepo.trim(),
        };
      }

      if (cpu.trim() || memory.trim()) {
        data.resources = {
          cpu: cpu.trim() || undefined,
          memory: memory.trim() || undefined,
        };
      }

      if (storageSize.trim()) {
        data.storageSize = storageSize.trim();
      }

      if (autoStopAfter) {
        data.autoStopAfter = autoStopAfter;
      }

      if (selectedTemplate) {
        data.templateName = selectedTemplate;
      }

      await api.createWorkspace(clusterNamespace, clusterName, data);
      onSuccess();
    } catch (e) {
      setCreateError(
        e instanceof Error ? e.message : 'Failed to create workspace.',
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Create Workspace</DialogTitle>
      <DialogContent>
        {loadingCatalogs ? (
          <Box display="flex" justifyContent="center" p={4}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {/* Template picker */}
            {templates.length > 0 && (
              <div>
                <Typography
                  variant="subtitle2"
                  gutterBottom
                  style={{ fontWeight: 600 }}
                >
                  Templates
                </Typography>
                <Typography
                  variant="body2"
                  color="textSecondary"
                  gutterBottom
                >
                  Select a template to pre-fill workspace settings, or
                  configure manually below.
                </Typography>
                <Grid container spacing={2}>
                  {templates.map(tpl => (
                    <Grid
                      item
                      xs={12}
                      sm={6}
                      md={4}
                      key={tpl.metadata.name}
                    >
                      <Card
                        variant="outlined"
                        className={`${classes.templateCard} ${
                          selectedTemplate === tpl.metadata.name
                            ? classes.templateCardSelected
                            : ''
                        }`}
                        onClick={() => handleSelectTemplate(tpl)}
                      >
                        <CardContent>
                          {tpl.spec.icon && (
                            <Typography className={classes.templateIcon}>
                              {tpl.spec.icon}
                            </Typography>
                          )}
                          <Typography
                            variant="subtitle2"
                            style={{ fontWeight: 500 }}
                          >
                            {tpl.spec.displayName}
                          </Typography>
                          {tpl.spec.description && (
                            <Typography
                              variant="body2"
                              color="textSecondary"
                              style={{ marginTop: 4 }}
                            >
                              {tpl.spec.description}
                            </Typography>
                          )}
                          {tpl.spec.category && (
                            <Chip
                              label={tpl.spec.category}
                              size="small"
                              variant="outlined"
                              style={{ marginTop: 8 }}
                            />
                          )}
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              </div>
            )}

            {/* Form fields */}
            <div className={classes.formSection}>
              <Typography
                variant="subtitle2"
                gutterBottom
                style={{ fontWeight: 600 }}
              >
                Configuration
              </Typography>

              <Box mt={1}>
                <TextField
                  label="Name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  fullWidth
                  variant="outlined"
                  size="small"
                  required
                  placeholder="my-workspace"
                />
              </Box>

              <Box mt={2}>
                <TextField
                  select
                  label="Image"
                  value={image}
                  onChange={e => setImage(e.target.value)}
                  fullWidth
                  variant="outlined"
                  size="small"
                  required
                >
                  {image && !images.find(i => i.image === image) && (
                    <MenuItem value={image}>{image}</MenuItem>
                  )}
                  {images.map(img => (
                    <MenuItem key={img.name} value={img.image}>
                      {img.displayName} - {img.description}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>

              <Box mt={2} display="flex" style={{ gap: 16 }}>
                <TextField
                  label="Repository URL"
                  value={repositoryUrl}
                  onChange={e => setRepositoryUrl(e.target.value)}
                  variant="outlined"
                  size="small"
                  style={{ flex: 2 }}
                  placeholder="https://github.com/org/repo"
                />
                <TextField
                  label="Branch"
                  value={repositoryBranch}
                  onChange={e => setRepositoryBranch(e.target.value)}
                  variant="outlined"
                  size="small"
                  style={{ flex: 1 }}
                  placeholder="main"
                />
              </Box>

              <Box mt={2}>
                <TextField
                  label="Dotfiles Repository URL"
                  value={dotfilesRepo}
                  onChange={e => setDotfilesRepo(e.target.value)}
                  fullWidth
                  variant="outlined"
                  size="small"
                  placeholder="https://github.com/user/dotfiles"
                />
              </Box>

              <Box mt={2} display="flex" style={{ gap: 16 }}>
                <TextField
                  label="CPU"
                  value={cpu}
                  onChange={e => setCpu(e.target.value)}
                  variant="outlined"
                  size="small"
                  style={{ flex: 1 }}
                  placeholder="2"
                />
                <TextField
                  label="Memory"
                  value={memory}
                  onChange={e => setMemory(e.target.value)}
                  variant="outlined"
                  size="small"
                  style={{ flex: 1 }}
                  placeholder="4Gi"
                />
                <TextField
                  label="Storage Size"
                  value={storageSize}
                  onChange={e => setStorageSize(e.target.value)}
                  variant="outlined"
                  size="small"
                  style={{ flex: 1 }}
                  placeholder="10Gi"
                />
              </Box>

              <Box mt={2}>
                <TextField
                  select
                  label="Auto-Stop Timeout"
                  value={autoStopAfter}
                  onChange={e => setAutoStopAfter(e.target.value)}
                  fullWidth
                  variant="outlined"
                  size="small"
                >
                  {AUTO_STOP_OPTIONS.map(opt => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>

              <div className={classes.sshInfoBox}>
                <Typography variant="body2" color="textSecondary">
                  Your saved SSH keys will be automatically added to the
                  workspace.
                </Typography>
              </div>
            </div>

            {createError && (
              <Box mt={2}>
                <Alert severity="error">{createError}</Alert>
              </Box>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={creating}>
          Cancel
        </Button>
        <Button
          onClick={handleCreate}
          color="primary"
          variant="contained"
          disabled={creating || loadingCatalogs || !name.trim() || !image.trim()}
          startIcon={
            creating ? (
              <CircularProgress size={16} color="inherit" />
            ) : undefined
          }
        >
          {creating ? 'Creating...' : 'Create Workspace'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Delete Workspace Dialog
// ---------------------------------------------------------------------------

function DeleteWorkspaceDialog({
  open,
  row,
  deleting,
  onDelete,
  onClose,
}: {
  open: boolean;
  row: WorkspaceRow | null;
  deleting: boolean;
  onDelete: () => void;
  onClose: () => void;
}) {
  if (!row) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Delete Workspace</DialogTitle>
      <DialogContent>
        <Typography>
          Are you sure you want to delete workspace{' '}
          <strong>{row.name}</strong>?
        </Typography>
        <Box mt={1}>
          <Typography variant="body2" color="textSecondary">
            This action is irreversible. The workspace and all its associated
            storage will be permanently removed.
          </Typography>
        </Box>
        {row.connected && (
          <Box mt={2}>
            <Alert severity="warning">
              This workspace is currently connected. It will be forcefully
              disconnected before deletion.
            </Alert>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={deleting}>
          Cancel
        </Button>
        <Button
          onClick={onDelete}
          color="secondary"
          variant="contained"
          disabled={deleting}
          startIcon={
            deleting ? (
              <CircularProgress size={16} color="inherit" />
            ) : undefined
          }
        >
          {deleting ? 'Deleting...' : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
