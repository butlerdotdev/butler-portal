// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  useParams,
  useNavigate,
  useSearchParams,
  Link as RouterLink,
} from 'react-router-dom';
import { useApi, alertApiRef } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';
import { butlerApiRef } from '../../api/ButlerApi';
import { useButlerResource } from '../../hooks/useButlerResource';
import type {
  Cluster,
  Node,
  ClusterEvent,
  UpdateClusterRequest,
} from '../../api/types/clusters';
import type {
  MachineRequest,
  LoadBalancerRequest,
} from '../../api/types/machines';
import { useClusterWatch } from '../../hooks/useClusterWatch';
import { useTeamContext } from '../../hooks/useTeamContext';
import { useTeamEnvironments } from '../../hooks/useTeamEnvironments';
import { AddonsTab } from './AddonsTab';
import { ObservabilityTab } from './observability/ObservabilityTab';
import { GitOpsTab } from './GitOpsTab';
import { CertificatesTab } from './CertificatesTab';
import { TerminalTab } from './TerminalTab';
import { useButlerRoutes } from '../../hooks/useButlerRoutes';
import { ControlPlaneTab } from './ControlPlaneTab';
import { MachineRequestsCard } from './MachineRequestsCard';
import { LoadBalancerRequestsCard } from './LoadBalancerRequestsCard';
import { InfrastructureOverrideCard } from './InfrastructureOverrideCard';
import { NetworkAllocationsCard } from './NetworkAllocationsCard';
import { DeleteClusterDialog } from './DeleteClusterDialog';
import { EditClusterDialog } from './EditClusterDialog';
import { ScaleWorkersDialog } from './ScaleWorkersDialog';
import { ChangeEnvironmentDialog } from './ChangeEnvironmentDialog';
import { ControlPlaneResourcesCard } from './ControlPlaneResourcesCard';
import { butlerTokens, rgb } from '../../theme';
import {
  ButlerBanner,
  ButlerButton,
  ButlerCard,
  ButlerChip,
  ButlerEmptyState,
  ButlerGrid,
  ButlerKeyValueList,
  ButlerKeyValueRow,
  ButlerLoading,
  ButlerPageHeader,
  ButlerStack,
  ButlerStatusBadge,
  ButlerTable,
  ButlerTabPanel,
  ButlerTabs,
  DownloadIcon,
  SpinnerIcon,
  TerminalIcon,
} from '../ui';
import type { ButlerColumn, ButlerTabItem } from '../ui';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  return {
    '@keyframes butlerSpin': { to: { transform: 'rotate(360deg)' } },
    converging: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      color: rgb(t.palette.amber[400]),
    },
    spin: { animation: '$butlerSpin 1s linear infinite' },
    conditionMessage: {
      margin: '4px 0 0',
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.muted,
      textAlign: 'right',
    },
    conditionValue: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      gap: 4,
    },
    conditionBadges: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
    },
    truncate: {
      display: 'block',
      maxWidth: 448,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    toggle: {
      appearance: 'none',
      position: 'relative',
      width: 36,
      height: 20,
      borderRadius: 9999,
      border: 'none',
      backgroundColor: rgb(t.palette.neutral[700]),
      cursor: 'pointer',
      transition: 'background-color 150ms',
      '&::after': {
        content: '""',
        position: 'absolute',
        top: 2,
        left: 2,
        width: 16,
        height: 16,
        borderRadius: '50%',
        backgroundColor: '#fff',
        transition: 'transform 150ms',
      },
      '&[aria-checked="true"]': { backgroundColor: rgb(t.palette.green[600]) },
      '&[aria-checked="true"]::after': { transform: 'translateX(16px)' },
      '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
      '&:focus-visible': {
        outline: 'none',
        boxShadow: `0 0 0 2px ${t.surface}, 0 0 0 4px ${t.accent}`,
      },
    },
  };
});

// Console tab order. Observability is not ported yet.
const TABS = [
  'overview',
  'control-plane',
  'nodes',
  'addons',
  'gitops',
  'events',
  'certificates',
  'observability',
  'terminal',
] as const;
type TabType = (typeof TABS)[number];

