// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ReactFlow, Background } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Box,
  Button,
  Tab,
  Tabs,
  Typography,
  Chip,
  List,
  ListItem,
  ListItemText,
  Divider,
} from '@material-ui/core';
import { makeStyles, Theme, createStyles } from '@material-ui/core/styles';
import EditIcon from '@material-ui/icons/Edit';
import GetAppIcon from '@material-ui/icons/GetApp';
import PublishIcon from '@material-ui/icons/Publish';
import {
  Progress,
  WarningPanel,
  InfoCard,
} from '@backstage/core-components';
import { usePipelineApi } from '../../hooks/usePipelineApi';
import type { Pipeline, PipelineVersion } from '../../api/types/pipelines';
import { VersionHistory } from '../common/VersionHistory';
import { DeployDialog } from '../deploy/DeployDialog';
import { DeploymentHistory } from '../deploy/DeploymentHistory';
import { dagToReactFlow } from '../builder/dagTranslation';
import { nodeTypes } from '../builder/nodeTypes';

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: theme.spacing(2),
    },
    titleRow: {
      display: 'flex',
      alignItems: 'center',
      gap: theme.spacing(2),
    },
    actions: {
      display: 'flex',
      gap: theme.spacing(1),
    },
    tabContent: {
      marginTop: theme.spacing(2),
    },
    configBlock: {
      padding: theme.spacing(2),
      backgroundColor: theme.palette.type === 'dark' ? '#1e1e1e' : '#f5f5f5',
      borderRadius: theme.shape.borderRadius,
      overflow: 'auto',
      maxHeight: 600,
      fontFamily: 'monospace',
      fontSize: '0.85rem',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-all',
    },
    overviewSection: {
      marginBottom: theme.spacing(3),
    },
    metadataGrid: {
      display: 'grid',
      gridTemplateColumns: '160px 1fr',
      gap: theme.spacing(1),
      '& dt': {
        fontWeight: 600,
        color: theme.palette.text.secondary,
      },
    },
    auditEntry: {
      borderLeft: `3px solid ${theme.palette.primary.main}`,
      paddingLeft: theme.spacing(2),
      marginBottom: theme.spacing(2),
    },
    activeChip: {
      backgroundColor: theme.palette.success?.main ?? '#4caf50',
      color: '#fff',
    },
    archivedChip: {
      backgroundColor: theme.palette.grey[500],
      color: '#fff',
    },
  }),
);

interface TabPanelProps {
  children: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  if (value !== index) return null;
  return <div role="tabpanel">{children}</div>;
}

