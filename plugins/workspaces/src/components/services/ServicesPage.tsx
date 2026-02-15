// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState, useCallback } from 'react';
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  IconButton,
  Menu,
  MenuItem,
  CircularProgress,
  Tooltip,
  TextField,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import { Alert } from '@material-ui/lab';
import RefreshIcon from '@material-ui/icons/Refresh';
import CodeIcon from '@material-ui/icons/Code';
import CloudIcon from '@material-ui/icons/Cloud';
import GetAppIcon from '@material-ui/icons/GetApp';
import FileCopyIcon from '@material-ui/icons/FileCopy';
import LinkIcon from '@material-ui/icons/Link';
import { butlerApiRef } from '@internal/plugin-butler';
import type {
  Cluster,
  ClusterService,
  MirrordConfig,
  WorkspaceImage,
} from '@internal/plugin-butler';
import { useWorkspaceTeam } from '../../hooks/useWorkspaceTeam';
import { createTarGzFromFiles } from '../../util/tarGz';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const useStyles = makeStyles(theme => ({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(3),
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  sectionCount: {
    fontSize: '0.75rem',
  },
  typeChip: {
    fontWeight: 500,
  },
  clusterIPChip: {
    fontFamily: 'monospace',
    fontSize: '0.8rem',
  },
  previewContainer: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    overflow: 'hidden',
    marginTop: theme.spacing(2),
  },
  previewHeader: {
    backgroundColor: theme.palette.background.default,
    padding: theme.spacing(1, 2),
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  previewContent: {
    fontFamily: 'monospace',
    fontSize: '0.75rem',
    padding: theme.spacing(1.5, 2),
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(0,0,0,0.2)'
        : 'rgba(0,0,0,0.03)',
    overflow: 'auto',
    maxHeight: 300,
    whiteSpace: 'pre',
    margin: 0,
  },
  dialogSection: {
    marginTop: theme.spacing(2),
  },
  commandBox: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginTop: theme.spacing(1),
  },
  commandText: {
    fontFamily: 'monospace',
    fontSize: '0.8rem',
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(0,0,0,0.2)'
        : 'rgba(0,0,0,0.03)',
    padding: theme.spacing(1, 1.5),
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.divider}`,
    flex: 1,
    overflow: 'auto',
    whiteSpace: 'nowrap',
  },
  envFromBox: {
    padding: theme.spacing(1.5, 2),
    borderRadius: theme.shape.borderRadius,
    backgroundColor: theme.palette.background.default,
    border: `1px solid ${theme.palette.divider}`,
    marginTop: theme.spacing(1),
  },
}));

// ---------------------------------------------------------------------------
// Row type
// ---------------------------------------------------------------------------

type ServiceRow = {
  id: string;
  name: string;
  namespace: string;
  type: string;
  clusterIP: string;
  ports: string;
  raw: ClusterService;
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const ServicesPage = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const { activeTeam } = useWorkspaceTeam();

  // Clusters
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [selectedCluster, setSelectedCluster] = useState('');
  const [loadingClusters, setLoadingClusters] = useState(true);

  // Services
  const [services, setServices] = useState<ClusterService[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [error, setError] = useState<Error | undefined>();

  // Develop menu state
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuRow, setMenuRow] = useState<ServiceRow | null>(null);

  // Cloud workspace dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createService, setCreateService] = useState<ServiceRow | null>(null);

  // mirrord dialog
  const [mirrordOpen, setMirrordOpen] = useState(false);
  const [mirrordService, setMirrordService] = useState<ServiceRow | null>(
    null,
  );
  const [mirrordConfig, setMirrordConfig] = useState<MirrordConfig | null>(
    null,
  );
  const [mirrordLoading, setMirrordLoading] = useState(false);
  const [mirrordError, setMirrordError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Fetch clusters
  useEffect(() => {
    if (!activeTeam) return;
    setLoadingClusters(true);
    api
      .listClusters({ team: activeTeam })
      .then(res => {
        const fetched = res.clusters || [];
        setClusters(fetched);
        if (fetched.length === 1) {
          setSelectedCluster(fetched[0].metadata.name);
        }
      })
      .catch(() => setClusters([]))
      .finally(() => setLoadingClusters(false));
  }, [api, activeTeam]);

  const selectedClusterObj = clusters.find(
    c => c.metadata.name === selectedCluster,
  );

  // Fetch services when cluster selected
  const fetchServices = useCallback(async () => {
    if (!selectedClusterObj) {
      setServices([]);
      return;
    }
    setLoadingServices(true);
    setError(undefined);
    try {
      const response = await api.listClusterServices(
        selectedClusterObj.metadata.namespace,
        selectedClusterObj.metadata.name,
      );
      setServices(response.services || []);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoadingServices(false);
    }
  }, [api, selectedClusterObj]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  // Derived rows
  const rows: ServiceRow[] = services.map(svc => ({
    id: `${svc.namespace}/${svc.name}`,
    name: svc.name,
    namespace: svc.namespace,
    type: svc.type,
    clusterIP: svc.clusterIP || 'None',
    ports: formatPorts(svc),
    raw: svc,
  }));

  // Handlers
  const handleMenuOpen = (
    event: React.MouseEvent<HTMLElement>,
    row: ServiceRow,
  ) => {
    setMenuAnchor(event.currentTarget);
    setMenuRow(row);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    setMenuRow(null);
  };

  const handleCloudWorkspace = (row: ServiceRow) => {
    handleMenuClose();
    setCreateService(row);
    setCreateOpen(true);
  };

  const handleMirrordOpen = async (row: ServiceRow) => {
    if (!selectedClusterObj) return;
    handleMenuClose();
    setMirrordService(row);
    setMirrordConfig(null);
    setMirrordError(null);
    setMirrordOpen(true);
    setCopied(null);

    setMirrordLoading(true);
    try {
      const config = await api.generateMirrordConfig(
        selectedClusterObj.metadata.namespace,
        selectedClusterObj.metadata.name,
        row.name,
        row.namespace,
      );
      setMirrordConfig(config);
    } catch (e) {
      setMirrordError(
        e instanceof Error
          ? e.message
          : 'Failed to generate mirrord config',
      );
    } finally {
      setMirrordLoading(false);
    }
  };

  const handleMirrordClose = () => {
    setMirrordOpen(false);
    setMirrordService(null);
    setMirrordConfig(null);
    setMirrordError(null);
    setCopied(null);
  };

  const handleDownload = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Silent
    }
  };

  const getVSCodeDeeplink = (configJson: string): string => {
    const encoded = encodeURIComponent(configJson);
    return `vscode://metalbear-co.mirrord/connect?config=${encoded}`;
  };

  // Table columns
  const columns: TableColumn<ServiceRow>[] = [
    {
      title: 'Name',
      field: 'name',
      render: (row: ServiceRow) => (
        <Typography variant="body2" style={{ fontWeight: 500 }}>
          {row.name}
        </Typography>
      ),
    },
    {
      title: 'Namespace',
      field: 'namespace',
      render: (row: ServiceRow) => (
        <Chip label={row.namespace} size="small" variant="outlined" />
      ),
    },
    {
      title: 'Type',
      field: 'type',
      render: (row: ServiceRow) => (
        <Chip
          label={row.type}
          size="small"
          className={classes.typeChip}
          variant="outlined"
          color={row.type === 'LoadBalancer' ? 'primary' : 'default'}
        />
      ),
    },
    {
      title: 'Cluster IP',
      field: 'clusterIP',
      render: (row: ServiceRow) => (
        <Typography variant="body2" className={classes.clusterIPChip}>
          {row.clusterIP}
        </Typography>
      ),
    },
    {
      title: 'Ports',
      field: 'ports',
      render: (row: ServiceRow) => (
        <Typography variant="body2">{row.ports}</Typography>
      ),
    },
    {
      title: 'Actions',
      field: 'id',
      width: '100px',
      render: (row: ServiceRow) => (
        <Button
          size="small"
          variant="outlined"
          color="primary"
          startIcon={<CodeIcon />}
          onClick={e => handleMenuOpen(e, row)}
          aria-label="develop actions"
        >
          Develop
        </Button>
      ),
    },
  ];

  if (loadingClusters) {
    return <Progress />;
  }

  return (
    <div className={classes.root}>
      {/* Header + cluster selector */}
      <div>
        <div className={classes.headerRow}>
          <div className={classes.sectionTitle}>
            <Typography variant="h5">Services</Typography>
            {selectedCluster && !loadingServices && (
              <Chip
                label={`${services.length}`}
                size="small"
                color="default"
                className={classes.sectionCount}
              />
            )}
          </div>
          <Box display="flex" style={{ gap: 8 }} alignItems="center">
            <TextField
              select
              label="Cluster"
              value={selectedCluster}
              onChange={e => setSelectedCluster(e.target.value)}
              variant="outlined"
              size="small"
              style={{ minWidth: 200 }}
            >
              {clusters.map(c => (
                <MenuItem key={c.metadata.name} value={c.metadata.name}>
                  {c.metadata.name}
                </MenuItem>
              ))}
            </TextField>
            <Button
              variant="outlined"
              size="small"
              startIcon={<RefreshIcon />}
              onClick={fetchServices}
              disabled={!selectedCluster}
            >
              Refresh
            </Button>
          </Box>
        </div>

        <Typography variant="body2" color="textSecondary">
          Browse services running in your tenant clusters. Use mirrord to
          intercept traffic locally or create a cloud workspace.
        </Typography>
      </div>

      {!selectedCluster ? (
        <EmptyState
          title="Select a cluster"
          description="Choose a cluster above to view its services."
          missing="content"
        />
      ) : loadingServices ? (
        <Progress />
      ) : error ? (
        <EmptyState
          title="Failed to load services"
          description={error.message}
          missing="info"
        />
      ) : services.length === 0 ? (
        <EmptyState
          title="No services found"
          description="This cluster does not have any services yet."
          missing="content"
        />
      ) : (
        <Table<ServiceRow>
          title={`Services (${services.length})`}
          options={{
            search: true,
            paging: services.length > 10,
            padding: 'dense',
            pageSize: 10,
          }}
          columns={columns}
          data={rows}
        />
      )}

      {/* Develop actions menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem
          onClick={() => {
            const row = menuRow;
            if (row) handleCloudWorkspace(row);
          }}
        >
          <CloudIcon fontSize="small" style={{ marginRight: 8 }} />
          Cloud Workspace
        </MenuItem>
        <MenuItem
          onClick={() => {
            const row = menuRow;
            if (row) handleMirrordOpen(row);
          }}
        >
          <LinkIcon fontSize="small" style={{ marginRight: 8 }} />
          Local + mirrord
        </MenuItem>
      </Menu>

      {/* Cloud Workspace Create Dialog */}
      {selectedClusterObj && (
        <CloudWorkspaceDialog
          open={createOpen}
          service={createService}
          clusterNamespace={selectedClusterObj.metadata.namespace}
          clusterName={selectedClusterObj.metadata.name}
          api={api}
          onSuccess={() => {
            setCreateOpen(false);
            setCreateService(null);
          }}
          onClose={() => {
            setCreateOpen(false);
            setCreateService(null);
          }}
        />
      )}

      {/* mirrord Configuration Dialog */}
      <Dialog
        open={mirrordOpen}
        onClose={handleMirrordClose}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          mirrord Configuration
          {mirrordService ? ` - ${mirrordService.name}` : ''}
        </DialogTitle>
        <DialogContent>
          {mirrordLoading && (
            <Box display="flex" justifyContent="center" py={4}>
              <CircularProgress />
            </Box>
          )}

          {mirrordError && (
            <EmptyState
              title="Failed to generate configuration"
              description={mirrordError}
              missing="info"
            />
          )}

          {mirrordConfig && (
            <>
              <div className={classes.previewContainer}>
                <div className={classes.previewHeader}>
                  <Typography variant="caption" color="textSecondary">
                    mirrord Config ({mirrordConfig.filename})
                  </Typography>
                </div>
                <pre className={classes.previewContent}>
                  {mirrordConfig.config}
                </pre>
              </div>

              <div className={classes.dialogSection}>
                <div className={classes.previewContainer}>
                  <div className={classes.previewHeader}>
                    <Typography variant="caption" color="textSecondary">
                      Scoped Kubeconfig
                    </Typography>
                  </div>
                  <pre className={classes.previewContent}>
                    {mirrordConfig.kubeconfig}
                  </pre>
                </div>
              </div>

              <div className={classes.dialogSection}>
                <Typography variant="subtitle2">CLI Command</Typography>
                <div className={classes.commandBox}>
                  <div className={classes.commandText}>
                    mirrord exec --config-file {mirrordConfig.filename} --
                    &lt;your-command&gt;
                  </div>
                  <Tooltip
                    title={copied === 'cli' ? 'Copied' : 'Copy command'}
                  >
                    <IconButton
                      size="small"
                      onClick={() =>
                        handleCopyToClipboard(
                          `mirrord exec --config-file ${mirrordConfig.filename} -- <your-command>`,
                          'cli',
                        )
                      }
                    >
                      <FileCopyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </div>
              </div>

              <div className={classes.dialogSection}>
                <Typography variant="subtitle2">
                  VS Code Extension
                </Typography>
                <div className={classes.commandBox}>
                  <div className={classes.commandText}>
                    vscode://metalbear-co.mirrord/connect?config=...
                  </div>
                  <Tooltip
                    title={
                      copied === 'vscode'
                        ? 'Copied'
                        : 'Copy VS Code link'
                    }
                  >
                    <IconButton
                      size="small"
                      onClick={() =>
                        handleCopyToClipboard(
                          getVSCodeDeeplink(mirrordConfig.config),
                          'vscode',
                        )
                      }
                    >
                      <FileCopyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </div>
              </div>
            </>
          )}
        </DialogContent>
        <DialogActions>
          {mirrordConfig && (
            <>
              <Button
                onClick={() =>
                  handleDownload(
                    mirrordConfig.config,
                    mirrordConfig.filename,
                  )
                }
                startIcon={<GetAppIcon />}
                color="primary"
                variant="outlined"
                size="small"
              >
                Download Config
              </Button>
              <Button
                onClick={() =>
                  handleDownload(mirrordConfig.kubeconfig, 'kubeconfig.yaml')
                }
                startIcon={<GetAppIcon />}
                color="primary"
                variant="outlined"
                size="small"
              >
                Download Kubeconfig
              </Button>
              <Button
                onClick={() =>
                  handleCopyToClipboard(
                    getVSCodeDeeplink(mirrordConfig.config),
                    'vscode',
                  )
                }
                startIcon={<LinkIcon />}
                color="primary"
                variant="outlined"
                size="small"
              >
                {copied === 'vscode' ? 'Copied' : 'Copy VS Code Link'}
              </Button>
            </>
          )}
          <Button onClick={handleMirrordClose}>Close</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Cloud Workspace Create Dialog
// ---------------------------------------------------------------------------

function CloudWorkspaceDialog({
  open,
  service,
  clusterNamespace,
  clusterName,
  api,
  onSuccess,
  onClose,
}: {
  open: boolean;
  service: ServiceRow | null;
  clusterNamespace: string;
  clusterName: string;
  api: any;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const classes = useStyles();

  const [name, setName] = useState('');
  const [image, setImage] = useState('');
  const [images, setImages] = useState<WorkspaceImage[]>([]);
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [repositoryBranch, setRepositoryBranch] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);
  const [savedSSHKeys, setSavedSSHKeys] = useState<string[]>([]);
  const [sshKeyInput, setSSHKeyInput] = useState('');
  const [nvimConfigRepo, setNvimConfigRepo] = useState('');
  const [nvimInitLua, setNvimInitLua] = useState('');
  const [nvimConfigMode, setNvimConfigMode] = useState<
    'none' | 'repo' | 'file' | 'directory'
  >('none');
  const [nvimConfigArchive, setNvimConfigArchive] = useState('');
  const [nvimDirFileCount, setNvimDirFileCount] = useState(0);

  useEffect(() => {
    if (!open || !service) return;
    setName(`dev-${service.name}`);
    setImage('');
    setRepositoryUrl('');
    setRepositoryBranch('');
    setCreateError(null);
    setCreated(false);
    setSSHKeyInput('');
    setNvimConfigRepo('');
    setNvimInitLua('');
    setNvimConfigMode('none');
    setNvimConfigArchive('');
    setNvimDirFileCount(0);

    Promise.all([
      api.listWorkspaceImages().catch(() => ({ images: [] })),
      api.listSSHKeys().catch(() => ({ keys: [] })),
    ]).then(([imgRes, sshRes]: any[]) => {
      setImages(imgRes.images || []);
      setSavedSSHKeys((sshRes.keys || []).map((k: any) => k.publicKey));
    });
  }, [open, service, api]);

  const handleCreate = async () => {
    if (!name.trim() || !image.trim() || !service) return;
    setCreating(true);
    setCreateError(null);
    try {
      const data: any = {
        name: name.trim(),
        image: image.trim(),
        envFrom: {
          kind: 'Deployment',
          name: service.name,
          namespace: service.namespace,
        },
      };
      if (repositoryUrl.trim()) {
        data.repository = {
          url: repositoryUrl.trim(),
          branch: repositoryBranch.trim() || undefined,
        };
      }
      const allKeys = [...savedSSHKeys];
      if (sshKeyInput.trim()) {
        allKeys.push(sshKeyInput.trim());
      }
      if (allKeys.length > 0) {
        data.sshPublicKeys = allKeys;
      }
      if (nvimConfigMode === 'repo' && nvimConfigRepo.trim()) {
        data.editorConfig = { neovimConfigRepo: nvimConfigRepo.trim() };
      } else if (nvimConfigMode === 'directory' && nvimConfigArchive) {
        data.editorConfig = { neovimConfigArchive: nvimConfigArchive };
      } else if (nvimConfigMode === 'file' && nvimInitLua.trim()) {
        data.editorConfig = { neovimInitLua: nvimInitLua.trim() };
      }
      await api.createWorkspace(clusterNamespace, clusterName, data);
      setCreated(true);
    } catch (e) {
      setCreateError(
        e instanceof Error ? e.message : 'Failed to create workspace.',
      );
    } finally {
      setCreating(false);
    }
  };

  if (!service) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create Workspace for {service.name}</DialogTitle>
      <DialogContent>
        {created ? (
          <Box py={2}>
            <Alert severity="success">
              Workspace <strong>{name}</strong> created. Go to the{' '}
              <strong>Dashboard</strong> to connect and start developing.
            </Alert>
          </Box>
        ) : (
          <>
            <Typography variant="body2" color="textSecondary" gutterBottom>
              Create a cloud workspace pre-configured to develop on the{' '}
              <strong>{service.name}</strong> service. Environment variables
              from the service will be automatically injected.
            </Typography>

            <div className={classes.envFromBox}>
              <Typography variant="caption" color="textSecondary">
                Environment Source
              </Typography>
              <Typography
                variant="body2"
                style={{ fontFamily: 'monospace' }}
              >
                Deployment/{service.name} in {service.namespace}
              </Typography>
            </div>

            <Box mt={2}>
              <TextField
                label="Workspace Name"
                value={name}
                onChange={e => setName(e.target.value)}
                fullWidth
                variant="outlined"
                size="small"
                required
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
                {images.map(img => (
                  <MenuItem key={img.name} value={img.image}>
                    {img.displayName} - {img.description}
                  </MenuItem>
                ))}
              </TextField>
            </Box>

            <Box mt={2} display="flex" style={{ gap: 16 }}>
              <TextField
                label="Repository URL (optional)"
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
              <Typography variant="body2" color="textSecondary" gutterBottom>
                Neovim Configuration
              </Typography>
              <Box display="flex" style={{ gap: 8 }} mb={1}>
                {(['none', 'repo', 'directory', 'file'] as const).map(mode => (
                  <Chip
                    key={mode}
                    label={
                      mode === 'none'
                        ? 'None'
                        : mode === 'repo'
                          ? 'Git Repository'
                          : mode === 'directory'
                            ? 'Upload Directory'
                            : 'Upload init.lua'
                    }
                    size="small"
                    color={nvimConfigMode === mode ? 'primary' : 'default'}
                    variant={
                      nvimConfigMode === mode ? 'default' : 'outlined'
                    }
                    onClick={() => setNvimConfigMode(mode)}
                    clickable
                  />
                ))}
              </Box>
              {nvimConfigMode === 'repo' && (
                <TextField
                  label="Neovim Config Repository"
                  value={nvimConfigRepo}
                  onChange={e => setNvimConfigRepo(e.target.value)}
                  fullWidth
                  variant="outlined"
                  size="small"
                  placeholder="https://github.com/user/nvim-config"
                  helperText="Cloned to ~/.config/nvim on workspace creation."
                />
              )}
              {nvimConfigMode === 'directory' && (
                <>
                  <Box mb={1}>
                    <Button
                      variant="outlined"
                      size="small"
                      component="label"
                      style={{ textTransform: 'none' }}
                    >
                      {nvimConfigArchive
                        ? `${nvimDirFileCount} files loaded`
                        : 'Choose nvim config directory'}
                      <input
                        type="file"
                        hidden
                        {...({ webkitdirectory: '', directory: '' } as any)}
                        onChange={async e => {
                          const files = e.target.files;
                          if (!files || files.length === 0) return;
                          try {
                            const archive = await createTarGzFromFiles(files);
                            setNvimConfigArchive(archive);
                            setNvimDirFileCount(files.length);
                          } catch (err) {
                            setCreateError(
                              `Failed to read directory: ${err instanceof Error ? err.message : String(err)}`,
                            );
                          }
                          e.target.value = '';
                        }}
                      />
                    </Button>
                  </Box>
                  <Typography variant="caption" color="textSecondary">
                    Select your ~/.config/nvim directory. All files will be
                    archived and extracted on workspace creation.
                  </Typography>
                </>
              )}
              {nvimConfigMode === 'file' && (
                <>
                  <Box mb={1}>
                    <Button
                      variant="outlined"
                      size="small"
                      component="label"
                      style={{ textTransform: 'none' }}
                    >
                      Choose init.lua file
                      <input
                        type="file"
                        accept=".lua"
                        hidden
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) {
                            file.text().then(text => setNvimInitLua(text));
                          }
                          e.target.value = '';
                        }}
                      />
                    </Button>
                  </Box>
                  <TextField
                    label="init.lua content"
                    value={nvimInitLua}
                    onChange={e => setNvimInitLua(e.target.value)}
                    fullWidth
                    variant="outlined"
                    size="small"
                    placeholder="-- Paste your init.lua content here"
                    multiline
                    rows={6}
                    helperText="Written to ~/.config/nvim/init.lua on workspace creation."
                    InputProps={{
                      style: {
                        fontFamily: 'monospace',
                        fontSize: '0.8rem',
                      },
                    }}
                  />
                </>
              )}
            </Box>

            <div className={classes.envFromBox} style={{ marginTop: 16 }}>
              {savedSSHKeys.length > 0 ? (
                <Typography variant="body2" color="textSecondary">
                  {savedSSHKeys.length} saved SSH key
                  {savedSSHKeys.length !== 1 ? 's' : ''} will be added
                  automatically.
                </Typography>
              ) : (
                <>
                  <Typography
                    variant="body2"
                    color="textSecondary"
                    gutterBottom
                  >
                    No saved SSH keys found. Load or paste a public key to
                    enable SSH access:
                  </Typography>
                  <Box mb={1}>
                    <Button
                      variant="outlined"
                      size="small"
                      component="label"
                      style={{ textTransform: 'none' }}
                    >
                      Load from file
                      <input
                        type="file"
                        accept=".pub"
                        hidden
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) {
                            file
                              .text()
                              .then(text => setSSHKeyInput(text.trim()));
                          }
                          e.target.value = '';
                        }}
                      />
                    </Button>
                  </Box>
                  <TextField
                    value={sshKeyInput}
                    onChange={e => setSSHKeyInput(e.target.value)}
                    fullWidth
                    variant="outlined"
                    size="small"
                    placeholder="ssh-ed25519 AAAA... user@host"
                    multiline
                    rows={2}
                  />
                </>
              )}
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
        {created ? (
          <Button onClick={onSuccess} color="primary" variant="contained">
            Done
          </Button>
        ) : (
          <>
            <Button onClick={onClose} disabled={creating}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              color="primary"
              variant="contained"
              disabled={creating || !name.trim() || !image.trim()}
              startIcon={
                creating ? (
                  <CircularProgress size={16} color="inherit" />
                ) : undefined
              }
            >
              {creating ? 'Creating...' : 'Create Workspace'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPorts(svc: ClusterService): string {
  if (!svc.ports || svc.ports.length === 0) return 'None';
  return svc.ports.map(p => `${p.port}/${p.protocol}`).join(', ');
}