const TAB_LABELS: Record<TabType, string> = {
  overview: 'Overview',
  'control-plane': 'Control Plane',
  nodes: 'Nodes',
  addons: 'Addons',
  gitops: 'GitOps',
  events: 'Events',
  certificates: 'Certificates',
  observability: 'Observability',
  terminal: 'Terminal',
};

function isValidTab(tab: string | null): tab is TabType {
  return tab !== null && (TABS as readonly string[]).includes(tab);
}

const CLUSTER_POLL_MS = 5000;

// Mirrors the console: keep polling while the cluster is still converging.
export function clusterPollInterval(
  cluster: Cluster | undefined,
): number | null {
  // Mirrors the console rule: poll only while the status block says the
  // cluster is still converging. A missing status or missing counters is
  // not treated as converging.
  if (!cluster?.status) return null;
  const { workerNodesReady, workerNodesDesired, phase } = cluster.status;
  const workersConverging =
    workerNodesReady !== undefined &&
    workerNodesDesired !== undefined &&
    workerNodesReady !== workerNodesDesired;
  const notReady = Boolean(phase) && phase !== 'Ready';
  return workersConverging || notReady ? CLUSTER_POLL_MS : null;
}

function errorMessage(e: unknown, prefix: string): string {
  const detail = e instanceof Error ? e.message : String(e);
  return detail ? `${prefix}: ${detail}` : prefix;
}

