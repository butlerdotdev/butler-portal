// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Tab,
  Tabs,
  Card,
  CardContent,
  CardActionArea,
  Grid,
  makeStyles,
} from '@material-ui/core';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import AddIcon from '@material-ui/icons/Add';
import DeleteIcon from '@material-ui/icons/Delete';
import LockIcon from '@material-ui/icons/Lock';
import { Progress, EmptyState } from '@backstage/core-components';
import { usePermission } from '@backstage/plugin-permission-react';
import {
  registryProjectUpdatePermission,
  registryProjectDeletePermission,
} from '@internal/plugin-registry-common';
import { useRegistryApi } from '../../hooks/useRegistryApi';
import { useRegistryTeam } from '../../hooks/useRegistryTeam';
import { hasMinRole } from '@internal/plugin-registry-common';
import { AddModuleDialog } from '../modules/AddModuleDialog';
import type {
  Project,
  ProjectModule,
  ProjectGraph,
} from '../../api/types/projects';
import type { Environment } from '../../api/types/environments';

// ── Styles ──────────────────────────────────────────────────────────

const useStyles = makeStyles(theme => ({
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing(2),
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  actions: {
    display: 'flex',
    gap: theme.spacing(1),
  },
  section: {
    marginBottom: theme.spacing(3),
  },
  sectionTitle: {
    fontWeight: 600,
    marginBottom: theme.spacing(1),
  },
  clickableRow: {
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
  },
  tabContent: {
    marginTop: theme.spacing(2),
  },
  graphContainer: {
    width: '100%',
    overflow: 'auto',
    padding: theme.spacing(2),
  },
  graphSvg: {
    display: 'block',
    margin: '0 auto',
  },
  graphEmpty: {
    textAlign: 'center',
    padding: theme.spacing(4),
  },
  envCard: {
    height: '100%',
  },
  envCardLock: {
    fontSize: '0.9rem',
    verticalAlign: 'middle',
    marginLeft: theme.spacing(0.5),
    color: theme.palette.warning.main,
  },
  settingsSection: {
    marginBottom: theme.spacing(3),
  },
  deleteSection: {
    marginTop: theme.spacing(4),
    padding: theme.spacing(2),
    borderColor: theme.palette.error.main,
  },
}));

// ── Helpers ─────────────────────────────────────────────────────────

function statusColor(status: string): 'default' | 'primary' | 'secondary' {
  switch (status) {
    case 'active':
      return 'primary';
    case 'paused':
      return 'default';
    case 'archived':
      return 'secondary';
    default:
      return 'default';
  }
}

function moduleStatusColor(
  status: string,
): 'default' | 'primary' | 'secondary' {
  switch (status) {
    case 'active':
      return 'primary';
    case 'archived':
      return 'secondary';
    default:
      return 'default';
  }
}

function executionModeLabel(mode: string): string {
  switch (mode) {
    case 'byoc':
      return 'BYOC';
    case 'peaas':
      return 'PEaaS';
    default:
      return mode;
  }
}

// ── Graph layout ────────────────────────────────────────────────────

const NODE_WIDTH = 160;
const NODE_HEIGHT = 60;
const H_SPACING = 200;
const V_SPACING = 100;
const PADDING = 40;

interface NodePosition {
  id: string;
  x: number;
  y: number;
  name: string;
  artifactName: string;
  status: string;
}

function graphStatusFill(status: string): string {
  switch (status) {
    case 'active':
      return '#4caf50';
    case 'archived':
      return '#9e9e9e';
    default:
      return '#bdbdbd';
  }
}

