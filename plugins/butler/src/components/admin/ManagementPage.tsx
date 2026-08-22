// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApi, discoveryApiRef } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { butlerApiRef } from '../../api/ButlerApi';
import { buildButlerWsUrl } from '../../api/wsUrl';
import type {
  ManagementCluster,
  ManagementNode,
  ManagementPod,
} from '../../api/types/clusters';
import type { AddonDefinition, ManagementAddon } from '../../api/types/addons';
import { CATEGORY_INFO } from '../../api/types/addons';
import type {
  DiscoveredRelease,
  DiscoveryResult,
  GitOpsStatus,
  GitProviderConfig,
  Repository,
} from '../../api/types/gitops';
import { getCategoryLabel, sortReleases } from '../../api/types/gitops';
import { useButlerRoutes } from '../../hooks/useButlerRoutes';
import { useTeamContext } from '../../hooks/useTeamContext';
import { butlerTokens, rgb, rgba } from '../../theme';
import {
  ButlerAccessDenied,
  ButlerBanner,
  ButlerButton,
  ButlerCard,
  ButlerCheckbox,
  ButlerChip,
  ButlerDialog,
  ButlerEmptyState,
  ButlerErrorState,
  ButlerFilePreview,
  ButlerInput,
  ButlerKeyValueList,
  ButlerKeyValueRow,
  ButlerLinkButton,
  ButlerLoading,
  ButlerPageHeader,
  ButlerPreviewToggle,
  ButlerSearchInput,
  ButlerSelect,
  ButlerSpinner,
  ButlerStack,
  ButlerStatGrid,
  ButlerStatTile,
  ButlerStatusBadge,
  ButlerTable,
  ButlerTabPanel,
  ButlerTabs,
  ButlerToggleBar,
  PlusIcon,
  ServerIcon,
} from '../ui';
import type { ButlerColumn, ButlerTabItem } from '../ui';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  return {
    headerRow: { display: 'flex', alignItems: 'flex-start', gap: 16 },
    iconTile: {
      width: 48,
      height: 48,
      borderRadius: t.radius.lg,
      backgroundColor: rgba(p.violet[500], 0.1),
      color: rgb(p.violet[500]),
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    headerMain: { flex: 1, minWidth: 0 },
    managementTag: {
      padding: '2px 8px',
      borderRadius: t.radius.sm,
      backgroundColor: rgba(p.violet[500], 0.1),
      color: rgb(p.violet[400]),
      fontSize: 12,
      lineHeight: '16px',
      fontWeight: 500,
      whiteSpace: 'nowrap',
    },
    sectionTitle: {
      margin: 0,
      fontSize: 18,
      lineHeight: '28px',
      fontWeight: 500,
      color: t.text.primary,
    },
    sectionSub: {
      margin: '4px 0 0',
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.subtle,
    },
    sectionHead: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      flexWrap: 'wrap',
    },
    titleWithCount: { display: 'flex', alignItems: 'center', gap: 8 },
    actions: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    nsGrid: {
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
    nsCard: { padding: 16 },
    nsRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    nsName: {
      fontSize: 16,
      lineHeight: '24px',
      fontWeight: 500,
      color: t.text.secondary,
      overflowWrap: 'anywhere',
    },
    nsCount: { fontSize: 14, lineHeight: '20px', whiteSpace: 'nowrap' },
    healthy: { color: rgb(p.green[400]) },
    unhealthy: { color: rgb(p.yellow[400]) },
    track: {
      marginTop: 8,
      height: 6,
      borderRadius: t.radius.pill,
      backgroundColor: rgb(p.neutral[800]),
      overflow: 'hidden',
    },
    fill: { height: '100%', borderRadius: t.radius.pill },
    fillHealthy: { backgroundColor: rgb(p.green[500]) },
    fillUnhealthy: { backgroundColor: rgb(p.yellow[500]) },
    toolbar: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap',
    },
    search: { flex: 1, minWidth: 200, maxWidth: 384 },
    fieldRow: { display: 'flex', alignItems: 'center', gap: 12 },
    fieldLabel: { fontSize: 14, lineHeight: '20px', color: t.text.muted },
    namespaceSelect: { minWidth: 250 },
    cardGrid: {
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
    itemCard: {
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      height: '100%',
    },
    itemTitle: {
      margin: 0,
      fontSize: 16,
      lineHeight: '24px',
      fontWeight: 500,
      color: t.text.strong,
      overflowWrap: 'anywhere',
    },
    itemBody: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.muted,
    },
    itemMeta: {
      margin: 0,
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.subtle,
    },
    itemMetaMono: { fontFamily: t.fontMono },
    chipRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
    itemFooter: { marginTop: 'auto', paddingTop: 8 },
    platformTag: {
      display: 'inline-flex',
      alignItems: 'center',
      padding: '4px 8px',
      borderRadius: t.radius.sm,
      fontFamily: t.fontSans,
      fontSize: 12,
      lineHeight: '16px',
      fontWeight: 500,
      whiteSpace: 'nowrap',
      backgroundColor: rgba(p.violet[500], 0.1),
      color: rgb(p.violet[400]),
    },
    dialogStack: { display: 'flex', flexDirection: 'column', gap: 16 },
    dialogRow: { display: 'flex', gap: 16 },
    dialogText: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.muted,
    },
    dialogStrong: { color: t.text.secondary, fontWeight: 500 },
    dialogError: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: rgb(p.red[400]),
    },
    releaseSummary: {
      padding: 12,
      borderRadius: t.radius.md,
      backgroundColor: t.inset,
      border: `1px solid ${t.border}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    selectionList: {
      maxHeight: 300,
      overflowY: 'auto',
      border: `1px solid ${t.border}`,
      borderRadius: t.radius.md,
    },
    selectionItem: {
      padding: '8px 12px',
      borderBottom: `1px solid ${t.border}`,
      '&:last-child': { borderBottom: 'none' },
    },
    selectionItemActive: { backgroundColor: t.inset },
    selectionMeta: {
      margin: '2px 0 0 26px',
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.subtle,
      fontFamily: t.fontMono,
    },
    // Terminal chrome, mirroring the cluster TerminalTab.
    terminalCard: {
      height: 500,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    },
    terminalBar: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 12px',
      backgroundColor: t.surface,
      borderBottom: `1px solid ${t.border}`,
      flexShrink: 0,
    },
    terminalStatus: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      minWidth: 0,
    },
    dot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
    dotConnected: { backgroundColor: rgb(p.green[500]) },
    dotConnecting: {
      backgroundColor: rgb(p.yellow[500]),
      animation: '$butlerPulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
    },
    dotError: { backgroundColor: rgb(p.red[500]) },
    dotDisconnected: { backgroundColor: rgb(p.neutral[500]) },
    '@keyframes butlerPulse': { '50%': { opacity: 0.5 } },
    terminalLabel: {
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.muted,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    terminalSeparator: { fontSize: 14, color: rgb(p.neutral[600]) },
    terminalName: {
      fontSize: 14,
      color: t.text.subtle,
      fontFamily: t.fontMono,
    },
    terminalReconnect: {
      padding: '4px 8px',
      borderRadius: t.radius.sm,
      border: 'none',
      backgroundColor: rgb(p.neutral[800]),
      color: rgb(p.neutral[300]),
      fontFamily: t.fontSans,
      fontSize: 12,
      lineHeight: '16px',
      cursor: 'pointer',
      transition: 'background-color 150ms',
      '&:hover': { backgroundColor: rgb(p.neutral[700]) },
      '&:focus-visible': {
        outline: 'none',
        boxShadow: `0 0 0 2px ${t.surface}, 0 0 0 4px ${t.accent}`,
      },
      '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
    },
    terminalSurface: {
      flex: 1,
      minHeight: 0,
      padding: 8,
      // The console pins the terminal to its dark page colour in both themes.
      backgroundColor: '#0a0a0a',
      '& .xterm': { height: '100%' },
    },
  };
});

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

const TABS = [
  'overview',
  'nodes',
  'pods',
  'addons',
  'gitops',
  'terminal',
] as const;
type TabType = (typeof TABS)[number];

const TAB_LABELS: Record<TabType, string> = {
  overview: 'Overview',
  nodes: 'Nodes',
  pods: 'Pods',
  addons: 'Addons',
  gitops: 'GitOps',
  terminal: 'Terminal',
};

function isValidTab(tab: string | null): tab is TabType {
  return tab !== null && (TABS as readonly string[]).includes(tab);
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const ManagementPage = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const routes = useButlerRoutes();
  const { isAdmin } = useTeamContext();

  // Console keeps the active tab in `?tab=` so the view survives a reload.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab: TabType = isValidTab(tabParam) ? tabParam : 'overview';
  const setActiveTab = (tab: TabType) =>
    setSearchParams({ tab }, { replace: true });

  const [management, setManagement] = useState<ManagementCluster | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();

  const [nodes, setNodes] = useState<ManagementNode[]>([]);
  const [nodesLoaded, setNodesLoaded] = useState(false);
  const [pods, setPods] = useState<ManagementPod[]>([]);
  const [selectedNamespace, setSelectedNamespace] = useState('butler-system');
  const [podsLoaded, setPodsLoaded] = useState(false);
  const [managementAddons, setManagementAddons] = useState<ManagementAddon[]>(
    [],
  );
  const [addonsLoaded, setAddonsLoaded] = useState(false);

  const fetchManagement = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const data = await api.getManagement();
      setManagement(data);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [api]);

  const fetchNodes = useCallback(async () => {
    try {
      const data = await api.getManagementNodes();
      setNodes(data.nodes || []);
    } catch {
      setNodes([]);
    } finally {
      setNodesLoaded(true);
    }
  }, [api]);

  const fetchPods = useCallback(
    async (namespace: string) => {
      try {
        const data = await api.getManagementPods(namespace);
        setPods(data.pods || []);
      } catch {
        setPods([]);
      } finally {
        setPodsLoaded(true);
      }
    },
    [api],
  );

  const fetchAddons = useCallback(async () => {
    try {
      const data = await api.getManagementAddons();
      setManagementAddons(data.addons || []);
    } catch {
      setManagementAddons([]);
    } finally {
      setAddonsLoaded(true);
    }
  }, [api]);

  useEffect(() => {
    if (isAdmin) fetchManagement();
  }, [fetchManagement, isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    if (activeTab === 'nodes' && !nodesLoaded) {
      fetchNodes();
    } else if (activeTab === 'pods' && !podsLoaded) {
      fetchPods(selectedNamespace);
    } else if (activeTab === 'addons' && !addonsLoaded) {
      fetchAddons();
    }
  }, [
    isAdmin,
    activeTab,
    nodesLoaded,
    podsLoaded,
    addonsLoaded,
    fetchNodes,
    fetchPods,
    fetchAddons,
    selectedNamespace,
  ]);

  const handleNamespaceChange = (namespace: string) => {
    setSelectedNamespace(namespace);
    setPodsLoaded(false);
    fetchPods(namespace);
  };

  const handleRefresh = () => {
    fetchManagement();
    setNodesLoaded(false);
    setPodsLoaded(false);
    setAddonsLoaded(false);
  };

  if (!isAdmin) {
    return (
      <ButlerAccessDenied
        resourceType="page"
        message="Platform administrator access is required to view the management cluster."
        homeTo={routes.root()}
      />
    );
  }

  if (loading) {
    return <ButlerLoading />;
  }

  if (error || !management) {
    return (
      <ButlerErrorState
        message="Failed to load management cluster"
        detail={error?.message}
        onRetry={fetchManagement}
      />
    );
  }

  const tabs: ButlerTabItem<TabType>[] = TABS.map(id => ({
    id,
    label: TAB_LABELS[id],
  }));

  return (
    <ButlerStack>
      <div className={classes.headerRow}>
        <div className={classes.iconTile} aria-hidden>
          <ServerIcon size={24} />
        </div>
        <ButlerPageHeader
          className={classes.headerMain}
          title="Management Cluster"
          titleAdornment={
            <>
              <span className={classes.managementTag}>Management</span>
              <ButlerStatusBadge status={management.phase} />
            </>
          }
          subtitle={`Kubernetes ${management.kubernetesVersion}`}
          actions={
            <ButlerButton variant="secondary" size="sm" onClick={handleRefresh}>
              Refresh
            </ButlerButton>
          }
        />
      </div>

      <ButlerStatGrid variant="metrics">
        <ButlerStatTile
          label="Nodes"
          value={`${management.nodes.ready}/${management.nodes.total}`}
        />
        <ButlerStatTile
          label="Tenant Clusters"
          value={management.tenantClusters}
          tone="green"
        />
        <ButlerStatTile
          label="System Namespaces"
          value={management.systemNamespaces.length}
        />
        <ButlerStatTile label="Version" value={management.kubernetesVersion} />
      </ButlerStatGrid>

      <ButlerTabs
        tabs={tabs}
        value={activeTab}
        onChange={setActiveTab}
        idPrefix="management"
        aria-label="Management cluster sections"
        tone="admin"
      />

      <ButlerTabPanel idPrefix="management" id={activeTab}>
        {activeTab === 'overview' && <OverviewTab management={management} />}
        {activeTab === 'nodes' && (
          <NodesTab nodes={nodes} loaded={nodesLoaded} onRetry={fetchNodes} />
        )}
        {activeTab === 'pods' && (
          <PodsTab
            pods={pods}
            loaded={podsLoaded}
            namespaces={management.systemNamespaces}
            selectedNamespace={selectedNamespace}
            onNamespaceChange={handleNamespaceChange}
          />
        )}
        {activeTab === 'addons' && (
          <AddonsTab
            addons={managementAddons}
            loaded={addonsLoaded}
            onRefresh={fetchAddons}
          />
        )}
        {activeTab === 'gitops' && <ManagementGitOpsTab />}
        {activeTab === 'terminal' && <ManagementTerminalTab />}
      </ButlerTabPanel>
    </ButlerStack>
  );
};

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

type TenantNsRow = {
  id: string;
  clusterName: string;
  sourceNamespace: string;
  tenantNamespace: string;
  phase: string;
};

const OverviewTab = ({ management }: { management: ManagementCluster }) => {
  const classes = useStyles();
  const systemNamespaces = management.systemNamespaces || [];
  const tenantNamespaces = management.tenantNamespaces || [];

  const columns: ButlerColumn<TenantNsRow>[] = [
    {
      id: 'cluster',
      header: 'Cluster',
      primary: true,
      render: row => row.clusterName,
    },
    {
      id: 'source',
      header: 'Source Namespace',
      render: row => row.sourceNamespace,
    },
    {
      id: 'tenant',
      header: 'Tenant Namespace',
      mono: true,
      render: row => row.tenantNamespace || '-',
    },
    {
      id: 'phase',
      header: 'Phase',
      render: row => <ButlerStatusBadge status={row.phase || 'Unknown'} />,
    },
  ];

  const rows: TenantNsRow[] = tenantNamespaces.map(tenant => ({
    id: tenant.name,
    clusterName: tenant.name,
    sourceNamespace: tenant.namespace,
    tenantNamespace: tenant.tenantNamespace,
    phase: tenant.phase,
  }));

  return (
    <ButlerStack gap={32}>
      <ButlerStack gap={16}>
        <h3 className={classes.sectionTitle}>System Namespaces</h3>
        {systemNamespaces.length === 0 ? (
          <ButlerEmptyState title="No system namespace data available." />
        ) : (
          <div className={classes.nsGrid}>
            {systemNamespaces.map(ns => {
              const healthy = ns.running === ns.total;
              const pct = ns.total > 0 ? (ns.running / ns.total) * 100 : 0;
              return (
                <ButlerCard key={ns.namespace} flush className={classes.nsCard}>
                  <div className={classes.nsRow}>
                    <span className={classes.nsName}>{ns.namespace}</span>
                    <span
                      className={clsx(
                        classes.nsCount,
                        healthy ? classes.healthy : classes.unhealthy,
                      )}
                    >
                      {ns.running}/{ns.total} pods
                    </span>
                  </div>
                  <div
                    className={classes.track}
                    role="progressbar"
                    aria-label={`${ns.namespace} pods running`}
                    aria-valuemin={0}
                    aria-valuemax={ns.total}
                    aria-valuenow={ns.running}
                  >
                    <div
                      className={clsx(
                        classes.fill,
                        healthy ? classes.fillHealthy : classes.fillUnhealthy,
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </ButlerCard>
              );
            })}
          </div>
        )}
      </ButlerStack>

      <ButlerStack gap={16}>
        <h3 className={classes.sectionTitle}>Tenant Namespaces</h3>
        {rows.length === 0 ? (
          <ButlerEmptyState title="No tenant clusters" />
        ) : (
          <ButlerTable columns={columns} rows={rows} rowKey={row => row.id} />
        )}
      </ButlerStack>
    </ButlerStack>
  );
};

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

const NodesTab = ({
  nodes,
  loaded,
  onRetry,
}: {
  nodes: ManagementNode[];
  loaded: boolean;
  onRetry: () => void;
}) => {
  if (!loaded) {
    return <ButlerLoading />;
  }

  if (nodes.length === 0) {
    return (
      <ButlerEmptyState
        title="No node information available"
        description="Unable to retrieve node data from the management cluster."
        action={
          <ButlerButton variant="secondary" onClick={onRetry}>
            Retry
          </ButlerButton>
        }
      />
    );
  }

  const columns: ButlerColumn<ManagementNode>[] = [
    { id: 'name', header: 'Name', primary: true, render: n => n.name },
    {
      id: 'status',
      header: 'Status',
      render: n => (
        <ButlerChip tone={n.status === 'Ready' ? 'green' : 'yellow'}>
          {n.status}
        </ButlerChip>
      ),
    },
    {
      id: 'roles',
      header: 'Roles',
      render: n => n.roles.join(', ') || 'worker',
    },
    { id: 'version', header: 'Version', render: n => n.version },
    { id: 'ip', header: 'IP', mono: true, render: n => n.internalIP },
    { id: 'age', header: 'Age', render: n => n.age },
  ];

  return <ButlerTable columns={columns} rows={nodes} rowKey={n => n.name} />;
};

// ---------------------------------------------------------------------------
// Pods
// ---------------------------------------------------------------------------

const PodsTab = ({
  pods,
  loaded,
  namespaces,
  selectedNamespace,
  onNamespaceChange,
}: {
  pods: ManagementPod[];
  loaded: boolean;
  namespaces: Array<{ namespace: string; running: number; total: number }>;
  selectedNamespace: string;
  onNamespaceChange: (ns: string) => void;
}) => {
  const classes = useStyles();

  const columns: ButlerColumn<ManagementPod>[] = [
    {
      id: 'name',
      header: 'Name',
      primary: true,
      mono: true,
      render: pod => pod.name,
    },
    {
      id: 'status',
      header: 'Status',
      render: pod => <ButlerStatusBadge status={pod.status} />,
    },
    { id: 'ready', header: 'Ready', render: pod => pod.ready },
    { id: 'restarts', header: 'Restarts', render: pod => pod.restarts },
    { id: 'age', header: 'Age', render: pod => pod.age },
  ];

  return (
    <ButlerStack gap={16}>
      <div className={classes.fieldRow}>
        <label className={classes.fieldLabel} htmlFor="management-namespace">
          Namespace:
        </label>
        <div className={classes.namespaceSelect}>
          <ButlerSelect
            id="management-namespace"
            value={selectedNamespace}
            onChange={event => onNamespaceChange(event.target.value)}
          >
            {namespaces.map(ns => (
              <option key={ns.namespace} value={ns.namespace}>
                {ns.namespace} ({ns.running}/{ns.total})
              </option>
            ))}
          </ButlerSelect>
        </div>
      </div>

      {!loaded ? (
        <ButlerLoading />
      ) : pods.length === 0 ? (
        <ButlerEmptyState title={`No pods in namespace ${selectedNamespace}`} />
      ) : (
        <ButlerTable columns={columns} rows={pods} rowKey={pod => pod.name} />
      )}
    </ButlerStack>
  );
};

// ---------------------------------------------------------------------------
// Addons
// ---------------------------------------------------------------------------

const AddonsTab = ({
  addons,
  loaded,
  onRefresh,
}: {
  addons: ManagementAddon[];
  loaded: boolean;
  onRefresh: () => void;
}) => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);

  const [catalog, setCatalog] = useState<AddonDefinition[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const [installOpen, setInstallOpen] = useState(false);
  const [installAddon, setInstallAddon] = useState<AddonDefinition | null>(
    null,
  );
  const [installForm, setInstallForm] = useState({ name: '', version: '' });
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | undefined>();

  const [uninstallTarget, setUninstallTarget] =
    useState<ManagementAddon | null>(null);
  const [uninstalling, setUninstalling] = useState(false);

  useEffect(() => {
    const loadCatalog = async () => {
      setCatalogLoading(true);
      try {
        const res = await api.getAddonCatalog();
        setCatalog(res.addons || []);
      } catch {
        // Non-fatal: the installed list still renders without the catalog.
      } finally {
        setCatalogLoading(false);
      }
    };
    loadCatalog();
  }, [api]);

  const installedAddonNames = useMemo(
    () => new Set(addons.map(a => a.addon.toLowerCase())),
    [addons],
  );

  const categories = useMemo(() => {
    const cats = new Set(catalog.filter(a => !a.platform).map(a => a.category));
    return Array.from(cats).sort();
  }, [catalog]);

  const installable = useMemo(
    () =>
      catalog
        .filter(a => !a.platform)
        .filter(a => !installedAddonNames.has(a.name.toLowerCase())),
    [catalog, installedAddonNames],
  );

  const availableAddons = useMemo(
    () =>
      installable
        .filter(a => {
          if (!searchQuery) return true;
          const q = searchQuery.toLowerCase();
          return (
            a.displayName.toLowerCase().includes(q) ||
            a.description.toLowerCase().includes(q)
          );
        })
        .filter(
          a => selectedCategory === 'all' || a.category === selectedCategory,
        ),
    [installable, searchQuery, selectedCategory],
  );

  const openInstall = (definition?: AddonDefinition) => {
    setInstallAddon(definition ?? null);
    setInstallForm({ name: '', version: definition?.defaultVersion || '' });
    setInstallError(undefined);
    setInstallOpen(true);
  };

  const handleInstall = async () => {
    if (!installAddon) {
      setInstallError('Please select an addon from the catalog.');
      return;
    }
    setInstalling(true);
    setInstallError(undefined);
    try {
      await api.installManagementAddon({
        name: installForm.name || installAddon.name,
        addon: installAddon.name,
        version: installForm.version || installAddon.defaultVersion,
      });
      setInstallOpen(false);
      onRefresh();
    } catch (e) {
      setInstallError(
        e instanceof Error ? e.message : 'Failed to install addon.',
      );
    } finally {
      setInstalling(false);
    }
  };

  const handleUninstall = async () => {
    if (!uninstallTarget) return;
    setUninstalling(true);
    try {
      await api.uninstallManagementAddon(uninstallTarget.name);
      setUninstallTarget(null);
      onRefresh();
    } catch {
      // The list refresh below surfaces whatever the server ended up with.
    } finally {
      setUninstalling(false);
    }
  };

  if (!loaded || catalogLoading) {
    return <ButlerLoading />;
  }

  const columns: ButlerColumn<ManagementAddon>[] = [
    { id: 'name', header: 'Name', primary: true, render: a => a.name },
    { id: 'addon', header: 'Addon', render: a => a.addon },
    {
      id: 'version',
      header: 'Version',
      mono: true,
      render: a => a.status.installedVersion || a.version || 'N/A',
    },
    {
      id: 'status',
      header: 'Status',
      render: a => <ButlerStatusBadge status={a.status.phase} />,
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      render: a => (
        <ButlerLinkButton tone="danger" onClick={() => setUninstallTarget(a)}>
          Uninstall
        </ButlerLinkButton>
      ),
    },
  ];

  const categoryOptions = [
    { value: 'all', label: 'All' },
    ...categories.map(cat => ({
      value: cat,
      label: CATEGORY_INFO[cat]?.displayName || cat,
    })),
  ];

  const installButton = (
    <ButlerButton
      size="sm"
      startIcon={<PlusIcon />}
      onClick={() => openInstall()}
    >
      Install Addon
    </ButlerButton>
  );

  return (
    <ButlerStack gap={32}>
      <ButlerStack gap={16}>
        <div className={classes.sectionHead}>
          <div className={classes.titleWithCount}>
            <h3 className={classes.sectionTitle}>Installed Addons</h3>
            {addons.length > 0 && (
              <ButlerChip tone="green">{addons.length} Active</ButlerChip>
            )}
          </div>
          <div className={classes.actions}>
            <ButlerButton variant="secondary" size="sm" onClick={onRefresh}>
              Refresh
            </ButlerButton>
            {installButton}
          </div>
        </div>

        {addons.length === 0 ? (
          <ButlerEmptyState
            title="No management addons installed"
            description="Install addons to extend the management cluster capabilities."
            action={installButton}
          />
        ) : (
          <ButlerTable columns={columns} rows={addons} rowKey={a => a.name} />
        )}
      </ButlerStack>

      <ButlerStack gap={16}>
        <div className={classes.titleWithCount}>
          <h3 className={classes.sectionTitle}>Available Addons</h3>
          {availableAddons.length > 0 && (
            <ButlerChip>{availableAddons.length} Available</ButlerChip>
          )}
        </div>

        <div className={classes.toolbar}>
          <ButlerSearchInput
            className={classes.search}
            aria-label="Search addons"
            placeholder="Search addons..."
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
          />
          <ButlerToggleBar
            aria-label="Filter addons by category"
            options={categoryOptions}
            value={selectedCategory}
            onChange={setSelectedCategory}
          />
        </div>

        {availableAddons.length === 0 ? (
          <ButlerEmptyState
            title={
              searchQuery || selectedCategory !== 'all'
                ? 'No addons match your search.'
                : 'All available addons are installed.'
            }
          />
        ) : (
          <div className={classes.cardGrid}>
            {availableAddons.map(addon => (
              <ButlerCard key={addon.name} flush className={classes.itemCard}>
                <div className={classes.chipRow}>
                  <ButlerChip>
                    {CATEGORY_INFO[addon.category]?.displayName ||
                      addon.category}
                  </ButlerChip>
                </div>
                <h4 className={classes.itemTitle}>{addon.displayName}</h4>
                <p className={classes.itemBody}>{addon.description}</p>
                <p className={classes.itemMeta}>
                  Version: {addon.defaultVersion}
                </p>
                {addon.dependsOn && addon.dependsOn.length > 0 && (
                  <p className={classes.itemMeta}>
                    Requires: {addon.dependsOn.join(', ')}
                  </p>
                )}
                <div className={classes.itemFooter}>
                  <ButlerButton
                    variant="secondary"
                    size="sm"
                    startIcon={<PlusIcon />}
                    onClick={() => openInstall(addon)}
                  >
                    Install
                  </ButlerButton>
                </div>
              </ButlerCard>
            ))}
          </div>
        )}
      </ButlerStack>

      <ButlerDialog
        open={installOpen}
        onClose={() => setInstallOpen(false)}
        title="Install Management Addon"
        subtitle={installAddon?.description}
        busy={installing}
        width={512}
        footer={
          <>
            <ButlerButton
              variant="secondary"
              onClick={() => setInstallOpen(false)}
              disabled={installing}
            >
              Cancel
            </ButlerButton>
            <ButlerButton
              onClick={handleInstall}
              disabled={installing || !installAddon}
            >
              {installing ? 'Installing...' : 'Install'}
            </ButlerButton>
          </>
        }
      >
        <div className={classes.dialogStack}>
          {installError && (
            <p className={classes.dialogError}>{installError}</p>
          )}
          {installAddon ? (
            <>
              <ButlerInput
                label="Release Name"
                help="Custom name for this addon installation. Defaults to the addon name."
                value={installForm.name}
                placeholder={installAddon.name}
                onChange={event =>
                  setInstallForm(prev => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
              />
              <ButlerSelect
                label="Version"
                value={installForm.version || installAddon.defaultVersion}
                onChange={event =>
                  setInstallForm(prev => ({
                    ...prev,
                    version: event.target.value,
                  }))
                }
              >
                {(
                  installAddon.availableVersions || [
                    installAddon.defaultVersion,
                  ]
                ).map(version => (
                  <option key={version} value={version}>
                    {version}
                    {version === installAddon.defaultVersion
                      ? ' (default)'
                      : ''}
                  </option>
                ))}
              </ButlerSelect>
              <p className={clsx(classes.itemMeta, classes.itemMetaMono)}>
                Chart: {installAddon.chartRepository}/{installAddon.chartName}
              </p>
            </>
          ) : (
            <ButlerSelect
              label="Addon"
              value=""
              onChange={event => {
                const found = catalog.find(a => a.name === event.target.value);
                if (found) {
                  setInstallAddon(found);
                  setInstallForm({ name: '', version: found.defaultVersion });
                }
              }}
            >
              <option value="">Select an addon...</option>
              {installable.map(addon => (
                <option key={addon.name} value={addon.name}>
                  {addon.displayName || addon.name} (
                  {CATEGORY_INFO[addon.category]?.displayName || addon.category}
                  )
                </option>
              ))}
            </ButlerSelect>
          )}
        </div>
      </ButlerDialog>

      <ButlerDialog
        open={Boolean(uninstallTarget)}
        onClose={() => setUninstallTarget(null)}
        title="Uninstall Management Addon"
        busy={uninstalling}
        footer={
          <>
            <ButlerButton
              variant="secondary"
              onClick={() => setUninstallTarget(null)}
              disabled={uninstalling}
            >
              Cancel
            </ButlerButton>
            <ButlerButton
              variant="danger"
              onClick={handleUninstall}
              disabled={uninstalling}
            >
              {uninstalling ? 'Uninstalling...' : 'Uninstall'}
            </ButlerButton>
          </>
        }
      >
        <div className={classes.dialogStack}>
          <p className={classes.dialogText}>
            Are you sure you want to uninstall{' '}
            <span className={classes.dialogStrong}>
              {uninstallTarget?.addon || uninstallTarget?.name}
            </span>{' '}
            from the management cluster?
          </p>
          <p className={classes.dialogText}>
            This will remove the addon and all its associated resources from the
            management cluster. This action cannot be undone.
          </p>
        </div>
      </ButlerDialog>
    </ButlerStack>
  );
};

// ---------------------------------------------------------------------------
// GitOps
// ---------------------------------------------------------------------------

const PROVIDER_LABELS: Record<string, string> = {
  flux: 'Flux CD',
  argocd: 'Argo CD',
  github: 'GitHub',
  gitlab: 'GitLab',
};

const ManagementGitOpsTab = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);

  const [gitOpsStatus, setGitOpsStatus] = useState<GitOpsStatus | null>(null);
  const [gitConfig, setGitConfig] = useState<GitProviderConfig | null>(null);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [discovery, setDiscovery] = useState<DiscoveryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [enableOpen, setEnableOpen] = useState(false);
  const [enableProvider, setEnableProvider] = useState<'flux' | 'argocd'>(
    'flux',
  );
  const [enableRepo, setEnableRepo] = useState('');
  const [enableBranch, setEnableBranch] = useState('main');
  const [enablePath, setEnablePath] = useState('clusters/management');
  const [enabling, setEnabling] = useState(false);

  const [disableOpen, setDisableOpen] = useState(false);
  const [disableConfirmText, setDisableConfirmText] = useState('');
  const [disabling, setDisabling] = useState(false);

  const [exportOpen, setExportOpen] = useState(false);
  const [exportRelease, setExportRelease] = useState<DiscoveredRelease | null>(
    null,
  );
  const [exportRepo, setExportRepo] = useState('');
  const [exportBranch, setExportBranch] = useState('main');
  const [exportPath, setExportPath] = useState('');
  const [exportCreatePR, setExportCreatePR] = useState(true);
  const [exportPRTitle, setExportPRTitle] = useState('');
  const [exportHelmRepoUrl, setExportHelmRepoUrl] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportPreview, setExportPreview] = useState<Record<
    string,
    string
  > | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const [migrateOpen, setMigrateOpen] = useState(false);
  const [migrateRepo, setMigrateRepo] = useState('');
  const [migrateBranch, setMigrateBranch] = useState('main');
  const [migrateBasePath, setMigrateBasePath] = useState('clusters/management');
  const [migrateCreatePR, setMigrateCreatePR] = useState(true);
  const [migrateSelected, setMigrateSelected] = useState<Set<string>>(
    new Set(),
  );
  const [migrating, setMigrating] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, configRes] = await Promise.allSettled([
        api.getManagementGitOpsStatus(),
        api.getGitOpsConfig(),
      ]);

      if (statusRes.status === 'fulfilled') {
        setGitOpsStatus(statusRes.value);
      }
      if (configRes.status === 'fulfilled') {
        setGitConfig(configRes.value);
        if (configRes.value.configured) {
          try {
            setRepositories(await api.listRepositories());
          } catch {
            // Non-fatal: the dialogs fall back to a free-text repository.
          }
        }
      }

      try {
        setDiscovery(await api.discoverManagementReleases());
      } catch {
        // Non-fatal: discovery is only used to offer exports.
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load GitOps status');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const discoverReleases = async () => {
    setDiscovering(true);
    try {
      setDiscovery(await api.discoverManagementReleases());
    } catch {
      // Non-fatal, the previous result stays on screen.
    } finally {
      setDiscovering(false);
    }
  };

  const handleEnable = async () => {
    setEnabling(true);
    try {
      await api.enableManagementGitOps({
        provider: enableProvider,
        repository: enableRepo,
        branch: enableBranch,
        path: enablePath,
      });
      setEnableOpen(false);
      await loadData();
    } catch {
      // Non-fatal, the reloaded status shows whether it took effect.
    } finally {
      setEnabling(false);
    }
  };

  const handleDisable = async () => {
    setDisabling(true);
    try {
      await api.disableManagementGitOps();
      setDisableOpen(false);
      setDisableConfirmText('');
      await loadData();
    } catch {
      // Non-fatal, the reloaded status shows whether it took effect.
    } finally {
      setDisabling(false);
    }
  };

  const openExport = (release: DiscoveredRelease) => {
    setExportRelease(release);
    setExportRepo(gitOpsStatus?.repository || '');
    setExportBranch(gitOpsStatus?.branch || 'main');
    setExportPath(`clusters/management/${release.category || 'apps'}`);
    setExportPRTitle(`Add ${release.name} to GitOps`);
    setExportHelmRepoUrl(release.repoUrl || '');
    setExportCreatePR(true);
    setExportPreview(null);
    setExportOpen(true);
  };

  const handleExport = async () => {
    if (!exportRelease) return;
    setExporting(true);
    try {
      await api.exportManagementRelease({
        releaseName: exportRelease.name,
        releaseNamespace: exportRelease.namespace,
        repository: exportRepo,
        branch: exportBranch,
        path: exportPath,
        createPR: exportCreatePR,
        prTitle: exportCreatePR ? exportPRTitle : undefined,
        helmRepoUrl: !exportRelease.addonDefinition
          ? exportHelmRepoUrl
          : undefined,
      });
      setExportOpen(false);
      setExportRelease(null);
      discoverReleases();
    } catch {
      // Non-fatal, re-discovery reflects what landed.
    } finally {
      setExporting(false);
    }
  };

  const togglePreview = async () => {
    if (exportPreview) {
      setExportPreview(null);
      return;
    }
    if (!exportRelease || !exportRepo) return;
    setLoadingPreview(true);
    try {
      setExportPreview(
        await api.previewManifests({
          addonName: exportRelease.name,
          repository: exportRepo,
          targetPath: exportPath,
          values: exportRelease.values,
        }),
      );
    } catch {
      // Non-fatal: the preview is optional.
    } finally {
      setLoadingPreview(false);
    }
  };

  const allReleases = useMemo(() => {
    if (!discovery) return [] as DiscoveredRelease[];
    return [
      ...sortReleases(discovery.matched || []),
      ...sortReleases(discovery.unmatched || []),
    ];
  }, [discovery]);

  const openMigrateAll = () => {
    setMigrateSelected(
      new Set(
        allReleases
          .filter(r => r.addonDefinition || r.repoUrl)
          .map(r => `${r.namespace}/${r.name}`),
      ),
    );
    setMigrateRepo(gitOpsStatus?.repository || '');
    setMigrateBranch(gitOpsStatus?.branch || 'main');
    setMigrateBasePath('clusters/management');
    setMigrateCreatePR(true);
    setMigrateOpen(true);
  };

  const handleMigrateAll = async () => {
    setMigrating(true);
    const selectedReleases = allReleases.filter(r =>
      migrateSelected.has(`${r.namespace}/${r.name}`),
    );
    try {
      await api.migrateManagementReleases({
        releases: selectedReleases.map(r => ({
          name: r.name,
          namespace: r.namespace,
          repoUrl: r.repoUrl || '',
          chartName: r.chart,
          chartVersion: r.chartVersion,
          values: r.values,
          category: r.category,
        })),
        repository: migrateRepo,
        branch: migrateBranch,
        basePath: migrateBasePath,
        createPR: migrateCreatePR,
        prTitle: `Migrate ${migrateSelected.size} management cluster releases to GitOps`,
      });
      setMigrateOpen(false);
      discoverReleases();
    } catch {
      // Non-fatal, re-discovery reflects what landed.
    } finally {
      setMigrating(false);
    }
  };

  if (loading) {
    return <ButlerLoading />;
  }

  if (error && !gitOpsStatus && !discovery) {
    return (
      <ButlerErrorState
        message="Failed to load GitOps status"
        detail={error}
        onRetry={loadData}
      />
    );
  }

  const isEnabled = gitOpsStatus?.enabled ?? false;
  const isGitOpsInstalled = discovery?.gitopsEngine?.installed ?? false;

  const repositoryField = (
    label: string,
    value: string,
    onChange: (next: string) => void,
  ) =>
    repositories.length > 0 ? (
      <ButlerSelect
        label={label}
        value={value}
        onChange={event => onChange(event.target.value)}
      >
        <option value="">Select a repository...</option>
        {repositories.map(repo => (
          <option key={repo.fullName} value={repo.fullName}>
            {repo.fullName}
            {repo.private ? ' (private)' : ''}
          </option>
        ))}
      </ButlerSelect>
    ) : (
      <ButlerInput
        label={`${label} (owner/repo)`}
        value={value}
        placeholder="owner/repo"
        onChange={event => onChange(event.target.value)}
      />
    );

  return (
    <ButlerStack>
      <div className={classes.sectionHead}>
        <h3 className={classes.sectionTitle}>GitOps Configuration</h3>
        <div className={classes.actions}>
          <ButlerButton variant="secondary" size="sm" onClick={loadData}>
            Refresh
          </ButlerButton>
          {isEnabled ? (
            <ButlerButton
              variant="danger"
              size="sm"
              onClick={() => setDisableOpen(true)}
            >
              Disable GitOps
            </ButlerButton>
          ) : (
            <ButlerButton size="sm" onClick={() => setEnableOpen(true)}>
              Enable GitOps
            </ButlerButton>
          )}
        </div>
      </div>

      <ButlerCard title="GitOps Engine Status">
        <ButlerKeyValueList>
          <ButlerKeyValueRow label="Status">
            <ButlerChip tone={isEnabled ? 'green' : 'neutral'}>
              {isEnabled ? 'Enabled' : 'Disabled'}
            </ButlerChip>
          </ButlerKeyValueRow>
          {gitOpsStatus?.provider && (
            <ButlerKeyValueRow label="Provider">
              {PROVIDER_LABELS[gitOpsStatus.provider] || gitOpsStatus.provider}
            </ButlerKeyValueRow>
          )}
          {gitOpsStatus?.version && (
            <ButlerKeyValueRow label="Version" mono>
              {gitOpsStatus.version}
            </ButlerKeyValueRow>
          )}
          {gitOpsStatus?.repository && (
            <ButlerKeyValueRow label="Repository" mono truncate>
              {gitOpsStatus.repository}
            </ButlerKeyValueRow>
          )}
          {gitOpsStatus?.branch && (
            <ButlerKeyValueRow label="Branch" mono>
              {gitOpsStatus.branch}
            </ButlerKeyValueRow>
          )}
          {gitOpsStatus?.path && (
            <ButlerKeyValueRow label="Path" mono truncate>
              {gitOpsStatus.path}
            </ButlerKeyValueRow>
          )}
          {gitOpsStatus?.status && (
            <ButlerKeyValueRow label="Reconciliation">
              <ButlerStatusBadge status={gitOpsStatus.status} />
            </ButlerKeyValueRow>
          )}
        </ButlerKeyValueList>
      </ButlerCard>

      {gitConfig?.configured && (
        <ButlerCard title="Git Provider">
          <div className={classes.sectionHead}>
            <p className={classes.itemBody}>
              Connected to{' '}
              {PROVIDER_LABELS[gitConfig.type || ''] || gitConfig.type}
              {gitConfig.username && ` as ${gitConfig.username}`}
              {gitConfig.organization && ` (${gitConfig.organization})`}
            </p>
            <ButlerButton
              variant="secondary"
              size="sm"
              onClick={openMigrateAll}
              disabled={discovering || allReleases.length === 0}
            >
              Export All to GitOps
            </ButlerButton>
          </div>
        </ButlerCard>
      )}

      {isGitOpsInstalled && (
        <>
          <div className={classes.sectionHead}>
            <div>
              <h3 className={classes.sectionTitle}>Discovered Releases</h3>
              <p className={classes.sectionSub}>
                {allReleases.length} Helm release
                {allReleases.length === 1 ? '' : 's'} found on the management
                cluster
              </p>
            </div>
            <ButlerButton
              variant="secondary"
              size="sm"
              onClick={discoverReleases}
              disabled={discovering}
            >
              {discovering ? (
                <>
                  <ButlerSpinner small />
                  Discovering...
                </>
              ) : (
                'Refresh'
              )}
            </ButlerButton>
          </div>

          {allReleases.length === 0 ? (
            <ButlerEmptyState
              title="No Helm releases found"
              description="No Helm releases were discovered on the management cluster."
            />
          ) : (
            <div className={classes.cardGrid}>
              {allReleases.map(release => (
                <ButlerCard
                  key={`${release.namespace}/${release.name}`}
                  flush
                  className={classes.itemCard}
                >
                  <h4 className={classes.itemTitle}>{release.name}</h4>
                  <p className={classes.itemMeta}>
                    Namespace: {release.namespace}
                  </p>
                  <div className={classes.chipRow}>
                    <ButlerChip>{release.chart}</ButlerChip>
                    <ButlerChip>v{release.chartVersion}</ButlerChip>
                    <ButlerStatusBadge status={release.status} />
                  </div>
                  <div className={classes.chipRow}>
                    {release.category && (
                      <ButlerChip tone="blue">
                        {getCategoryLabel(release.category)}
                      </ButlerChip>
                    )}
                    {release.platform && (
                      <span className={classes.platformTag}>Platform</span>
                    )}
                  </div>
                  <p className={classes.itemMeta}>
                    Revision: {release.revision}
                  </p>
                  <div className={classes.itemFooter}>
                    <ButlerButton
                      variant="secondary"
                      size="sm"
                      onClick={() => openExport(release)}
                    >
                      Export to Git
                    </ButlerButton>
                  </div>
                </ButlerCard>
              ))}
            </div>
          )}
        </>
      )}

      <ButlerDialog
        open={enableOpen}
        onClose={() => setEnableOpen(false)}
        title="Enable GitOps on Management Cluster"
        subtitle="Select a GitOps provider and configure the repository to manage the management cluster via Git."
        busy={enabling}
        width={512}
        footer={
          <>
            <ButlerButton
              variant="secondary"
              onClick={() => setEnableOpen(false)}
              disabled={enabling}
            >
              Cancel
            </ButlerButton>
            <ButlerButton
              onClick={handleEnable}
              disabled={enabling || !enableRepo}
            >
              {enabling ? 'Enabling...' : 'Enable'}
            </ButlerButton>
          </>
        }
      >
        <div className={classes.dialogStack}>
          <ButlerSelect
            label="GitOps Provider"
            value={enableProvider}
            onChange={event =>
              setEnableProvider(event.target.value as 'flux' | 'argocd')
            }
          >
            <option value="flux">Flux CD</option>
            <option value="argocd">Argo CD</option>
          </ButlerSelect>
          {repositoryField('Target Repository', enableRepo, setEnableRepo)}
          <div className={classes.dialogRow}>
            <ButlerInput
              label="Branch"
              value={enableBranch}
              onChange={event => setEnableBranch(event.target.value)}
            />
            <ButlerInput
              label="Path"
              value={enablePath}
              onChange={event => setEnablePath(event.target.value)}
            />
          </div>
        </div>
      </ButlerDialog>

      <ButlerDialog
        open={disableOpen}
        onClose={() => setDisableOpen(false)}
        title="Disable GitOps on Management Cluster"
        busy={disabling}
        footer={
          <>
            <ButlerButton
              variant="secondary"
              onClick={() => setDisableOpen(false)}
              disabled={disabling}
            >
              Cancel
            </ButlerButton>
            <ButlerButton
              variant="danger"
              onClick={handleDisable}
              disabled={disabling || disableConfirmText !== 'management'}
            >
              {disabling ? 'Disabling...' : 'Disable GitOps'}
            </ButlerButton>
          </>
        }
      >
        <div className={classes.dialogStack}>
          <p className={classes.dialogText}>
            This will uninstall the GitOps engine from the{' '}
            <span className={classes.dialogStrong}>management cluster</span> and
            remove all GitOps controllers. Your Git repository will not be
            affected.
          </p>
          <ButlerBanner
            title="Warning"
            message="Any resources managed by the GitOps engine will no longer be automatically reconciled from Git. This includes Butler platform components if they are managed via GitOps."
          />
          <ButlerInput
            label={'Type "management" to confirm'}
            value={disableConfirmText}
            placeholder="management"
            autoFocus
            onChange={event => setDisableConfirmText(event.target.value)}
          />
        </div>
      </ButlerDialog>

      <ButlerDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title={`Export ${exportRelease?.name || ''} to Git`}
        busy={exporting}
        width={512}
        footer={
          <>
            <ButlerButton
              variant="secondary"
              onClick={() => setExportOpen(false)}
              disabled={exporting}
            >
              Cancel
            </ButlerButton>
            <ButlerButton
              onClick={handleExport}
              disabled={
                exporting ||
                !exportRepo ||
                (!exportRelease?.addonDefinition && !exportHelmRepoUrl)
              }
            >
              {exporting
                ? 'Exporting...'
                : exportCreatePR
                ? 'Create Pull Request'
                : 'Export'}
            </ButlerButton>
          </>
        }
      >
        <div className={classes.dialogStack}>
          {exportRelease && (
            <div className={classes.releaseSummary}>
              <div>
                <p className={classes.itemTitle}>{exportRelease.name}</p>
                <p className={clsx(classes.itemMeta, classes.itemMetaMono)}>
                  {exportRelease.namespace} &bull; {exportRelease.chart}:
                  {exportRelease.chartVersion}
                </p>
              </div>
              <ButlerChip tone="blue">
                {getCategoryLabel(exportRelease.category || 'apps')}
              </ButlerChip>
            </div>
          )}

          {exportRelease && !exportRelease.addonDefinition && (
            <ButlerInput
              label="Helm Repository URL"
              value={exportHelmRepoUrl}
              placeholder="https://charts.example.com"
              tone={!exportHelmRepoUrl ? 'danger' : 'default'}
              help={
                !exportHelmRepoUrl
                  ? 'Required: provide the Helm repository URL'
                  : exportRelease.repoUrl
                  ? 'Auto-detected from chart metadata'
                  : undefined
              }
              onChange={event => setExportHelmRepoUrl(event.target.value)}
            />
          )}

          {repositoryField('Target Repository', exportRepo, setExportRepo)}

          <div className={classes.dialogRow}>
            <ButlerInput
              label="Branch"
              value={exportBranch}
              onChange={event => setExportBranch(event.target.value)}
            />
            <ButlerInput
              label="Path"
              value={exportPath}
              onChange={event => setExportPath(event.target.value)}
            />
          </div>

          <ButlerCheckbox
            label="Create Pull Request"
            checked={exportCreatePR}
            onChange={event => setExportCreatePR(event.target.checked)}
          />

          {exportCreatePR && (
            <ButlerInput
              label="PR Title"
              value={exportPRTitle}
              onChange={event => setExportPRTitle(event.target.value)}
            />
          )}

          {exportRepo && (
            <ButlerPreviewToggle
              open={Boolean(exportPreview)}
              loading={loadingPreview}
              onToggle={togglePreview}
            />
          )}
          {exportPreview && <ButlerFilePreview files={exportPreview} />}
        </div>
      </ButlerDialog>

      <ButlerDialog
        open={migrateOpen}
        onClose={() => setMigrateOpen(false)}
        title="Export All Releases to GitOps"
        busy={migrating}
        width={896}
        footer={
          <>
            <ButlerButton
              variant="secondary"
              onClick={() => setMigrateOpen(false)}
              disabled={migrating}
            >
              Cancel
            </ButlerButton>
            <ButlerButton
              onClick={handleMigrateAll}
              disabled={migrating || !migrateRepo || migrateSelected.size === 0}
            >
              {migrating
                ? `Exporting ${migrateSelected.size} releases...`
                : migrateCreatePR
                ? `Create PR with ${migrateSelected.size} releases`
                : `Export ${migrateSelected.size} releases`}
            </ButlerButton>
          </>
        }
      >
        <div className={classes.dialogStack}>
          <div className={classes.sectionHead}>
            <p className={classes.dialogText}>
              <span className={classes.dialogStrong}>
                {migrateSelected.size}
              </span>{' '}
              of{' '}
              <span className={classes.dialogStrong}>{allReleases.length}</span>{' '}
              releases selected
            </p>
            <div className={classes.actions}>
              <ButlerLinkButton
                onClick={() =>
                  setMigrateSelected(
                    new Set(allReleases.map(r => `${r.namespace}/${r.name}`)),
                  )
                }
              >
                Select All
              </ButlerLinkButton>
              <ButlerLinkButton
                tone="muted"
                onClick={() => setMigrateSelected(new Set())}
              >
                Select None
              </ButlerLinkButton>
            </div>
          </div>

          <div className={classes.dialogRow}>
            {repositoryField('Target Repository', migrateRepo, setMigrateRepo)}
            <ButlerInput
              label="Branch"
              value={migrateBranch}
              onChange={event => setMigrateBranch(event.target.value)}
            />
          </div>

          <ButlerInput
            label="Base Path"
            value={migrateBasePath}
            help={`Releases organized as: ${migrateBasePath}/infrastructure/[addon] and ${migrateBasePath}/apps/[addon]`}
            onChange={event => setMigrateBasePath(event.target.value)}
          />

          <ButlerCheckbox
            label="Create Pull Request"
            checked={migrateCreatePR}
            onChange={event => setMigrateCreatePR(event.target.checked)}
          />

          <div
            className={classes.selectionList}
            role="group"
            aria-label="Select releases to export"
          >
            {allReleases.map(release => {
              const key = `${release.namespace}/${release.name}`;
              const selected = migrateSelected.has(key);
              return (
                <div
                  key={key}
                  className={clsx(
                    classes.selectionItem,
                    selected && classes.selectionItemActive,
                  )}
                >
                  <ButlerCheckbox
                    label={
                      <span className={classes.chipRow}>
                        {release.name}
                        {release.platform && (
                          <span className={classes.platformTag}>Platform</span>
                        )}
                        {release.category && (
                          <ButlerChip>
                            {getCategoryLabel(release.category)}
                          </ButlerChip>
                        )}
                      </span>
                    }
                    checked={selected}
                    onChange={() => {
                      const next = new Set(migrateSelected);
                      if (next.has(key)) {
                        next.delete(key);
                      } else {
                        next.add(key);
                      }
                      setMigrateSelected(next);
                    }}
                  />
                  <p className={classes.selectionMeta}>
                    {release.namespace} &bull; {release.chart}:
                    {release.chartVersion}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </ButlerDialog>
    </ButlerStack>
  );
};

// ---------------------------------------------------------------------------
// Terminal
// ---------------------------------------------------------------------------

const ManagementTerminalTab = () => {
  const classes = useStyles();
  const discoveryApi = useApi(discoveryApiRef);
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const connect = useCallback(async () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (terminalInstance.current) {
      terminalInstance.current.dispose();
      terminalInstance.current = null;
    }

    if (!terminalRef.current) return;

    setStatus('connecting');
    setErrorMsg(null);

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily:
        '"Cascadia Code", "Fira Code", "JetBrains Mono", Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#0a0a0a',
        foreground: '#e4e4e7',
        cursor: '#e4e4e7',
        selectionBackground: '#3f3f46',
        black: '#09090b',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#e4e4e7',
        brightBlack: '#52525b',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#fafafa',
      },
      scrollback: 5000,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);

    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
      } catch {
        // Fit may fail if the terminal is not visible.
      }
    });

    terminalInstance.current = term;
    fitAddonRef.current = fitAddon;

    term.writeln('Connecting to management cluster terminal...');
    term.writeln('');

    try {
      const baseUrl = await discoveryApi.getBaseUrl('butler');
      const ws = new WebSocket(
        buildButlerWsUrl(baseUrl, '/ws/terminal/management'),
      );
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('connected');
        term.writeln('\x1b[32mConnected.\x1b[0m');
        term.writeln('');

        const dimensions = fitAddon.proposeDimensions();
        if (dimensions) {
          ws.send(
            JSON.stringify({
              type: 'resize',
              cols: dimensions.cols,
              rows: dimensions.rows,
            }),
          );
        }
      };

      ws.onmessage = (event: MessageEvent) => {
        if (typeof event.data === 'string') {
          term.write(event.data);
        } else if (event.data instanceof Blob) {
          event.data.text().then(text => term.write(text));
        }
      };

      ws.onerror = () => {
        setStatus('error');
        setErrorMsg(
          'WebSocket connection error. Please check your network and try again.',
        );
        term.writeln('\x1b[31mConnection error.\x1b[0m');
      };

      ws.onclose = (event: CloseEvent) => {
        setStatus('disconnected');
        term.writeln('');
        term.writeln(
          event.code !== 1000
            ? `\x1b[33mConnection closed (code: ${event.code}).\x1b[0m`
            : '\x1b[33mSession ended.\x1b[0m',
        );
      };

      term.onData((data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'data', data }));
        }
      });

      term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols, rows }));
        }
      });
    } catch (e) {
      setStatus('error');
      const message =
        e instanceof Error ? e.message : 'Failed to establish connection';
      setErrorMsg(message);
      term.writeln(`\x1b[31mFailed to connect: ${message}\x1b[0m`);
    }
  }, [discoveryApi]);

  useEffect(() => {
    const handleResize = () => {
      try {
        fitAddonRef.current?.fit();
      } catch {
        // Fit may fail if the terminal is not visible.
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (terminalInstance.current) {
        terminalInstance.current.dispose();
        terminalInstance.current = null;
      }
    };
  }, [connect]);

  const dotClass =
    status === 'connected'
      ? classes.dotConnected
      : status === 'connecting'
      ? classes.dotConnecting
      : status === 'error'
      ? classes.dotError
      : classes.dotDisconnected;

  const statusLabel =
    status === 'connected'
      ? 'Connected'
      : status === 'connecting'
      ? 'Connecting...'
      : status === 'error'
      ? errorMsg || 'Error'
      : 'Disconnected';

  return (
    <ButlerCard flush className={classes.terminalCard}>
      <div className={classes.terminalBar}>
        <div className={classes.terminalStatus}>
          <span className={clsx(classes.dot, dotClass)} aria-hidden />
          <span
            className={classes.terminalLabel}
            role="status"
            title={statusLabel}
          >
            {statusLabel}
          </span>
          <span className={classes.terminalSeparator} aria-hidden>
            |
          </span>
          <span className={classes.terminalName}>management</span>
        </div>
        {status !== 'connected' && (
          <button
            type="button"
            className={classes.terminalReconnect}
            onClick={connect}
            disabled={status === 'connecting'}
          >
            Reconnect
          </button>
        )}
      </div>
      <div ref={terminalRef} className={classes.terminalSurface} />
    </ButlerCard>
  );
};