export const ClusterDetailPage = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const routes = useButlerRoutes();
  const alertApi = useApi(alertApiRef);
  const navigate = useNavigate();
  const { namespace, name, team } = useParams<{
    namespace: string;
    name: string;
    team: string;
  }>();
  const clustersPath = routes.clusters({ team: team ?? '' });

  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab: TabType = isValidTab(tabParam) ? tabParam : 'overview';
  const setActiveTab = (tab: TabType) => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'overview') next.delete('tab');
    else next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [scaleOpen, setScaleOpen] = useState(false);
  const [envOpen, setEnvOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [togglingWorkspaces, setTogglingWorkspaces] = useState(false);

  // Nodes state
  const [nodes, setNodes] = useState<Node[]>([]);
  const [nodesLoading, setNodesLoading] = useState(false);
  const [nodesLoaded, setNodesLoaded] = useState(false);

  // Events state
  const [events, setEvents] = useState<ClusterEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsLoaded, setEventsLoaded] = useState(false);

  const clusterState = useButlerResource<Cluster>(
    () => {
      if (!namespace || !name) {
        return Promise.reject(
          new Error('Cluster namespace and name are required'),
        );
      }
      return api.getCluster(namespace, name);
    },
    {
      deps: [api, namespace, name],
      enabled: Boolean(namespace && name),
      pollIntervalMs: clusterPollInterval,
    },
  );
  const loadedCluster =
    clusterState.status === 'loading' ? undefined : clusterState.data;
  const refreshError =
    clusterState.status === 'error' && clusterState.data
      ? clusterState.error
      : undefined;
  // A failed poll or refresh keeps the last good cluster on screen, so the
  // error is surfaced as a toast instead of replacing the page.
  useEffect(() => {
    if (refreshError) {
      alertApi.post({
        message: errorMessage(refreshError, 'Failed to refresh cluster'),
        severity: 'error',
      });
    }
  }, [alertApi, refreshError]);

  // Provisioning state (Overview tab only)
  const [machineRequests, setMachineRequests] = useState<MachineRequest[]>([]);
  const [loadBalancerRequests, setLoadBalancerRequests] = useState<
    LoadBalancerRequest[]
  >([]);
  const [provisioningLoaded, setProvisioningLoaded] = useState(false);

  const fetchProvisioning = useCallback(async () => {
    if (!namespace || !name) return;
    const [machines, lbs] = await Promise.allSettled([
      api.getClusterMachineRequests(namespace, name),
      api.getClusterLoadBalancerRequests(namespace, name),
    ]);
    if (machines.status === 'fulfilled') {
      setMachineRequests(machines.value.machineRequests ?? []);
    } else {
      alertApi.post({
        message: `Failed to load machine requests: ${String(
          machines.reason instanceof Error
            ? machines.reason.message
            : machines.reason,
        )}`,
        severity: 'error',
      });
    }
    if (lbs.status === 'fulfilled') {
      setLoadBalancerRequests(lbs.value.loadBalancerRequests ?? []);
    } else {
      alertApi.post({
        message: `Failed to load load balancer requests: ${String(
          lbs.reason instanceof Error ? lbs.reason.message : lbs.reason,
        )}`,
        severity: 'error',
      });
    }
    setProvisioningLoaded(true);
  }, [api, alertApi, namespace, name]);

  useEffect(() => {
    if (activeTab === 'overview' && loadedCluster && !provisioningLoaded) {
      fetchProvisioning();
    }
  }, [activeTab, loadedCluster, provisioningLoaded, fetchProvisioning]);

  const handleExportYAML = async () => {
    if (!namespace || !name) return;
    setExporting(true);
    try {
      const yaml = await api.exportClusterYAML(namespace, name);
      const blob = new Blob([yaml], { type: 'application/x-yaml' });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${name}.yaml`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alertApi.post({
        message: `Failed to export YAML: ${
          e instanceof Error ? e.message : String(e)
        }`,
        severity: 'error',
      });
    } finally {
      setExporting(false);
    }
  };

  // The toggle endpoint returns the updated cluster; show it until the next
  // poll or refresh delivers a fresh server copy (tracked by object identity).
  const [clusterOverride, setClusterOverride] = useState<
    { base: Cluster | undefined; value: Cluster } | undefined
  >();
  const effectiveCluster =
    clusterOverride && clusterOverride.base === loadedCluster
      ? clusterOverride.value
      : loadedCluster;

  const fetchNodes = useCallback(async () => {
    if (!namespace || !name) return;
    setNodesLoading(true);
    try {
      const result = await api.getClusterNodes(namespace, name);
      setNodes(result.nodes || []);
    } catch (e) {
      setNodes([]);
      alertApi.post({
        message: errorMessage(e, 'Failed to load nodes'),
        severity: 'error',
      });
    } finally {
      setNodesLoading(false);
      setNodesLoaded(true);
    }
  }, [api, alertApi, namespace, name]);

  const fetchEvents = useCallback(async () => {
    if (!namespace || !name) return;
    setEventsLoading(true);
    try {
      const result = await api.getClusterEvents(namespace, name);
      setEvents(result.events || []);
    } catch (e) {
      setEvents([]);
      alertApi.post({
        message: errorMessage(e, 'Failed to load events'),
        severity: 'error',
      });
    } finally {
      setEventsLoading(false);
      setEventsLoaded(true);
    }
  }, [api, alertApi, namespace, name]);

  // The server refuses cluster mutations to viewers only, so an operator
  // and a team admin keep the destructive action the console hides from
  // them. Offering it to a viewer would be a dead control.
  // The role must come from the team in the route, not the stored active
  // team, or a stale selection would gate a destructive action against the
  // wrong team.
  const { isAdmin, teams } = useTeamContext();
  const routeTeamRole = teams.find(t => t.name === team)?.role;
  const canOperate =
    isAdmin || routeTeamRole === 'admin' || routeTeamRole === 'operator';

  // The environments a cluster may move between come from its team, read
  // through the same hook the environments page uses so a newly created
  // environment is offered here and a deleted one stops being offered.
  // With none configured the move is not offered: there is nowhere to go.
  const { environments } = useTeamEnvironments(
    loadedCluster?.spec.teamRef?.name ?? team,
  );

  const { subscribe } = useClusterWatch();
  const [deletedRemotely, setDeletedRemotely] = useState(false);
  // Read through a ref so the subscription does not churn on every poll.
  const loadedClusterRef = useRef(loadedCluster);
  loadedClusterRef.current = loadedCluster;

  useEffect(
    () =>
      subscribe(event => {
        if (event.type === 'update') {
          if (
            event.cluster.metadata.name === name &&
            event.cluster.metadata.namespace === namespace
          ) {
            // A live update overrides the fetched object until the next
            // fetch replaces the base, same mechanism as the workspace toggle.
            setClusterOverride({
              base: loadedClusterRef.current,
              value: event.cluster,
            });
            setDeletedRemotely(false);
          }
        } else if (event.name === name && event.namespace === namespace) {
          setDeletedRemotely(true);
        }
      }),
    [subscribe, name, namespace],
  );

  // Lazy-load tab data
  useEffect(() => {
    if (activeTab === 'nodes' && !nodesLoaded) {
      fetchNodes();
    }
    if (activeTab === 'events' && !eventsLoaded) {
      fetchEvents();
    }
  }, [activeTab, nodesLoaded, eventsLoaded, fetchNodes, fetchEvents]);

  const handleDownloadKubeconfig = async () => {
    if (!namespace || !name) return;
    setDownloading(true);
    try {
      const result = await api.getClusterKubeconfig(namespace, name);
      const blob = new Blob([result.kubeconfig], { type: 'application/yaml' });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${name}-kubeconfig.yaml`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alertApi.post({
        message: errorMessage(e, 'Failed to download kubeconfig'),
        severity: 'error',
      });
    } finally {
      setDownloading(false);
    }
  };

  // Each of these lets the failure propagate so the dialog can show what
  // the server said, and refreshes so the page reflects the new spec.
  const handleEdit = async (request: UpdateClusterRequest) => {
    if (!namespace || !name) throw new Error('cluster is not addressable');
    const updated = await api.updateCluster(namespace, name, request);
    clusterState.refresh();
    alertApi.post({ message: `${name} updated`, severity: 'success' });
    return updated;
  };

  const handleScale = async (replicas: number) => {
    if (!namespace || !name) throw new Error('cluster is not addressable');
    const scaled = await api.scaleCluster(namespace, name, replicas);
    clusterState.refresh();
    alertApi.post({
      message: `${name} scaling to ${replicas} worker${
        replicas === 1 ? '' : 's'
      }`,
      severity: 'success',
    });
    return scaled;
  };

  const handleChangeEnvironment = async (environment: string) => {
    if (!namespace || !name) throw new Error('cluster is not addressable');
    const moved = await api.changeClusterEnvironment(
      namespace,
      name,
      environment,
    );
    clusterState.refresh();
    alertApi.post({
      message: environment
        ? `${name} moved to ${environment}`
        : `${name} environment cleared`,
      severity: 'success',
    });
    return moved;
  };

  // The dialog renders the failure inline, so this lets errors propagate.
  const handleDelete = async () => {
    if (!namespace || !name) return;
    await api.deleteCluster(namespace, name);
    alertApi.post({
      message: `Cluster ${name} has been deleted`,
      severity: 'success',
    });
    navigate(clustersPath);
  };

  const handleToggleWorkspaces = async (enabled: boolean) => {
    if (!namespace || !name) return;
    setTogglingWorkspaces(true);
    try {
      const updated = await api.toggleClusterWorkspaces(
        namespace,
        name,
        enabled,
      );
      setClusterOverride({ base: loadedCluster, value: updated });
    } catch (e) {
      alertApi.post({
        message: errorMessage(e, 'Failed to update workspaces setting'),
        severity: 'error',
      });
    } finally {
      setTogglingWorkspaces(false);
    }
  };

  if (clusterState.status === 'loading') {
    return <ButlerLoading />;
  }

  if (!effectiveCluster) {
    const error =
      clusterState.status === 'error' ? clusterState.error : undefined;
    return (
      <ButlerEmptyState
        title="Cluster not found"
        description={
          error?.message || `Cluster ${namespace}/${name} could not be loaded.`
        }
        action={
          <ButlerButton
            variant="secondary"
            component={RouterLink}
            to={clustersPath}
          >
            Back to Clusters
          </ButlerButton>
        }
      />
    );
  }

  const cluster: Cluster = effectiveCluster;
  const spec = cluster.spec;
  const status = cluster.status;
  const phase = status?.phase || 'Unknown';
  const conditions = status?.conditions || [];
  const readyCondition = conditions.find(c => c.type === 'Ready');
  const workersReady = conditions.find(c => c.type === 'WorkersReady');
  const networkReady = conditions.find(c => c.type === 'NetworkReady');
  const isDegraded = readyCondition?.reason === 'ReconcileDegraded';
  const isFailed = phase === 'Failed';
  const ready = status?.workerNodesReady;
  const desired = status?.workerNodesDesired;
  const hasStaleNodes =
    phase === 'Ready' && ready != null && desired != null && ready > desired;
  const converging = ready != null && desired != null && ready !== desired;
  const workerCount = spec.workers?.replicas ?? 0;
  const os = spec.workers?.machineTemplate?.os;
  const osVersion = os?.type === 'talos' ? os.talos?.version : os?.version;

  const nodeColumns: ButlerColumn<Node>[] = [
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
  ];

  type EventRow = ClusterEvent & { id: string };
  const eventColumns: ButlerColumn<EventRow>[] = [
    {
      id: 'type',
      header: 'Type',
      render: e => (
        <ButlerChip tone={e.type === 'Normal' ? 'blue' : 'yellow'}>
          {e.type}
        </ButlerChip>
      ),
    },
    { id: 'reason', header: 'Reason', primary: true, render: e => e.reason },
    {
      id: 'message',
      header: 'Message',
      render: e => (
        <span className={classes.truncate} title={e.message}>
          {e.message}
        </span>
      ),
    },
    { id: 'count', header: 'Count', render: e => e.count },
  ];
  const eventRows: EventRow[] = events.map((event, idx) => ({
    ...event,
    id: `${event.reason}-${idx}`,
  }));

  const tabs: ButlerTabItem<TabType>[] = TABS.map(id => ({
    id,
    label: TAB_LABELS[id],
    disabled: id === 'terminal' && phase !== 'Ready',
  }));

  const workersValue = (() => {
    if (converging) {
      return (
        <span className={classes.converging}>
          <span>
            {ready}/{desired} ready
          </span>
          <SpinnerIcon className={classes.spin} />
        </span>
      );
    }
    if (ready != null && desired != null) return `${ready}/${desired} ready`;
    return String(workerCount);
  })();

  const conditionBadge = (c: { status: string; reason?: string }) => {
    if (c.status === 'True') return 'Ready';
    if (c.status === 'False') {
      return c.reason === 'WorkersProvisioning' ? 'Provisioning' : 'Failed';
    }
    return 'Pending';
  };

  const workspacesEnabled = spec.workspaces?.enabled ?? false;

  return (
    <ButlerStack>
      {deletedRemotely && (
        <ButlerBanner
          severity="danger"
          title="This cluster was deleted"
          message="The details below are the last known state."
        />
      )}

      <ButlerPageHeader
        title={cluster.metadata.name}
        titleAdornment={<ButlerStatusBadge status={phase} />}
        subtitle={cluster.metadata.namespace}
        onBack={() => navigate(clustersPath)}
        actions={
          <>
            <ButlerButton
              variant="secondary"
              onClick={() => setActiveTab('terminal')}
              disabled={phase !== 'Ready'}
              startIcon={<TerminalIcon />}
            >
              Terminal
            </ButlerButton>
            <ButlerButton
              variant="secondary"
              onClick={handleExportYAML}
              disabled={exporting}
              startIcon={<DownloadIcon />}
            >
              {exporting ? 'Exporting...' : 'Export YAML'}
            </ButlerButton>
            <ButlerButton
              variant="secondary"
              onClick={handleDownloadKubeconfig}
              disabled={downloading || phase !== 'Ready'}
            >
              {downloading ? 'Downloading...' : 'Download Kubeconfig'}
            </ButlerButton>
            {canOperate && (
              <>
                <ButlerButton
                  variant="secondary"
                  onClick={() => setEditOpen(true)}
                  disabled={phase === 'Failed' || phase === 'Deleting'}
                >
                  Edit
                </ButlerButton>
                <ButlerButton
                  variant="secondary"
                  onClick={() => setScaleOpen(true)}
                >
                  Scale Workers
                </ButlerButton>
                {environments.length > 0 && (
                  <ButlerButton
                    variant="secondary"
                    onClick={() => setEnvOpen(true)}
                    disabled={phase === 'Deleting'}
                  >
                    Change Environment
                  </ButlerButton>
                )}
                <ButlerButton
                  variant="danger"
                  onClick={() => setDeleteOpen(true)}
                >
                  Delete
                </ButlerButton>
              </>
            )}
          </>
        }
      />

      <ButlerTabs
        tabs={tabs}
        value={activeTab}
        onChange={setActiveTab}
        idPrefix="cluster"
        aria-label="Cluster sections"
      />

      <ButlerTabPanel idPrefix="cluster" id={activeTab}>
        {activeTab === 'overview' && (
          <ButlerStack>
            {isFailed && readyCondition?.message && (
              <ButlerBanner
                severity="danger"
                title="Cluster Failed"
                message={readyCondition.message}
              />
            )}
            {isDegraded && (
              <ButlerBanner
                title="Cluster Degraded"
                message={readyCondition?.message}
              />
            )}
            {hasStaleNodes && (
              <ButlerBanner
                title="Stale Nodes Detected"
                message={`${ready} nodes reporting but only ${desired} desired. Check the Nodes tab for NotReady nodes that may need manual cleanup.`}
              />
            )}

            <ButlerGrid>
              <ButlerCard title="Specification">
                <ButlerKeyValueList>
                  <ButlerKeyValueRow label="Control Plane Version">
                    {spec.kubernetesVersion || 'Unknown'}
                  </ButlerKeyValueRow>
                  {os?.type && (
                    <ButlerKeyValueRow label="Worker OS">
                      {osVersion ? `${os.type} ${osVersion}` : os.type}
                    </ButlerKeyValueRow>
                  )}
                  <ButlerKeyValueRow label="Provider">
                    {spec.providerConfigRef?.name || 'Default'}
                  </ButlerKeyValueRow>
                  <ButlerKeyValueRow label="Team">
                    {spec.teamRef?.name || team || 'N/A'}
                  </ButlerKeyValueRow>
                  <ButlerKeyValueRow label="Workers">
                    {workersValue}
                  </ButlerKeyValueRow>
                  {spec.controlPlane?.replicas != null && (
                    <ButlerKeyValueRow label="Control Plane Replicas">
                      {spec.controlPlane.replicas}
                    </ButlerKeyValueRow>
                  )}
                  {spec.workers?.machineTemplate?.cpu != null && (
                    <ButlerKeyValueRow label="Worker CPU">
                      {spec.workers.machineTemplate.cpu} cores
                    </ButlerKeyValueRow>
                  )}
                  {spec.workers?.machineTemplate?.memory && (
                    <ButlerKeyValueRow label="Worker Memory">
                      {spec.workers.machineTemplate.memory}
                    </ButlerKeyValueRow>
                  )}
                  {spec.workers?.machineTemplate?.diskSize && (
                    <ButlerKeyValueRow label="Worker Disk">
                      {spec.workers.machineTemplate.diskSize}
                    </ButlerKeyValueRow>
                  )}
                </ButlerKeyValueList>
              </ButlerCard>

              <ButlerCard title="Status">
                <ButlerKeyValueList>
                  <ButlerKeyValueRow label="Phase">
                    <ButlerStatusBadge status={phase} />
                  </ButlerKeyValueRow>
                  <ButlerKeyValueRow label="Tenant Namespace">
                    {status?.tenantNamespace || 'N/A'}
                  </ButlerKeyValueRow>
                  <ButlerKeyValueRow label="Control Plane Ready">
                    {phase === 'Ready' ? 'Yes' : 'No'}
                  </ButlerKeyValueRow>
                  {workersReady && (
                    <ButlerKeyValueRow label="Workers Ready">
                      <ButlerStatusBadge
                        status={
                          workersReady.status === 'True' || phase === 'Ready'
                            ? 'Ready'
                            : workersReady.reason === 'WorkersProvisioning'
                            ? 'Provisioning'
                            : 'Pending'
                        }
                      />
                    </ButlerKeyValueRow>
                  )}
                  {networkReady && (
                    <ButlerKeyValueRow label="Network Ready">
                      <ButlerStatusBadge
                        status={
                          networkReady.status === 'True'
                            ? 'Ready'
                            : networkReady.status === 'False'
                            ? 'Failed'
                            : 'Pending'
                        }
                      />
                    </ButlerKeyValueRow>
                  )}
                </ButlerKeyValueList>
              </ButlerCard>
            </ButlerGrid>

            {conditions.length > 0 && (
              <ButlerCard title="Conditions">
                <ButlerKeyValueList>
                  {conditions.map(condition => (
                    <ButlerKeyValueRow
                      key={condition.type}
                      label={condition.type}
                    >
                      <span className={classes.conditionValue}>
                        <span className={classes.conditionBadges}>
                          {condition.reason && condition.status !== 'True' && (
                            <ButlerChip tone="neutral">
                              {condition.reason}
                            </ButlerChip>
                          )}
                          <ButlerStatusBadge
                            status={conditionBadge(condition)}
                          />
                        </span>
                        {condition.message && (
                          <span className={classes.conditionMessage}>
                            {condition.message}
                          </span>
                        )}
                      </span>
                    </ButlerKeyValueRow>
                  ))}
                </ButlerKeyValueList>
              </ButlerCard>
            )}

            <ControlPlaneResourcesCard
              resources={spec.controlPlane?.resources}
            />

            {spec.networking?.loadBalancerPool && (
              <ButlerCard title="Networking">
                <ButlerKeyValueList>
                  <ButlerKeyValueRow label="Load Balancer IP Range" mono>
                    {spec.networking.loadBalancerPool.start} -{' '}
                    {spec.networking.loadBalancerPool.end}
                  </ButlerKeyValueRow>
                </ButlerKeyValueList>
              </ButlerCard>
            )}

            <MachineRequestsCard machineRequests={machineRequests} />
            <LoadBalancerRequestsCard
              loadBalancerRequests={loadBalancerRequests}
            />
            <InfrastructureOverrideCard
              override={spec.infrastructureOverride}
            />

            <NetworkAllocationsCard
              clusterName={cluster.metadata.name}
              clusterNamespace={cluster.metadata.namespace}
            />

            <ButlerCard
              title="Cloud Workspaces"
              titleAction={
                <button
                  type="button"
                  role="switch"
                  aria-checked={workspacesEnabled}
                  aria-label="Enable cloud workspaces"
                  className={classes.toggle}
                  disabled={togglingWorkspaces}
                  onClick={() => handleToggleWorkspaces(!workspacesEnabled)}
                />
              }
            >
              <ButlerKeyValueList>
                <ButlerKeyValueRow label="Enabled">
                  {workspacesEnabled ? 'Yes' : 'No'}
                </ButlerKeyValueRow>
              </ButlerKeyValueList>
            </ButlerCard>
          </ButlerStack>
        )}

        {activeTab === 'control-plane' && namespace && name && (
          <ControlPlaneTab clusterNamespace={namespace} clusterName={name} />
        )}

        {activeTab === 'nodes' &&
          (nodesLoading ? (
            <ButlerLoading />
          ) : nodes.length === 0 ? (
            <ButlerEmptyState
              title="No nodes available"
              description="Nodes appear once the cluster is provisioned and workers are ready."
            />
          ) : (
            <ButlerTable
              columns={nodeColumns}
              rows={nodes}
              rowKey={n => n.name}
              aria-label="Nodes"
            />
          ))}

        {activeTab === 'addons' && namespace && name && (
          <AddonsTab
            clusterNamespace={namespace}
            clusterName={name}
            canOperate={canOperate}
          />
        )}
        {activeTab === 'observability' && namespace && name && (
          <ObservabilityTab
            clusterNamespace={namespace}
            clusterName={name}
            canOperate={canOperate}
          />
        )}

        {activeTab === 'gitops' && namespace && name && (
          <GitOpsTab clusterNamespace={namespace} clusterName={name} />
        )}

        {activeTab === 'events' &&
          (eventsLoading ? (
            <ButlerLoading />
          ) : events.length === 0 ? (
            <ButlerEmptyState title="No events found" />
          ) : (
            <ButlerTable
              columns={eventColumns}
              rows={eventRows}
              rowKey={e => e.id}
              aria-label="Events"
            />
          ))}

        {activeTab === 'certificates' && namespace && name && (
          <CertificatesTab clusterNamespace={namespace} clusterName={name} />
        )}

        {activeTab === 'terminal' && namespace && name && phase === 'Ready' && (
          <TerminalTab clusterNamespace={namespace} clusterName={name} />
        )}
      </ButlerTabPanel>

      <EditClusterDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        cluster={cluster}
        onSave={handleEdit}
        isPlatformAdmin={isAdmin}
      />

      <ScaleWorkersDialog
        open={scaleOpen}
        onClose={() => setScaleOpen(false)}
        cluster={cluster}
        onScale={handleScale}
      />

      <ChangeEnvironmentDialog
        open={envOpen}
        onClose={() => setEnvOpen(false)}
        cluster={cluster}
        environments={environments}
        onChange={handleChangeEnvironment}
      />

      <DeleteClusterDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        clusterName={cluster.metadata.name}
        clusterNamespace={cluster.metadata.namespace}
        workerCount={workerCount}
      />
    </ButlerStack>
  );
};
