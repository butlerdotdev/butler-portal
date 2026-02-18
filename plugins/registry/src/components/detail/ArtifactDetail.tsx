// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Chip,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  IconButton,
  Tooltip,
  MenuItem,
  TextField,
  makeStyles,
} from '@material-ui/core';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import FileCopyIcon from '@material-ui/icons/FileCopy';
import { Progress, EmptyState } from '@backstage/core-components';
import { useRegistryApi } from '../../hooks/useRegistryApi';
import { getArtifactTypeInfo } from '../../utils/artifactTypeInfo';
import { getInstallSnippets } from '../../utils/installSnippets';
import type {
  Artifact,
  ArtifactVersion,
  TerraformMetadata,
  ConsumerInfo,
  ExampleConfig,
  DependencyRef,
} from '../../api/types/artifacts';
import { RunsTab } from './RunsTab';

const useStyles = makeStyles(theme => ({
  header: {
    marginBottom: theme.spacing(3),
  },
  typeChip: {
    marginRight: theme.spacing(1),
  },
  statusChip: {
    marginLeft: theme.spacing(1),
  },
  tabs: {
    marginBottom: theme.spacing(2),
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  snippetBox: {
    position: 'relative' as const,
    backgroundColor: theme.palette.background.default,
    padding: theme.spacing(2),
    borderRadius: theme.shape.borderRadius,
    fontFamily: 'monospace',
    fontSize: '0.85rem',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    marginBottom: theme.spacing(2),
  },
  snippetLabel: {
    marginBottom: theme.spacing(0.5),
    fontWeight: 600,
  },
  copyButton: {
    position: 'absolute' as const,
    top: theme.spacing(0.5),
    right: theme.spacing(0.5),
  },
  approvalBadge: {
    fontWeight: 600,
  },
  inputTable: {
    marginBottom: theme.spacing(2),
  },
  sectionTitle: {
    marginTop: theme.spacing(2),
    marginBottom: theme.spacing(1),
    fontWeight: 600,
  },
  resourceChip: {
    margin: theme.spacing(0.25),
  },
  yankReason: {
    fontStyle: 'italic',
    color: theme.palette.text.secondary,
    marginLeft: theme.spacing(1),
    fontSize: '0.75rem',
  },
  depItem: {
    padding: theme.spacing(1, 2),
    marginBottom: theme.spacing(1),
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exampleBlock: {
    marginBottom: theme.spacing(3),
  },
}));

function approvalColor(status: string): 'default' | 'primary' | 'secondary' {
  switch (status) {
    case 'approved':
      return 'primary';
    case 'rejected':
      return 'secondary';
    default:
      return 'default';
  }
}

function CopySnippet({ code, label, classes }: { code: string; label: string; classes: any }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Box mb={2}>
      <Typography variant="subtitle2" className={classes.snippetLabel}>
        {label}
      </Typography>
      <Box className={classes.snippetBox}>
        <Tooltip title={copied ? 'Copied!' : 'Copy to clipboard'}>
          <IconButton size="small" className={classes.copyButton} onClick={handleCopy}>
            <FileCopyIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        {code}
      </Box>
    </Box>
  );
}

export function ArtifactDetail() {
  const classes = useStyles();
  const navigate = useNavigate();
  const { namespace, name } = useParams<{
    namespace: string;
    name: string;
  }>();
  const api = useRegistryApi();

  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [versions, setVersions] = useState<ArtifactVersion[]>([]);
  const [consumers, setConsumers] = useState<{
    consumers: ConsumerInfo[];
    anonymous: Array<{ consumer_type: string; download_count: number; last_download: string }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabIndex, setTabIndex] = useState(0);
  const [selectedVersionIdx, setSelectedVersionIdx] = useState(-1);

  const fetchData = useCallback(async () => {
    if (!namespace || !name) return;
    try {
      setLoading(true);
      const [artifactData, versionsData] = await Promise.all([
        api.getArtifact(namespace, name),
        api.listVersions(namespace, name),
      ]);
      setArtifact(artifactData);
      setVersions(versionsData.versions);
      setError(null);
      // Fetch consumers in background (non-blocking)
      api.getConsumers(namespace, name).then(setConsumers).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load artifact');
    } finally {
      setLoading(false);
    }
  }, [api, namespace, name]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) return <Progress />;

  if (error) {
    return (
      <EmptyState
        title="Failed to load artifact"
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

  if (!artifact) {
    return (
      <EmptyState title="Artifact not found" missing="data" />
    );
  }

  const typeInfo = getArtifactTypeInfo(artifact.type);
  const latestVersion = versions.find(v => v.is_latest);

  // Default to latest version if not explicitly selected
  const effectiveIdx = selectedVersionIdx >= 0 ? selectedVersionIdx : versions.findIndex(v => v.is_latest);
  const selectedVersion = effectiveIdx >= 0 ? versions[effectiveIdx] : versions[0] ?? null;

  const snippets = selectedVersion
    ? getInstallSnippets(
        artifact.type,
        artifact.namespace,
        artifact.name,
        selectedVersion.version,
        window.location.origin + '/api/registry',
        artifact.provider,
      )
    : [];

  const tfMeta = selectedVersion?.terraform_metadata as TerraformMetadata | null;
  const examples: ExampleConfig[] = selectedVersion?.examples ?? [];
  const deps: DependencyRef[] = selectedVersion?.dependencies ?? [];
  const isTerraform = artifact.type === 'terraform-module';

  // Build tab list dynamically
  const tabDefs: Array<{ label: string; id: string }> = [
    { label: 'Versions', id: 'versions' },
    { label: 'Install', id: 'install' },
    { label: 'README', id: 'readme' },
  ];
  if (isTerraform && tfMeta && ((tfMeta.inputs?.length ?? 0) > 0 || (tfMeta.outputs?.length ?? 0) > 0)) {
    tabDefs.push({ label: 'Inputs / Outputs', id: 'io' });
  }
  if (examples.length > 0) {
    tabDefs.push({ label: 'Examples', id: 'examples' });
  }
  if (deps.length > 0 || (tfMeta?.resources?.length ?? 0) > 0) {
    tabDefs.push({ label: 'Dependencies', id: 'deps' });
  }
  tabDefs.push({ label: 'Consumers', id: 'consumers' });
  tabDefs.push({ label: 'Module Tests', id: 'runs' });

  const currentTab = tabDefs[tabIndex]?.id ?? 'versions';

  return (
    <>
      <Box className={classes.header}>
        <Box display="flex" alignItems="center" mb={1}>
          <IconButton size="small" onClick={() => navigate('..')} style={{ marginRight: 8 }}>
            <ArrowBackIcon />
          </IconButton>
          <Chip
            label={typeInfo.label}
            size="small"
            className={classes.typeChip}
            style={{ backgroundColor: typeInfo.color, color: '#fff' }}
          />
          <Chip
            label={artifact.status}
            size="small"
            variant="outlined"
            className={classes.statusChip}
          />
        </Box>
        <Typography variant="h4">
          {artifact.namespace}/{artifact.name}
        </Typography>
        {artifact.description && (
          <Typography variant="body1" color="textSecondary">
            {artifact.description}
          </Typography>
        )}
        <Typography variant="caption" color="textSecondary">
          {artifact.download_count.toLocaleString()} downloads
          {artifact.team && ` | Team: ${artifact.team}`}
          {latestVersion && ` | Latest: v${latestVersion.version}`}
        </Typography>
      </Box>

      {versions.length > 1 && (
        <Box mb={2}>
          <TextField
            select
            label="Viewing version"
            value={effectiveIdx >= 0 ? effectiveIdx : 0}
            onChange={e => {
              setSelectedVersionIdx(Number(e.target.value));
              setTabIndex(0);
            }}
            variant="outlined"
            size="small"
            style={{ minWidth: 220 }}
          >
            {versions.map((v, i) => (
              <MenuItem key={v.id} value={i}>
                {v.version}
                {v.is_latest ? ' (latest)' : ''}
                {v.is_bad ? ' (yanked)' : ''}
              </MenuItem>
            ))}
          </TextField>
        </Box>
      )}

      <Tabs
        value={tabIndex}
        onChange={(_e, v) => setTabIndex(v)}
        className={classes.tabs}
        variant="scrollable"
        scrollButtons="auto"
      >
        {tabDefs.map(t => (
          <Tab key={t.id} label={t.label} />
        ))}
      </Tabs>

      {/* ── Versions Tab ── */}
      {currentTab === 'versions' && (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Version</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Published By</TableCell>
                <TableCell>Created</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {versions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} align="center">
                    No versions published yet
                  </TableCell>
                </TableRow>
              ) : (
                versions.map(v => (
                  <TableRow key={v.id}>
                    <TableCell>
                      {v.version}
                      {v.is_latest && (
                        <Chip
                          label="latest"
                          size="small"
                          color="primary"
                          style={{ marginLeft: 8 }}
                        />
                      )}
                      {v.is_bad && (
                        <Tooltip title={v.yank_reason || 'Yanked'}>
                          <Chip
                            label="yanked"
                            size="small"
                            color="secondary"
                            style={{ marginLeft: 8 }}
                          />
                        </Tooltip>
                      )}
                      {v.is_bad && v.yank_reason && (
                        <Typography component="span" className={classes.yankReason}>
                          {v.yank_reason}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={v.approval_status}
                        size="small"
                        color={approvalColor(v.approval_status)}
                        className={classes.approvalBadge}
                      />
                    </TableCell>
                    <TableCell>{v.published_by || '-'}</TableCell>
                    <TableCell>
                      {new Date(v.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* ── Install Tab (with copy buttons) ── */}
      {currentTab === 'install' && (
        <Box>
          {snippets.length === 0 ? (
            <Typography color="textSecondary">
              No approved version available for installation.
            </Typography>
          ) : (
            snippets.map((snippet, i) => (
              <CopySnippet
                key={i}
                label={snippet.label}
                code={snippet.code}
                classes={classes}
              />
            ))
          )}
        </Box>
      )}

      {/* ── README Tab ── */}
      {currentTab === 'readme' && (
        <Box>
          {artifact.readme ? (
            <Paper variant="outlined" style={{ padding: 16 }}>
              <Typography component="pre" style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                {artifact.readme}
              </Typography>
            </Paper>
          ) : (
            <Typography color="textSecondary">No README available.</Typography>
          )}
        </Box>
      )}

      {/* ── Inputs / Outputs Tab ── */}
      {currentTab === 'io' && tfMeta && (
        <Box>
          {(tfMeta.inputs?.length ?? 0) > 0 && (
            <>
              <Typography variant="h6" className={classes.sectionTitle}>
                Inputs ({tfMeta.inputs!.length})
              </Typography>
              <TableContainer component={Paper} variant="outlined" className={classes.inputTable}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Required</TableCell>
                      <TableCell>Default</TableCell>
                      <TableCell>Description</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tfMeta.inputs!.map(input => (
                      <TableRow key={input.name}>
                        <TableCell>
                          <code>{input.name}</code>
                          {input.sensitive && (
                            <Chip label="sensitive" size="small" style={{ marginLeft: 4 }} />
                          )}
                        </TableCell>
                        <TableCell><code>{input.type}</code></TableCell>
                        <TableCell>{input.required ? 'Yes' : 'No'}</TableCell>
                        <TableCell>
                          {input.default !== undefined ? <code>{input.default}</code> : '-'}
                        </TableCell>
                        <TableCell>{input.description || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}

          {(tfMeta.outputs?.length ?? 0) > 0 && (
            <>
              <Typography variant="h6" className={classes.sectionTitle}>
                Outputs ({tfMeta.outputs!.length})
              </Typography>
              <TableContainer component={Paper} variant="outlined" className={classes.inputTable}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Description</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tfMeta.outputs!.map(output => (
                      <TableRow key={output.name}>
                        <TableCell>
                          <code>{output.name}</code>
                          {output.sensitive && (
                            <Chip label="sensitive" size="small" style={{ marginLeft: 4 }} />
                          )}
                        </TableCell>
                        <TableCell>{output.description || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}

          {(tfMeta.providers?.length ?? 0) > 0 && (
            <>
              <Typography variant="h6" className={classes.sectionTitle}>
                Required Providers
              </Typography>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Provider</TableCell>
                      <TableCell>Source</TableCell>
                      <TableCell>Version Constraint</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tfMeta.providers!.map(p => (
                      <TableRow key={p.source}>
                        <TableCell><code>{p.name}</code></TableCell>
                        <TableCell><code>{p.source}</code></TableCell>
                        <TableCell>{p.versionConstraint || 'any'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}

          {tfMeta.requiredVersion && (
            <Box mt={2}>
              <Typography variant="body2">
                Required Terraform version: <code>{tfMeta.requiredVersion}</code>
              </Typography>
            </Box>
          )}
        </Box>
      )}

      {/* ── Examples Tab ── */}
      {currentTab === 'examples' && (
        <Box>
          {examples.map((ex, i) => (
            <Box key={i} className={classes.exampleBlock}>
              <Typography variant="h6" gutterBottom>
                {ex.name}
              </Typography>
              {ex.description && (
                <Typography variant="body2" color="textSecondary" gutterBottom>
                  {ex.description}
                </Typography>
              )}
              <CopySnippet
                label={ex.path ?? 'main.tf'}
                code={ex.source}
                classes={classes}
              />
            </Box>
          ))}
        </Box>
      )}

      {/* ── Dependencies Tab ── */}
      {currentTab === 'deps' && (
        <Box>
          {deps.length > 0 && (
            <>
              <Typography variant="h6" className={classes.sectionTitle}>
                Module Dependencies ({deps.length})
              </Typography>
              {deps.map((dep, i) => (
                <Paper key={i} variant="outlined" className={classes.depItem}>
                  <Box>
                    <Typography variant="subtitle2">{dep.name || dep.source}</Typography>
                    <Typography variant="caption" color="textSecondary">
                      <code>{dep.source}</code>
                    </Typography>
                  </Box>
                  {dep.version && (
                    <Chip label={dep.version} size="small" variant="outlined" />
                  )}
                </Paper>
              ))}
            </>
          )}

          {(tfMeta?.resources?.length ?? 0) > 0 && (
            <>
              <Typography variant="h6" className={classes.sectionTitle}>
                Managed Resources ({tfMeta!.resources!.length})
              </Typography>
              <Box display="flex" flexWrap="wrap" style={{ gap: 4 }}>
                {tfMeta!.resources!.map(r => (
                  <Chip
                    key={r}
                    label={r}
                    size="small"
                    variant="outlined"
                    className={classes.resourceChip}
                  />
                ))}
              </Box>
            </>
          )}
        </Box>
      )}

      {/* ── Runs Tab ── */}
      {currentTab === 'runs' && namespace && name && (
        <RunsTab namespace={namespace} name={name} />
      )}

      {/* ── Consumers Tab ── */}
      {currentTab === 'consumers' && (
        <Box>
          {!consumers ? (
            <Progress />
          ) : consumers.consumers.length === 0 && consumers.anonymous.length === 0 ? (
            <EmptyState
              title="No consumers tracked yet"
              description="Download data will appear here as artifacts are consumed via the registry protocols."
              missing="data"
            />
          ) : (
            <>
              {consumers.consumers.length > 0 && (
                <>
                  <Typography variant="h6" className={classes.sectionTitle}>
                    Authenticated Consumers
                  </Typography>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Token</TableCell>
                          <TableCell>Protocol</TableCell>
                          <TableCell>Downloads</TableCell>
                          <TableCell>Last Used</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {consumers.consumers.map((c, i) => (
                          <TableRow key={i}>
                            <TableCell>
                              {c.token_name}
                              <Typography variant="caption" color="textSecondary" style={{ marginLeft: 8 }}>
                                ({c.token_prefix}...)
                              </Typography>
                            </TableCell>
                            <TableCell>
                              {c.consumer_types.join(', ') || '-'}
                            </TableCell>
                            <TableCell>{c.download_count}</TableCell>
                            <TableCell>
                              {new Date(c.last_download).toLocaleDateString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </>
              )}

              {consumers.anonymous.length > 0 && (
                <>
                  <Typography variant="h6" className={classes.sectionTitle}>
                    Anonymous Downloads
                  </Typography>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Protocol</TableCell>
                          <TableCell>Downloads</TableCell>
                          <TableCell>Last Download</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {consumers.anonymous.map((a, i) => (
                          <TableRow key={i}>
                            <TableCell>{a.consumer_type}</TableCell>
                            <TableCell>{a.download_count}</TableCell>
                            <TableCell>
                              {new Date(a.last_download).toLocaleDateString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </>
              )}
            </>
          )}
        </Box>
      )}
    </>
  );
}
