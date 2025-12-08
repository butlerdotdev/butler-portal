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
  CardActions,
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
  FormControlLabel,
  Checkbox,
  Collapse,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import { Alert } from '@material-ui/lab';
import AddIcon from '@material-ui/icons/Add';
import DeleteIcon from '@material-ui/icons/Delete';
import RefreshIcon from '@material-ui/icons/Refresh';
import SettingsIcon from '@material-ui/icons/Settings';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import SearchIcon from '@material-ui/icons/Search';
import CloudUploadIcon from '@material-ui/icons/CloudUpload';
import SyncIcon from '@material-ui/icons/Sync';
import WarningIcon from '@material-ui/icons/Warning';
import VisibilityIcon from '@material-ui/icons/Visibility';
import VisibilityOffIcon from '@material-ui/icons/VisibilityOff';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import ExpandLessIcon from '@material-ui/icons/ExpandLess';
import { butlerApiRef } from '../../api/ButlerApi';
import type {
  InstalledAddon,
  AddonDefinition,
  CategoryInfo,
} from '../../api/types/addons';
import type {
  GitProviderConfig,
  Repository,
  Branch,
  DiscoveredRelease,
  DiscoveryResult,
  GitOpsStatus,
} from '../../api/types/gitops';
import { StatusBadge } from '../StatusBadge/StatusBadge';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AddonsTabProps {
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
  gitopsBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1.5),
    padding: theme.spacing(1.5, 2),
    borderRadius: theme.shape.borderRadius,
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(156, 39, 176, 0.08)'
        : 'rgba(156, 39, 176, 0.06)',
    border: `1px solid ${
      theme.palette.type === 'dark'
        ? 'rgba(156, 39, 176, 0.3)'
        : 'rgba(156, 39, 176, 0.2)'
    }`,
  },
  gitopsBannerText: {
    color: theme.palette.type === 'dark' ? '#ce93d8' : '#7b1fa2',
  },
  // Installed addons table
  platformChip: {
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(33, 150, 243, 0.15)'
        : 'rgba(33, 150, 243, 0.1)',
    color: theme.palette.info.main,
    fontWeight: 500,
  },
  gitopsChip: {
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(156, 39, 176, 0.15)'
        : 'rgba(156, 39, 176, 0.1)',
    color: theme.palette.type === 'dark' ? '#ce93d8' : '#7b1fa2',
    fontWeight: 500,
  },
  butlerChip: {
    fontWeight: 500,
  },
  // Catalog search and filter
  searchField: {
    minWidth: 280,
  },
  categoryChips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(0.75),
  },
  categoryChipActive: {
    fontWeight: 600,
  },
  // Catalog addon cards
  addonCard: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    transition: 'border-color 0.2s',
    '&:hover': {
      borderColor: theme.palette.primary.main,
    },
  },
  addonDescription: {
    color: theme.palette.text.secondary,
    marginTop: theme.spacing(1),
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  addonMeta: {
    marginTop: theme.spacing(1),
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    flexWrap: 'wrap',
  },
  addonLinks: {
    display: 'flex',
    gap: theme.spacing(1.5),
    marginTop: theme.spacing(1),
  },
  addonLink: {
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
    textDecoration: 'none',
    '&:hover': {
      color: theme.palette.primary.main,
      textDecoration: 'underline',
    },
  },
  installButtonGroup: {
    display: 'flex',
    width: '100%',
  },
  installButtonMain: {
    flexGrow: 1,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },
  installButtonDropdown: {
    minWidth: 'auto',
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    borderLeft: `1px solid ${theme.palette.primary.dark}`,
    padding: theme.spacing(0.5),
  },
  // Category section
  categoryHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(1),
  },
  categoryDescription: {
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(2),
  },
  // Dialog styles
  dialogSection: {
    marginTop: theme.spacing(2),
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
  previewFileHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    cursor: 'pointer',
    padding: theme.spacing(1, 2),
    borderBottom: `1px solid ${theme.palette.divider}`,
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
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
    maxHeight: 200,
    whiteSpace: 'pre',
    margin: 0,
  },
  warningBox: {
    padding: theme.spacing(2),
    borderRadius: theme.shape.borderRadius,
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(255, 152, 0, 0.08)'
        : 'rgba(255, 152, 0, 0.06)',
    border: `1px solid ${
      theme.palette.type === 'dark'
        ? 'rgba(255, 152, 0, 0.3)'
        : 'rgba(255, 152, 0, 0.2)'
    }`,
  },
  yamlField: {
    fontFamily: 'monospace',
    fontSize: '0.85rem',
  },
  addonInfoBox: {
    padding: theme.spacing(1.5, 2),
    borderRadius: theme.shape.borderRadius,
    backgroundColor: theme.palette.background.default,
    border: `1px solid ${theme.palette.divider}`,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
}));

// ---------------------------------------------------------------------------
// Installed addon row type for the table
// ---------------------------------------------------------------------------

