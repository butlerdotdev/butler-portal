// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
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
  Tabs,
  Tab,
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import GetAppIcon from '@material-ui/icons/GetApp';
import DeleteIcon from '@material-ui/icons/Delete';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import RefreshIcon from '@material-ui/icons/Refresh';
import Switch from '@material-ui/core/Switch';
import { butlerApiRef } from '../../api/ButlerApi';
import type { Cluster, Node, ClusterEvent } from '../../api/types/clusters';
import { StatusBadge } from '../StatusBadge/StatusBadge';
import { AddonsTab } from './AddonsTab';
import { GitOpsTab } from './GitOpsTab';
import { CertificatesTab } from './CertificatesTab';
import { TerminalTab } from './TerminalTab';

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
  headerInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(0.5),
  },
  headerMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  headerActions: {
    display: 'flex',
    gap: theme.spacing(1),
  },
  tabContent: {
    paddingTop: theme.spacing(3),
  },
  conditionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    padding: theme.spacing(0.5, 0),
  },
  specLabel: {
    fontWeight: 600,
    color: theme.palette.text.secondary,
    minWidth: 160,
  },
  specValue: {
    color: theme.palette.text.primary,
  },
  specRow: {
    display: 'flex',
    padding: theme.spacing(1, 0),
    borderBottom: `1px solid ${theme.palette.divider}`,
    '&:last-child': {
      borderBottom: 'none',
    },
  },
  deleteDialogWarning: {
    color: theme.palette.error.main,
    fontWeight: 600,
    marginTop: theme.spacing(1),
  },
}));

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box>{children}</Box>}
    </div>
  );
}

type NodeRow = {
  id: string;
  name: string;
  status: string;
  roles: string;
  version: string;
  ip: string;
};

type EventRow = {
  id: string;
  type: string;
  reason: string;
  message: string;
  count: number;
  source: string;
  lastTimestamp: string;
};

