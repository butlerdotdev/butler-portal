// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  DragEvent,
} from 'react';
import {
  Box,
  TextField,
  Button,
  Toolbar,
  Snackbar,
  Typography,
} from '@material-ui/core';
import { makeStyles, Theme, createStyles } from '@material-ui/core/styles';
import SaveIcon from '@material-ui/icons/Save';
import GetAppIcon from '@material-ui/icons/GetApp';
import PublishIcon from '@material-ui/icons/Publish';
import { Alert } from '@material-ui/lab';
import {
  ReactFlowProvider,
  ReactFlow,
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
  type OnNodesChange,
  type OnEdgesChange,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type {
  DagComponent,
  PipelineDag,
} from '../../api/types/pipelines';
import { dagToReactFlow, reactFlowToDag } from './dagTranslation';
import { compileDagToYaml } from '../../compiler/dagCompiler';
import { nodeTypes } from './nodeTypes';
import { ComponentLibrary } from './ComponentLibrary';
import { ComponentPanel } from './ComponentPanel';
import { ConfigToggle } from './ConfigToggle';
import { ImportPipelineDialog } from '../common/ImportPipelineDialog';

export interface ConfigEditorProps {
  /** Initial DAG to load into the editor. */
  initialDag?: PipelineDag;
  /** Called when the user clicks Save. */
  onSave: (dag: PipelineDag, changeSummary?: string) => Promise<void>;
  /** Called whenever the DAG changes (node/edge add/remove/move). */
  onDagChange?: (dag: PipelineDag) => void;
  /** Title shown in the toolbar (e.g. "nginx-proxy-01 config"). */
  title?: string;
  /** Show pipeline name input field. Default false. */
  showNameField?: boolean;
  /** Pipeline name state (only used when showNameField is true). */
  name?: string;
  /** Pipeline name change handler. */
  onNameChange?: (name: string) => void;
  /** Extra toolbar buttons rendered after the standard buttons. */
  toolbarActions?: React.ReactNode;
  /** Read-only mode disables editing. */
  readOnly?: boolean;
}

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    root: {
      display: 'flex',
      flexDirection: 'column',
      height: 'calc(100vh - 200px)',
      minHeight: 500,
    },
    toolbar: {
      display: 'flex',
      alignItems: 'center',
      gap: theme.spacing(1),
      padding: theme.spacing(1, 2),
      borderBottom: `1px solid ${theme.palette.divider}`,
      flexWrap: 'wrap',
    },
    nameInput: {
      minWidth: 240,
    },
    title: {
      fontWeight: 600,
      marginRight: theme.spacing(2),
    },
    mainArea: {
      display: 'flex',
      flex: 1,
      overflow: 'hidden',
    },
    canvasContainer: {
      flex: 1,
      position: 'relative',
    },
  }),
);

/**
 * Generate a meaningful component ID from the vectorType (e.g. "datadog_agent").
 * If a node with that ID already exists, appends _2, _3, etc.
 */
function generateNodeId(vectorType: string, existingNodes: Node[]): string {
  const baseId = vectorType.replace(/[^a-zA-Z0-9_]/g, '_');
  const existingIds = new Set(existingNodes.map(n => n.id));

  if (!existingIds.has(baseId)) {
    return baseId;
  }

  let counter = 2;
  while (existingIds.has(`${baseId}_${counter}`)) {
    counter += 1;
  }
  return `${baseId}_${counter}`;
}

