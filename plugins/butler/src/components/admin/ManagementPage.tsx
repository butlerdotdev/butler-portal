// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useApi, discoveryApiRef } from '@backstage/core-plugin-api';
import {
  Table,
  TableColumn,
  InfoCard,
  Progress,
  EmptyState,
} from '@backstage/core-components';
import {
  Grid,
  Typography,
  Button,
  Box,
  Chip,
  Tabs,
  Tab,
  Paper,
  LinearProgress,
  Card,
  CardContent,
  CardActions,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  FormControlLabel,
  Checkbox,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import RefreshIcon from '@material-ui/icons/Refresh';
import AddIcon from '@material-ui/icons/Add';
import DeleteIcon from '@material-ui/icons/Delete';
import SearchIcon from '@material-ui/icons/Search';
import CloudUploadIcon from '@material-ui/icons/CloudUpload';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import CancelIcon from '@material-ui/icons/Cancel';
import WarningIcon from '@material-ui/icons/Warning';
import VisibilityIcon from '@material-ui/icons/Visibility';
import VisibilityOffIcon from '@material-ui/icons/VisibilityOff';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { butlerApiRef } from '../../api/ButlerApi';
import type {
  ManagementCluster,
  ManagementNode,
  ManagementPod,
} from '../../api/types/clusters';
import type {
  ManagementAddon,
  AddonDefinition,
} from '../../api/types/addons';
import type {
  GitOpsStatus,
  GitProviderConfig,
  Repository,
  DiscoveredRelease,
  DiscoveryResult,
} from '../../api/types/gitops';
import { StatusBadge } from '../StatusBadge/StatusBadge';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const useStyles = makeStyles(theme => ({
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(2),
  },
  actions: {
    display: 'flex',
    gap: theme.spacing(1),
  },
  statsGrid: {
    marginBottom: theme.spacing(3),
  },
  statCard: {
    textAlign: 'center',
    padding: theme.spacing(2),
  },
  statValue: {
    fontSize: '1.75rem',
    fontWeight: 700,
  },
  statLabel: {
    color: theme.palette.text.secondary,
    fontSize: '0.875rem',
  },
  tabContent: {
    marginTop: theme.spacing(3),
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: theme.spacing(1, 0),
    borderBottom: `1px solid ${theme.palette.divider}`,
    '&:last-child': {
      borderBottom: 'none',
    },
  },
  infoLabel: {
    fontWeight: 600,
    color: theme.palette.text.secondary,
    minWidth: 160,
  },
  namespaceBar: {
    height: 6,
    borderRadius: 3,
  },
  formField: {
    marginBottom: theme.spacing(2),
  },
  searchField: {
    marginBottom: theme.spacing(2),
  },
  addonCard: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  addonDescription: {
    color: theme.palette.text.secondary,
    marginTop: theme.spacing(1),
  },
  sectionTitle: {
    marginTop: theme.spacing(3),
    marginBottom: theme.spacing(2),
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(2),
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    padding: theme.spacing(1, 0),
    borderBottom: `1px solid ${theme.palette.divider}`,
    '&:last-child': {
      borderBottom: 'none',
    },
  },
  statusLabel: {
    fontWeight: 600,
    color: theme.palette.text.secondary,
    minWidth: 140,
  },
  statusValue: {
    color: theme.palette.text.primary,
  },
  enabledIcon: {
    color: theme.palette.success.main,
    marginRight: theme.spacing(0.5),
    fontSize: '1.2rem',
  },
  disabledIcon: {
    color: theme.palette.error.main,
    marginRight: theme.spacing(0.5),
    fontSize: '1.2rem',
  },
  releaseCard: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  releaseChips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(0.5),
    marginTop: theme.spacing(1),
  },
  // Terminal styles
  terminalContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(2),
  },
  terminalToolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  terminalStatusIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  terminalDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    display: 'inline-block',
  },
  terminalConnected: {
    backgroundColor: theme.palette.success.main,
  },
  terminalDisconnected: {
    backgroundColor: theme.palette.error.main,
  },
  terminalConnecting: {
    backgroundColor: theme.palette.warning.main,
  },
  terminalWrapper: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    overflow: 'hidden',
    backgroundColor: '#0a0a0a',
  },
  terminalElement: {
    height: 500,
    padding: theme.spacing(1),
  },
  terminalErrorBox: {
    padding: theme.spacing(2),
    border: `1px solid ${theme.palette.error.main}`,
    borderRadius: theme.shape.borderRadius,
    backgroundColor: theme.palette.error.main + '10',
  },
  warningBox: {
    padding: theme.spacing(2),
    border: `1px solid ${theme.palette.warning.main}`,
    borderRadius: theme.shape.borderRadius,
    backgroundColor: theme.palette.warning.main + '10',
    marginBottom: theme.spacing(2),
  },
  selectionList: {
    maxHeight: 300,
    overflowY: 'auto',
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
  },
  selectionItem: {
    display: 'flex',
    alignItems: 'center',
    padding: theme.spacing(1, 2),
    borderBottom: `1px solid ${theme.palette.divider}`,
    '&:last-child': {
      borderBottom: 'none',
    },
  },
  previewContent: {
    maxHeight: 250,
    overflowY: 'auto',
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    marginTop: theme.spacing(1),
  },
  previewFile: {
    padding: theme.spacing(1, 2),
    borderBottom: `1px solid ${theme.palette.divider}`,
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
  },
  previewCode: {
    padding: theme.spacing(1, 2),
    backgroundColor: theme.palette.background.default,
    fontFamily: 'monospace',
    fontSize: '0.75rem',
    overflowX: 'auto',
    whiteSpace: 'pre',
    margin: 0,
  },
  categoryChip: {
    marginRight: theme.spacing(0.5),
    marginBottom: theme.spacing(0.5),
  },
}));

// ---------------------------------------------------------------------------
// Tab labels
// ---------------------------------------------------------------------------

const TAB_LABELS = ['Overview', 'Nodes', 'Pods', 'Addons', 'GitOps', 'Terminal'];

// ---------------------------------------------------------------------------
// Types for table rows
// ---------------------------------------------------------------------------

type NodeRow = {
  id: string;
  name: string;
  status: string;
  roles: string;
  version: string;
  ip: string;
  age: string;
};

type PodRow = {
  id: string;
  name: string;
  status: string;
  ready: string;
  restarts: number;
  age: string;
};

type MgmtAddonRow = {
  id: string;
  name: string;
  addon: string;
  version: string;
  phase: string;
};

type TenantNsRow = {
  id: string;
  clusterName: string;
  sourceNamespace: string;
  tenantNamespace: string;
  phase: string;
};