function layoutProjectGraph(
  graph: ProjectGraph,
): { nodes: NodePosition[]; width: number; height: number } {
  if (graph.nodes.length === 0) {
    return { nodes: [], width: 0, height: 0 };
  }

  const incoming = new Map<string, Set<string>>();
  const outgoing = new Map<string, Set<string>>();
  for (const n of graph.nodes) {
    incoming.set(n.id, new Set());
    outgoing.set(n.id, new Set());
  }
  for (const e of graph.edges) {
    incoming.get(e.to)?.add(e.from);
    outgoing.get(e.from)?.add(e.to);
  }

  const layers = new Map<string, number>();
  const queue: string[] = [];
  const inDegree = new Map<string, number>();
  for (const n of graph.nodes) {
    const deg = incoming.get(n.id)?.size ?? 0;
    inDegree.set(n.id, deg);
    if (deg === 0) {
      queue.push(n.id);
      layers.set(n.id, 0);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentLayer = layers.get(current) ?? 0;
    for (const next of outgoing.get(current) ?? []) {
      const newDeg = (inDegree.get(next) ?? 1) - 1;
      inDegree.set(next, newDeg);
      const existingLayer = layers.get(next) ?? 0;
      layers.set(next, Math.max(existingLayer, currentLayer + 1));
      if (newDeg === 0) {
        queue.push(next);
      }
    }
  }

  for (const n of graph.nodes) {
    if (!layers.has(n.id)) {
      layers.set(n.id, 0);
    }
  }

  const layerGroups = new Map<number, string[]>();
  for (const [id, layer] of layers) {
    const group = layerGroups.get(layer) ?? [];
    group.push(id);
    layerGroups.set(layer, group);
  }

  const nodeMap = new Map(graph.nodes.map(n => [n.id, n]));
  const positions: NodePosition[] = [];
  const maxLayer = Math.max(...layerGroups.keys(), 0);

  for (let layer = 0; layer <= maxLayer; layer++) {
    const ids = layerGroups.get(layer) ?? [];
    ids.forEach((id, idx) => {
      const node = nodeMap.get(id)!;
      positions.push({
        id,
        x: PADDING + layer * H_SPACING,
        y: PADDING + idx * V_SPACING,
        name: node.name,
        artifactName: node.artifact_name,
        status: node.status,
      });
    });
  }

  const maxNodesInLayer = Math.max(
    ...Array.from(layerGroups.values()).map(g => g.length),
    1,
  );
  const width = PADDING * 2 + maxLayer * H_SPACING + NODE_WIDTH;
  const height =
    PADDING * 2 + (maxNodesInLayer - 1) * V_SPACING + NODE_HEIGHT;

  return { nodes: positions, width, height };
}

// ── Component ───────────────────────────────────────────────────────

export function ProjectDetail() {
  const classes = useStyles();
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const api = useRegistryApi();

  const [project, setProject] = useState<Project | null>(null);
  const [modules, setModules] = useState<ProjectModule[]>([]);
  const [graph, setGraph] = useState<ProjectGraph | null>(null);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);

  // Add module dialog
  const [addModuleDialogOpen, setAddModuleDialogOpen] = useState(false);

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Settings form state
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editExecutionMode, setEditExecutionMode] = useState('');
  const [saving, setSaving] = useState(false);

  // Permissions: combine Backstage permission framework with team role checks
  const { activeRole } = useRegistryTeam();
  const { allowed: permCanUpdate } = usePermission({
    permission: registryProjectUpdatePermission,
  });
  const { allowed: permCanDelete } = usePermission({
    permission: registryProjectDeletePermission,
  });
  const canUpdate = permCanUpdate && hasMinRole(activeRole, 'operator');
  const canDelete = permCanDelete && hasMinRole(activeRole, 'admin');

  const fetchData = useCallback(async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const [projectData, modulesData, graphData, envsData] =
        await Promise.all([
          api.getProject(projectId),
          api.listProjectModules(projectId),
          api.getProjectGraph(projectId),
          api.listProjectEnvironments(projectId),
        ]);
      setProject(projectData);
      setModules(modulesData.modules);
      setGraph(graphData);
      setEnvironments(envsData.items);
      setEditName(projectData.name);
      setEditDescription(projectData.description ?? '');
      setEditExecutionMode(projectData.execution_mode);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load project',
      );
    } finally {
      setLoading(false);
    }
  }, [api, projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSaveSettings = async () => {
    if (!projectId) return;
    try {
      setSaving(true);
      await api.updateProject(projectId, {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
        execution_mode: editExecutionMode as 'byoc' | 'peaas',
      });
      fetchData();
    } catch {
      // Silent
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!projectId) return;
    try {
      setDeleting(true);
      await api.deleteProject(projectId);
      navigate('../projects', { replace: true });
    } catch {
      // Silent
    } finally {
      setDeleting(false);
    }
  };

  const graphLayout = useMemo(
    () => (graph ? layoutProjectGraph(graph) : null),
    [graph],
  );

  if (loading) return <Progress />;

  if (error) {
    return (
      <EmptyState
        title="Failed to load project"
        description={error}
        missing="data"
        action={
          <Button variant="outlined" onClick={fetchData}>
            Retry
          </Button>
        }
      />
    );
  }

  if (!project) {
    return <EmptyState title="Project not found" missing="data" />;
  }

  return (
    <>
      {/* Header */}
      <Box className={classes.header}>
        <Box>
          <Box className={classes.headerLeft}>
            <IconButton size="small" onClick={() => navigate(-1)}>
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="h5">{project.name}</Typography>
            <Chip
              label={project.status}
              size="small"
              color={statusColor(project.status)}
            />
            <Chip
              label={executionModeLabel(project.execution_mode)}
              size="small"
              variant="outlined"
            />
          </Box>
          {project.description && (
            <Typography
              variant="body2"
              color="textSecondary"
              style={{ marginTop: 4 }}
            >
              {project.description}
            </Typography>
          )}
          <Typography variant="caption" color="textSecondary">
            {project.module_count} modules | {project.total_resources}{' '}
            resources
            {project.team && ` | Team: ${project.team}`}
          </Typography>
        </Box>

        <Box className={classes.actions}>
          {canUpdate && (
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => setAddModuleDialogOpen(true)}
              size="small"
            >
              Add Module
            </Button>
          )}
        </Box>
      </Box>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={(_e, val) => setActiveTab(val)}
        indicatorColor="primary"
        textColor="primary"
      >
        <Tab label="Modules" />
        <Tab label="Environments" />
        <Tab label="Settings" />
      </Tabs>

      <Box className={classes.tabContent}>
        {/* ── Modules Tab ─────────────────────────────────────────── */}
        {activeTab === 0 && (
          <>
            {/* Dependency Graph */}
            {graph && graph.nodes.length > 0 && graphLayout && (
              <Box className={classes.section}>
                <Typography
                  variant="subtitle1"
                  className={classes.sectionTitle}
                >
                  Dependency Graph
                </Typography>
                <Paper variant="outlined">
                  <Box className={classes.graphContainer}>
                    {graphLayout.nodes.length === 0 ? (
                      <Box className={classes.graphEmpty}>
                        <Typography color="textSecondary">
                          No modules to display.
                        </Typography>
                      </Box>
                    ) : (
                      <svg
                        className={classes.graphSvg}
                        width={graphLayout.width}
                        height={graphLayout.height}
                        viewBox={`0 0 ${graphLayout.width} ${graphLayout.height}`}
                      >
                        <defs>
                          <marker
                            id="project-arrowhead"
                            markerWidth="10"
                            markerHeight="7"
                            refX="10"
                            refY="3.5"
                            orient="auto"
                          >
                            <polygon
                              points="0 0, 10 3.5, 0 7"
                              fill="#666"
                            />
                          </marker>
                        </defs>

                        {/* Edges */}
                        {graph.edges.map((edge: { from: string; to: string }, i: number) => {
                          const posMap = new Map(
                            graphLayout.nodes.map(n => [n.id, n]),
                          );
                          const from = posMap.get(edge.from);
                          const to = posMap.get(edge.to);
                          if (!from || !to) return null;
                          const x1 = from.x + NODE_WIDTH;
                          const y1 = from.y + NODE_HEIGHT / 2;
                          const x2 = to.x;
                          const y2 = to.y + NODE_HEIGHT / 2;
                          return (
                            <line
                              key={i}
                              x1={x1}
                              y1={y1}
                              x2={x2}
                              y2={y2}
                              stroke="#666"
                              strokeWidth={2}
                              markerEnd="url(#project-arrowhead)"
                            />
                          );
                        })}

                        {/* Nodes */}
                        {graphLayout.nodes.map((node: NodePosition) => (
                          <g
                            key={node.id}
                            transform={`translate(${node.x},${node.y})`}
                            style={{ cursor: 'pointer' }}
                            onClick={() => navigate(`modules/${node.id}`)}
                          >
                            <rect
                              width={NODE_WIDTH}
                              height={NODE_HEIGHT}
                              rx={6}
                              fill="#fff"
                              stroke="#ccc"
                              strokeWidth={2}
                            />
                            <rect
                              width={6}
                              height={NODE_HEIGHT}
                              rx={3}
                              fill={graphStatusFill(node.status)}
                            />
                            <text
                              x={16}
                              y={24}
                              fontSize={13}
                              fontWeight={600}
                              fill="#333"
                            >
                              {node.name.length > 16
                                ? `${node.name.slice(0, 15)}...`
                                : node.name}
                            </text>
                            <text x={16} y={42} fontSize={10} fill="#888">
                              {node.artifactName}
                            </text>
                          </g>
                        ))}
                      </svg>
                    )}
                  </Box>
                </Paper>
              </Box>
            )}

            {/* Module Table */}
            <Box className={classes.section}>
              <Typography
                variant="subtitle1"
                className={classes.sectionTitle}
              >
                Modules ({modules.length})
              </Typography>
              {modules.length === 0 ? (
                <EmptyState
                  title="No modules"
                  description="Add a module from the registry to start building this project."
                  missing="data"
                  action={
                    canUpdate ? (
                      <Button
                        variant="contained"
                        color="primary"
                        startIcon={<AddIcon />}
                        onClick={() => setAddModuleDialogOpen(true)}
                      >
                        Add Module
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Name</TableCell>
                        <TableCell>Artifact</TableCell>
                        <TableCell>Version</TableCell>
                        <TableCell>Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {modules.map(mod => (
                        <TableRow
                          key={mod.id}
                          className={classes.clickableRow}
                          onClick={() => navigate(`modules/${mod.id}`)}
                        >
                          <TableCell>
                            <Typography variant="body2">
                              {mod.name}
                            </Typography>
                            {mod.description && (
                              <Typography
                                variant="caption"
                                color="textSecondary"
                              >
                                {mod.description}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell>
                            {mod.artifact_namespace}/{mod.artifact_name}
                          </TableCell>
                          <TableCell>
                            {mod.pinned_version || (
                              <Chip label="latest" size="small" />
                            )}
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={mod.status}
                              size="small"
                              color={moduleStatusColor(mod.status)}
                              variant="outlined"
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>
          </>
        )}

        {/* ── Environments Tab ────────────────────────────────────── */}
        {activeTab === 1 && (
          <Box className={classes.section}>
            <Box
              display="flex"
              justifyContent="space-between"
              alignItems="center"
              mb={2}
            >
              <Typography
                variant="subtitle1"
                className={classes.sectionTitle}
              >
                Environments ({environments.length})
              </Typography>
              {canUpdate && (
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<AddIcon />}
                  onClick={() =>
                    navigate(`environments/create`)
                  }
                  size="small"
                >
                  Add Environment
                </Button>
              )}
            </Box>
            {environments.length === 0 ? (
              <EmptyState
                title="No environments"
                description="Create an environment to deploy this project's modules."
                missing="data"
                action={
                  canUpdate ? (
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={() =>
                        navigate(
                          `environments/create`,
                        )
                      }
                    >
                      Add Environment
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <Grid container spacing={2}>
                {environments.map(env => (
                  <Grid item xs={12} sm={6} md={4} key={env.id}>
                    <Card variant="outlined" className={classes.envCard}>
                      <CardActionArea
                        onClick={() =>
                          navigate(`environments/${env.id}`)
                        }
                      >
                        <CardContent>
                          <Box
                            display="flex"
                            justifyContent="space-between"
                            alignItems="center"
                          >
                            <Typography variant="subtitle2">
                              {env.name}
                              {env.locked && (
                                <LockIcon className={classes.envCardLock} />
                              )}
                            </Typography>
                            <Chip
                              label={env.status}
                              size="small"
                              color={statusColor(env.status)}
                            />
                          </Box>
                          {env.description && (
                            <Typography
                              variant="caption"
                              color="textSecondary"
                              display="block"
                              style={{ marginTop: 4 }}
                            >
                              {env.description}
                            </Typography>
                          )}
                          <Box mt={1}>
                            <Typography
                              variant="caption"
                              color="textSecondary"
                            >
                              {env.total_resources} resources
                            </Typography>
                            {env.last_run_at && (
                              <Typography
                                variant="caption"
                                color="textSecondary"
                                display="block"
                              >
                                Last run:{' '}
                                {new Date(env.last_run_at).toLocaleDateString()}
                              </Typography>
                            )}
                          </Box>
                        </CardContent>
                      </CardActionArea>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            )}
          </Box>
        )}

        {/* ── Settings Tab ────────────────────────────────────────── */}
        {activeTab === 2 && (
          <Box className={classes.section}>
            <Typography
              variant="subtitle1"
              className={classes.sectionTitle}
            >
              Project Settings
            </Typography>
            <Paper variant="outlined" style={{ padding: 16 }}>
              <Box className={classes.settingsSection}>
                <TextField
                  fullWidth
                  variant="outlined"
                  label="Project Name"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  margin="normal"
                  size="small"
                  disabled={!canUpdate}
                />
                <TextField
                  fullWidth
                  variant="outlined"
                  label="Description"
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  margin="normal"
                  size="small"
                  multiline
                  rows={3}
                  disabled={!canUpdate}
                />
                <TextField
                  select
                  fullWidth
                  variant="outlined"
                  label="Execution Mode"
                  value={editExecutionMode}
                  onChange={e => setEditExecutionMode(e.target.value)}
                  margin="normal"
                  size="small"
                  disabled={!canUpdate}
                  SelectProps={{ native: true }}
                >
                  <option value="byoc">BYOC (Bring Your Own Compute)</option>
                  <option value="peaas">PEaaS (Platform-Managed)</option>
                </TextField>
                {canUpdate && (
                  <Box mt={2}>
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={handleSaveSettings}
                      disabled={saving || !editName.trim()}
                    >
                      {saving ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </Box>
                )}
              </Box>
            </Paper>

            {/* Danger Zone */}
            {canDelete && (
              <Paper
                variant="outlined"
                className={classes.deleteSection}
              >
                <Typography variant="subtitle2" color="error" gutterBottom>
                  Danger Zone
                </Typography>
                <Typography variant="body2" gutterBottom>
                  Deleting a project removes all associated modules,
                  environments, and run history. This action cannot be undone.
                </Typography>
                <Button
                  variant="outlined"
                  color="secondary"
                  startIcon={<DeleteIcon />}
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  Delete Project
                </Button>
              </Paper>
            )}
          </Box>
        )}
      </Box>

      {/* Add Module Dialog */}
      {projectId && (
        <AddModuleDialog
          open={addModuleDialogOpen}
          projectId={projectId}
          onClose={() => setAddModuleDialogOpen(false)}
          onAdded={fetchData}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Delete Project</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>
            This will permanently delete the project{' '}
            <strong>{project.name}</strong> and all of its modules,
            environments, and run history.
          </Typography>
          <Typography variant="body2" gutterBottom>
            Type the project name to confirm:
          </Typography>
          <TextField
            fullWidth
            variant="outlined"
            size="small"
            value={deleteConfirmName}
            onChange={e => setDeleteConfirmName(e.target.value)}
            placeholder={project.name}
            margin="normal"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="secondary"
            onClick={handleDelete}
            disabled={deleting || deleteConfirmName !== project.name}
          >
            {deleting ? 'Deleting...' : 'Delete Project'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