function ConfigEditorInner(props: ConfigEditorProps) {
  const {
    initialDag,
    onSave,
    onDagChange,
    title,
    showNameField,
    name,
    onNameChange,
    toolbarActions,
    readOnly,
  } = props;

  const classes = useStyles();
  const { screenToFlowPosition } = useReactFlow();

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [viewMode, setViewMode] = useState<'visual' | 'yaml'>('visual');
  const [yamlContent, setYamlContent] = useState('');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'warning' | 'info';
  }>({ open: false, message: '', severity: 'info' });

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

  // Load initial DAG
  useEffect(() => {
    if (initialDag && !initializedRef.current) {
      initializedRef.current = true;
      const { nodes: loadedNodes, edges: loadedEdges } =
        dagToReactFlow(initialDag);
      setNodes(loadedNodes);
      setEdges(loadedEdges);
    }
  }, [initialDag]);

  const onNodesChange: OnNodesChange = useCallback(
    changes => {
      if (readOnly) return;
      setNodes(nds => applyNodeChanges(changes, nds));
    },
    [readOnly],
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    changes => {
      if (readOnly) return;
      setEdges(eds => applyEdgeChanges(changes, eds));
    },
    [readOnly],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (readOnly) return;
      setEdges(eds => addEdge(connection, eds));
    },
    [readOnly],
  );

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNode(node);
    },
    [],
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (readOnly) return;
      event.preventDefault();

      const dataStr = event.dataTransfer.getData(
        'application/butler-pipeline-component',
      );
      if (!dataStr) return;

      let schema: {
        type: 'source' | 'transform' | 'sink';
        vectorType: string;
        displayName: string;
        defaultConfig: Record<string, unknown>;
        configSchema: Record<string, unknown>;
      };
      try {
        schema = JSON.parse(dataStr);
      } catch {
        return;
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      setNodes(currentNodes => {
        const nodeId = generateNodeId(schema.vectorType, currentNodes);
        const component: DagComponent = {
          id: nodeId,
          type: schema.type,
          vectorType: schema.vectorType,
          config: { ...schema.defaultConfig },
          position,
          metadata: { label: schema.displayName },
          inferredInputSchema: null,
          inferredOutputSchema: null,
        };

        const newNode: Node = {
          id: nodeId,
          type: 'component',
          position,
          data: { component, configSchema: schema.configSchema },
        };

        return [...currentNodes, newNode];
      });
    },
    [readOnly, screenToFlowPosition],
  );

  const getCurrentDag = useCallback((): PipelineDag => {
    return reactFlowToDag(nodes, edges);
  }, [nodes, edges]);

  const handleSave = useCallback(async () => {
    if (readOnly) return;
    setSaving(true);
    try {
      const dag = getCurrentDag();
      await onSave(dag);
      setSnackbar({
        open: true,
        message: 'Config saved successfully.',
        severity: 'success',
      });
    } catch (err) {
      setSnackbar({
        open: true,
        message: `Failed to save: ${err instanceof Error ? err.message : String(err)}`,
        severity: 'error',
      });
    } finally {
      setSaving(false);
    }
  }, [readOnly, getCurrentDag, onSave]);

  const handleExportYaml = useCallback(() => {
    const dag = getCurrentDag();
    const yamlStr = compileDagToYaml(dag, name || title);
    const blob = new Blob([yamlStr], { type: 'text/yaml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name || title || 'config'}.yaml`;
    a.click();
    URL.revokeObjectURL(url);
  }, [name, title, getCurrentDag]);

  const handleRemoveNode = useCallback(
    (nodeId: string) => {
      if (readOnly) return;
      setNodes(nds => nds.filter(n => n.id !== nodeId));
      setEdges(eds =>
        eds.filter(e => e.source !== nodeId && e.target !== nodeId),
      );
      if (selectedNode?.id === nodeId) {
        setSelectedNode(null);
      }
    },
    [readOnly, selectedNode],
  );

  const handleUpdateConfig = useCallback(
    (nodeId: string, config: Record<string, unknown>) => {
      if (readOnly) return;
      setNodes(nds =>
        nds.map(n => {
          if (n.id !== nodeId) return n;
          const component = n.data?.component as DagComponent;
          return {
            ...n,
            data: {
              ...n.data,
              component: { ...component, config },
            },
          };
        }),
      );
    },
    [readOnly],
  );

  const handleRenameNode = useCallback(
    (oldId: string, newId: string) => {
      if (readOnly) return;
      setNodes(nds =>
        nds.map(n => {
          if (n.id !== oldId) return n;
          const component = n.data?.component as DagComponent;
          return {
            ...n,
            id: newId,
            data: {
              ...n.data,
              component: { ...component, id: newId },
            },
          };
        }),
      );
      setEdges(eds =>
        eds.map(e => ({
          ...e,
          id: e.id.replace(oldId, newId),
          source: e.source === oldId ? newId : e.source,
          target: e.target === oldId ? newId : e.target,
        })),
      );
      if (selectedNode?.id === oldId) {
        setSelectedNode(prev => {
          if (!prev) return null;
          const component = prev.data?.component as DagComponent;
          return {
            ...prev,
            id: newId,
            data: {
              ...prev.data,
              component: { ...component, id: newId },
            },
          };
        });
      }
    },
    [readOnly, selectedNode],
  );

  const handleImportComplete = useCallback(
    (dag: PipelineDag) => {
      const { nodes: importedNodes, edges: importedEdges } =
        dagToReactFlow(dag);
      setNodes(importedNodes);
      setEdges(importedEdges);
      setShowImportDialog(false);
      setSnackbar({
        open: true,
        message: 'Config imported successfully.',
        severity: 'success',
      });
    },
    [],
  );

  // Live-compile DAG to Vector YAML whenever nodes/edges change
  useEffect(() => {
    const dag = getCurrentDag();
    setYamlContent(compileDagToYaml(dag, name || title));
    onDagChange?.(dag);
  }, [nodes, edges, getCurrentDag, name, title, onDagChange]);

  // Keep selectedNode in sync with node updates
  useEffect(() => {
    if (selectedNode) {
      const updated = nodes.find(n => n.id === selectedNode.id);
      if (updated && updated !== selectedNode) {
        setSelectedNode(updated);
      }
    }
  }, [nodes, selectedNode]);

  return (
    <div className={classes.root}>
      <Toolbar className={classes.toolbar} disableGutters variant="dense">
        {title && (
          <Typography variant="subtitle1" className={classes.title}>
            {title}
          </Typography>
        )}
        {showNameField && (
          <TextField
            className={classes.nameInput}
            size="small"
            variant="outlined"
            placeholder="Pipeline name"
            value={name ?? ''}
            onChange={e => onNameChange?.(e.target.value)}
            disabled={readOnly}
          />
        )}
        {!readOnly && (
          <Button
            variant="contained"
            color="primary"
            size="small"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        )}
        <Button
          variant="outlined"
          size="small"
          startIcon={<GetAppIcon />}
          onClick={handleExportYaml}
        >
          Export YAML
        </Button>
        {!readOnly && (
          <Button
            variant="outlined"
            size="small"
            startIcon={<PublishIcon />}
            onClick={() => setShowImportDialog(true)}
          >
            Import
          </Button>
        )}
        {toolbarActions}
      </Toolbar>

      <ConfigToggle
        mode={viewMode}
        onModeChange={setViewMode}
        yamlContent={yamlContent}
      >
        <Box className={classes.mainArea}>
          {!readOnly && <ComponentLibrary />}
          <div
            className={classes.canvasContainer}
            ref={reactFlowWrapper}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              onDragOver={onDragOver}
              onDrop={onDrop}
              fitView
              deleteKeyCode={readOnly ? undefined : 'Delete'}
            />
          </div>
          {selectedNode && (
            <ComponentPanel
              node={selectedNode}
              allNodeIds={nodes.map(n => n.id)}
              onClose={() => setSelectedNode(null)}
              onRemove={readOnly ? undefined : handleRemoveNode}
              onUpdateConfig={readOnly ? undefined : handleUpdateConfig}
              onRename={readOnly ? undefined : handleRenameNode}
            />
          )}
        </Box>
      </ConfigToggle>

      {!readOnly && (
        <ImportPipelineDialog
          open={showImportDialog}
          onClose={() => setShowImportDialog(false)}
          onImport={handleImportComplete}
        />
      )}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
      >
        <Alert
          onClose={() => setSnackbar(s => ({ ...s, open: false }))}
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </div>
  );
}

export function ConfigEditor(props: ConfigEditorProps) {
  return (
    <ReactFlowProvider>
      <ConfigEditorInner {...props} />
    </ReactFlowProvider>
  );
}
