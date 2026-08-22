// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { butlerApiRef } from '../../api/ButlerApi';
import type { ButlerApi } from '../../api/ButlerApi';
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
import { useTeamContext } from '../../hooks/useTeamContext';
import { butlerTokens, rgb, rgba } from '../../theme';
import {
  AlertTriangleIcon,
  ButlerButton,
  ButlerCallout,
  ButlerCard,
  ButlerCheckbox,
  ButlerChip,
  ButlerDialog,
  ButlerEmptyState,
  ButlerErrorState,
  ButlerField,
  ButlerFilePreview,
  ButlerFormRow,
  ButlerInput,
  ButlerMenu,
  ButlerMenuItem,
  ButlerPreviewToggle,
  ButlerSearchInput,
  ButlerSelect,
  ButlerSpinner,
  ButlerStack,
  ButlerStatusBadge,
  ButlerTextarea,
  ButlerToggleBar,
} from '../ui';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AddonsTabProps {
  clusterNamespace: string;
  clusterName: string;
}

export const ADDONS_PLATFORM_EMPTY_TEXT = 'No platform addons detected';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  return {
    loading: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 48,
      gap: 12,
      color: t.text.muted,
      fontFamily: t.fontSans,
    },
    // Console GitOps banner uses untokenized purple; violet tokens here.
    gitopsBanner: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: 16,
      borderRadius: t.radius.lg,
      border: `1px solid ${rgba(p.violet[500], 0.2)}`,
      backgroundColor: rgba(p.violet[500], 0.1),
      fontFamily: t.fontSans,
    },
    gitopsBannerIcon: { fontSize: 20, lineHeight: '28px' },
    gitopsBannerTitle: {
      margin: 0,
      fontSize: 16,
      lineHeight: '24px',
      fontWeight: 500,
      color: rgb(p.violet[300]),
    },
    gitopsBannerText: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: rgba(p.violet[400], 0.7),
    },
    sectionHead: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 16,
    },
    sectionTitle: {
      margin: 0,
      fontSize: 18,
      lineHeight: '28px',
      fontWeight: 500,
      color: t.text.primary,
    },
    sectionDesc: {
      margin: '0 0 16px',
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.subtle,
    },
    countChip: {
      padding: '2px 8px',
      borderRadius: t.radius.sm,
      fontSize: 12,
      lineHeight: '16px',
    },
    chipBlue: {
      backgroundColor: rgba(p.blue[500], 0.1),
      color: rgb(p.blue[400]),
    },
    chipGreen: {
      backgroundColor: rgba(p.green[500], 0.1),
      color: rgb(p.green[400]),
    },
    chipViolet: {
      backgroundColor: rgba(p.violet[500], 0.1),
      color: rgb(p.violet[400]),
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: '1fr',
      gap: 16,
      '@media (min-width: 768px)': {
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      },
      '@media (min-width: 1024px)': {
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      },
    },
    toolbar: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      marginBottom: 24,
      '@media (min-width: 640px)': { flexDirection: 'row' },
    },
    categoryGroup: {},
    categoryHead: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    categoryIcon: { fontSize: 20, lineHeight: '28px' },
    categoryTitle: {
      margin: 0,
      fontSize: 16,
      lineHeight: '24px',
      fontWeight: 500,
      color: rgb(p.neutral[200]),
    },
    // Addon cards
    card: {
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      transition: 'border-color 150ms',
      '&:hover': { borderColor: rgb(p.neutral[600]) },
    },
    cardInstalled: { borderColor: rgba(p.green[500], 0.2) },
    cardGitOps: { borderColor: rgba(p.violet[500], 0.3) },
    cardTop: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    cardTopSpaced: { marginBottom: 12 },
    identity: { display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 },
    iconTile: {
      width: 48,
      height: 48,
      borderRadius: t.radius.lg,
      backgroundColor: rgb(p.neutral[800]),
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      fontSize: 20,
    },
    nameRow: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
    name: {
      margin: 0,
      fontSize: 16,
      lineHeight: '24px',
      fontWeight: 500,
      color: t.text.strong,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    // Console TierPill is untokenized indigo; violet tokens here.
    tierPill: {
      flexShrink: 0,
      padding: '2px 8px',
      borderRadius: t.radius.sm,
      fontSize: 12,
      lineHeight: '16px',
      fontWeight: 500,
      backgroundColor: rgba(p.violet[500], 0.1),
      color: rgb(p.violet[400]),
      border: `1px solid ${rgba(p.violet[500], 0.2)}`,
    },
    version: {
      margin: 0,
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.subtle,
    },
    badges: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
    gitopsPill: {
      padding: '4px 8px',
      borderRadius: t.radius.pill,
      fontSize: 12,
      lineHeight: '16px',
      backgroundColor: rgba(p.violet[500], 0.1),
      color: rgb(p.violet[400]),
      border: `1px solid ${rgba(p.violet[500], 0.3)}`,
    },
    description: {
      margin: '0 0 16px',
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.muted,
      display: '-webkit-box',
      WebkitLineClamp: 2,
      WebkitBoxOrient: 'vertical',
      overflow: 'hidden',
    },
    requires: {
      marginBottom: 12,
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.muted,
    },
    requiresLabel: { color: t.text.subtle },
    links: { display: 'flex', gap: 12, marginBottom: 16, fontSize: 12 },
    link: {
      color: t.text.subtle,
      textDecoration: 'none',
      '&:hover': { color: rgb(p.neutral[300]) },
    },
    cardFooter: { marginTop: 'auto' },
    manage: {
      width: '100%',
      justifyContent: 'space-between',
    },
    split: { display: 'flex', width: '100%' },
    splitMain: {
      flex: 1,
      borderTopRightRadius: 0,
      borderBottomRightRadius: 0,
    },
    splitToggle: {
      borderTopLeftRadius: 0,
      borderBottomLeftRadius: 0,
      borderLeft: `1px solid ${rgb(p.green[600])}`,
      padding: '6px 8px',
    },
    chevron: { flexShrink: 0 },
    // Dialog pieces
    dialogText: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.muted,
    },
    dialogCenter: { margin: 0, color: t.text.muted, textAlign: 'center' },
    strong: { color: rgb(p.neutral[200]), fontWeight: 500 },
    infoBox: {
      padding: 12,
      borderRadius: t.radius.lg,
      backgroundColor: t.inset,
      border: `1px solid ${rgb(p.neutral[700])}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    infoName: { margin: 0, fontWeight: 500, color: rgb(p.neutral[200]) },
    infoMeta: { margin: 0, fontSize: 14, color: t.text.subtle },
    mono: { fontFamily: t.fontMono },
    inlineError: {
      margin: 0,
      padding: 12,
      borderRadius: t.radius.lg,
      border: `1px solid ${rgba(p.red[500], 0.2)}`,
      backgroundColor: rgba(p.red[500], 0.1),
      fontSize: 14,
      color: rgb(p.red[400]),
    },
    emoji: { fontSize: 20 },
  };
});

const ChevronDown = ({ className }: { className?: string }) => (
  <svg
    width={16}
    height={16}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    className={className}
    aria-hidden
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
);

// ---------------------------------------------------------------------------
// Installed addon row type
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
  const { isAdmin } = useTeamContext();

  // Console AddonsTab gates every install/manage action on canMutate
  // (platform admin, not viewer); team admins see a read-only catalog.
  const canMutate = isAdmin;

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
  const [configureAddon, setConfigureAddon] =
    useState<InstalledAddonRow | null>(null);
  const [configureValues, setConfigureValues] = useState('');
  const [configuring, setConfiguring] = useState(false);

  // Uninstall dialog state
  const [uninstallOpen, setUninstallOpen] = useState(false);
  const [uninstallTarget, setUninstallTarget] =
    useState<InstalledAddonRow | null>(null);
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
      a => a.name.toLowerCase() === 'flux' || a.name.toLowerCase() === 'argocd',
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

  const installedRows: InstalledAddonRow[] = useMemo(() => {
    return installedAddons.map(addon => {
      const catalogEntry = catalog.find(
        c => c.name.toLowerCase() === addon.name.toLowerCase(),
      );
      const isPlatform = platformAddonNames.has(addon.name.toLowerCase());
      return {
        id: addon.name,
        name: addon.name,
        displayName:
          addon.displayName || catalogEntry?.displayName || addon.name,
        version: addon.installedVersion || addon.version || 'Unknown version',
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

  const platformRows = useMemo(
    () => installedRows.filter(r => r.isPlatform),
    [installedRows],
  );
  const installedOptionalRows = useMemo(
    () => installedRows.filter(r => !r.isPlatform),
    [installedRows],
  );

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
  const openConfigureDialog = (row: InstalledAddonRow) => {
    setConfigureAddon(row);
    setConfigureValues('');
    setConfigureOpen(true);
  };

  const handleOpenConfigure = (row: InstalledAddonRow) => {
    if (row.isGitOpsManaged) {
      setGitopsWarningTarget(row);
      setGitopsWarningAction('configure');
      setGitopsWarningOpen(true);
      return;
    }
    openConfigureDialog(row);
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
        {
          values,
        },
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

  const handleOpenMigrate = (row: InstalledAddonRow) => {
    setMigrateAddon(row);
    setMigrateOpen(true);
  };

  const handleOpenExport = (addon: AddonDefinition) => {
    setExportAddon(addon);
    setExportOpen(true);
  };

  // --------------------------------------------------------------------------
  // Render: loading/error
  // --------------------------------------------------------------------------

  if (loading) {
    return (
      <div className={classes.loading} role="progressbar" aria-busy>
        <ButlerSpinner />
        <span>Loading addon catalog...</span>
      </div>
    );
  }

  if (error) {
    return (
      <ButlerErrorState
        message="Failed to load addon catalog"
        detail={error.message}
        onRetry={fetchData}
      />
    );
  }

  const categoryOptions = [
    { value: 'all', label: 'All' },
    ...optionalCategories.map(cat => ({
      value: cat.name as string,
      label: `${cat.icon} ${cat.displayName}`,
    })),
  ];

  return (
    <ButlerStack gap={32}>
      {gitopsEnabled && (
        <div className={classes.gitopsBanner} role="status">
          <span className={classes.gitopsBannerIcon} aria-hidden>
            {'\u{1F504}'}
          </span>
          <div>
            <p className={classes.gitopsBannerTitle}>GitOps Enabled</p>
            <p className={classes.gitopsBannerText}>
              Addons can be exported to Git via the GitOps tab or the Manage
              menu on each addon.
            </p>
          </div>
        </div>
      )}

      {/* Platform Addons */}
      <section>
        <div className={classes.sectionHead}>
          <h3 className={classes.sectionTitle}>Platform Addons</h3>
          <span className={clsx(classes.countChip, classes.chipBlue)}>
            Core
          </span>
        </div>
        <p className={classes.sectionDesc}>
          Essential components installed during cluster bootstrap. These cannot
          be removed via the UI.
        </p>
        {platformRows.length === 0 ? (
          <ButlerEmptyState title={ADDONS_PLATFORM_EMPTY_TEXT} />
        ) : (
          <div className={classes.grid}>
            {platformRows.map(row => (
              <PlatformAddonCard key={row.id} row={row} />
            ))}
          </div>
        )}
      </section>

      {/* Installed optional addons */}
      {installedOptionalRows.length > 0 && (
        <section>
          <div className={classes.sectionHead}>
            <h3 className={classes.sectionTitle}>Installed Addons</h3>
            <span className={clsx(classes.countChip, classes.chipGreen)}>
              {installedOptionalRows.length} Active
            </span>
          </div>
          <p className={classes.sectionDesc}>
            Optional addons currently running on this cluster.
          </p>
          <div className={classes.grid}>
            {installedOptionalRows.map(row => (
              <InstalledAddonCard
                key={row.id}
                row={row}
                gitopsEnabled={gitopsEnabled}
                canMutate={canMutate}
                onConfigure={() => handleOpenConfigure(row)}
                onUninstall={() => handleOpenUninstall(row)}
                onMigrateToGitOps={() => handleOpenMigrate(row)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Available Addons */}
      <section>
        <div className={classes.sectionHead}>
          <h3 className={classes.sectionTitle}>Available Addons</h3>
          <span className={clsx(classes.countChip, classes.chipViolet)}>
            {availableCatalog.length} Available
          </span>
        </div>
        <p className={classes.sectionDesc}>
          Additional functionality you can enable for this cluster.
        </p>

        <div className={classes.toolbar}>
          <ButlerSearchInput
            placeholder="Search addons..."
            aria-label="Search addons"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <ButlerToggleBar
            aria-label="Filter by category"
            options={categoryOptions}
            value={selectedCategory}
            onChange={setSelectedCategory}
          />
        </div>

        {availableCatalog.length === 0 ? (
          <ButlerEmptyState
            title={
              searchQuery || selectedCategory !== 'all'
                ? 'No addons match your search'
                : 'All available addons are installed'
            }
          />
        ) : (
          <ButlerStack gap={32}>
            {optionalCategories.map(category => {
              const categoryAddons =
                groupedAvailableCatalog[category.name] || [];
              if (categoryAddons.length === 0) return null;
              return (
                <div key={category.name} className={classes.categoryGroup}>
                  <div className={classes.categoryHead}>
                    <span className={classes.categoryIcon} aria-hidden>
                      {category.icon}
                    </span>
                    <h4 className={classes.categoryTitle}>
                      {category.displayName}
                    </h4>
                  </div>
                  <p className={classes.sectionDesc}>{category.description}</p>
                  <div className={classes.grid}>
                    {categoryAddons.map(addon => (
                      <AvailableAddonCard
                        key={addon.name}
                        addon={addon}
                        installing={quickInstallingAddon === addon.name}
                        gitopsEnabled={gitopsEnabled}
                        canMutate={canMutate}
                        onQuickInstall={() => handleQuickInstall(addon)}
                        onConfigureInstall={() => handleOpenInstall(addon)}
                        onGitOpsExport={() => handleOpenExport(addon)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </ButlerStack>
        )}
      </section>

      {/* Dialogs */}
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
    </ButlerStack>
  );
};

// ---------------------------------------------------------------------------
// Cards (console PlatformAddonCard / InstalledAddonCard / AvailableAddonCard)
// ---------------------------------------------------------------------------

function AddonIdentity({
  name,
  icon,
  tier,
  version,
}: {
  name: string;
  icon?: string;
  tier: boolean;
  version: string;
}) {
  const classes = useStyles();
  return (
    <div className={classes.identity}>
      <div className={classes.iconTile} aria-hidden>
        {icon || '\u{1F4E6}'}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className={classes.nameRow}>
          <h4 className={classes.name}>{name}</h4>
          {tier && (
            <span className={classes.tierPill} title="Infrastructure tier">
              Infra
            </span>
          )}
        </div>
        <p className={classes.version}>{version}</p>
      </div>
    </div>
  );
}

function PlatformAddonCard({ row }: { row: InstalledAddonRow }) {
  const classes = useStyles();
  return (
    <ButlerCard flush className={classes.card}>
      <div className={classes.cardTop}>
        <AddonIdentity
          name={row.displayName}
          icon={row.catalogInfo?.icon}
          tier
          version={row.version}
        />
        <ButlerStatusBadge status={row.status} />
      </div>
    </ButlerCard>
  );
}

function InstalledAddonCard({
  row,
  gitopsEnabled,
  canMutate,
  onConfigure,
  onUninstall,
  onMigrateToGitOps,
}: {
  row: InstalledAddonRow;
  gitopsEnabled: boolean;
  canMutate: boolean;
  onConfigure: () => void;
  onUninstall: () => void;
  onMigrateToGitOps: () => void;
}) {
  const classes = useStyles();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = () => setAnchor(null);

  return (
    <ButlerCard
      flush
      className={clsx(
        classes.card,
        row.isGitOpsManaged ? classes.cardGitOps : classes.cardInstalled,
      )}
    >
      <div className={clsx(classes.cardTop, classes.cardTopSpaced)}>
        <AddonIdentity
          name={row.displayName}
          icon={row.catalogInfo?.icon}
          tier={!!row.catalogInfo?.platform}
          version={row.version}
        />
        <div className={classes.badges}>
          <ButlerStatusBadge status={row.status} />
          {row.isGitOpsManaged && (
            <span className={classes.gitopsPill}>GitOps</span>
          )}
        </div>
      </div>

      {row.catalogInfo?.description && (
        <p className={classes.description}>{row.catalogInfo.description}</p>
      )}

      {canMutate && (
        <div className={classes.cardFooter}>
          <ButlerButton
            variant="secondary"
            size="sm"
            className={classes.manage}
            onClick={e => setAnchor(e.currentTarget)}
            aria-haspopup="menu"
            aria-expanded={Boolean(anchor)}
          >
            Manage
            <ChevronDown className={classes.chevron} />
          </ButlerButton>
          <ButlerMenu
            anchorEl={anchor}
            open={Boolean(anchor)}
            onClose={close}
            fullWidth
            align="left"
          >
            <ButlerMenuItem
              icon={<span className={classes.emoji}>{'⚙️'}</span>}
              label="Configure"
              description={
                row.isGitOpsManaged
                  ? 'Update values (GitOps warning)'
                  : 'Update Helm values'
              }
              warning={row.isGitOpsManaged}
              onClick={() => {
                close();
                onConfigure();
              }}
            />
            {gitopsEnabled && !row.isGitOpsManaged && (
              <ButlerMenuItem
                icon={<span className={classes.emoji}>{'\u{1F504}'}</span>}
                label="Migrate to GitOps"
                description="Hand off management to Flux/ArgoCD"
                onClick={() => {
                  close();
                  onMigrateToGitOps();
                }}
              />
            )}
            <ButlerMenuItem
              icon={<span className={classes.emoji}>{'\u{1F5D1}️'}</span>}
              label="Uninstall"
              description={
                row.isGitOpsManaged
                  ? 'Remove addon (GitOps warning)'
                  : 'Remove this addon'
              }
              destructive
              warning={row.isGitOpsManaged}
              onClick={() => {
                close();
                onUninstall();
              }}
            />
          </ButlerMenu>
        </div>
      )}
    </ButlerCard>
  );
}

function AvailableAddonCard({
  addon,
  installing,
  gitopsEnabled,
  canMutate,
  onQuickInstall,
  onConfigureInstall,
  onGitOpsExport,
}: {
  addon: AddonDefinition;
  installing: boolean;
  gitopsEnabled: boolean;
  canMutate: boolean;
  onQuickInstall: () => void;
  onConfigureInstall: () => void;
  onGitOpsExport: () => void;
}) {
  const classes = useStyles();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = () => setAnchor(null);

  return (
    <ButlerCard flush className={classes.card}>
      <div className={clsx(classes.cardTop, classes.cardTopSpaced)}>
        <AddonIdentity
          name={addon.displayName}
          icon={addon.icon}
          tier={addon.platform}
          version={addon.defaultVersion}
        />
      </div>

      <p className={classes.description}>{addon.description}</p>

      {addon.dependsOn && addon.dependsOn.length > 0 && (
        <div className={classes.requires}>
          <span className={classes.requiresLabel}>Requires: </span>
          {addon.dependsOn.join(', ')}
        </div>
      )}

      {addon.links && (addon.links.documentation || addon.links.homepage) && (
        <div className={classes.links}>
          {addon.links.documentation && (
            <a
              href={addon.links.documentation}
              target="_blank"
              rel="noopener noreferrer"
              className={classes.link}
            >
              Docs &#8599;
            </a>
          )}
          {addon.links.homepage && (
            <a
              href={addon.links.homepage}
              target="_blank"
              rel="noopener noreferrer"
              className={classes.link}
            >
              Homepage &#8599;
            </a>
          )}
        </div>
      )}

      {canMutate && (
        <div className={classes.cardFooter}>
          <div className={classes.split}>
            <ButlerButton
              size="sm"
              className={classes.splitMain}
              onClick={onQuickInstall}
              disabled={installing}
            >
              {installing ? (
                <>
                  <ButlerSpinner small />
                  Installing...
                </>
              ) : (
                'Install'
              )}
            </ButlerButton>
            <ButlerButton
              size="sm"
              className={classes.splitToggle}
              onClick={e => setAnchor(e.currentTarget.parentElement)}
              disabled={installing}
              aria-label="Install options"
              aria-haspopup="menu"
              aria-expanded={Boolean(anchor)}
            >
              <ChevronDown />
            </ButlerButton>
          </div>
          <ButlerMenu
            anchorEl={anchor}
            open={Boolean(anchor)}
            onClose={close}
            fullWidth
            align="left"
          >
            <ButlerMenuItem
              icon={<span className={classes.emoji}>{'⚡'}</span>}
              label="Quick Install"
              description="Install with default settings"
              onClick={() => {
                close();
                onQuickInstall();
              }}
            />
            <ButlerMenuItem
              icon={<span className={classes.emoji}>{'⚙️'}</span>}
              label="Configure & Install"
              description="Customize Helm values before installing"
              onClick={() => {
                close();
                onConfigureInstall();
              }}
            />
            {gitopsEnabled && (
              <ButlerMenuItem
                icon={<span className={classes.emoji}>{'\u{1F4E6}'}</span>}
                label="Export to GitOps"
                description="Generate manifests for Flux/ArgoCD"
                onClick={() => {
                  close();
                  onGitOpsExport();
                }}
              />
            )}
          </ButlerMenu>
        </div>
      )}
    </ButlerCard>
  );
}

// ---------------------------------------------------------------------------
// Shared dialog fields
// ---------------------------------------------------------------------------

function RepositorySelect({
  value,
  onChange,
  repositories,
}: {
  value: string;
  onChange: (v: string) => void;
  repositories: Repository[];
}) {
  return (
    <ButlerSelect
      label="Target Repository"
      value={value}
      onChange={e => onChange(e.target.value)}
    >
      <option value="">Select a repository...</option>
      {repositories.map(repo => (
        <option key={repo.fullName} value={repo.fullName}>
          {repo.fullName}
          {repo.private ? ' (private)' : ''}
        </option>
      ))}
    </ButlerSelect>
  );
}

function BranchSelect({
  value,
  onChange,
  branches,
  loading,
  createPR,
}: {
  value: string;
  onChange: (v: string) => void;
  branches: Branch[];
  loading: boolean;
  createPR: boolean;
}) {
  return (
    <ButlerSelect
      label={createPR ? 'Target Branch' : 'Branch'}
      help={createPR ? 'PR will be opened against this branch' : undefined}
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={loading || branches.length === 0}
      loading={loading}
    >
      {branches.length === 0 ? (
        <option value={value}>{value}</option>
      ) : (
        branches.map(b => (
          <option key={b.name} value={b.name}>
            {b.name}
          </option>
        ))
      )}
    </ButlerSelect>
  );
}

function NotConfiguredDialog({
  open,
  title,
  subtitle,
  icon,
  verb,
  onClose,
}: {
  open: boolean;
  title: string;
  subtitle: string;
  icon: ReactNode;
  verb: string;
  onClose: () => void;
}) {
  return (
    <ButlerDialog
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      icon={icon}
      footer={
        <ButlerButton variant="secondary" onClick={onClose}>
          Close
        </ButlerButton>
      }
    >
      <ButlerCallout tone="warning" title="Git Provider Not Configured">
        <p>
          Please configure a Git provider (GitHub/GitLab) in the GitOps tab
          before {verb} addons.
        </p>
      </ButlerCallout>
    </ButlerDialog>
  );
}

// ---------------------------------------------------------------------------
// Install (Configure & Install) dialog
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
  const classes = useStyles();
  if (!addon) return null;

  const versions = addon.availableVersions?.length
    ? addon.availableVersions
    : [addon.defaultVersion];

  return (
    <ButlerDialog
      open={open}
      onClose={onClose}
      busy={installing}
      width={512}
      title={`Configure ${addon.displayName}`}
      subtitle={`Version ${addon.defaultVersion}`}
      icon={<span className={classes.emoji}>{addon.icon || '\u{1F4E6}'}</span>}
      footer={
        <>
          <ButlerButton
            variant="secondary"
            onClick={onClose}
            disabled={installing}
          >
            Cancel
          </ButlerButton>
          <ButlerButton onClick={onInstall} disabled={installing || !version}>
            {installing ? (
              <>
                <ButlerSpinner small />
                Installing...
              </>
            ) : (
              'Install'
            )}
          </ButlerButton>
        </>
      }
    >
      <p className={classes.dialogText}>{addon.description}</p>
      <ButlerSelect
        label="Version"
        value={version}
        onChange={e => onVersionChange(e.target.value)}
        help={
          <>
            Chart:{' '}
            <span className={classes.mono}>
              {addon.chartRepository}/{addon.chartName}
            </span>
          </>
        }
      >
        {versions.map(v => (
          <option key={v} value={v}>
            {v}
            {v === addon.defaultVersion ? ' (default)' : ''}
          </option>
        ))}
      </ButlerSelect>
      <ButlerTextarea
        label="Helm Values (YAML)"
        mono
        rows={8}
        value={values}
        onChange={e => onValuesChange(e.target.value)}
        placeholder="# Optional: custom Helm values in YAML format"
        help="Leave empty to install with default values."
      />
    </ButlerDialog>
  );
}

// ---------------------------------------------------------------------------
// Configure (edit values) dialog
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
    <ButlerDialog
      open={open}
      onClose={onClose}
      busy={configuring}
      width={512}
      title={`Edit ${row.displayName} Values`}
      subtitle="Modify Helm values for this addon"
      icon={<span className={classes.emoji}>{'⚙️'}</span>}
      footer={
        <>
          <ButlerButton
            variant="secondary"
            onClick={onClose}
            disabled={configuring}
          >
            Cancel
          </ButlerButton>
          <ButlerButton onClick={onConfigure} disabled={configuring}>
            {configuring ? (
              <>
                <ButlerSpinner small />
                Saving...
              </>
            ) : (
              'Save Values'
            )}
          </ButlerButton>
        </>
      }
    >
      <div className={classes.infoBox}>
        <div>
          <p className={classes.infoName}>{row.displayName}</p>
          {row.catalogInfo && (
            <p className={classes.infoMeta}>
              {row.catalogInfo.chartName}:{row.version}
            </p>
          )}
        </div>
        <ButlerStatusBadge status={row.status} />
      </div>

      {row.isGitOpsManaged && (
        <ButlerCallout tone="warning" title="Changes may be overwritten">
          <p>
            This addon is managed by GitOps. Any configuration changes made here
            may be overwritten the next time GitOps reconciles from your Git
            repository.
          </p>
        </ButlerCallout>
      )}

      <p className={classes.dialogText}>
        Edit the Helm values in YAML format. Only include values you want to
        override from defaults.
      </p>
      <ButlerTextarea
        aria-label="Helm values override (YAML)"
        mono
        rows={10}
        value={values}
        onChange={e => onValuesChange(e.target.value)}
        placeholder={
          '# Enter Helm values in YAML format\n# Example:\n# replicas: 3\n# resources:\n#   limits:\n#     memory: 512Mi'
        }
      />
    </ButlerDialog>
  );
}

// ---------------------------------------------------------------------------
// Uninstall confirmation (the console uninstalls without a prompt; the
// portal keeps a destructive confirmation in the console's delete recipe)
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
  const classes = useStyles();
  if (!row) return null;

  return (
    <ButlerDialog
      open={open}
      onClose={onClose}
      busy={uninstalling}
      title="Uninstall Addon"
      subtitle="This action cannot be undone"
      icon={<AlertTriangleIcon />}
      iconTone="danger"
      footer={
        <>
          <ButlerButton
            variant="secondary"
            onClick={onClose}
            disabled={uninstalling}
          >
            Cancel
          </ButlerButton>
          <ButlerButton
            variant="danger"
            onClick={onUninstall}
            disabled={uninstalling}
          >
            {uninstalling ? 'Uninstalling...' : 'Uninstall'}
          </ButlerButton>
        </>
      }
    >
      <ButlerCallout tone="danger" compact>
        <p>
          You are about to uninstall{' '}
          <span className={classes.strong}>{row.displayName}</span> from this
          cluster. The addon and all its associated resources will be removed
          from the tenant cluster.
        </p>
      </ButlerCallout>
      {row.isGitOpsManaged && (
        <ButlerCallout tone="warning" title="Addon will be re-created">
          <p>
            This addon is managed by GitOps. If you uninstall it here, GitOps
            will automatically re-create it from your Git repository. To
            permanently remove it, delete the addon from your Git repository
            first.
          </p>
        </ButlerCallout>
      )}
    </ButlerDialog>
  );
}

// ---------------------------------------------------------------------------
// GitOps warning dialog (console GitOpsEditWarningModal)
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
  const classes = useStyles();
  if (!row) return null;

  const actionLabel = action === 'configure' ? 'Configure' : 'Uninstall';

  return (
    <ButlerDialog
      open={open}
      onClose={onClose}
      title="GitOps-Managed Addon"
      subtitle={`${row.displayName} is managed by GitOps`}
      icon={<AlertTriangleIcon />}
      iconTone={action === 'uninstall' ? 'danger' : 'neutral'}
      footer={
        <>
          <ButlerButton variant="secondary" onClick={onClose}>
            Cancel
          </ButlerButton>
          <ButlerButton
            variant={action === 'uninstall' ? 'danger' : 'primary'}
            onClick={onProceed}
          >
            {actionLabel} Anyway
          </ButlerButton>
        </>
      }
    >
      {action === 'configure' ? (
        <ButlerCallout tone="warning" title="Changes may be overwritten">
          <p>
            Any configuration changes made here will be overwritten the next
            time GitOps reconciles from your Git repository.
          </p>
        </ButlerCallout>
      ) : (
        <ButlerCallout tone="warning" title="Addon will be re-created">
          <p>
            If you uninstall this addon, GitOps will automatically re-create it
            from your Git repository. To permanently remove it, delete it from
            Git first.
          </p>
        </ButlerCallout>
      )}
      <ButlerCallout tone="neutral" compact>
        <p>
          <span className={classes.strong}>Recommended:</span>{' '}
          {action === 'configure'
            ? 'Make changes in your Git repository instead for a proper audit trail.'
            : 'Remove the addon from your Git repository to permanently uninstall it.'}
        </p>
      </ButlerCallout>
    </ButlerDialog>
  );
}

// ---------------------------------------------------------------------------
// Export to GitOps dialog (from catalog)
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
  api: ButlerApi;
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

  const icon = <span className={classes.emoji}>{'\u{1F4E6}'}</span>;

  if (!gitConfigured) {
    return (
      <NotConfiguredDialog
        open={open}
        title="Export to GitOps"
        subtitle={addon.displayName}
        icon={icon}
        verb="exporting"
        onClose={onClose}
      />
    );
  }

  return (
    <ButlerDialog
      open={open}
      onClose={onClose}
      busy={exporting}
      width={512}
      title="Export to GitOps"
      subtitle={addon.displayName}
      icon={icon}
      footer={
        <>
          <ButlerButton
            variant="secondary"
            onClick={onClose}
            disabled={exporting}
          >
            Cancel
          </ButlerButton>
          <ButlerButton
            onClick={handleExport}
            disabled={exporting || !repository}
          >
            {exporting ? (
              <>
                <ButlerSpinner small />
                Exporting...
              </>
            ) : createPR ? (
              'Create Pull Request'
            ) : (
              'Export'
            )}
          </ButlerButton>
        </>
      }
    >
      <div className={classes.infoBox}>
        <div>
          <p className={classes.infoName}>{addon.displayName}</p>
          <p className={classes.infoMeta}>
            {addon.chartName}:{addon.defaultVersion}
          </p>
        </div>
        <ButlerChip tone="blue">From Catalog</ButlerChip>
      </div>

      <RepositorySelect
        value={repository}
        onChange={setRepository}
        repositories={repositories}
      />

      <ButlerFormRow>
        <BranchSelect
          value={branch}
          onChange={setBranch}
          branches={branches}
          loading={loadingBranches}
          createPR={createPR}
        />
        <ButlerInput
          label="Path"
          value={path}
          onChange={e => setPath(e.target.value)}
          placeholder="clusters/my-cluster"
        />
      </ButlerFormRow>

      <ButlerCheckbox
        checked={createPR}
        onChange={e => setCreatePR(e.target.checked)}
        label="Create Pull Request"
        description="Create a PR for review instead of committing directly"
      />

      {repository && (
        <ButlerPreviewToggle
          open={!!preview}
          loading={loadingPreview}
          onToggle={handleTogglePreview}
        />
      )}

      {preview && <ButlerFilePreview files={preview} />}
    </ButlerDialog>
  );
}

// ---------------------------------------------------------------------------
// Migrate to GitOps dialog (from installed)
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
  api: ButlerApi;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const classes = useStyles();
  const defaultPath = row ? `clusters/${clusterName}/apps/${row.name}` : '';

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

  const icon = <span className={classes.emoji}>{'\u{1F504}'}</span>;

  if (!gitConfigured) {
    return (
      <NotConfiguredDialog
        open={open}
        title="Migrate to GitOps"
        subtitle={row.displayName}
        icon={icon}
        verb="migrating"
        onClose={onClose}
      />
    );
  }

  return (
    <ButlerDialog
      open={open}
      onClose={onClose}
      busy={migrating}
      width={512}
      title="Migrate to GitOps"
      subtitle={row.displayName}
      icon={icon}
      footer={
        <>
          <ButlerButton
            variant="secondary"
            onClick={onClose}
            disabled={migrating}
          >
            Cancel
          </ButlerButton>
          <ButlerButton
            onClick={handleMigrate}
            disabled={migrating || !repository}
          >
            {migrating ? (
              <>
                <ButlerSpinner small />
                Exporting...
              </>
            ) : createPR ? (
              'Create Pull Request'
            ) : (
              'Export'
            )}
          </ButlerButton>
        </>
      }
    >
      <ButlerCallout tone="warning" compact>
        <p>
          This will export the current configuration to Git and mark the addon
          as GitOps-managed. Future changes should be made through your Git
          repository.
        </p>
      </ButlerCallout>

      <RepositorySelect
        value={repository}
        onChange={setRepository}
        repositories={repositories}
      />

      <ButlerFormRow>
        <BranchSelect
          value={branch}
          onChange={setBranch}
          branches={branches}
          loading={loadingBranches}
          createPR={createPR}
        />
        <ButlerInput
          label="Path"
          value={path}
          onChange={e => setPath(e.target.value)}
          placeholder="clusters/my-cluster"
        />
      </ButlerFormRow>

      <ButlerField
        label="Helm Repository URL"
        optional
        help="Override the Helm repository URL if auto-detection fails"
      >
        <ButlerInput
          type="url"
          value={helmRepoUrl}
          onChange={e => setHelmRepoUrl(e.target.value)}
          placeholder="https://charts.example.com"
        />
      </ButlerField>

      <ButlerCheckbox
        checked={createPR}
        onChange={e => setCreatePR(e.target.checked)}
        label="Create Pull Request"
        description="Create a PR for review instead of committing directly"
      />

      {repository && (
        <ButlerPreviewToggle
          open={!!preview}
          loading={loadingPreview}
          onToggle={handleTogglePreview}
        />
      )}

      {preview && <ButlerFilePreview files={preview} />}
    </ButlerDialog>
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
