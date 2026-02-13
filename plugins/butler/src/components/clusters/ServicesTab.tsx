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
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import RefreshIcon from '@material-ui/icons/Refresh';
import CodeIcon from '@material-ui/icons/Code';
import CloudIcon from '@material-ui/icons/Cloud';
import GetAppIcon from '@material-ui/icons/GetApp';
import FileCopyIcon from '@material-ui/icons/FileCopy';
import LinkIcon from '@material-ui/icons/Link';
import { butlerApiRef } from '../../api/ButlerApi';
import type {
  ClusterService,
  MirrordConfig,
} from '../../api/types/workspaces';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ServicesTabProps {
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

export const ServicesTab = ({
  clusterNamespace,
  clusterName,
}: ServicesTabProps) => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);

  const [services, setServices] = useState<ClusterService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();

  // Develop menu state
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuRow, setMenuRow] = useState<ServiceRow | null>(null);

  // mirrord dialog state
  const [mirrordOpen, setMirrordOpen] = useState(false);
  const [mirrordService, setMirrordService] = useState<ServiceRow | null>(null);
  const [mirrordConfig, setMirrordConfig] = useState<MirrordConfig | null>(null);
  const [mirrordLoading, setMirrordLoading] = useState(false);
  const [mirrordError, setMirrordError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // --------------------------------------------------------------------------
  // Data fetching
  // --------------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await api.listClusterServices(
        clusterNamespace,
        clusterName,
      );
      setServices(response.services || []);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [api, clusterNamespace, clusterName]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --------------------------------------------------------------------------
  // Derived state
  // --------------------------------------------------------------------------

  const rows: ServiceRow[] = services.map(svc => ({
    id: `${svc.namespace}/${svc.name}`,
    name: svc.name,
    namespace: svc.namespace,
    type: svc.type,
    clusterIP: svc.clusterIP || 'None',
    ports: formatPorts(svc),
    raw: svc,
  }));

  // --------------------------------------------------------------------------
  // Handlers
  // --------------------------------------------------------------------------

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

  const handleCloudWorkspace = () => {
    handleMenuClose();
    // Placeholder: in future, this will open the Create Workspace dialog on WorkspacesTab
  };

  const handleMirrordOpen = async (row: ServiceRow) => {
    handleMenuClose();
    setMirrordService(row);
    setMirrordConfig(null);
    setMirrordError(null);
    setMirrordOpen(true);
    setCopied(null);

    setMirrordLoading(true);
    try {
      const config = await api.generateMirrordConfig(
        clusterNamespace,
        clusterName,
        row.name,
        row.namespace,
      );
      setMirrordConfig(config);
    } catch (e) {
      setMirrordError(
        e instanceof Error ? e.message : 'Failed to generate mirrord config',
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

  // --------------------------------------------------------------------------
  // Render: loading/error
  // --------------------------------------------------------------------------

  if (loading) {
    return <Progress />;
  }

  if (error) {
    return (
      <EmptyState
        title="Failed to load services"
        description={error.message}
        missing="info"
      />
    );
  }

  // --------------------------------------------------------------------------
  // Table columns
  // --------------------------------------------------------------------------

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

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  return (
    <div className={classes.root}>
      <div>
        <div className={classes.headerRow}>
          <div className={classes.sectionTitle}>
            <Typography variant="h6">Services</Typography>
            <Chip
              label={`${services.length}`}
              size="small"
              color="default"
              className={classes.sectionCount}
            />
          </div>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={fetchData}
          >
            Refresh
          </Button>
        </div>

        {services.length === 0 ? (
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
      </div>

      {/* Develop actions menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem onClick={handleCloudWorkspace}>
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

      {/* mirrord Configuration Dialog */}
      <MirrordConfigDialog
        open={mirrordOpen}
        service={mirrordService}
        config={mirrordConfig}
        loading={mirrordLoading}
        error={mirrordError}
        copied={copied}
        onDownloadConfig={() => {
          if (mirrordConfig) {
            handleDownload(mirrordConfig.config, mirrordConfig.filename);
          }
        }}
        onDownloadKubeconfig={() => {
          if (mirrordConfig) {
            handleDownload(mirrordConfig.kubeconfig, 'kubeconfig.yaml');
          }
        }}
        onCopyVSCodeLink={() => {
          if (mirrordConfig) {
            handleCopyToClipboard(
              getVSCodeDeeplink(mirrordConfig.config),
              'vscode',
            );
          }
        }}
        onCopyCLI={() => {
          if (mirrordConfig) {
            handleCopyToClipboard(
              `mirrord exec --config-file ${mirrordConfig.filename} -- <your-command>`,
              'cli',
            );
          }
        }}
        onClose={handleMirrordClose}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// mirrord Configuration Dialog
// ---------------------------------------------------------------------------

function MirrordConfigDialog({
  open,
  service,
  config,
  loading,
  error,
  copied,
  onDownloadConfig,
  onDownloadKubeconfig,
  onCopyVSCodeLink,
  onCopyCLI,
  onClose,
}: {
  open: boolean;
  service: ServiceRow | null;
  config: MirrordConfig | null;
  loading: boolean;
  error: string | null;
  copied: string | null;
  onDownloadConfig: () => void;
  onDownloadKubeconfig: () => void;
  onCopyVSCodeLink: () => void;
  onCopyCLI: () => void;
  onClose: () => void;
}) {
  const classes = useStyles();

  if (!service) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>mirrord Configuration - {service.name}</DialogTitle>
      <DialogContent>
        {loading && (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        )}

        {error && (
          <EmptyState
            title="Failed to generate configuration"
            description={error}
            missing="info"
          />
        )}

        {config && (
          <>
            {/* mirrord Config */}
            <div className={classes.previewContainer}>
              <div className={classes.previewHeader}>
                <Typography variant="caption" color="textSecondary">
                  mirrord Config ({config.filename})
                </Typography>
              </div>
              <pre className={classes.previewContent}>{config.config}</pre>
            </div>

            {/* Kubeconfig */}
            <div className={classes.dialogSection}>
              <div className={classes.previewContainer}>
                <div className={classes.previewHeader}>
                  <Typography variant="caption" color="textSecondary">
                    Scoped Kubeconfig
                  </Typography>
                </div>
                <pre className={classes.previewContent}>
                  {config.kubeconfig}
                </pre>
              </div>
            </div>

            {/* CLI Command */}
            <div className={classes.dialogSection}>
              <Typography variant="subtitle2">CLI Command</Typography>
              <div className={classes.commandBox}>
                <div className={classes.commandText}>
                  mirrord exec --config-file {config.filename} -- &lt;your-command&gt;
                </div>
                <Tooltip title={copied === 'cli' ? 'Copied' : 'Copy command'}>
                  <IconButton size="small" onClick={onCopyCLI}>
                    <FileCopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </div>
            </div>

            {/* VS Code Deeplink */}
            <div className={classes.dialogSection}>
              <Typography variant="subtitle2">VS Code Extension</Typography>
              <div className={classes.commandBox}>
                <div className={classes.commandText}>
                  vscode://metalbear-co.mirrord/connect?config=...
                </div>
                <Tooltip
                  title={copied === 'vscode' ? 'Copied' : 'Copy VS Code link'}
                >
                  <IconButton size="small" onClick={onCopyVSCodeLink}>
                    <FileCopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </div>
            </div>
          </>
        )}
      </DialogContent>
      <DialogActions>
        {config && (
          <>
            <Button
              onClick={onDownloadConfig}
              startIcon={<GetAppIcon />}
              color="primary"
              variant="outlined"
              size="small"
            >
              Download Config
            </Button>
            <Button
              onClick={onDownloadKubeconfig}
              startIcon={<GetAppIcon />}
              color="primary"
              variant="outlined"
              size="small"
            >
              Download Kubeconfig
            </Button>
            <Button
              onClick={onCopyVSCodeLink}
              startIcon={<LinkIcon />}
              color="primary"
              variant="outlined"
              size="small"
            >
              {copied === 'vscode' ? 'Copied' : 'Copy VS Code Link'}
            </Button>
          </>
        )}
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPorts(svc: ClusterService): string {
  if (!svc.ports || svc.ports.length === 0) return 'None';
  return svc.ports
    .map(p => `${p.port}/${p.protocol}`)
    .join(', ');
}