function DagPreview({ dag }: { dag: import('../../api/types/pipelines').PipelineDag }) {
  const { nodes, edges } = useMemo(() => dagToReactFlow(dag), [dag]);

  return (
    <Box mt={2}>
      <Typography variant="subtitle2" gutterBottom>
        Pipeline DAG
      </Typography>
      <div style={{ height: 350, border: '1px solid #333', borderRadius: 8, overflow: 'hidden' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          panOnDrag
          zoomOnScroll={false}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#333" gap={20} />
        </ReactFlow>
      </div>
    </Box>
  );
}

export function PipelineDetail() {
  const classes = useStyles();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const api = usePipelineApi();

  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [versions, setVersions] = useState<PipelineVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [deployOpen, setDeployOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [pipelineData, versionsData] = await Promise.all([
          api.getPipeline(id),
          api.listVersions(id),
        ]);
        if (!cancelled) {
          setPipeline(pipelineData);
          setVersions(versionsData);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [api, id]);

  const handleExportYaml = () => {
    if (!versions.length || !pipeline) return;
    const latestVersion = versions[0];
    const blob = new Blob([latestVersion.vector_config], {
      type: 'text/yaml;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pipeline.name}.yaml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <Progress />;
  }

  if (error) {
    return (
      <WarningPanel title="Failed to load pipeline" message={error.message} />
    );
  }

  if (!pipeline) {
    return <WarningPanel title="Pipeline not found" />;
  }

  const latestVersion = versions.length > 0 ? versions[0] : null;

  return (
    <div>
      <Box className={classes.header}>
        <Box className={classes.titleRow}>
          <Typography variant="h4">{pipeline.name}</Typography>
          <Chip
            label={pipeline.status}
            size="small"
            className={
              pipeline.status === 'active'
                ? classes.activeChip
                : classes.archivedChip
            }
          />
        </Box>
        <Box className={classes.actions}>
          <Button
            variant="outlined"
            startIcon={<EditIcon />}
            onClick={() => navigate(`../${id}/edit`)}
          >
            Edit Pipeline
          </Button>
          <Button
            variant="outlined"
            startIcon={<GetAppIcon />}
            onClick={handleExportYaml}
            disabled={!latestVersion}
          >
            Export YAML
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<PublishIcon />}
            onClick={() => setDeployOpen(true)}
            disabled={!latestVersion || pipeline.status !== 'active' || !pipeline.agents?.length}
          >
            Deploy
          </Button>
        </Box>
      </Box>

      <Tabs
        value={activeTab}
        onChange={(_e, val) => setActiveTab(val)}
        indicatorColor="primary"
        textColor="primary"
      >
        <Tab label="Overview" />
        <Tab label="Versions" />
        <Tab label="Config" />
        <Tab label="Audit" />
        <Tab label="Deployments" />
      </Tabs>

      <div className={classes.tabContent}>
        <TabPanel value={activeTab} index={0}>
          <InfoCard title="Pipeline Overview">
            <div className={classes.overviewSection}>
              <dl className={classes.metadataGrid}>
                <dt>Name</dt>
                <dd>{pipeline.name}</dd>
                <dt>Description</dt>
                <dd>{pipeline.description || 'No description'}</dd>
                <dt>Team</dt>
                <dd>{pipeline.team}</dd>
                <dt>Status</dt>
                <dd>{pipeline.status}</dd>
                <dt>Agents</dt>
                <dd>
                  {pipeline.agents?.length ?? 0} agent
                  {(pipeline.agents?.length ?? 0) !== 1 ? 's' : ''} (
                  {pipeline.agents?.filter(a => a.status === 'online').length ?? 0}{' '}
                  online)
                </dd>
                <dt>Created By</dt>
                <dd>{pipeline.created_by}</dd>
                <dt>Created At</dt>
                <dd>{new Date(pipeline.created_at).toLocaleString()}</dd>
                <dt>Updated At</dt>
                <dd>{new Date(pipeline.updated_at).toLocaleString()}</dd>
              </dl>
            </div>
            {latestVersion && (
              <div className={classes.overviewSection}>
                <Typography variant="h6" gutterBottom>
                  Latest Version
                </Typography>
                <dl className={classes.metadataGrid}>
                  <dt>Version</dt>
                  <dd>v{latestVersion.version}</dd>
                  <dt>Author</dt>
                  <dd>{latestVersion.created_by}</dd>
                  <dt>Date</dt>
                  <dd>{new Date(latestVersion.created_at).toLocaleString()}</dd>
                  <dt>Summary</dt>
                  <dd>{latestVersion.change_summary || 'No summary'}</dd>
                  <dt>Config Hash</dt>
                  <dd>
                    <code>{latestVersion.config_hash.slice(0, 12)}</code>
                  </dd>
                  <dt>Components</dt>
                  <dd>{latestVersion.dag.components.length}</dd>
                  <dt>Edges</dt>
                  <dd>{latestVersion.dag.edges.length}</dd>
                </dl>
              </div>
            )}
            {latestVersion && latestVersion.dag.components.length > 0 && (
              <DagPreview dag={latestVersion.dag} />
            )}
          </InfoCard>
        </TabPanel>

        <TabPanel value={activeTab} index={1}>
          <VersionHistory pipelineId={pipeline.id} versions={versions} />
        </TabPanel>

        <TabPanel value={activeTab} index={2}>
          <InfoCard title="Compiled Vector Configuration">
            {latestVersion ? (
              <pre className={classes.configBlock}>
                {latestVersion.vector_config}
              </pre>
            ) : (
              <Typography color="textSecondary">
                No versions available. Create a version to see the compiled
                configuration.
              </Typography>
            )}
          </InfoCard>
        </TabPanel>

        <TabPanel value={activeTab} index={3}>
          <InfoCard title="Audit Log">
            {versions.length > 0 ? (
              <List>
                {versions.map((version, idx) => (
                  <div key={version.id}>
                    <ListItem alignItems="flex-start">
                      <ListItemText
                        primary={
                          <Typography variant="subtitle2">
                            Version {version.version} created by{' '}
                            {version.created_by}
                          </Typography>
                        }
                        secondary={
                          <>
                            <Typography
                              component="span"
                              variant="body2"
                              color="textPrimary"
                            >
                              {new Date(version.created_at).toLocaleString()}
                            </Typography>
                            {version.change_summary && (
                              <Typography
                                component="span"
                                variant="body2"
                                color="textSecondary"
                              >
                                {' -- '}
                                {version.change_summary}
                              </Typography>
                            )}
                          </>
                        }
                      />
                    </ListItem>
                    {idx < versions.length - 1 && <Divider component="li" />}
                  </div>
                ))}
              </List>
            ) : (
              <Typography color="textSecondary">
                No audit entries yet.
              </Typography>
            )}
          </InfoCard>
        </TabPanel>

        <TabPanel value={activeTab} index={4}>
          <DeploymentHistory pipelineId={pipeline.id} />
        </TabPanel>
      </div>

      {pipeline && (
        <DeployDialog
          open={deployOpen}
          onClose={() => setDeployOpen(false)}
          pipelineId={pipeline.id}
          pipelineName={pipeline.name}
          agents={pipeline.agents ?? []}
        />
      )}
    </div>
  );
}