type InstalledAddonRow = {
  id: string;
  name: string;
  displayName: string;
  version: string;
  status: string;
  category: string;
  managedBy: string;
  isPlatform: boolean;
  isGitOpsManaged: boolean;
  catalogInfo?: AddonDefinition;
  raw: InstalledAddon;
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const AddonsTab = ({
  clusterNamespace,
  clusterName,
}: AddonsTabProps) => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);

  // Data state
  const [installedAddons, setInstalledAddons] = useState<InstalledAddon[]>([]);
  const [catalog, setCatalog] = useState<AddonDefinition[]>([]);
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();

  // Search / filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // GitOps state
  const [gitOpsStatus, setGitOpsStatus] = useState<GitOpsStatus | null>(null);
  const [gitConfig, setGitConfig] = useState<GitProviderConfig | null>(null);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [discoveredReleases, setDiscoveredReleases] = useState<
    DiscoveredRelease[]
  >([]);

  // Install dialog state
  const [installOpen, setInstallOpen] = useState(false);
  const [selectedAddon, setSelectedAddon] = useState<AddonDefinition | null>(
    null,
  );
  const [selectedVersion, setSelectedVersion] = useState('');
  const [installValues, setInstallValues] = useState('');
  const [installing, setInstalling] = useState(false);
  const [quickInstallingAddon, setQuickInstallingAddon] = useState<
    string | null
  >(null);

  // Configure dialog state
  const [configureOpen, setConfigureOpen] = useState(false);
  const [configureAddon, setConfigureAddon] = useState<InstalledAddonRow | null>(
    null,
  );
  const [configureValues, setConfigureValues] = useState('');
  const [configuring, setConfiguring] = useState(false);

  // Uninstall dialog state
  const [uninstallOpen, setUninstallOpen] = useState(false);
  const [uninstallTarget, setUninstallTarget] = useState<InstalledAddonRow | null>(
    null,
  );
  const [uninstalling, setUninstalling] = useState(false);

  // GitOps warning dialog state
  const [gitopsWarningOpen, setGitopsWarningOpen] = useState(false);
  const [gitopsWarningAction, setGitopsWarningAction] = useState<
    'configure' | 'uninstall'
  >('configure');
  const [gitopsWarningTarget, setGitopsWarningTarget] =
    useState<InstalledAddonRow | null>(null);

  // GitOps export dialog (from catalog)
  const [exportOpen, setExportOpen] = useState(false);
  const [exportAddon, setExportAddon] = useState<AddonDefinition | null>(null);

  // Migrate to GitOps dialog (from installed)
  const [migrateOpen, setMigrateOpen] = useState(false);
  const [migrateAddon, setMigrateAddon] = useState<InstalledAddonRow | null>(
    null,
  );

  // Actions menu anchor (for per-row dropdown)
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuRow, setMenuRow] = useState<InstalledAddonRow | null>(null);

  // Install dropdown menu (for catalog cards)
  const [installMenuAnchor, setInstallMenuAnchor] =
    useState<null | HTMLElement>(null);
  const [installMenuAddon, setInstallMenuAddon] =
    useState<AddonDefinition | null>(null);

  // --------------------------------------------------------------------------
  // Data fetching
  // --------------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [addonsResponse, catalogResponse] = await Promise.all([
        api.listClusterAddons(clusterNamespace, clusterName),
        api.getAddonCatalog(),
      ]);
      setInstalledAddons(addonsResponse.addons || []);
      setCatalog(catalogResponse.addons || []);
      setCategories(catalogResponse.categories || []);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [api, clusterNamespace, clusterName]);

  const fetchGitOpsData = useCallback(async () => {
    try {
      const [status, config] = await Promise.all([
        api.getClusterGitOpsStatus(clusterNamespace, clusterName),
        api.getGitOpsConfig(),
      ]);
      setGitOpsStatus(status);
      setGitConfig(config);

      if (config.configured) {
        try {
          const repos = await api.listRepositories();
          setRepositories(repos);
        } catch {
          // Repositories not critical
        }
      }
    } catch {
      // GitOps data not critical
    }
  }, [api, clusterNamespace, clusterName]);

  const fetchDiscoveredReleases = useCallback(async () => {
    try {
      const result: DiscoveryResult = await api.discoverClusterReleases(
        clusterNamespace,
        clusterName,
      );
      const allReleases = [
        ...(result.matched || []),
        ...(result.unmatched || []),
      ];
      setDiscoveredReleases(allReleases);
    } catch {
      // Discovery not critical
    }
  }, [api, clusterNamespace, clusterName]);

  useEffect(() => {
    fetchData();
    fetchGitOpsData();
    fetchDiscoveredReleases();
  }, [fetchData, fetchGitOpsData, fetchDiscoveredReleases]);

  // --------------------------------------------------------------------------
  // Derived state
  // --------------------------------------------------------------------------

  const gitopsEnabled = useMemo(() => {
    if (gitOpsStatus?.enabled) return true;
    return installedAddons.some(
      a =>
        a.name.toLowerCase() === 'flux' || a.name.toLowerCase() === 'argocd',
    );
  }, [gitOpsStatus, installedAddons]);

  const platformAddonNames = useMemo(() => {
    return new Set(
      catalog.filter(a => a.platform).map(a => a.name.toLowerCase()),
    );
  }, [catalog]);

  const optionalCatalog = useMemo(() => {
    return catalog.filter(a => !a.platform);
  }, [catalog]);

  const optionalCategories = useMemo(() => {
    const catNames = new Set(optionalCatalog.map(a => a.category));
    return categories.filter(c => catNames.has(c.name));
  }, [optionalCatalog, categories]);

  const installedNames = useMemo(
    () => new Set(installedAddons.map(a => a.name.toLowerCase())),
    [installedAddons],
  );

  // Table rows
  const installedRows: InstalledAddonRow[] = useMemo(() => {
    return installedAddons.map(addon => {
      const catalogEntry = catalog.find(
        c => c.name.toLowerCase() === addon.name.toLowerCase(),
      );
      const isPlatform = platformAddonNames.has(addon.name.toLowerCase());
      return {
        id: addon.name,
        name: addon.name,
        displayName: addon.displayName || catalogEntry?.displayName || addon.name,
        version: addon.installedVersion || addon.version || 'N/A',
        status: addon.status,
        category: catalogEntry?.category || 'other',
        managedBy: addon.managedBy || (isPlatform ? 'platform' : 'butler'),
        isPlatform,
        isGitOpsManaged: addon.managedBy === 'gitops',
        catalogInfo: catalogEntry,
        raw: addon,
      };
    });
  }, [installedAddons, catalog, platformAddonNames]);

  // Available (not installed) optional addons, filtered
  const availableCatalog = useMemo(() => {
    return optionalCatalog.filter(addon => {
      if (installedNames.has(addon.name.toLowerCase())) return false;

      const matchesSearch =
        searchQuery === '' ||
        addon.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        addon.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        addon.name.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory =
        selectedCategory === 'all' || addon.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [optionalCatalog, installedNames, searchQuery, selectedCategory]);

  // Group available by category
  const groupedAvailableCatalog = useMemo(() => {
    const groups: Record<string, AddonDefinition[]> = {};
    optionalCategories.forEach(cat => {
      groups[cat.name] = [];
    });
    availableCatalog.forEach(addon => {
      if (groups[addon.category]) {
        groups[addon.category].push(addon);
      }
    });
    return groups;
  }, [availableCatalog, optionalCategories]);

  // Helper to find discovered release for an addon
  const getDiscoveredRelease = useCallback(
    (addonName: string) => {
      const normalized = addonName
        .toLowerCase()
        .replace(/^grafana[\s-]*/i, '')
        .replace(/[\s-]+/g, '-');

      return discoveredReleases.find(r => {
        const releaseName = r.name.toLowerCase();
        const chartName = r.chart.toLowerCase().split(':')[0];
        return (
          releaseName === normalized ||
          chartName === normalized ||
          releaseName.includes(normalized) ||
          chartName.includes(normalized) ||
          normalized.includes(releaseName)
        );
      });
    },
    [discoveredReleases],
  );

  // --------------------------------------------------------------------------
  // Handlers
  // --------------------------------------------------------------------------

  const handleOpenInstall = (addon: AddonDefinition) => {
    setSelectedAddon(addon);
    setSelectedVersion(addon.defaultVersion);
    setInstallValues('');
    setInstallOpen(true);
  };

  const handleQuickInstall = async (addon: AddonDefinition) => {
    setQuickInstallingAddon(addon.name);
    try {
      await api.installAddon(clusterNamespace, clusterName, {
        addon: addon.name,
      });
      await fetchData();
    } catch {
      // Silent
    } finally {
      setQuickInstallingAddon(null);
    }
  };

  const handleInstall = async () => {
    if (!selectedAddon) return;
    setInstalling(true);
    try {
      let values: Record<string, unknown> | undefined;
      if (installValues.trim()) {
        try {
          values = parseYaml(installValues);
        } catch {
          // Treat as empty values on parse error
        }
      }
      await api.installAddon(clusterNamespace, clusterName, {
        addon: selectedAddon.name,
        version: selectedVersion,
        values,
      });
      setInstallOpen(false);
      setSelectedAddon(null);
      setSelectedVersion('');
      setInstallValues('');
      await fetchData();
    } catch {
      // Silent
    } finally {
      setInstalling(false);
    }
  };

  // Configure
  const handleOpenConfigure = (row: InstalledAddonRow) => {
    if (row.isGitOpsManaged) {
      setGitopsWarningTarget(row);
      setGitopsWarningAction('configure');
      setGitopsWarningOpen(true);
      return;
    }
    openConfigureDialog(row);
  };

  const openConfigureDialog = (row: InstalledAddonRow) => {
    setConfigureAddon(row);
    setConfigureValues('');
    setConfigureOpen(true);
  };

  const handleConfigure = async () => {
    if (!configureAddon) return;
    setConfiguring(true);
    try {
      let values: Record<string, unknown> | undefined;
      if (configureValues.trim()) {
        try {
          values = parseYaml(configureValues);
        } catch {
          // Treat as empty
        }
      }
      await api.updateAddon(
        clusterNamespace,
        clusterName,
        configureAddon.name,
        { values },
      );
      setConfigureOpen(false);
      setConfigureAddon(null);
      setConfigureValues('');
      await fetchData();
    } catch {
      // Silent
    } finally {
      setConfiguring(false);
    }
  };

  // Uninstall
  const handleOpenUninstall = (row: InstalledAddonRow) => {
    if (row.isGitOpsManaged) {
      setGitopsWarningTarget(row);
      setGitopsWarningAction('uninstall');
      setGitopsWarningOpen(true);
      return;
    }
    setUninstallTarget(row);
    setUninstallOpen(true);
  };

  const handleUninstall = async () => {
    if (!uninstallTarget) return;
    setUninstalling(true);
    try {
      await api.uninstallAddon(
        clusterNamespace,
        clusterName,
        uninstallTarget.name,
      );
      setUninstallOpen(false);
      setUninstallTarget(null);
      await fetchData();
    } catch {
      // Silent
    } finally {
      setUninstalling(false);
    }
  };

  // GitOps warning proceed
  const handleGitOpsWarningProceed = () => {
    if (!gitopsWarningTarget) return;
    setGitopsWarningOpen(false);

    if (gitopsWarningAction === 'configure') {
      openConfigureDialog(gitopsWarningTarget);
    } else {
      setUninstallTarget(gitopsWarningTarget);
      setUninstallOpen(true);
    }
    setGitopsWarningTarget(null);
  };

  // Migrate to GitOps
  const handleOpenMigrate = (row: InstalledAddonRow) => {
    setMigrateAddon(row);
    setMigrateOpen(true);
  };

  // Export to GitOps (from catalog)
  const handleOpenExport = (addon: AddonDefinition) => {
    setExportAddon(addon);
    setExportOpen(true);
  };

  // Menu handlers
  const handleMenuOpen = (
    event: React.MouseEvent<HTMLElement>,
    row: InstalledAddonRow,
  ) => {
    setMenuAnchor(event.currentTarget);
    setMenuRow(row);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    setMenuRow(null);
  };

  const handleInstallMenuOpen = (
    event: React.MouseEvent<HTMLElement>,
    addon: AddonDefinition,
  ) => {
    setInstallMenuAnchor(event.currentTarget);
    setInstallMenuAddon(addon);
  };

  const handleInstallMenuClose = () => {
    setInstallMenuAnchor(null);
    setInstallMenuAddon(null);
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
        title="Failed to load addons"
        description={error.message}
        missing="info"
      />
    );
  }

  // --------------------------------------------------------------------------
  // Table columns
  // --------------------------------------------------------------------------

  const installedColumns: TableColumn<InstalledAddonRow>[] = [
    {
      title: 'Name',
      field: 'displayName',
      render: (row: InstalledAddonRow) => (
        <Box display="flex" alignItems="center" style={{ gap: 8 }}>
          <Typography variant="body2" style={{ fontWeight: 500 }}>
            {row.displayName}
          </Typography>
          {row.isPlatform && (
            <Chip
              label="Platform"
              size="small"
              className={classes.platformChip}
            />
          )}
        </Box>
      ),
    },
    { title: 'Version', field: 'version' },
    {
      title: 'Status',
      field: 'status',
      render: (row: InstalledAddonRow) => <StatusBadge status={row.status} />,
    },
    {
      title: 'Category',
      field: 'category',
      render: (row: InstalledAddonRow) => (
        <Chip label={row.category} size="small" variant="outlined" />
      ),
    },
    {
      title: 'Managed By',
      field: 'managedBy',
      render: (row: InstalledAddonRow) => {
        if (row.isGitOpsManaged) {
          return (
            <Chip
              label="GitOps"
              size="small"
              className={classes.gitopsChip}
            />
          );
        }
        if (row.isPlatform) {
          return (
            <Chip
              label="Platform"
              size="small"
              className={classes.platformChip}
            />
          );
        }
        return (
          <Chip
            label={row.managedBy}
            size="small"
            variant="outlined"
            className={classes.butlerChip}
          />
        );
      },
    },
    {
      title: 'Actions',
      field: 'id',
      width: '80px',
      render: (row: InstalledAddonRow) => (
        <IconButton
          size="small"
          onClick={e => handleMenuOpen(e, row)}
          aria-label="addon actions"
        >
          <MoreVertIcon />
        </IconButton>
      ),
    },
  ];

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  return (
    <div className={classes.root}>
      {/* GitOps Status Banner */}
      {gitopsEnabled && (
        <div className={classes.gitopsBanner}>
          <SyncIcon className={classes.gitopsBannerText} />
          <div>
            <Typography
              variant="subtitle2"
              className={classes.gitopsBannerText}
            >
              GitOps Enabled
            </Typography>
            <Typography variant="caption" color="textSecondary">
              Addons can be exported to Git or migrated to GitOps management via
              the actions menu on each addon.
            </Typography>
          </div>
        </div>
      )}

      {/* Installed Addons Section */}
      <div>
        <div className={classes.headerRow}>
          <div className={classes.sectionTitle}>
            <Typography variant="h6">Installed Addons</Typography>
            <Chip
              label={`${installedAddons.length}`}
              size="small"
              color="default"
              className={classes.sectionCount}
            />
          </div>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={() => {
              fetchData();
              fetchDiscoveredReleases();
            }}
          >
            Refresh
          </Button>
        </div>

        {installedAddons.length === 0 ? (
          <EmptyState
            title="No addons installed"
            description="Install addons from the catalog below to extend your cluster."
            missing="content"
          />
        ) : (
          <Table<InstalledAddonRow>
            title={`Installed (${installedAddons.length})`}
            options={{
              search: false,
              paging: installedAddons.length > 10,
              padding: 'dense',
              pageSize: 10,
            }}
            columns={installedColumns}
            data={installedRows}
          />
        )}
      </div>

      {/* Actions menu for installed addons */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {menuRow?.catalogInfo && (
          <MenuItem
            onClick={() => {
              handleMenuClose();
              if (menuRow) handleOpenConfigure(menuRow);
            }}
          >
            <SettingsIcon fontSize="small" style={{ marginRight: 8 }} />
            Configure
            {menuRow?.isGitOpsManaged && (
              <WarningIcon
                fontSize="small"
                style={{ marginLeft: 8, color: '#ff9800' }}
              />
            )}
          </MenuItem>
        )}
        {gitopsEnabled && menuRow && !menuRow.isGitOpsManaged && !menuRow.isPlatform && (
          <MenuItem
            onClick={() => {
              const row = menuRow;
              handleMenuClose();
              handleOpenMigrate(row);
            }}
          >
            <SyncIcon fontSize="small" style={{ marginRight: 8 }} />
            Migrate to GitOps
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            const row = menuRow;
            handleMenuClose();
            if (row) handleOpenUninstall(row);
          }}
          disabled={menuRow?.isPlatform}
        >
          <DeleteIcon
            fontSize="small"
            style={{ marginRight: 8, color: menuRow?.isPlatform ? undefined : '#f44336' }}
          />
          <Typography
            variant="inherit"
            color={menuRow?.isPlatform ? 'textSecondary' : 'secondary'}
          >
            Uninstall
          </Typography>
          {menuRow?.isGitOpsManaged && (
            <WarningIcon
              fontSize="small"
              style={{ marginLeft: 8, color: '#ff9800' }}
            />
          )}
        </MenuItem>
      </Menu>

      {/* Available Addons Catalog */}
      <div>
        <div className={classes.headerRow}>
          <div className={classes.sectionTitle}>
            <Typography variant="h6">Available Addons</Typography>
            <Chip
              label={`${availableCatalog.length}`}
              size="small"
              color="default"
              className={classes.sectionCount}
            />
          </div>
        </div>
        <Typography variant="body2" color="textSecondary" gutterBottom>
          Additional functionality you can enable for this cluster.
        </Typography>

        {/* Search and Category Filter */}
        <Box
          display="flex"
          flexDirection="row"
          flexWrap="wrap"
          alignItems="center"
          style={{ gap: 16 }}
          mb={3}
          mt={2}
        >
          <TextField
            variant="outlined"
            size="small"
            placeholder="Search addons..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className={classes.searchField}
            InputProps={{
              startAdornment: (
                <SearchIcon
                  fontSize="small"
                  color="disabled"
                  style={{ marginRight: 8 }}
                />
              ),
            }}
          />
          <div className={classes.categoryChips}>
            <Chip
              label="All"
              size="small"
              variant={selectedCategory === 'all' ? 'default' : 'outlined'}
              color={selectedCategory === 'all' ? 'primary' : 'default'}
              className={
                selectedCategory === 'all'
                  ? classes.categoryChipActive
                  : undefined
              }
              onClick={() => setSelectedCategory('all')}
              clickable
            />
            {optionalCategories.map(cat => (
              <Chip
                key={cat.name}
                label={cat.displayName}
                size="small"
                variant={
                  selectedCategory === cat.name ? 'default' : 'outlined'
                }
                color={selectedCategory === cat.name ? 'primary' : 'default'}
                className={
                  selectedCategory === cat.name
                    ? classes.categoryChipActive
                    : undefined
                }
                onClick={() => setSelectedCategory(cat.name)}
                clickable
              />
            ))}
          </div>
        </Box>

        {/* Catalog Cards by Category */}
        {availableCatalog.length === 0 ? (
          <Typography color="textSecondary" align="center">
            {searchQuery || selectedCategory !== 'all'
              ? 'No addons match your search.'
              : 'All available addons are already installed.'}
          </Typography>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            {optionalCategories.map(category => {
              const categoryAddons =
                groupedAvailableCatalog[category.name] || [];
              if (categoryAddons.length === 0) return null;
              return (
                <div key={category.name}>
                  <div className={classes.categoryHeader}>
                    <Typography variant="subtitle1" style={{ fontWeight: 600 }}>
                      {category.displayName}
                    </Typography>
                  </div>
                  <Typography
                    variant="body2"
                    className={classes.categoryDescription}
                  >
                    {category.description}
                  </Typography>
                  <Grid container spacing={2}>
                    {categoryAddons.map(addon => (
                      <Grid item xs={12} sm={6} md={4} lg={3} key={addon.name}>
                        <Card
                          className={classes.addonCard}
                          variant="outlined"
                        >
                          <CardContent>
                            <Chip
                              label={addon.category}
                              size="small"
                              variant="outlined"
                            />
                            <Typography
                              variant="subtitle1"
                              style={{ fontWeight: 500, marginTop: 8 }}
                            >
                              {addon.displayName}
                            </Typography>
                            <Typography
                              variant="body2"
                              className={classes.addonDescription}
                            >
                              {addon.description}
                            </Typography>
                            <div className={classes.addonMeta}>
                              <Typography
                                variant="caption"
                                color="textSecondary"
                              >
                                v{addon.defaultVersion}
                              </Typography>
                              {addon.dependsOn &&
                                addon.dependsOn.length > 0 && (
                                  <Typography
                                    variant="caption"
                                    color="textSecondary"
                                  >
                                    Requires: {addon.dependsOn.join(', ')}
                                  </Typography>
                                )}
                            </div>
                            {addon.links && (
                              <div className={classes.addonLinks}>
                                {addon.links.documentation && (
                                  <a
                                    href={addon.links.documentation}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={classes.addonLink}
                                  >
                                    Docs
                                  </a>
                                )}
                                {addon.links.homepage && (
                                  <a
                                    href={addon.links.homepage}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={classes.addonLink}
                                  >
                                    Homepage
                                  </a>
                                )}
                              </div>
                            )}
                          </CardContent>
                          <CardActions>
                            <div className={classes.installButtonGroup}>
                              <Button
                                size="small"
                                color="primary"
                                variant="contained"
                                className={classes.installButtonMain}
                                startIcon={
                                  quickInstallingAddon === addon.name ? (
                                    <CircularProgress
                                      size={16}
                                      color="inherit"
                                    />
                                  ) : (
                                    <AddIcon />
                                  )
                                }
                                disabled={
                                  quickInstallingAddon === addon.name
                                }
                                onClick={() => handleQuickInstall(addon)}
                              >
                                {quickInstallingAddon === addon.name
                                  ? 'Installing...'
                                  : 'Install'}
                              </Button>
                              <Button
                                size="small"
                                color="primary"
                                variant="contained"
                                className={classes.installButtonDropdown}
                                disabled={
                                  quickInstallingAddon === addon.name
                                }
                                onClick={e =>
                                  handleInstallMenuOpen(e, addon)
                                }
                                aria-label="install options"
                              >
                                <ExpandMoreIcon fontSize="small" />
                              </Button>
                            </div>
                          </CardActions>
                        </Card>
                      </Grid>
                    ))}
                  </Grid>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Install options dropdown menu */}
      <Menu
        anchorEl={installMenuAnchor}
        open={Boolean(installMenuAnchor)}
        onClose={handleInstallMenuClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem
          onClick={() => {
            const addon = installMenuAddon;
            handleInstallMenuClose();
            if (addon) handleQuickInstall(addon);
          }}
        >
          <AddIcon fontSize="small" style={{ marginRight: 8 }} />
          Quick Install
        </MenuItem>
        <MenuItem
          onClick={() => {
            const addon = installMenuAddon;
            handleInstallMenuClose();
            if (addon) handleOpenInstall(addon);
          }}
        >
          <SettingsIcon fontSize="small" style={{ marginRight: 8 }} />
          Configure and Install
        </MenuItem>
        {gitopsEnabled && (
          <MenuItem
            onClick={() => {
              const addon = installMenuAddon;
              handleInstallMenuClose();
              if (addon) handleOpenExport(addon);
            }}
          >
            <CloudUploadIcon fontSize="small" style={{ marginRight: 8 }} />
            Export to GitOps
          </MenuItem>
        )}
      </Menu>

      {/* ================================================================= */}
      {/* DIALOGS                                                           */}
      {/* ================================================================= */}

      {/* Install Addon Dialog */}
      <InstallAddonDialog
        open={installOpen}
        addon={selectedAddon}
        version={selectedVersion}
        values={installValues}
        installing={installing}
        onVersionChange={setSelectedVersion}
        onValuesChange={setInstallValues}
        onInstall={handleInstall}
        onClose={() => {
          setInstallOpen(false);
          setSelectedAddon(null);
        }}
      />

      {/* Configure Addon Dialog */}
      <ConfigureAddonDialog
        open={configureOpen}
        row={configureAddon}
        values={configureValues}
        configuring={configuring}
        onValuesChange={setConfigureValues}
        onConfigure={handleConfigure}
        onClose={() => {
          setConfigureOpen(false);
          setConfigureAddon(null);
        }}
      />

      {/* Uninstall Confirmation Dialog */}
      <UninstallAddonDialog
        open={uninstallOpen}
        row={uninstallTarget}
        uninstalling={uninstalling}
        onUninstall={handleUninstall}
        onClose={() => {
          setUninstallOpen(false);
          setUninstallTarget(null);
        }}
      />

      {/* GitOps Warning Dialog */}
      <GitOpsWarningDialog
        open={gitopsWarningOpen}
        row={gitopsWarningTarget}
        action={gitopsWarningAction}
        onProceed={handleGitOpsWarningProceed}
        onClose={() => {
          setGitopsWarningOpen(false);
          setGitopsWarningTarget(null);
        }}
      />

      {/* Export to GitOps Dialog (from catalog) */}
      <ExportToGitOpsDialog
        open={exportOpen}
        addon={exportAddon}
        clusterName={clusterName}
        clusterNamespace={clusterNamespace}
        repositories={repositories}
        gitConfigured={gitConfig?.configured ?? false}
        api={api}
        onSuccess={() => {
          setExportOpen(false);
          setExportAddon(null);
          fetchData();
        }}
        onClose={() => {
          setExportOpen(false);
          setExportAddon(null);
        }}
      />

      {/* Migrate to GitOps Dialog (from installed) */}
      <MigrateToGitOpsDialog
        open={migrateOpen}
        row={migrateAddon}
        clusterName={clusterName}
        clusterNamespace={clusterNamespace}
        repositories={repositories}
        gitConfigured={gitConfig?.configured ?? false}
        discoveredRelease={
          migrateAddon ? getDiscoveredRelease(migrateAddon.name) : undefined
        }
        api={api}
        onSuccess={() => {
          setMigrateOpen(false);
          setMigrateAddon(null);
          fetchData();
        }}
        onClose={() => {
          setMigrateOpen(false);
          setMigrateAddon(null);
        }}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Install Addon Dialog
// ---------------------------------------------------------------------------

function InstallAddonDialog({
  open,
  addon,
  version,
  values,
  installing,
  onVersionChange,
  onValuesChange,
  onInstall,
  onClose,
}: {
  open: boolean;
  addon: AddonDefinition | null;
  version: string;
  values: string;
  installing: boolean;
  onVersionChange: (v: string) => void;
  onValuesChange: (v: string) => void;
  onInstall: () => void;
  onClose: () => void;
}) {
  if (!addon) return null;

  const versions = addon.availableVersions?.length
    ? addon.availableVersions
    : [addon.defaultVersion];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Install {addon.displayName}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="textSecondary" gutterBottom>
          {addon.description}
        </Typography>

        <Box mt={2}>
          <TextField
            select
            label="Version"
            value={version}
            onChange={e => onVersionChange(e.target.value)}
            fullWidth
            variant="outlined"
            size="small"
          >
            {versions.map(v => (
              <MenuItem key={v} value={v}>
                {v}
                {v === addon.defaultVersion ? ' (default)' : ''}
              </MenuItem>
            ))}
          </TextField>
        </Box>

        <Box mt={2}>
          <Typography variant="caption" color="textSecondary">
            Chart: {addon.chartRepository}/{addon.chartName}
          </Typography>
        </Box>

        <Box mt={2}>
          <TextField
            label="Helm Values (YAML)"
            multiline
            rows={8}
            value={values}
            onChange={e => onValuesChange(e.target.value)}
            fullWidth
            variant="outlined"
            size="small"
            placeholder="# Optional: custom Helm values in YAML format"
            InputProps={{
              style: { fontFamily: 'monospace', fontSize: '0.85rem' },
            }}
          />
          <Typography
            variant="caption"
            color="textSecondary"
            style={{ marginTop: 4, display: 'block' }}
          >
            Leave empty to install with default values.
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={installing}>
          Cancel
        </Button>
        <Button
          onClick={onInstall}
          color="primary"
          variant="contained"
          disabled={installing || !version}
          startIcon={
            installing ? (
              <CircularProgress size={16} color="inherit" />
            ) : undefined
          }
        >
          {installing ? 'Installing...' : 'Install'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Configure Addon Dialog
// ---------------------------------------------------------------------------

function ConfigureAddonDialog({
  open,
  row,
  values,
  configuring,
  onValuesChange,
  onConfigure,
  onClose,
}: {
  open: boolean;
  row: InstalledAddonRow | null;
  values: string;
  configuring: boolean;
  onValuesChange: (v: string) => void;
  onConfigure: () => void;
  onClose: () => void;
}) {
  const classes = useStyles();

  if (!row) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Configure {row.displayName}</DialogTitle>
      <DialogContent>
        <div className={classes.addonInfoBox}>
          <div>
            <Typography variant="body2" style={{ fontWeight: 500 }}>
              {row.displayName}
            </Typography>
            {row.catalogInfo && (
              <Typography variant="caption" color="textSecondary">
                {row.catalogInfo.chartName}:{row.version}
              </Typography>
            )}
          </div>
          <Chip label={row.status} size="small" variant="outlined" />
        </div>

        {row.isGitOpsManaged && (
          <Box mt={2}>
            <Alert severity="warning">
              This addon is managed by GitOps. Any configuration changes made
              here may be overwritten the next time GitOps reconciles from your
              Git repository.
            </Alert>
          </Box>
        )}

        <Box mt={2}>
          <TextField
            label="Helm Values Override (YAML)"
            multiline
            rows={10}
            value={values}
            onChange={e => onValuesChange(e.target.value)}
            fullWidth
            variant="outlined"
            size="small"
            placeholder="# Enter Helm values in YAML format to override current configuration"
            InputProps={{
              style: { fontFamily: 'monospace', fontSize: '0.85rem' },
            }}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={configuring}>
          Cancel
        </Button>
        <Button
          onClick={onConfigure}
          color="primary"
          variant="contained"
          disabled={configuring}
          startIcon={
            configuring ? (
              <CircularProgress size={16} color="inherit" />
            ) : undefined
          }
        >
          {configuring ? 'Saving...' : 'Save Configuration'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Uninstall Confirmation Dialog
// ---------------------------------------------------------------------------

function UninstallAddonDialog({
  open,
  row,
  uninstalling,
  onUninstall,
  onClose,
}: {
  open: boolean;
  row: InstalledAddonRow | null;
  uninstalling: boolean;
  onUninstall: () => void;
  onClose: () => void;
}) {
  if (!row) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Uninstall Addon</DialogTitle>
      <DialogContent>
        <Typography>
          Are you sure you want to uninstall{' '}
          <strong>{row.displayName}</strong> from this cluster?
        </Typography>
        <Box mt={1}>
          <Typography variant="body2" color="textSecondary">
            This action is irreversible. The addon and all its associated
            resources will be removed from the tenant cluster.
          </Typography>
        </Box>
        {row.isGitOpsManaged && (
          <Box mt={2}>
            <Alert severity="warning">
              This addon is managed by GitOps. If you uninstall it here, GitOps
              will automatically re-create it from your Git repository. To
              permanently remove it, delete the addon from your Git repository
              first.
            </Alert>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={uninstalling}>
          Cancel
        </Button>
        <Button
          onClick={onUninstall}
          color="secondary"
          variant="contained"
          disabled={uninstalling}
          startIcon={
            uninstalling ? (
              <CircularProgress size={16} color="inherit" />
            ) : undefined
          }
        >
          {uninstalling ? 'Uninstalling...' : 'Uninstall'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// GitOps Warning Dialog
// ---------------------------------------------------------------------------

function GitOpsWarningDialog({
  open,
  row,
  action,
  onProceed,
  onClose,
}: {
  open: boolean;
  row: InstalledAddonRow | null;
  action: 'configure' | 'uninstall';
  onProceed: () => void;
  onClose: () => void;
}) {
  if (!row) return null;

  const actionLabel = action === 'configure' ? 'Configure' : 'Uninstall';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" style={{ gap: 8 }}>
          <WarningIcon style={{ color: '#ff9800' }} />
          GitOps-Managed Addon
        </Box>
      </DialogTitle>
      <DialogContent>
        <Typography gutterBottom>
          <strong>{row.displayName}</strong> is managed by GitOps.
        </Typography>

        {action === 'configure' ? (
          <Alert severity="warning" style={{ marginTop: 8 }}>
            <Typography variant="body2" style={{ fontWeight: 500 }}>
              Changes may be overwritten
            </Typography>
            <Typography variant="body2">
              Any configuration changes made here will be overwritten the next
              time GitOps reconciles from your Git repository.
            </Typography>
          </Alert>
        ) : (
          <Alert severity="warning" style={{ marginTop: 8 }}>
            <Typography variant="body2" style={{ fontWeight: 500 }}>
              Addon will be re-created
            </Typography>
            <Typography variant="body2">
              If you uninstall this addon, GitOps will automatically re-create
              it from your Git repository. To permanently remove it, delete it
              from Git first.
            </Typography>
          </Alert>
        )}

        <Box mt={2}>
          <Alert severity="info">
            <Typography variant="body2">
              <strong>Recommended:</strong>{' '}
              {action === 'configure'
                ? 'Make changes in your Git repository instead for a proper audit trail.'
                : 'Remove the addon from your Git repository to permanently uninstall it.'}
            </Typography>
          </Alert>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={onProceed}
          color={action === 'uninstall' ? 'secondary' : 'primary'}
          variant="contained"
        >
          {actionLabel} Anyway
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Export to GitOps Dialog
// ---------------------------------------------------------------------------

function ExportToGitOpsDialog({
  open,
  addon,
  clusterName,
  clusterNamespace,
  repositories,
  gitConfigured,
  api,
  onSuccess,
  onClose,
}: {
  open: boolean;
  addon: AddonDefinition | null;
  clusterName: string;
  clusterNamespace: string;
  repositories: Repository[];
  gitConfigured: boolean;
  api: any;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const classes = useStyles();

  const defaultPath = addon
    ? addon.platform
      ? `clusters/${clusterName}/infrastructure/${addon.name}`
      : `clusters/${clusterName}/apps/${addon.name}`
    : '';

  const [repository, setRepository] = useState('');
  const [branch, setBranch] = useState('main');
  const [path, setPath] = useState(defaultPath);
  const [createPR, setCreatePR] = useState(true);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [preview, setPreview] = useState<Record<string, string> | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Reset state when dialog opens with new addon
  useEffect(() => {
    if (open && addon) {
      const newPath = addon.platform
        ? `clusters/${clusterName}/infrastructure/${addon.name}`
        : `clusters/${clusterName}/apps/${addon.name}`;
      setPath(newPath);
      setPreview(null);
      setCreatePR(true);
      if (repositories.length > 0 && !repository) {
        setRepository(repositories[0].fullName);
      }
    }
  }, [open, addon, clusterName, repositories, repository]);

  // Load branches when repository changes
  useEffect(() => {
    if (!repository || !open) {
      setBranches([]);
      return;
    }
    const loadBranches = async () => {
      setLoadingBranches(true);
      try {
        const [owner, repo] = repository.split('/');
        if (owner && repo) {
          const branchList = await api.listBranches(owner, repo);
          setBranches(branchList);
          const defaultBranch = repositories.find(
            r => r.fullName === repository,
          )?.defaultBranch;
          if (defaultBranch) {
            setBranch(defaultBranch);
          }
        }
      } catch {
        // Silent
      } finally {
        setLoadingBranches(false);
      }
    };
    loadBranches();
  }, [repository, repositories, api, open]);

  const handleTogglePreview = async () => {
    if (preview) {
      setPreview(null);
      return;
    }
    if (!repository || !addon) return;
    setLoadingPreview(true);
    try {
      const result = await api.previewManifests({
        addonName: addon.name,
        repository,
        targetPath: path,
      });
      setPreview(result);
    } catch {
      // Silent
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleExport = async () => {
    if (!addon || !repository) return;
    setExporting(true);
    try {
      await api.exportClusterAddon(clusterNamespace, clusterName, {
        addonName: addon.name,
        repository,
        branch,
        targetPath: path,
        createPR,
        prTitle: `Add ${addon.displayName} addon`,
      });
      onSuccess();
    } catch {
      // Silent
    } finally {
      setExporting(false);
    }
  };

  if (!addon) return null;

  if (!gitConfigured) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>Export to GitOps</DialogTitle>
        <DialogContent>
          <Alert severity="warning">
            <Typography variant="body2" style={{ fontWeight: 500 }}>
              Git Provider Not Configured
            </Typography>
            <Typography variant="body2">
              Please configure a Git provider (GitHub/GitLab) in the GitOps tab
              before exporting addons.
            </Typography>
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Export to GitOps - {addon.displayName}</DialogTitle>
      <DialogContent>
        {/* Addon info */}
        <div className={classes.addonInfoBox}>
          <div>
            <Typography variant="body2" style={{ fontWeight: 500 }}>
              {addon.displayName}
            </Typography>
            <Typography variant="caption" color="textSecondary">
              {addon.chartName}:{addon.defaultVersion}
            </Typography>
          </div>
          <Chip label="From Catalog" size="small" color="primary" variant="outlined" />
        </div>

        {/* Repository Selection */}
        <Box mt={2}>
          <TextField
            select
            label="Target Repository"
            value={repository}
            onChange={e => setRepository(e.target.value)}
            fullWidth
            variant="outlined"
            size="small"
          >
            <MenuItem value="">Select a repository...</MenuItem>
            {repositories.map(repo => (
              <MenuItem key={repo.fullName} value={repo.fullName}>
                {repo.fullName}
                {repo.private ? ' (private)' : ''}
              </MenuItem>
            ))}
          </TextField>
        </Box>

        {/* Branch and Path */}
        <Box mt={2} display="flex" style={{ gap: 16 }}>
          <TextField
            select
            label="Branch"
            value={branch}
            onChange={e => setBranch(e.target.value)}
            variant="outlined"
            size="small"
            style={{ flex: 1 }}
            disabled={loadingBranches || branches.length === 0}
            InputProps={{
              endAdornment: loadingBranches ? (
                <CircularProgress size={16} />
              ) : undefined,
            }}
          >
            {branches.length === 0 ? (
              <MenuItem value={branch}>{branch}</MenuItem>
            ) : (
              branches.map(b => (
                <MenuItem key={b.name} value={b.name}>
                  {b.name}
                </MenuItem>
              ))
            )}
          </TextField>
          <TextField
            label="Path"
            value={path}
            onChange={e => setPath(e.target.value)}
            variant="outlined"
            size="small"
            style={{ flex: 1 }}
            placeholder="clusters/my-cluster"
          />
        </Box>

        {/* Create PR */}
        <Box mt={1}>
          <FormControlLabel
            control={
              <Checkbox
                checked={createPR}
                onChange={e => setCreatePR(e.target.checked)}
                color="primary"
                size="small"
              />
            }
            label={
              <div>
                <Typography variant="body2">Create Pull Request</Typography>
                <Typography variant="caption" color="textSecondary">
                  Create a PR for review instead of committing directly
                </Typography>
              </div>
            }
          />
        </Box>

        {/* Preview Button */}
        {repository && (
          <Box mt={1}>
            <Button
              size="small"
              color="primary"
              startIcon={
                loadingPreview ? (
                  <CircularProgress size={14} />
                ) : preview ? (
                  <VisibilityOffIcon fontSize="small" />
                ) : (
                  <VisibilityIcon fontSize="small" />
                )
              }
              onClick={handleTogglePreview}
              disabled={loadingPreview}
            >
              {loadingPreview
                ? 'Loading preview...'
                : preview
                  ? 'Hide generated manifests'
                  : 'Preview generated manifests'}
            </Button>
          </Box>
        )}

        {/* Preview Content */}
        {preview && <ManifestPreview files={preview} />}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={exporting}>
          Cancel
        </Button>
        <Button
          onClick={handleExport}
          color="primary"
          variant="contained"
          disabled={exporting || !repository}
          startIcon={
            exporting ? (
              <CircularProgress size={16} color="inherit" />
            ) : undefined
          }
        >
          {exporting
            ? 'Exporting...'
            : createPR
              ? 'Create Pull Request'
              : 'Export'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Migrate to GitOps Dialog
// ---------------------------------------------------------------------------

function MigrateToGitOpsDialog({
  open,
  row,
  clusterName,
  clusterNamespace,
  repositories,
  gitConfigured,
  discoveredRelease,
  api,
  onSuccess,
  onClose,
}: {
  open: boolean;
  row: InstalledAddonRow | null;
  clusterName: string;
  clusterNamespace: string;
  repositories: Repository[];
  gitConfigured: boolean;
  discoveredRelease?: DiscoveredRelease;
  api: any;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const defaultPath = row
    ? `clusters/${clusterName}/apps/${row.name}`
    : '';

  const [repository, setRepository] = useState('');
  const [branch, setBranch] = useState('main');
  const [path, setPath] = useState(defaultPath);
  const [createPR, setCreatePR] = useState(true);
  const [helmRepoUrl, setHelmRepoUrl] = useState(
    discoveredRelease?.repoUrl || '',
  );
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [preview, setPreview] = useState<Record<string, string> | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [migrating, setMigrating] = useState(false);

  // Reset state when dialog opens
  useEffect(() => {
    if (open && row) {
      setPath(`clusters/${clusterName}/apps/${row.name}`);
      setHelmRepoUrl(discoveredRelease?.repoUrl || '');
      setPreview(null);
      setCreatePR(true);
      if (repositories.length > 0 && !repository) {
        setRepository(repositories[0].fullName);
      }
    }
  }, [open, row, clusterName, discoveredRelease, repositories, repository]);

  // Load branches when repository changes
  useEffect(() => {
    if (!repository || !open) {
      setBranches([]);
      return;
    }
    const loadBranches = async () => {
      setLoadingBranches(true);
      try {
        const [owner, repo] = repository.split('/');
        if (owner && repo) {
          const branchList = await api.listBranches(owner, repo);
          setBranches(branchList);
          const defaultBranch = repositories.find(
            r => r.fullName === repository,
          )?.defaultBranch;
          if (defaultBranch) {
            setBranch(defaultBranch);
          }
        }
      } catch {
        // Silent
      } finally {
        setLoadingBranches(false);
      }
    };
    loadBranches();
  }, [repository, repositories, api, open]);

  const handleTogglePreview = async () => {
    if (preview) {
      setPreview(null);
      return;
    }
    if (!repository || !row) return;
    setLoadingPreview(true);
    try {
      const result = await api.previewManifests({
        addonName: row.name,
        repository,
        targetPath: path,
      });
      setPreview(result);
    } catch {
      // Silent
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleMigrate = async () => {
    if (!row || !repository) return;
    setMigrating(true);
    try {
      const releaseName = discoveredRelease?.name || row.name.toLowerCase();
      const releaseNamespace =
        discoveredRelease?.namespace || `${row.name.toLowerCase()}-system`;

      await api.exportClusterRelease(clusterNamespace, clusterName, {
        releaseName,
        releaseNamespace,
        repository,
        branch,
        path,
        createPR,
        prTitle: `Migrate ${row.displayName} to GitOps`,
        helmRepoUrl: helmRepoUrl || undefined,
      });
      onSuccess();
    } catch {
      // Silent
    } finally {
      setMigrating(false);
    }
  };

  if (!row) return null;

  if (!gitConfigured) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>Migrate to GitOps</DialogTitle>
        <DialogContent>
          <Alert severity="warning">
            <Typography variant="body2" style={{ fontWeight: 500 }}>
              Git Provider Not Configured
            </Typography>
            <Typography variant="body2">
              Please configure a Git provider (GitHub/GitLab) in the GitOps tab
              before migrating addons.
            </Typography>
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Migrate to GitOps - {row.displayName}</DialogTitle>
      <DialogContent>
        {/* Warning */}
        <Alert severity="info">
          This will export the current configuration to Git and mark the addon
          as GitOps-managed. Future changes should be made through your Git
          repository.
        </Alert>

        {/* Repository Selection */}
        <Box mt={2}>
          <TextField
            select
            label="Target Repository"
            value={repository}
            onChange={e => setRepository(e.target.value)}
            fullWidth
            variant="outlined"
            size="small"
          >
            <MenuItem value="">Select a repository...</MenuItem>
            {repositories.map(repo => (
              <MenuItem key={repo.fullName} value={repo.fullName}>
                {repo.fullName}
                {repo.private ? ' (private)' : ''}
              </MenuItem>
            ))}
          </TextField>
        </Box>

        {/* Branch and Path */}
        <Box mt={2} display="flex" style={{ gap: 16 }}>
          <TextField
            select
            label="Branch"
            value={branch}
            onChange={e => setBranch(e.target.value)}
            variant="outlined"
            size="small"
            style={{ flex: 1 }}
            disabled={loadingBranches || branches.length === 0}
            InputProps={{
              endAdornment: loadingBranches ? (
                <CircularProgress size={16} />
              ) : undefined,
            }}
          >
            {branches.length === 0 ? (
              <MenuItem value={branch}>{branch}</MenuItem>
            ) : (
              branches.map(b => (
                <MenuItem key={b.name} value={b.name}>
                  {b.name}
                </MenuItem>
              ))
            )}
          </TextField>
          <TextField
            label="Path"
            value={path}
            onChange={e => setPath(e.target.value)}
            variant="outlined"
            size="small"
            style={{ flex: 1 }}
            placeholder="clusters/my-cluster"
          />
        </Box>

        {/* Helm Repo URL */}
        <Box mt={2}>
          <TextField
            label="Helm Repository URL (optional)"
            value={helmRepoUrl}
            onChange={e => setHelmRepoUrl(e.target.value)}
            fullWidth
            variant="outlined"
            size="small"
            placeholder="https://charts.example.com"
            helperText="Override the Helm repository URL if auto-detection fails"
          />
        </Box>

        {/* Create PR */}
        <Box mt={1}>
          <FormControlLabel
            control={
              <Checkbox
                checked={createPR}
                onChange={e => setCreatePR(e.target.checked)}
                color="primary"
                size="small"
              />
            }
            label={
              <div>
                <Typography variant="body2">Create Pull Request</Typography>
                <Typography variant="caption" color="textSecondary">
                  Create a PR for review instead of committing directly
                </Typography>
              </div>
            }
          />
        </Box>

        {/* Preview Button */}
        {repository && (
          <Box mt={1}>
            <Button
              size="small"
              color="primary"
              startIcon={
                loadingPreview ? (
                  <CircularProgress size={14} />
                ) : preview ? (
                  <VisibilityOffIcon fontSize="small" />
                ) : (
                  <VisibilityIcon fontSize="small" />
                )
              }
              onClick={handleTogglePreview}
              disabled={loadingPreview}
            >
              {loadingPreview
                ? 'Loading preview...'
                : preview
                  ? 'Hide generated manifests'
                  : 'Preview generated manifests'}
            </Button>
          </Box>
        )}

        {/* Preview Content */}
        {preview && <ManifestPreview files={preview} />}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={migrating}>
          Cancel
        </Button>
        <Button
          onClick={handleMigrate}
          color="primary"
          variant="contained"
          disabled={migrating || !repository}
          startIcon={
            migrating ? (
              <CircularProgress size={16} color="inherit" />
            ) : undefined
          }
        >
          {migrating
            ? 'Migrating...'
            : createPR
              ? 'Create Pull Request'
              : 'Migrate'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Manifest Preview Component
// ---------------------------------------------------------------------------

function ManifestPreview({ files }: { files: Record<string, string> }) {
  const classes = useStyles();
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const toggleFile = (filename: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(filename)) {
        next.delete(filename);
      } else {
        next.add(filename);
      }
      return next;
    });
  };

  return (
    <div className={classes.previewContainer}>
      <div className={classes.previewHeader}>
        <Typography variant="caption" color="textSecondary">
          Generated Files
        </Typography>
      </div>
      <div style={{ maxHeight: 300, overflow: 'auto' }}>
        {Object.entries(files).map(([filename, content]) => (
          <div key={filename}>
            <div
              className={classes.previewFileHeader}
              onClick={() => toggleFile(filename)}
            >
              {expandedFiles.has(filename) ? (
                <ExpandLessIcon fontSize="small" color="action" />
              ) : (
                <ExpandMoreIcon fontSize="small" color="action" />
              )}
              <Typography variant="body2">{filename}</Typography>
            </div>
            <Collapse in={expandedFiles.has(filename)}>
              <pre className={classes.previewContent}>{content}</pre>
            </Collapse>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Minimal YAML parser that handles simple key: value pairs and nested objects.
 * For production, a full YAML library should be used.
 */
function parseYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split('\n');
  const stack: { obj: Record<string, unknown>; indent: number }[] = [
    { obj: result, indent: -1 },
  ];

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const indent = line.search(/\S/);
    const match = line.trim().match(/^([^:]+):\s*(.*)$/);
    if (!match) continue;

    const [, key, value] = match;

    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].obj;

    if (value === '' || value === undefined) {
      const newObj: Record<string, unknown> = {};
      parent[key] = newObj;
      stack.push({ obj: newObj, indent });
    } else {
      let parsedValue: unknown = value;
      if (value === 'true') parsedValue = true;
      else if (value === 'false') parsedValue = false;
      else if (!isNaN(Number(value)) && value.trim() !== '')
        parsedValue = Number(value);
      else if (value.startsWith('"') && value.endsWith('"'))
        parsedValue = value.slice(1, -1);
      parent[key] = parsedValue;
    }
  }

  return result;
}