export const ClusterDetailPage = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const navigate = useNavigate();
  const { namespace, name, team } = useParams<{
    namespace: string;
    name: string;
    team: string;
  }>();

  const [cluster, setCluster] = useState<Cluster | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();
  const [activeTab, setActiveTab] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [togglingWorkspaces, setTogglingWorkspaces] = useState(false);

  // Nodes state
  const [nodes, setNodes] = useState<Node[]>([]);
  const [nodesLoading, setNodesLoading] = useState(false);
  const [nodesLoaded, setNodesLoaded] = useState(false);

  // Events state
  const [events, setEvents] = useState<ClusterEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsLoaded, setEventsLoaded] = useState(false);

  const fetchCluster = useCallback(async () => {
    if (!namespace || !name) return;
    setLoading(true);
    setError(undefined);
    try {
      const result = await api.getCluster(namespace, name);
      setCluster(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [api, namespace, name]);

  const fetchNodes = useCallback(async () => {
    if (!namespace || !name) return;
    setNodesLoading(true);
    try {
      const result = await api.getClusterNodes(namespace, name);
      setNodes(result.nodes || []);
    } catch {
      setNodes([]);
    } finally {
      setNodesLoading(false);
      setNodesLoaded(true);
    }
  }, [api, namespace, name]);

  const fetchEvents = useCallback(async () => {
    if (!namespace || !name) return;
    setEventsLoading(true);
    try {
      const result = await api.getClusterEvents(namespace, name);
      setEvents(result.events || []);
    } catch {
      setEvents([]);
    } finally {
      setEventsLoading(false);
      setEventsLoaded(true);
    }
  }, [api, namespace, name]);

  useEffect(() => {
    fetchCluster();
  }, [fetchCluster]);

  // Lazy-load tab data
  useEffect(() => {
    if (activeTab === 1 && !nodesLoaded) {
      fetchNodes();
    }
    if (activeTab === 5 && !eventsLoaded) {
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
    } catch {
      // Error handled silently; could add alerting here
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async () => {
    if (!namespace || !name) return;
    setDeleting(true);
    try {
      await api.deleteCluster(namespace, name);
      setDeleteOpen(false);
      navigate(`/butler/t/${team}/clusters`);
    } catch {
      // Error handled silently
    } finally {
      setDeleting(false);
    }
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
      setCluster(updated);
    } catch {
      // Silent
    } finally {
      setTogglingWorkspaces(false);
    }
  };

  if (loading) {
    return <Progress />;
  }

  if (error || !cluster) {
    return (
      <EmptyState
        title="Cluster not found"
        description={error?.message || `Cluster ${namespace}/${name} could not be loaded.`}
        missing="info"
        action={
          <Button
            component={RouterLink}
            to={`/butler/t/${team}/clusters`}
            variant="outlined"
            startIcon={<ArrowBackIcon />}
          >
            Back to Clusters
          </Button>
        }
      />
    );
  }

  const phase = cluster.status?.phase || 'Unknown';
  const conditions = cluster.status?.conditions || [];

  // Node table columns
  const nodeColumns: TableColumn<NodeRow>[] = [
    { title: 'Name', field: 'name' },
    {
      title: 'Status',
      field: 'status',
      render: (row: NodeRow) => <StatusBadge status={row.status} />,
    },
    { title: 'Roles', field: 'roles' },
    { title: 'Version', field: 'version' },
    { title: 'IP', field: 'ip' },
  ];

  const nodeData: NodeRow[] = nodes.map(node => ({
    id: node.name,
    name: node.name,
    status: node.status,
    roles: node.roles.join(', ') || 'worker',
    version: node.version,
    ip: node.internalIP,
  }));

  // Event table columns
  const eventColumns: TableColumn<EventRow>[] = [
    {
      title: 'Type',
      field: 'type',
      render: (row: EventRow) => (
        <Chip
          label={row.type}
          size="small"
          color={row.type === 'Warning' ? 'secondary' : 'default'}
          variant="outlined"
        />
      ),
    },
    { title: 'Reason', field: 'reason' },
    { title: 'Message', field: 'message' },
    { title: 'Count', field: 'count', type: 'numeric' },
    { title: 'Source', field: 'source' },
  ];

  const eventData: EventRow[] = events.map((event, idx) => ({
    id: `${event.reason}-${idx}`,
    type: event.type,
    reason: event.reason,
    message: event.message,
    count: event.count,
    source: event.source,
    lastTimestamp: event.lastTimestamp,
  }));

  return (
    <div>
      <Button
        startIcon={<ArrowBackIcon />}
        component={RouterLink}
        to={`/butler/t/${team}/clusters`}
        style={{ textTransform: 'none', marginBottom: 16 }}
      >
        Back to Clusters
      </Button>
      {/* Header */}
      <div className={classes.header}>
        <div className={classes.headerLeft}>
          <Button
            component={RouterLink}
            to={`/butler/t/${team}/clusters`}
            size="small"
            startIcon={<ArrowBackIcon />}
          >
            Back
          </Button>
          <div className={classes.headerInfo}>
            <Typography variant="h4">{cluster.metadata.name}</Typography>
            <div className={classes.headerMeta}>
              <Typography variant="body2" color="textSecondary">
                {cluster.metadata.namespace}
              </Typography>
              <StatusBadge status={phase} />
              <Chip
                label={`v${cluster.spec.kubernetesVersion}`}
                size="small"
                variant="outlined"
              />
            </div>
          </div>
        </div>
        <div className={classes.headerActions}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={fetchCluster}
          >
            Refresh
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<GetAppIcon />}
            onClick={handleDownloadKubeconfig}
            disabled={downloading || phase !== 'Ready'}
          >
            {downloading ? 'Downloading...' : 'Kubeconfig'}
          </Button>
          <Button
            variant="outlined"
            size="small"
            color="secondary"
            startIcon={<DeleteIcon />}
            onClick={() => setDeleteOpen(true)}
          >
            Delete
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={(_, newValue) => setActiveTab(newValue)}
        indicatorColor="primary"
        textColor="primary"
        variant="scrollable"
        scrollButtons="auto"
      >
        <Tab label="Overview" />
        <Tab label="Nodes" />
        <Tab label="Addons" />
        <Tab label="GitOps" />
        <Tab label="Certificates" />
        <Tab label="Events" />
        <Tab label="Terminal" />
      </Tabs>

      <div className={classes.tabContent}>
        {/* Overview Tab */}
        <TabPanel value={activeTab} index={0}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <InfoCard title="Specification">
                <div>
                  <div className={classes.specRow}>
                    <Typography className={classes.specLabel}>
                      Kubernetes Version
                    </Typography>
                    <Typography className={classes.specValue}>
                      {cluster.spec.kubernetesVersion}
                    </Typography>
                  </div>
                  <div className={classes.specRow}>
                    <Typography className={classes.specLabel}>
                      Provider
                    </Typography>
                    <Typography className={classes.specValue}>
                      {cluster.spec.providerConfigRef?.name || 'Default'}
                    </Typography>
                  </div>
                  <div className={classes.specRow}>
                    <Typography className={classes.specLabel}>Team</Typography>
                    <Typography className={classes.specValue}>
                      {cluster.spec.teamRef?.name || team || 'N/A'}
                    </Typography>
                  </div>
                  <div className={classes.specRow}>
                    <Typography className={classes.specLabel}>
                      Worker Replicas
                    </Typography>
                    <Typography className={classes.specValue}>
                      {cluster.spec.workers?.replicas ?? 0}
                    </Typography>
                  </div>
                  {cluster.spec.workers?.machineTemplate && (
                    <>
                      <div className={classes.specRow}>
                        <Typography className={classes.specLabel}>
                          Worker CPU
                        </Typography>
                        <Typography className={classes.specValue}>
                          {cluster.spec.workers.machineTemplate.cpu || 'N/A'}
                        </Typography>
                      </div>
                      <div className={classes.specRow}>
                        <Typography className={classes.specLabel}>
                          Worker Memory
                        </Typography>
                        <Typography className={classes.specValue}>
                          {cluster.spec.workers.machineTemplate.memory || 'N/A'}
                        </Typography>
                      </div>
                      <div className={classes.specRow}>
                        <Typography className={classes.specLabel}>
                          Worker Disk
                        </Typography>
                        <Typography className={classes.specValue}>
                          {cluster.spec.workers.machineTemplate.diskSize || 'N/A'}
                        </Typography>
                      </div>
                    </>
                  )}
                  {cluster.spec.networking?.loadBalancerPool && (
                    <div className={classes.specRow}>
                      <Typography className={classes.specLabel}>
                        LB IP Range
                      </Typography>
                      <Typography className={classes.specValue}>
                        {cluster.spec.networking.loadBalancerPool.start} -{' '}
                        {cluster.spec.networking.loadBalancerPool.end}
                      </Typography>
                    </div>
                  )}
                  <div className={classes.specRow}>
                    <Typography className={classes.specLabel}>
                      Cloud Workspaces
                    </Typography>
                    <Switch
                      checked={cluster.spec.workspaces?.enabled ?? false}
                      onChange={e =>
                        handleToggleWorkspaces(e.target.checked)
                      }
                      color="primary"
                      size="small"
                      disabled={togglingWorkspaces}
                    />
                  </div>
                </div>
              </InfoCard>
            </Grid>
            <Grid item xs={12} md={6}>
              <InfoCard title="Status">
                <div>
                  <div className={classes.specRow}>
                    <Typography className={classes.specLabel}>Phase</Typography>
                    <StatusBadge status={phase} />
                  </div>
                  <div className={classes.specRow}>
                    <Typography className={classes.specLabel}>
                      Control Plane Ready
                    </Typography>
                    <Typography className={classes.specValue}>
                      {cluster.status?.controlPlaneReady ? 'Yes' : 'No'}
                    </Typography>
                  </div>
                  <div className={classes.specRow}>
                    <Typography className={classes.specLabel}>
                      Infrastructure Ready
                    </Typography>
                    <Typography className={classes.specValue}>
                      {cluster.status?.infrastructureReady ? 'Yes' : 'No'}
                    </Typography>
                  </div>
                  {cluster.status?.tenantNamespace && (
                    <div className={classes.specRow}>
                      <Typography className={classes.specLabel}>
                        Tenant Namespace
                      </Typography>
                      <Typography className={classes.specValue}>
                        {cluster.status.tenantNamespace}
                      </Typography>
                    </div>
                  )}
                </div>
              </InfoCard>
              {conditions.length > 0 && (
                <Box mt={2}>
                  <InfoCard title="Conditions">
                    <div>
                      {conditions.map((condition, idx) => (
                        <div key={idx} className={classes.conditionRow}>
                          <Chip
                            label={condition.type}
                            size="small"
                            color={
                              condition.status === 'True' ? 'primary' : 'default'
                            }
                            variant="outlined"
                          />
                          <StatusBadge
                            status={
                              condition.status === 'True'
                                ? 'Ready'
                                : condition.reason || 'Pending'
                            }
                          />
                          {condition.message && (
                            <Typography variant="caption" color="textSecondary">
                              {condition.message}
                            </Typography>
                          )}
                        </div>
                      ))}
                    </div>
                  </InfoCard>
                </Box>
              )}
            </Grid>
          </Grid>
        </TabPanel>

        {/* Nodes Tab */}
        <TabPanel value={activeTab} index={1}>
          {nodesLoading ? (
            <Progress />
          ) : nodes.length === 0 ? (
            <EmptyState
              title="No nodes found"
              description="Nodes will appear here once the cluster is provisioned and workers are ready."
              missing="content"
            />
          ) : (
            <Table<NodeRow>
              title={`Cluster Nodes (${nodes.length})`}
              options={{
                search: false,
                paging: false,
                padding: 'dense',
              }}
              columns={nodeColumns}
              data={nodeData}
            />
          )}
        </TabPanel>

        {/* Addons Tab */}
        <TabPanel value={activeTab} index={2}>
          {namespace && name && (
            <AddonsTab clusterNamespace={namespace} clusterName={name} />
          )}
        </TabPanel>

        {/* GitOps Tab */}
        <TabPanel value={activeTab} index={3}>
          {namespace && name && (
            <GitOpsTab clusterNamespace={namespace} clusterName={name} />
          )}
        </TabPanel>

        {/* Certificates Tab */}
        <TabPanel value={activeTab} index={4}>
          {namespace && name && (
            <CertificatesTab clusterNamespace={namespace} clusterName={name} />
          )}
        </TabPanel>

        {/* Events Tab */}
        <TabPanel value={activeTab} index={5}>
          {eventsLoading ? (
            <Progress />
          ) : events.length === 0 ? (
            <EmptyState
              title="No events"
              description="Cluster events will appear here as they occur."
              missing="content"
            />
          ) : (
            <Table<EventRow>
              title={`Events (${events.length})`}
              options={{
                search: true,
                paging: events.length > 20,
                pageSize: 20,
                padding: 'dense',
              }}
              columns={eventColumns}
              data={eventData}
            />
          )}
        </TabPanel>

        {/* Terminal Tab */}
        <TabPanel value={activeTab} index={6}>
          {namespace && name && (
            <TerminalTab clusterNamespace={namespace} clusterName={name} />
          )}
        </TabPanel>

      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Delete Cluster</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the cluster{' '}
            <strong>{cluster.metadata.name}</strong> in namespace{' '}
            <strong>{cluster.metadata.namespace}</strong>?
          </Typography>
          <Typography className={classes.deleteDialogWarning}>
            This action is irreversible. All workloads, data, and resources
            associated with this cluster will be permanently destroyed.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button
            onClick={handleDelete}
            color="secondary"
            variant="contained"
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete Cluster'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};