// ---------------------------------------------------------------------------
// Connection status for terminal
// ---------------------------------------------------------------------------

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const ManagementPage = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);

  // Core state
  const [management, setManagement] = useState<ManagementCluster | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();
  const [activeTab, setActiveTab] = useState(0);

  // Lazy-loaded tab state
  const [nodes, setNodes] = useState<ManagementNode[]>([]);
  const [nodesLoaded, setNodesLoaded] = useState(false);
  const [pods, setPods] = useState<ManagementPod[]>([]);
  const [selectedNamespace, setSelectedNamespace] = useState('butler-system');
  const [podsLoaded, setPodsLoaded] = useState(false);
  const [managementAddons, setManagementAddons] = useState<ManagementAddon[]>([]);
  const [addonsLoaded, setAddonsLoaded] = useState(false);

  // Fetch management cluster info
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

  // Fetch nodes lazily
  const fetchNodes = useCallback(async () => {
    try {
      const data = await api.getManagementNodes();
      setNodes(data.nodes || []);
      setNodesLoaded(true);
    } catch {
      setNodes([]);
      setNodesLoaded(true);
    }
  }, [api]);

  // Fetch pods lazily
  const fetchPods = useCallback(
    async (namespace: string) => {
      try {
        const data = await api.getManagementPods(namespace);
        setPods(data.pods || []);
        setPodsLoaded(true);
      } catch {
        setPods([]);
        setPodsLoaded(true);
      }
    },
    [api],
  );

  // Fetch addons lazily
  const fetchAddons = useCallback(async () => {
    try {
      const data = await api.getManagementAddons();
      setManagementAddons(data.addons || []);
      setAddonsLoaded(true);
    } catch {
      setManagementAddons([]);
      setAddonsLoaded(true);
    }
  }, [api]);

  // Initial load
  useEffect(() => {
    fetchManagement();
  }, [fetchManagement]);

  // Lazy-load tab data
  useEffect(() => {
    if (activeTab === 1 && !nodesLoaded) {
      fetchNodes();
    } else if (activeTab === 2 && !podsLoaded) {
      fetchPods(selectedNamespace);
    } else if (activeTab === 3 && !addonsLoaded) {
      fetchAddons();
    }
  }, [activeTab, nodesLoaded, podsLoaded, addonsLoaded, fetchNodes, fetchPods, fetchAddons, selectedNamespace]);

  // Handle namespace change for pods
  const handleNamespaceChange = (namespace: string) => {
    setSelectedNamespace(namespace);
    fetchPods(namespace);
  };

  if (loading) {
    return <Progress />;
  }

  if (error) {
    return (
      <EmptyState
        title="Failed to load management cluster"
        description={error.message}
        missing="info"
        action={
          <Button variant="contained" color="primary" onClick={fetchManagement}>
            Retry
          </Button>
        }
      />
    );
  }

  if (!management) {
    return (
      <EmptyState
        title="Management cluster not found"
        description="Unable to retrieve management cluster information."
        missing="info"
      />
    );
  }

  return (
    <div>
      <Button
        startIcon={<ArrowBackIcon />}
        component={RouterLink}
        to="/butler/admin"
        style={{ textTransform: 'none', marginBottom: 16 }}
      >
        Back to Admin
      </Button>

      <div className={classes.header}>
        <Box display="flex" alignItems="center" style={{ gap: 12 }}>
          <Typography variant="h4">Management Cluster</Typography>
          <Chip label="Management" size="small" color="primary" variant="outlined" />
          <StatusBadge status={management.phase} />
        </Box>
        <div className={classes.actions}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={() => {
              fetchManagement();
              setNodesLoaded(false);
              setPodsLoaded(false);
              setAddonsLoaded(false);
            }}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <Grid container spacing={2} className={classes.statsGrid}>
        <Grid item xs={12} sm={6} md={3}>
          <Paper className={classes.statCard} variant="outlined">
            <Typography className={classes.statValue}>
              {management.nodes.ready}/{management.nodes.total}
            </Typography>
            <Typography className={classes.statLabel}>Nodes</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper className={classes.statCard} variant="outlined">
            <Typography className={classes.statValue} style={{ color: '#4caf50' }}>
              {management.tenantClusters}
            </Typography>
            <Typography className={classes.statLabel}>Tenant Clusters</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper className={classes.statCard} variant="outlined">
            <Typography className={classes.statValue}>
              {management.systemNamespaces.length}
            </Typography>
            <Typography className={classes.statLabel}>System Namespaces</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper className={classes.statCard} variant="outlined">
            <Typography className={classes.statValue}>
              {management.kubernetesVersion}
            </Typography>
            <Typography className={classes.statLabel}>Version</Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Paper variant="outlined">
        <Tabs
          value={activeTab}
          onChange={(_, newValue) => setActiveTab(newValue)}
          indicatorColor="primary"
          textColor="primary"
          variant="scrollable"
          scrollButtons="auto"
        >
          {TAB_LABELS.map(label => (
            <Tab key={label} label={label} />
          ))}
        </Tabs>
      </Paper>

      {/* Tab Content */}
      <div className={classes.tabContent}>
        {activeTab === 0 && <OverviewTab management={management} />}
        {activeTab === 1 && (
          <NodesTab
            nodes={nodes}
            loaded={nodesLoaded}
            onRefresh={fetchNodes}
          />
        )}
        {activeTab === 2 && (
          <PodsTab
            pods={pods}
            loaded={podsLoaded}
            namespaces={management.systemNamespaces}
            selectedNamespace={selectedNamespace}
            onNamespaceChange={handleNamespaceChange}
          />
        )}
        {activeTab === 3 && (
          <AddonsTab
            addons={managementAddons}
            loaded={addonsLoaded}
            onRefresh={fetchAddons}
          />
        )}
        {activeTab === 4 && <ManagementGitOpsTab />}
        {activeTab === 5 && <ManagementTerminalTab />}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Overview Tab
// ---------------------------------------------------------------------------

const OverviewTab = ({ management }: { management: ManagementCluster }) => {
  const classes = useStyles();
  const tenantNamespaces = management.tenantNamespaces || [];

  const tenantNsColumns: TableColumn<TenantNsRow>[] = [
    { title: 'Cluster', field: 'clusterName' },
    { title: 'Source Namespace', field: 'sourceNamespace' },
    {
      title: 'Tenant Namespace',
      field: 'tenantNamespace',
      render: (row: TenantNsRow) => (
        <Typography variant="body2" style={{ fontFamily: 'monospace' }}>
          {row.tenantNamespace || '-'}
        </Typography>
      ),
    },
    {
      title: 'Phase',
      field: 'phase',
      render: (row: TenantNsRow) => (
        <StatusBadge status={row.phase || 'Unknown'} />
      ),
    },
  ];

  const tenantNsData: TenantNsRow[] = tenantNamespaces.map(t => ({
    id: t.name,
    clusterName: t.name,
    sourceNamespace: t.namespace,
    tenantNamespace: t.tenantNamespace,
    phase: t.phase,
  }));

  return (
    <div>
      {/* System Namespaces */}
      <Typography variant="h6" gutterBottom>
        System Namespaces
      </Typography>
      {management.systemNamespaces && management.systemNamespaces.length > 0 ? (
        <Grid container spacing={2}>
          {management.systemNamespaces.map(ns => {
            const pct = ns.total > 0 ? (ns.running / ns.total) * 100 : 0;
            const healthy = ns.running === ns.total;
            return (
              <Grid item xs={12} sm={6} md={4} key={ns.namespace}>
                <Paper variant="outlined" style={{ padding: 16 }}>
                  <Box
                    display="flex"
                    justifyContent="space-between"
                    alignItems="center"
                    mb={1}
                  >
                    <Typography variant="body1" style={{ fontWeight: 500 }}>
                      {ns.namespace}
                    </Typography>
                    <Chip
                      label={`${ns.running}/${ns.total} pods`}
                      size="small"
                      color={healthy ? 'primary' : 'default'}
                      variant="outlined"
                    />
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={pct}
                    color={healthy ? 'primary' : 'secondary'}
                    className={classes.namespaceBar}
                  />
                </Paper>
              </Grid>
            );
          })}
        </Grid>
      ) : (
        <Typography color="textSecondary">
          No system namespace data available.
        </Typography>
      )}

      {/* Tenant Namespaces */}
      <Box mt={4}>
        <Typography variant="h6" gutterBottom>
          Tenant Namespaces
        </Typography>
        {tenantNamespaces.length === 0 ? (
          <Paper variant="outlined" style={{ padding: 32, textAlign: 'center' }}>
            <Typography color="textSecondary">No tenant clusters</Typography>
          </Paper>
        ) : (
          <Table<TenantNsRow>
            title={`Tenant Clusters (${tenantNamespaces.length})`}
            options={{
              search: false,
              paging: tenantNamespaces.length > 20,
              pageSize: 20,
              padding: 'dense',
            }}
            columns={tenantNsColumns}
            data={tenantNsData}
          />
        )}
      </Box>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Nodes Tab
// ---------------------------------------------------------------------------

const NodesTab = ({
  nodes,
  loaded,
  onRefresh,
}: {
  nodes: ManagementNode[];
  loaded: boolean;
  onRefresh: () => void;
}) => {
  if (!loaded) {
    return <Progress />;
  }

  const nodeColumns: TableColumn<NodeRow>[] = [
    { title: 'Name', field: 'name' },
    {
      title: 'Status',
      field: 'status',
      render: (row: NodeRow) => <StatusBadge status={row.status} />,
    },
    { title: 'Roles', field: 'roles' },
    { title: 'Version', field: 'version' },
    {
      title: 'IP',
      field: 'ip',
      render: (row: NodeRow) => (
        <Typography variant="body2" style={{ fontFamily: 'monospace' }}>
          {row.ip}
        </Typography>
      ),
    },
    { title: 'Age', field: 'age' },
  ];

  const nodeData: NodeRow[] = nodes.map(node => ({
    id: node.name,
    name: node.name,
    status: node.status,
    roles: node.roles.join(', ') || 'worker',
    version: node.version,
    ip: node.internalIP,
    age: node.age,
  }));

  if (nodes.length === 0) {
    return (
      <EmptyState
        title="No node information available"
        description="Unable to retrieve node data from the management cluster."
        missing="info"
        action={
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={onRefresh}>
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <div>
      <Box display="flex" justifyContent="flex-end" mb={1}>
        <Button
          variant="outlined"
          size="small"
          startIcon={<RefreshIcon />}
          onClick={onRefresh}
        >
          Refresh
        </Button>
      </Box>
      <Table<NodeRow>
        title={`Nodes (${nodes.length})`}
        options={{
          search: false,
          paging: false,
          padding: 'dense',
        }}
        columns={nodeColumns}
        data={nodeData}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Pods Tab
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
  const podColumns: TableColumn<PodRow>[] = [
    {
      title: 'Name',
      field: 'name',
      render: (row: PodRow) => (
        <Typography variant="body2" style={{ fontFamily: 'monospace' }}>
          {row.name}
        </Typography>
      ),
    },
    {
      title: 'Status',
      field: 'status',
      render: (row: PodRow) => <StatusBadge status={row.status} />,
    },
    { title: 'Ready', field: 'ready' },
    { title: 'Restarts', field: 'restarts' },
    { title: 'Age', field: 'age' },
  ];

  const podData: PodRow[] = pods.map(pod => ({
    id: pod.name,
    name: pod.name,
    status: pod.status,
    ready: pod.ready,
    restarts: pod.restarts,
    age: pod.age,
  }));

  return (
    <div>
      <Box display="flex" alignItems="center" mb={2} style={{ gap: 12 }}>
        <Typography variant="body2" color="textSecondary">
          Namespace:
        </Typography>
        <FormControl variant="outlined" size="small" style={{ minWidth: 250 }}>
          <Select
            value={selectedNamespace}
            onChange={e => onNamespaceChange(e.target.value as string)}
          >
            {namespaces.map(ns => (
              <MenuItem key={ns.namespace} value={ns.namespace}>
                {ns.namespace} ({ns.running}/{ns.total})
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {!loaded ? (
        <Progress />
      ) : pods.length === 0 ? (
        <Paper variant="outlined" style={{ padding: 32, textAlign: 'center' }}>
          <Typography color="textSecondary">
            No pods in namespace {selectedNamespace}
          </Typography>
        </Paper>
      ) : (
        <Table<PodRow>
          title={`Pods in ${selectedNamespace} (${pods.length})`}
          options={{
            search: true,
            paging: pods.length > 20,
            pageSize: 20,
            padding: 'dense',
          }}
          columns={podColumns}
          data={podData}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Addons Tab
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

  // Catalog state
  const [catalog, setCatalog] = useState<AddonDefinition[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Install dialog state
  const [installOpen, setInstallOpen] = useState(false);
  const [installAddon, setInstallAddon] = useState<AddonDefinition | null>(null);
  const [installForm, setInstallForm] = useState({ name: '', version: '' });
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | undefined>();

  // Uninstall dialog state
  const [uninstallOpen, setUninstallOpen] = useState(false);
  const [uninstallTarget, setUninstallTarget] = useState<ManagementAddon | null>(null);
  const [uninstalling, setUninstalling] = useState(false);

  // Fetch catalog
  useEffect(() => {
    const loadCatalog = async () => {
      setCatalogLoading(true);
      try {
        const res = await api.getAddonCatalog();
        setCatalog(res.addons || []);
      } catch {
        // Non-fatal
      } finally {
        setCatalogLoading(false);
      }
    };
    loadCatalog();
  }, [api]);

  // Installed addon names for filtering
  const installedAddonNames = useMemo(
    () => new Set(addons.map(a => a.addon.toLowerCase())),
    [addons],
  );

  // Categories from catalog
  const categories = useMemo(() => {
    const cats = new Set(catalog.filter(a => !a.platform).map(a => a.category));
    return Array.from(cats).sort();
  }, [catalog]);

  // Available addons (not installed, non-platform, matching filter)
  const availableAddons = useMemo(() => {
    return catalog
      .filter(a => !a.platform)
      .filter(a => !installedAddonNames.has(a.name.toLowerCase()))
      .filter(a => {
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          return (
            a.displayName.toLowerCase().includes(q) ||
            a.description.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .filter(a => selectedCategory === 'all' || a.category === selectedCategory);
  }, [catalog, installedAddonNames, searchQuery, selectedCategory]);

  // Addon table data
  const addonColumns: TableColumn<MgmtAddonRow>[] = [
    { title: 'Name', field: 'name' },
    { title: 'Addon', field: 'addon' },
    { title: 'Version', field: 'version' },
    {
      title: 'Status',
      field: 'phase',
      render: (row: MgmtAddonRow) => <StatusBadge status={row.phase} />,
    },
    {
      title: 'Actions',
      field: 'id',
      render: (row: MgmtAddonRow) => (
        <Button
          size="small"
          color="secondary"
          startIcon={<DeleteIcon />}
          onClick={() => {
            const addon = addons.find(a => a.name === row.name);
            if (addon) {
              setUninstallTarget(addon);
              setUninstallOpen(true);
            }
          }}
        >
          Uninstall
        </Button>
      ),
    },
  ];

  const addonData: MgmtAddonRow[] = addons.map(addon => ({
    id: addon.name,
    name: addon.name,
    addon: addon.addon,
    version: addon.status.installedVersion || addon.version || 'N/A',
    phase: addon.status.phase,
  }));

  // Install handler
  const handleOpenInstall = (addonDef?: AddonDefinition) => {
    if (addonDef) {
      setInstallAddon(addonDef);
      setInstallForm({
        name: '',
        version: addonDef.defaultVersion,
      });
    } else {
      setInstallAddon(null);
      setInstallForm({ name: '', version: '' });
    }
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

  // Uninstall handler
  const handleUninstall = async () => {
    if (!uninstallTarget) return;
    setUninstalling(true);
    try {
      await api.uninstallManagementAddon(uninstallTarget.name);
      setUninstallOpen(false);
      setUninstallTarget(null);
      onRefresh();
    } catch {
      // Silently handled
    } finally {
      setUninstalling(false);
    }
  };

  if (!loaded || catalogLoading) {
    return <Progress />;
  }

  return (
    <div>
      {/* Installed Addons */}
      <div className={classes.headerRow}>
        <Box display="flex" alignItems="center" style={{ gap: 8 }}>
          <Typography variant="h6">Installed Addons</Typography>
          {addons.length > 0 && (
            <Chip
              label={`${addons.length} Active`}
              size="small"
              color="primary"
              variant="outlined"
            />
          )}
        </Box>
        <div className={classes.actions}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={onRefresh}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            color="primary"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => handleOpenInstall()}
          >
            Install Addon
          </Button>
        </div>
      </div>

      {addons.length === 0 ? (
        <EmptyState
          title="No management addons installed"
          description="Install addons to extend the management cluster capabilities."
          missing="content"
          action={
            <Button
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
              onClick={() => handleOpenInstall()}
            >
              Install Addon
            </Button>
          }
        />
      ) : (
        <Table<MgmtAddonRow>
          title={`Installed Addons (${addons.length})`}
          options={{
            search: true,
            paging: addons.length > 20,
            pageSize: 20,
            padding: 'dense',
          }}
          columns={addonColumns}
          data={addonData}
        />
      )}

      {/* Available Addons from Catalog */}
      <Typography variant="h6" className={classes.sectionTitle}>
        Available Addons
        {availableAddons.length > 0 && (
          <Chip
            label={`${availableAddons.length} Available`}
            size="small"
            variant="outlined"
            style={{ marginLeft: 8 }}
          />
        )}
      </Typography>

      {/* Search and Category Filter */}
      <Box display="flex" alignItems="center" mb={2} style={{ gap: 12 }} flexWrap="wrap">
        <TextField
          variant="outlined"
          size="small"
          placeholder="Search addons..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: <SearchIcon style={{ marginRight: 8, color: '#999' }} />,
          }}
          style={{ minWidth: 250 }}
        />
        <Chip
          label="All"
          size="small"
          color={selectedCategory === 'all' ? 'primary' : 'default'}
          variant={selectedCategory === 'all' ? 'default' : 'outlined'}
          onClick={() => setSelectedCategory('all')}
          className={classes.categoryChip}
        />
        {categories.map(cat => (
          <Chip
            key={cat}
            label={cat}
            size="small"
            color={selectedCategory === cat ? 'primary' : 'default'}
            variant={selectedCategory === cat ? 'default' : 'outlined'}
            onClick={() => setSelectedCategory(cat)}
            className={classes.categoryChip}
          />
        ))}
      </Box>

      {availableAddons.length === 0 ? (
        <Paper variant="outlined" style={{ padding: 32, textAlign: 'center' }}>
          <Typography color="textSecondary">
            {searchQuery || selectedCategory !== 'all'
              ? 'No addons match your search.'
              : 'All available addons are installed.'}
          </Typography>
        </Paper>
      ) : (
        <Grid container spacing={2}>
          {availableAddons.map(addon => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={addon.name}>
              <Card className={classes.addonCard} variant="outlined">
                <CardContent>
                  <Chip
                    label={addon.category}
                    size="small"
                    variant="outlined"
                    style={{ marginBottom: 4 }}
                  />
                  <Typography variant="subtitle1" gutterBottom>
                    {addon.displayName}
                  </Typography>
                  <Typography variant="body2" className={classes.addonDescription}>
                    {addon.description}
                  </Typography>
                  <Box mt={1}>
                    <Typography variant="caption" color="textSecondary">
                      Version: {addon.defaultVersion}
                    </Typography>
                  </Box>
                  {addon.dependsOn && addon.dependsOn.length > 0 && (
                    <Box mt={0.5}>
                      <Typography variant="caption" color="textSecondary">
                        Requires: {addon.dependsOn.join(', ')}
                      </Typography>
                    </Box>
                  )}
                </CardContent>
                <CardActions>
                  <Button
                    size="small"
                    color="primary"
                    startIcon={<AddIcon />}
                    onClick={() => handleOpenInstall(addon)}
                  >
                    Install
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Install Addon Dialog */}
      <Dialog
        open={installOpen}
        onClose={() => setInstallOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Install Management Addon</DialogTitle>
        <DialogContent>
          {installError && (
            <Typography color="error" variant="body2" gutterBottom>
              {installError}
            </Typography>
          )}

          {installAddon ? (
            <>
              <Typography variant="body2" color="textSecondary" gutterBottom>
                {installAddon.description}
              </Typography>
              <TextField
                className={classes.formField}
                label="Release Name"
                helperText="Custom name for this addon installation. Defaults to the addon name."
                value={installForm.name}
                onChange={e =>
                  setInstallForm(prev => ({ ...prev, name: e.target.value }))
                }
                placeholder={installAddon.name}
                fullWidth
                margin="dense"
                variant="outlined"
                size="small"
              />
              <FormControl
                fullWidth
                margin="dense"
                variant="outlined"
                size="small"
                className={classes.formField}
              >
                <InputLabel id="install-version-label">Version</InputLabel>
                <Select
                  labelId="install-version-label"
                  label="Version"
                  value={installForm.version || installAddon.defaultVersion}
                  onChange={e =>
                    setInstallForm(prev => ({
                      ...prev,
                      version: e.target.value as string,
                    }))
                  }
                >
                  {(
                    installAddon.availableVersions || [installAddon.defaultVersion]
                  ).map(v => (
                    <MenuItem key={v} value={v}>
                      {v}
                      {v === installAddon.defaultVersion ? ' (default)' : ''}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Box mt={1}>
                <Typography variant="caption" color="textSecondary">
                  Chart: {installAddon.chartRepository}/{installAddon.chartName}
                </Typography>
              </Box>
            </>
          ) : (
            <FormControl
              fullWidth
              margin="dense"
              variant="outlined"
              size="small"
              className={classes.formField}
            >
              <InputLabel id="addon-select-label">Addon</InputLabel>
              <Select
                labelId="addon-select-label"
                label="Addon"
                value=""
                onChange={e => {
                  const found = catalog.find(a => a.name === e.target.value);
                  if (found) {
                    setInstallAddon(found);
                    setInstallForm({
                      name: '',
                      version: found.defaultVersion,
                    });
                  }
                }}
              >
                {catalog
                  .filter(a => !a.platform)
                  .filter(a => !installedAddonNames.has(a.name.toLowerCase()))
                  .map(addon => (
                    <MenuItem key={addon.name} value={addon.name}>
                      {addon.displayName || addon.name} ({addon.category})
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInstallOpen(false)} disabled={installing}>
            Cancel
          </Button>
          <Button
            onClick={handleInstall}
            color="primary"
            variant="contained"
            disabled={installing || !installAddon}
          >
            {installing ? 'Installing...' : 'Install'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Uninstall Confirmation Dialog */}
      <Dialog
        open={uninstallOpen}
        onClose={() => setUninstallOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Uninstall Management Addon</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to uninstall{' '}
            <strong>{uninstallTarget?.addon || uninstallTarget?.name}</strong> from the
            management cluster?
          </Typography>
          <Box mt={1}>
            <Typography variant="body2" color="textSecondary">
              This will remove the addon and all its associated resources from the
              management cluster. This action cannot be undone.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUninstallOpen(false)} disabled={uninstalling}>
            Cancel
          </Button>
          <Button
            onClick={handleUninstall}
            color="secondary"
            variant="contained"
            disabled={uninstalling}
          >
            {uninstalling ? 'Uninstalling...' : 'Uninstall'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

// ---------------------------------------------------------------------------
// GitOps Tab (Management)
// ---------------------------------------------------------------------------

const ManagementGitOpsTab = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);

  // State
  const [gitOpsStatus, setGitOpsStatus] = useState<GitOpsStatus | null>(null);
  const [gitConfig, setGitConfig] = useState<GitProviderConfig | null>(null);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [discovery, setDiscovery] = useState<DiscoveryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [enableOpen, setEnableOpen] = useState(false);
  const [enableProvider, setEnableProvider] = useState<'flux' | 'argocd'>('flux');
  const [enableRepo, setEnableRepo] = useState('');
  const [enableBranch, setEnableBranch] = useState('main');
  const [enablePath, setEnablePath] = useState('clusters/management');
  const [enabling, setEnabling] = useState(false);

  const [disableOpen, setDisableOpen] = useState(false);
  const [disableConfirmText, setDisableConfirmText] = useState('');
  const [disabling, setDisabling] = useState(false);

  const [exportOpen, setExportOpen] = useState(false);
  const [exportRelease, setExportRelease] = useState<DiscoveredRelease | null>(null);
  const [exportRepo, setExportRepo] = useState('');
  const [exportBranch, setExportBranch] = useState('main');
  const [exportPath, setExportPath] = useState('');
  const [exportCreatePR, setExportCreatePR] = useState(true);
  const [exportPRTitle, setExportPRTitle] = useState('');
  const [exportHelmRepoUrl, setExportHelmRepoUrl] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportPreview, setExportPreview] = useState<Record<string, string> | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const [migrateOpen, setMigrateOpen] = useState(false);
  const [migrateRepo, setMigrateRepo] = useState('');
  const [migrateBranch, setMigrateBranch] = useState('main');
  const [migrateBasePath, setMigrateBasePath] = useState('clusters/management');
  const [migrateCreatePR, setMigrateCreatePR] = useState(true);
  const [migrateSelected, setMigrateSelected] = useState<Set<string>>(new Set());
  const [migrating, setMigrating] = useState(false);

  // Load everything
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
            const repos = await api.listRepositories();
            setRepositories(repos);
          } catch {
            // Non-fatal
          }
        }
      }

      // Discover releases
      try {
        const disc = await api.discoverManagementReleases();
        setDiscovery(disc);
      } catch {
        // Non-fatal
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

  // Discover releases
  const discoverReleases = async () => {
    setDiscovering(true);
    try {
      const result = await api.discoverManagementReleases();
      setDiscovery(result);
    } catch {
      // Silently handled
    } finally {
      setDiscovering(false);
    }
  };

  // Enable GitOps
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
      // Silently handled
    } finally {
      setEnabling(false);
    }
  };

  // Disable GitOps
  const handleDisable = async () => {
    setDisabling(true);
    try {
      await api.disableManagementGitOps();
      setDisableOpen(false);
      setDisableConfirmText('');
      await loadData();
    } catch {
      // Silently handled
    } finally {
      setDisabling(false);
    }
  };

  // Open export dialog
  const handleOpenExport = (release: DiscoveredRelease) => {
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

  // Export release
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
        helmRepoUrl: !exportRelease.addonDefinition ? exportHelmRepoUrl : undefined,
      });
      setExportOpen(false);
      setExportRelease(null);
      discoverReleases();
    } catch {
      // Silently handled
    } finally {
      setExporting(false);
    }
  };

  // Preview manifests
  const togglePreview = async () => {
    if (exportPreview) {
      setExportPreview(null);
      return;
    }
    if (!exportRelease || !exportRepo) return;
    setLoadingPreview(true);
    try {
      const result = await api.previewManifests({
        addonName: exportRelease.name,
        repository: exportRepo,
        targetPath: exportPath,
        values: exportRelease.values,
      });
      setExportPreview(result);
    } catch {
      // Non-fatal
    } finally {
      setLoadingPreview(false);
    }
  };

  // Open migrate all dialog
  const handleOpenMigrateAll = () => {
    const allReleases = [
      ...(discovery?.matched || []),
      ...(discovery?.unmatched || []),
    ];
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

  // Migrate all
  const handleMigrateAll = async () => {
    setMigrating(true);
    const allReleases = [
      ...(discovery?.matched || []),
      ...(discovery?.unmatched || []),
    ];
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
      // Silently handled
    } finally {
      setMigrating(false);
    }
  };

  if (loading) {
    return <Progress />;
  }

  if (error && !gitOpsStatus && !discovery) {
    return (
      <EmptyState
        title="Failed to load GitOps status"
        description={error}
        missing="info"
        action={
          <Button variant="contained" color="primary" onClick={loadData}>
            Retry
          </Button>
        }
      />
    );
  }

  const isEnabled = gitOpsStatus?.enabled ?? false;
  const allReleases = [
    ...(discovery?.matched || []),
    ...(discovery?.unmatched || []),
  ];
  const gitopsEngine = discovery?.gitopsEngine;
  const isGitOpsInstalled = gitopsEngine?.installed ?? false;

  return (
    <div>
      {/* GitOps Status Card */}
      <div className={classes.headerRow}>
        <Typography variant="h6">GitOps Configuration</Typography>
        <div className={classes.actions}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={loadData}
          >
            Refresh
          </Button>
          {isEnabled ? (
            <Button
              variant="outlined"
              size="small"
              color="secondary"
              onClick={() => setDisableOpen(true)}
            >
              Disable GitOps
            </Button>
          ) : (
            <Button
              variant="contained"
              size="small"
              color="primary"
              onClick={() => setEnableOpen(true)}
            >
              Enable GitOps
            </Button>
          )}
        </div>
      </div>

      <InfoCard title="GitOps Engine Status" className={classes.sectionTitle}>
        <div>
          <div className={classes.statusRow}>
            <Typography className={classes.statusLabel}>Status</Typography>
            <Box display="flex" alignItems="center">
              {isEnabled ? (
                <>
                  <CheckCircleIcon className={classes.enabledIcon} />
                  <Typography className={classes.statusValue}>Enabled</Typography>
                </>
              ) : (
                <>
                  <CancelIcon className={classes.disabledIcon} />
                  <Typography className={classes.statusValue}>Disabled</Typography>
                </>
              )}
            </Box>
          </div>
          {gitOpsStatus?.provider && (
            <div className={classes.statusRow}>
              <Typography className={classes.statusLabel}>Provider</Typography>
              <Chip
                label={gitOpsStatus.provider === 'flux' ? 'Flux CD' : 'Argo CD'}
                size="small"
                variant="outlined"
              />
            </div>
          )}
          {gitOpsStatus?.version && (
            <div className={classes.statusRow}>
              <Typography className={classes.statusLabel}>Version</Typography>
              <Typography className={classes.statusValue}>
                {gitOpsStatus.version}
              </Typography>
            </div>
          )}
          {gitOpsStatus?.repository && (
            <div className={classes.statusRow}>
              <Typography className={classes.statusLabel}>Repository</Typography>
              <Typography className={classes.statusValue}>
                {gitOpsStatus.repository}
              </Typography>
            </div>
          )}
          {gitOpsStatus?.branch && (
            <div className={classes.statusRow}>
              <Typography className={classes.statusLabel}>Branch</Typography>
              <Typography className={classes.statusValue}>
                {gitOpsStatus.branch}
              </Typography>
            </div>
          )}
          {gitOpsStatus?.path && (
            <div className={classes.statusRow}>
              <Typography className={classes.statusLabel}>Path</Typography>
              <Typography className={classes.statusValue}>
                {gitOpsStatus.path}
              </Typography>
            </div>
          )}
          {gitOpsStatus?.status && (
            <div className={classes.statusRow}>
              <Typography className={classes.statusLabel}>Reconciliation</Typography>
              <StatusBadge status={gitOpsStatus.status} />
            </div>
          )}
        </div>
      </InfoCard>

      {/* Git Provider Status */}
      {gitConfig?.configured && (
        <Box mt={2}>
          <InfoCard title="Git Provider">
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Typography>
                Connected to {gitConfig.type === 'github' ? 'GitHub' : 'GitLab'}
                {gitConfig.username && ` as ${gitConfig.username}`}
                {gitConfig.organization && ` (${gitConfig.organization})`}
              </Typography>
              <Button
                variant="outlined"
                size="small"
                onClick={handleOpenMigrateAll}
                disabled={discovering || allReleases.length === 0}
              >
                Export All to GitOps
              </Button>
            </Box>
          </InfoCard>
        </Box>
      )}

      {/* Discovered Releases */}
      {isGitOpsInstalled && (
        <Box mt={3}>
          <div className={classes.headerRow}>
            <div>
              <Typography variant="h6">Discovered Releases</Typography>
              <Typography variant="body2" color="textSecondary">
                {allReleases.length} Helm releases found on the management cluster
              </Typography>
            </div>
            <Button
              variant="outlined"
              size="small"
              startIcon={<RefreshIcon />}
              onClick={discoverReleases}
              disabled={discovering}
            >
              {discovering ? 'Discovering...' : 'Refresh'}
            </Button>
          </div>

          {discovering ? (
            <Progress />
          ) : allReleases.length === 0 ? (
            <EmptyState
              title="No Helm releases found"
              description="No Helm releases were discovered on the management cluster."
              missing="content"
            />
          ) : (
            <Grid container spacing={2}>
              {allReleases.map(release => (
                <Grid
                  item
                  xs={12}
                  sm={6}
                  md={4}
                  key={`${release.namespace}/${release.name}`}
                >
                  <Card className={classes.releaseCard} variant="outlined">
                    <CardContent>
                      <Typography variant="subtitle1" gutterBottom>
                        {release.name}
                      </Typography>
                      <Typography variant="body2" color="textSecondary">
                        Namespace: {release.namespace}
                      </Typography>
                      <div className={classes.releaseChips}>
                        <Chip
                          label={release.chart}
                          size="small"
                          variant="outlined"
                        />
                        <Chip
                          label={`v${release.chartVersion}`}
                          size="small"
                          variant="outlined"
                        />
                        <StatusBadge status={release.status} />
                      </div>
                      {release.category && (
                        <Box mt={1}>
                          <Chip
                            label={release.category}
                            size="small"
                            color="primary"
                            variant="outlined"
                          />
                        </Box>
                      )}
                      {release.platform && (
                        <Box mt={0.5}>
                          <Chip
                            label="Platform"
                            size="small"
                            variant="outlined"
                            style={{ borderColor: '#9c27b0', color: '#9c27b0' }}
                          />
                        </Box>
                      )}
                      <Typography
                        variant="caption"
                        color="textSecondary"
                        component="div"
                      >
                        Revision: {release.revision}
                      </Typography>
                    </CardContent>
                    <CardActions>
                      <Button
                        size="small"
                        color="primary"
                        startIcon={<CloudUploadIcon />}
                        onClick={() => handleOpenExport(release)}
                      >
                        Export to Git
                      </Button>
                    </CardActions>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </Box>
      )}

      {/* Enable GitOps Dialog */}
      <Dialog
        open={enableOpen}
        onClose={() => setEnableOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Enable GitOps on Management Cluster</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="textSecondary" gutterBottom>
            Select a GitOps provider and configure the repository to manage the
            management cluster via Git.
          </Typography>
          <Box mt={2} display="flex" flexDirection="column" style={{ gap: 16 }}>
            <TextField
              select
              label="GitOps Provider"
              value={enableProvider}
              onChange={e =>
                setEnableProvider(e.target.value as 'flux' | 'argocd')
              }
              fullWidth
              variant="outlined"
              size="small"
            >
              <MenuItem value="flux">Flux CD</MenuItem>
              <MenuItem value="argocd">Argo CD</MenuItem>
            </TextField>
            {repositories.length > 0 ? (
              <TextField
                select
                label="Target Repository"
                value={enableRepo}
                onChange={e => setEnableRepo(e.target.value)}
                fullWidth
                variant="outlined"
                size="small"
              >
                <MenuItem value="">Select a repository...</MenuItem>
                {repositories.map(repo => (
                  <MenuItem key={repo.fullName} value={repo.fullName}>
                    {repo.fullName} {repo.private ? '(private)' : ''}
                  </MenuItem>
                ))}
              </TextField>
            ) : (
              <TextField
                label="Repository (owner/repo)"
                value={enableRepo}
                onChange={e => setEnableRepo(e.target.value)}
                placeholder="owner/repo"
                fullWidth
                variant="outlined"
                size="small"
              />
            )}
            <Box display="flex" style={{ gap: 16 }}>
              <TextField
                label="Branch"
                value={enableBranch}
                onChange={e => setEnableBranch(e.target.value)}
                fullWidth
                variant="outlined"
                size="small"
              />
              <TextField
                label="Path"
                value={enablePath}
                onChange={e => setEnablePath(e.target.value)}
                fullWidth
                variant="outlined"
                size="small"
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEnableOpen(false)} disabled={enabling}>
            Cancel
          </Button>
          <Button
            onClick={handleEnable}
            color="primary"
            variant="contained"
            disabled={enabling || !enableRepo}
          >
            {enabling ? 'Enabling...' : 'Enable'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Disable GitOps Dialog */}
      <Dialog
        open={disableOpen}
        onClose={() => setDisableOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Disable GitOps on Management Cluster</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>
            This will uninstall the GitOps engine from the{' '}
            <strong>management cluster</strong> and remove all GitOps controllers.
            Your Git repository will not be affected.
          </Typography>
          <Box className={classes.warningBox} mt={2}>
            <Box display="flex" alignItems="flex-start" style={{ gap: 8 }}>
              <WarningIcon color="error" />
              <Typography variant="body2">
                <strong>Warning:</strong> Any resources managed by the GitOps engine
                will no longer be automatically reconciled from Git. This includes
                Butler platform components if they are managed via GitOps.
              </Typography>
            </Box>
          </Box>
          <Box mt={2}>
            <Typography variant="body2" color="textSecondary" gutterBottom>
              Type <strong>management</strong> to confirm:
            </Typography>
            <TextField
              value={disableConfirmText}
              onChange={e => setDisableConfirmText(e.target.value)}
              placeholder="management"
              fullWidth
              variant="outlined"
              size="small"
              autoFocus
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDisableOpen(false)} disabled={disabling}>
            Cancel
          </Button>
          <Button
            onClick={handleDisable}
            color="secondary"
            variant="contained"
            disabled={disabling || disableConfirmText !== 'management'}
          >
            {disabling ? 'Disabling...' : 'Disable GitOps'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Export Release Dialog */}
      <Dialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Export {exportRelease?.name} to Git</DialogTitle>
        <DialogContent>
          {exportRelease && (
            <Box mb={2}>
              <Paper variant="outlined" style={{ padding: 12 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <div>
                    <Typography variant="subtitle2">{exportRelease.name}</Typography>
                    <Typography variant="caption" color="textSecondary">
                      {exportRelease.namespace} -- {exportRelease.chart}:
                      {exportRelease.chartVersion}
                    </Typography>
                  </div>
                  <Chip
                    label={exportRelease.category || 'apps'}
                    size="small"
                    variant="outlined"
                  />
                </Box>
              </Paper>
            </Box>
          )}

          {/* Helm Repo URL if unmatched */}
          {exportRelease && !exportRelease.addonDefinition && (
            <TextField
              label="Helm Repository URL"
              value={exportHelmRepoUrl}
              onChange={e => setExportHelmRepoUrl(e.target.value)}
              placeholder="https://charts.example.com"
              helperText={
                !exportHelmRepoUrl
                  ? 'Required: provide the Helm repository URL'
                  : exportRelease.repoUrl
                    ? 'Auto-detected from chart metadata'
                    : undefined
              }
              error={!exportHelmRepoUrl && !exportRelease.addonDefinition}
              fullWidth
              variant="outlined"
              size="small"
              style={{ marginBottom: 16 }}
            />
          )}

          <Box display="flex" flexDirection="column" style={{ gap: 16 }}>
            {repositories.length > 0 ? (
              <TextField
                select
                label="Target Repository"
                value={exportRepo}
                onChange={e => setExportRepo(e.target.value)}
                fullWidth
                variant="outlined"
                size="small"
              >
                <MenuItem value="">Select a repository...</MenuItem>
                {repositories.map(repo => (
                  <MenuItem key={repo.fullName} value={repo.fullName}>
                    {repo.fullName} {repo.private ? '(private)' : ''}
                  </MenuItem>
                ))}
              </TextField>
            ) : (
              <TextField
                label="Repository (owner/repo)"
                value={exportRepo}
                onChange={e => setExportRepo(e.target.value)}
                placeholder="owner/repo"
                fullWidth
                variant="outlined"
                size="small"
              />
            )}
            <Box display="flex" style={{ gap: 16 }}>
              <TextField
                label="Branch"
                value={exportBranch}
                onChange={e => setExportBranch(e.target.value)}
                fullWidth
                variant="outlined"
                size="small"
              />
              <TextField
                label="Path"
                value={exportPath}
                onChange={e => setExportPath(e.target.value)}
                fullWidth
                variant="outlined"
                size="small"
              />
            </Box>
            <FormControlLabel
              control={
                <Checkbox
                  checked={exportCreatePR}
                  onChange={e => setExportCreatePR(e.target.checked)}
                  color="primary"
                />
              }
              label="Create Pull Request"
            />
            {exportCreatePR && (
              <TextField
                label="PR Title"
                value={exportPRTitle}
                onChange={e => setExportPRTitle(e.target.value)}
                fullWidth
                variant="outlined"
                size="small"
              />
            )}
            {/* Preview button */}
            {exportRepo && (
              <Button
                size="small"
                onClick={togglePreview}
                disabled={loadingPreview}
                startIcon={
                  loadingPreview ? (
                    <CircularProgress size={16} />
                  ) : exportPreview ? (
                    <VisibilityOffIcon />
                  ) : (
                    <VisibilityIcon />
                  )
                }
                style={{ textTransform: 'none' }}
              >
                {loadingPreview
                  ? 'Loading preview...'
                  : exportPreview
                    ? 'Hide generated manifests'
                    : 'Preview generated manifests'}
              </Button>
            )}
            {/* Preview content */}
            {exportPreview && (
              <div className={classes.previewContent}>
                <Box px={2} py={1} style={{ backgroundColor: '#f5f5f5' }}>
                  <Typography variant="caption" color="textSecondary">
                    Generated Files
                  </Typography>
                </Box>
                {Object.entries(exportPreview).map(([filename, content]) => (
                  <details key={filename}>
                    <summary className={classes.previewFile}>
                      <Typography variant="body2">{filename}</Typography>
                    </summary>
                    <pre className={classes.previewCode}>{content}</pre>
                  </details>
                ))}
              </div>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExportOpen(false)} disabled={exporting}>
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            color="primary"
            variant="contained"
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
          </Button>
        </DialogActions>
      </Dialog>

      {/* Migrate All Dialog */}
      <Dialog
        open={migrateOpen}
        onClose={() => setMigrateOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Export All Releases to GitOps</DialogTitle>
        <DialogContent>
          {/* Selection summary */}
          <Box
            display="flex"
            justifyContent="space-between"
            alignItems="center"
            mb={2}
          >
            <Typography>
              <strong>{migrateSelected.size}</strong> of{' '}
              <strong>{allReleases.length}</strong> releases selected
            </Typography>
            <div>
              <Button
                size="small"
                onClick={() =>
                  setMigrateSelected(
                    new Set(allReleases.map(r => `${r.namespace}/${r.name}`)),
                  )
                }
              >
                Select All
              </Button>
              <Button size="small" onClick={() => setMigrateSelected(new Set())}>
                Select None
              </Button>
            </div>
          </Box>

          {/* Repository config */}
          <Box display="flex" flexDirection="column" style={{ gap: 16 }} mb={2}>
            <Box display="flex" style={{ gap: 16 }}>
              {repositories.length > 0 ? (
                <TextField
                  select
                  label="Target Repository"
                  value={migrateRepo}
                  onChange={e => setMigrateRepo(e.target.value)}
                  fullWidth
                  variant="outlined"
                  size="small"
                >
                  <MenuItem value="">Select a repository...</MenuItem>
                  {repositories.map(repo => (
                    <MenuItem key={repo.fullName} value={repo.fullName}>
                      {repo.fullName} {repo.private ? '(private)' : ''}
                    </MenuItem>
                  ))}
                </TextField>
              ) : (
                <TextField
                  label="Repository (owner/repo)"
                  value={migrateRepo}
                  onChange={e => setMigrateRepo(e.target.value)}
                  placeholder="owner/repo"
                  fullWidth
                  variant="outlined"
                  size="small"
                />
              )}
              <TextField
                label="Branch"
                value={migrateBranch}
                onChange={e => setMigrateBranch(e.target.value)}
                fullWidth
                variant="outlined"
                size="small"
              />
            </Box>
            <TextField
              label="Base Path"
              value={migrateBasePath}
              onChange={e => setMigrateBasePath(e.target.value)}
              helperText={`Releases organized as: ${migrateBasePath}/infrastructure/[addon] and ${migrateBasePath}/apps/[addon]`}
              fullWidth
              variant="outlined"
              size="small"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={migrateCreatePR}
                  onChange={e => setMigrateCreatePR(e.target.checked)}
                  color="primary"
                />
              }
              label="Create Pull Request"
            />
          </Box>

          {/* Release selection list */}
          <Typography variant="subtitle2" gutterBottom>
            Select Releases to Export
          </Typography>
          <div className={classes.selectionList}>
            {allReleases.map(release => {
              const key = `${release.namespace}/${release.name}`;
              const isSelected = migrateSelected.has(key);
              return (
                <div
                  key={key}
                  className={classes.selectionItem}
                  style={{
                    backgroundColor: isSelected ? 'rgba(63, 81, 181, 0.04)' : undefined,
                  }}
                >
                  <Checkbox
                    checked={isSelected}
                    onChange={() => {
                      const newSelected = new Set(migrateSelected);
                      if (newSelected.has(key)) {
                        newSelected.delete(key);
                      } else {
                        newSelected.add(key);
                      }
                      setMigrateSelected(newSelected);
                    }}
                    color="primary"
                    size="small"
                  />
                  <Box flex={1} ml={1}>
                    <Box display="flex" alignItems="center" style={{ gap: 8 }}>
                      <Typography variant="body2" style={{ fontWeight: 500 }}>
                        {release.name}
                      </Typography>
                      {release.platform && (
                        <Chip
                          label="Platform"
                          size="small"
                          variant="outlined"
                          style={{
                            borderColor: '#9c27b0',
                            color: '#9c27b0',
                            height: 20,
                            fontSize: '0.7rem',
                          }}
                        />
                      )}
                      {release.category && (
                        <Chip
                          label={release.category}
                          size="small"
                          variant="outlined"
                          style={{ height: 20, fontSize: '0.7rem' }}
                        />
                      )}
                    </Box>
                    <Typography variant="caption" color="textSecondary">
                      {release.namespace} -- {release.chart}:{release.chartVersion}
                    </Typography>
                  </Box>
                </div>
              );
            })}
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMigrateOpen(false)} disabled={migrating}>
            Cancel
          </Button>
          <Button
            onClick={handleMigrateAll}
            color="primary"
            variant="contained"
            disabled={migrating || !migrateRepo || migrateSelected.size === 0}
          >
            {migrating
              ? `Exporting ${migrateSelected.size} releases...`
              : migrateCreatePR
                ? `Create PR with ${migrateSelected.size} releases`
                : `Export ${migrateSelected.size} releases`}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Terminal Tab (Management)
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
    // Clean up existing connection
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

    // Initialize the terminal
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
        // Fit may fail if terminal is not visible
      }
    });

    terminalInstance.current = term;
    fitAddonRef.current = fitAddon;

    term.writeln('Connecting to management cluster terminal...');
    term.writeln('');

    // Build WebSocket URL - management terminal uses a different path
    try {
      const baseUrl = await discoveryApi.getBaseUrl('butler');
      const wsUrl = baseUrl
        .replace(/^http/, 'ws')
        .replace(/\/api\/butler$/, '');
      const fullWsUrl = `${wsUrl}/api/butler/ws/terminal/management`;

      const ws = new WebSocket(fullWsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('connected');
        term.writeln('\x1b[32mConnected.\x1b[0m');
        term.writeln('');

        // Send initial resize
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
        if (event.code !== 1000) {
          term.writeln('');
          term.writeln(
            `\x1b[33mConnection closed (code: ${event.code}).\x1b[0m`,
          );
        } else {
          term.writeln('');
          term.writeln('\x1b[33mSession ended.\x1b[0m');
        }
      };

      // Forward terminal input to WebSocket
      term.onData((data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'data', data }));
        }
      });

      // Handle terminal resize
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

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (fitAddonRef.current) {
        try {
          fitAddonRef.current.fit();
        } catch {
          // Fit may fail if terminal is not visible
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Connect on mount
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

  const statusClass =
    status === 'connected'
      ? classes.terminalConnected
      : status === 'connecting'
        ? classes.terminalConnecting
        : classes.terminalDisconnected;

  const statusLabel =
    status === 'connected'
      ? 'Connected'
      : status === 'connecting'
        ? 'Connecting...'
        : status === 'error'
          ? 'Error'
          : 'Disconnected';

  return (
    <div className={classes.terminalContainer}>
      <div className={classes.terminalToolbar}>
        <div className={classes.terminalStatusIndicator}>
          <span className={`${classes.terminalDot} ${statusClass}`} />
          <Typography variant="body2">{statusLabel}</Typography>
        </div>
        <Button
          variant="outlined"
          size="small"
          startIcon={<RefreshIcon />}
          onClick={connect}
          disabled={status === 'connecting'}
        >
          {status === 'connected' ? 'Reconnect' : 'Connect'}
        </Button>
      </div>

      {errorMsg && (
        <Box className={classes.terminalErrorBox}>
          <Typography variant="body2" color="error">
            {errorMsg}
          </Typography>
        </Box>
      )}

      <div className={classes.terminalWrapper}>
        <div ref={terminalRef} className={classes.terminalElement} />
      </div>
    </div>
  );
};
