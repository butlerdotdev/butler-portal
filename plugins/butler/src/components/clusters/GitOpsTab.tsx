// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import {
  InfoCard,
  Progress,
  EmptyState,
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
  FormControlLabel,
  Checkbox,
  CircularProgress,
  Collapse,
  IconButton,
  InputAdornment,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import CancelIcon from '@material-ui/icons/Cancel';
import CloudUploadIcon from '@material-ui/icons/CloudUpload';
import RefreshIcon from '@material-ui/icons/Refresh';
import WarningIcon from '@material-ui/icons/Warning';
import VisibilityIcon from '@material-ui/icons/Visibility';
import VisibilityOffIcon from '@material-ui/icons/VisibilityOff';
import SettingsIcon from '@material-ui/icons/Settings';
import LinkIcon from '@material-ui/icons/Link';
import { butlerApiRef } from '../../api/ButlerApi';
import type {
  GitOpsStatus,
  GitOpsToolType,
  GitProviderType,
  GitProviderConfig,
  DiscoveredRelease,
  DiscoveryResult,
  Repository,
  Branch,
  MigrationRelease,
} from '../../api/types/gitops';
import {
  sortReleases,
  getCategoryLabel,
} from '../../api/types/gitops';
import { StatusBadge } from '../StatusBadge/StatusBadge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GitOpsTabProps {
  clusterNamespace: string;
  clusterName: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FLUX_EXTRA_COMPONENTS = [
  {
    name: 'image-reflector-controller',
    label: 'Image Reflector Controller',
    description: 'Watches container registries for new image tags',
  },
  {
    name: 'image-automation-controller',
    label: 'Image Automation Controller',
    description: 'Automatically commits image updates to Git',
  },
];

const TOOL_LABELS: Record<GitOpsToolType, string> = {
  flux: 'Flux CD',
  argocd: 'Argo CD',
};

const PROVIDER_LABELS: Record<GitProviderType, string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const useStyles = makeStyles(theme => ({
  root: {
    width: '100%',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(2),
  },
  actions: {
    display: 'flex',
    gap: theme.spacing(1),
  },
  statusCard: {
    marginBottom: theme.spacing(3),
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
    color: theme.palette.type === 'dark' ? '#4caf50' : theme.palette.success.main,
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
    flexDirection: 'column' as const,
    justifyContent: 'space-between',
  },
  releaseChips: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: theme.spacing(0.5),
    marginTop: theme.spacing(1),
  },
  warningBanner: {
    padding: theme.spacing(2),
    marginBottom: theme.spacing(2),
    border: `1px solid ${theme.palette.warning.main}`,
    borderRadius: theme.shape.borderRadius,
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(255, 152, 0, 0.08)'
        : 'rgba(255, 152, 0, 0.04)',
    display: 'flex',
    alignItems: 'flex-start',
    gap: theme.spacing(1.5),
  },
  warningIcon: {
    color: theme.palette.warning.main,
    marginTop: 2,
  },
  warningCardBorder: {
    borderColor: `${theme.palette.warning.main} !important`,
  },
  platformChip: {
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(156, 39, 176, 0.15)'
        : 'rgba(156, 39, 176, 0.08)',
    color: theme.palette.type === 'dark' ? '#ce93d8' : '#9c27b0',
    borderColor: theme.palette.type === 'dark' ? '#ce93d8' : '#9c27b0',
  },
  categoryChip: {
    textTransform: 'capitalize' as const,
  },
  repoUrlWarning: {
    color: theme.palette.warning.main,
    fontSize: '0.75rem',
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    marginTop: theme.spacing(1),
  },
  releaseValues: {
    marginTop: theme.spacing(1),
    '& pre': {
      margin: 0,
      padding: theme.spacing(1),
      backgroundColor:
        theme.palette.type === 'dark'
          ? theme.palette.background.default
          : theme.palette.grey[100],
      borderRadius: theme.shape.borderRadius,
      fontSize: '0.75rem',
      overflow: 'auto',
      maxHeight: 128,
    },
  },
  formField: {
    marginBottom: theme.spacing(2),
  },
  toolSelector: {
    display: 'flex',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(2),
  },
  toolCard: {
    flex: 1,
    cursor: 'pointer',
    border: `2px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    padding: theme.spacing(2),
    textAlign: 'center' as const,
    transition: 'border-color 0.2s, background-color 0.2s',
    '&:hover': {
      borderColor: theme.palette.primary.main,
    },
  },
  toolCardSelected: {
    borderColor: `${theme.palette.primary.main} !important`,
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(33, 150, 243, 0.08)'
        : 'rgba(33, 150, 243, 0.04)',
  },
  toolCardDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
    '&:hover': {
      borderColor: theme.palette.divider,
    },
  },
  infoBox: {
    padding: theme.spacing(2),
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.info.main}`,
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(33, 150, 243, 0.08)'
        : 'rgba(33, 150, 243, 0.04)',
    marginTop: theme.spacing(2),
  },
  releaseInfo: {
    padding: theme.spacing(1.5),
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.divider}`,
    backgroundColor:
      theme.palette.type === 'dark'
        ? theme.palette.background.default
        : theme.palette.grey[50],
    marginBottom: theme.spacing(2),
  },
  previewContainer: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    overflow: 'hidden',
    marginTop: theme.spacing(2),
  },
  previewHeader: {
    padding: theme.spacing(1, 2),
    backgroundColor:
      theme.palette.type === 'dark'
        ? theme.palette.background.default
        : theme.palette.grey[100],
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  previewFileItem: {
    borderBottom: `1px solid ${theme.palette.divider}`,
    '&:last-child': {
      borderBottom: 'none',
    },
  },
  previewFileName: {
    padding: theme.spacing(1, 2),
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    '&:hover': {
      backgroundColor:
        theme.palette.type === 'dark'
          ? 'rgba(255, 255, 255, 0.04)'
          : 'rgba(0, 0, 0, 0.02)',
    },
  },
  previewCode: {
    margin: 0,
    padding: theme.spacing(1.5),
    backgroundColor:
      theme.palette.type === 'dark'
        ? theme.palette.background.default
        : theme.palette.grey[50],
    fontSize: '0.75rem',
    overflow: 'auto',
    maxHeight: 200,
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-all' as const,
  },
  migrateReleaseList: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    overflow: 'hidden',
  },
  migrateReleaseListHeader: {
    padding: theme.spacing(1, 2),
    backgroundColor:
      theme.palette.type === 'dark'
        ? theme.palette.background.default
        : theme.palette.grey[100],
    borderBottom: `1px solid ${theme.palette.divider}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  migrateReleaseScroll: {
    maxHeight: 320,
    overflowY: 'auto' as const,
  },
  migrateReleaseItem: {
    padding: theme.spacing(1.5, 2),
    borderBottom: `1px solid ${theme.palette.divider}`,
    '&:last-child': {
      borderBottom: 'none',
    },
  },
  migrateReleaseItemSelected: {
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(76, 175, 80, 0.08)'
        : 'rgba(76, 175, 80, 0.04)',
  },
  providerSetupRoot: {
    maxWidth: 600,
    margin: '0 auto',
  },
  providerButton: {
    flex: 1,
    padding: theme.spacing(3),
    border: `2px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    cursor: 'pointer',
    textAlign: 'center' as const,
    transition: 'border-color 0.2s',
    backgroundColor: 'transparent',
    color: 'inherit',
    '&:hover': {
      borderColor: theme.palette.primary.main,
    },
  },
  connectedBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing(1.5, 2),
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.divider}`,
    marginBottom: theme.spacing(2),
  },
  connectedInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1.5),
  },
  confirmInput: {
    marginTop: theme.spacing(2),
    marginBottom: theme.spacing(1),
  },
  warningBox: {
    padding: theme.spacing(1.5),
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.error.main}`,
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(244, 67, 54, 0.08)'
        : 'rgba(244, 67, 54, 0.04)',
    marginTop: theme.spacing(2),
    marginBottom: theme.spacing(2),
  },
}));

// ---------------------------------------------------------------------------
// Hook: useBranchLoader
// ---------------------------------------------------------------------------

function useBranchLoader(
  repository: string,
  repositories: Repository[],
) {
  const api = useApi(butlerApiRef);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [defaultBranch, setDefaultBranch] = useState('main');

  useEffect(() => {
    if (!repository) {
      setBranches([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [owner, repo] = repository.split('/');
        if (owner && repo) {
          const list = await api.listBranches(owner, repo);
          if (!cancelled) {
            setBranches(list);
            const repoObj = repositories.find(r => r.fullName === repository);
            if (repoObj?.defaultBranch) {
              setDefaultBranch(repoObj.defaultBranch);
            }
          }
        }
      } catch {
        if (!cancelled) setBranches([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [repository, repositories, api]);

  return { branches, loading, defaultBranch };
}

// ===========================================================================
// Main Component: GitOpsTab
// ===========================================================================

export const GitOpsTab = ({
  clusterNamespace,
  clusterName,
}: GitOpsTabProps) => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);

  // Core state
  const [gitConfig, setGitConfig] = useState<GitProviderConfig | null>(null);
  const [gitOpsStatus, setGitOpsStatus] = useState<GitOpsStatus | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryResult | null>(null);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // Dialog visibility
  const [enableOpen, setEnableOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [exportRelease, setExportRelease] = useState<DiscoveredRelease | null>(
    null,
  );
  const [migrateOpen, setMigrateOpen] = useState(false);

  // -----------------------------------------------------------------------
  // Data Loading
  // -----------------------------------------------------------------------

  const loadGitConfig = useCallback(async () => {
    try {
      const config = await api.getGitOpsConfig();
      setGitConfig(config);
      if (config.configured) {
        try {
          const repos = await api.listRepositories();
          setRepositories(repos);
        } catch {
          /* non-critical */
        }
      }
    } catch {
      /* non-critical */
    }
  }, [api]);

  const loadStatus = useCallback(async () => {
    try {
      const status = await api.getClusterGitOpsStatus(
        clusterNamespace,
        clusterName,
      );
      setGitOpsStatus(status);
      return status;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [api, clusterNamespace, clusterName]);

  const discoverReleases = useCallback(async () => {
    setDiscovering(true);
    try {
      const result = await api.discoverClusterReleases(
        clusterNamespace,
        clusterName,
      );
      setDiscovery(result);
      setError(undefined);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Failed to discover releases',
      );
    } finally {
      setDiscovering(false);
    }
  }, [api, clusterNamespace, clusterName]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await loadGitConfig();
      const status = await loadStatus();
      if (status?.enabled) {
        await discoverReleases();
      }
      setLoading(false);
    };
    init();
  }, [loadGitConfig, loadStatus, discoverReleases]);

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleRefresh = async () => {
    const status = await loadStatus();
    if (status?.enabled) {
      await discoverReleases();
    }
  };

  const handleGitConfigured = async () => {
    await loadGitConfig();
  };

  const handleEnableSuccess = async () => {
    setEnableOpen(false);
    await loadStatus();
    await discoverReleases();
  };

  const handleDisableGitOps = async () => {
    setDisabling(true);
    try {
      await api.disableClusterGitOps(clusterNamespace, clusterName);
      setDisableOpen(false);
      setDiscovery(null);
      await loadStatus();
    } catch {
      /* handled silently */
    } finally {
      setDisabling(false);
    }
  };

  // -----------------------------------------------------------------------
  // Derived State
  // -----------------------------------------------------------------------

  const isEnabled = gitOpsStatus?.enabled ?? false;
  const gitopsEngine = discovery?.gitopsEngine;
  const isGitOpsInstalled = gitopsEngine?.installed || isEnabled;

  const allReleases = useMemo(() => {
    if (!discovery) return [];
    return [
      ...sortReleases(discovery.matched || []),
      ...sortReleases(discovery.unmatched || []),
    ];
  }, [discovery]);

  const releasesNeedingUrl = useMemo(
    () => (discovery?.unmatched || []).filter(r => !r.repoUrl),
    [discovery],
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (loading) {
    return <Progress />;
  }

  if (error && !discovery && !gitOpsStatus) {
    return (
      <EmptyState
        title="Failed to load GitOps status"
        description={error}
        missing="info"
      />
    );
  }

  if (!gitConfig?.configured) {
    return <GitProviderSetup onConfigured={handleGitConfigured} />;
  }

  return (
    <div className={classes.root}>
      {/* Header */}
      <div className={classes.headerRow}>
        <Typography variant="h6">GitOps Configuration</Typography>
        <div className={classes.actions}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={handleRefresh}
          >
            Refresh
          </Button>
          {isGitOpsInstalled ? (
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

      {/* Status Card */}
      <InfoCard title="GitOps Engine Status" className={classes.statusCard}>
        <div>
          <div className={classes.statusRow}>
            <Typography className={classes.statusLabel}>Status</Typography>
            <Box display="flex" alignItems="center">
              {isEnabled ? (
                <>
                  <CheckCircleIcon className={classes.enabledIcon} />
                  <Typography className={classes.statusValue}>
                    Enabled
                  </Typography>
                </>
              ) : (
                <>
                  <CancelIcon className={classes.disabledIcon} />
                  <Typography className={classes.statusValue}>
                    Disabled
                  </Typography>
                </>
              )}
            </Box>
          </div>
          {gitOpsStatus?.provider && (
            <div className={classes.statusRow}>
              <Typography className={classes.statusLabel}>Provider</Typography>
              <Chip
                label={TOOL_LABELS[gitOpsStatus.provider]}
                size="small"
                variant="outlined"
              />
            </div>
          )}
          {(gitOpsStatus?.version || gitOpsStatus?.fluxVersion) && (
            <div className={classes.statusRow}>
              <Typography className={classes.statusLabel}>Version</Typography>
              <Typography className={classes.statusValue}>
                {gitOpsStatus.version || gitOpsStatus.fluxVersion}
              </Typography>
            </div>
          )}
          {gitOpsStatus?.repository && (
            <div className={classes.statusRow}>
              <Typography className={classes.statusLabel}>
                Repository
              </Typography>
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
              <Typography className={classes.statusLabel}>
                Reconciliation
              </Typography>
              <StatusBadge status={gitOpsStatus.status} />
            </div>
          )}
          {gitopsEngine && (
            <div className={classes.statusRow}>
              <Typography className={classes.statusLabel}>
                Components
              </Typography>
              <Typography className={classes.statusValue}>
                {gitopsEngine.components?.length ?? 0} running
              </Typography>
            </div>
          )}
        </div>
      </InfoCard>

      {/* Git Provider Connection */}
      <div className={classes.connectedBar}>
        <div className={classes.connectedInfo}>
          <LinkIcon fontSize="small" color="action" />
          <div>
            <Typography variant="body2">
              Connected to{' '}
              {PROVIDER_LABELS[gitConfig.type!] || gitConfig.type}
            </Typography>
            <Typography variant="caption" color="textSecondary">
              {gitConfig.username}
              {gitConfig.organization
                ? ` -- ${gitConfig.organization}`
                : ''}
            </Typography>
          </div>
        </div>
        {isGitOpsInstalled && allReleases.length > 0 && (
          <Button
            variant="outlined"
            size="small"
            color="primary"
            onClick={() => setMigrateOpen(true)}
          >
            Export All to GitOps
          </Button>
        )}
      </div>

      {/* Discovered Releases */}
      {isGitOpsInstalled && (
        <>
          <div className={classes.headerRow}>
            <div>
              <Typography variant="h6">Discovered Releases</Typography>
              <Typography variant="body2" color="textSecondary">
                {allReleases.length} Helm release
                {allReleases.length !== 1 ? 's' : ''} found on this cluster
              </Typography>
            </div>
            <Button
              variant="outlined"
              size="small"
              startIcon={
                discovering ? (
                  <CircularProgress size={16} />
                ) : (
                  <RefreshIcon />
                )
              }
              onClick={discoverReleases}
              disabled={discovering}
            >
              {discovering ? 'Discovering...' : 'Refresh'}
            </Button>
          </div>

          {releasesNeedingUrl.length > 0 && (
            <div className={classes.warningBanner}>
              <WarningIcon className={classes.warningIcon} />
              <div>
                <Typography variant="body2" style={{ fontWeight: 600 }}>
                  {releasesNeedingUrl.length} release
                  {releasesNeedingUrl.length !== 1 ? 's' : ''} need repository
                  URL
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  These releases don't match any AddonDefinition and couldn't
                  be auto-detected. You'll need to provide the Helm repository
                  URL when exporting.
                </Typography>
              </div>
            </div>
          )}

          {discovering && allReleases.length === 0 ? (
            <Progress />
          ) : allReleases.length === 0 ? (
            <EmptyState
              title="No Helm releases found"
              description="No Helm releases were discovered on this cluster."
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
                  <ReleaseCard
                    release={release}
                    onExport={() => setExportRelease(release)}
                  />
                </Grid>
              ))}
            </Grid>
          )}
        </>
      )}

      {/* Dialogs */}
      <EnableGitOpsDialog
        open={enableOpen}
        clusterNamespace={clusterNamespace}
        clusterName={clusterName}
        repositories={repositories}
        onClose={() => setEnableOpen(false)}
        onSuccess={handleEnableSuccess}
      />

      <DisableGitOpsDialog
        open={disableOpen}
        clusterName={clusterName}
        disabling={disabling}
        onClose={() => setDisableOpen(false)}
        onConfirm={handleDisableGitOps}
      />

      <ExportReleaseDialog
        open={!!exportRelease}
        release={exportRelease}
        repositories={repositories}
        clusterNamespace={clusterNamespace}
        clusterName={clusterName}
        onClose={() => setExportRelease(null)}
        onSuccess={() => setExportRelease(null)}
      />

      <MigrateAllDialog
        open={migrateOpen}
        releases={allReleases}
        repositories={repositories}
        clusterNamespace={clusterNamespace}
        clusterName={clusterName}
        configuredRepository={gitopsEngine?.repository}
        onClose={() => setMigrateOpen(false)}
        onSuccess={() => setMigrateOpen(false)}
      />
    </div>
  );
};

export default GitOpsTab;

// ===========================================================================
// ReleaseCard
// ===========================================================================

interface ReleaseCardProps {
  release: DiscoveredRelease;
  onExport: () => void;
}

function ReleaseCard({ release, onExport }: ReleaseCardProps) {
  const classes = useStyles();
  const [valuesOpen, setValuesOpen] = useState(false);

  const isMatched = !!release.addonDefinition;
  const isPlatform = !!release.platform;
  const hasRepoUrl = !!release.repoUrl;
  const needsUrl = !isMatched && !hasRepoUrl;
  const hasValues =
    release.values != null && Object.keys(release.values).length > 0;

  return (
    <Card
      className={`${classes.releaseCard} ${needsUrl ? classes.warningCardBorder : ''}`}
      variant="outlined"
    >
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="subtitle1" noWrap>
            {release.name}
          </Typography>
          {isPlatform && (
            <Chip
              label="Platform"
              size="small"
              variant="outlined"
              className={classes.platformChip}
            />
          )}
        </Box>
        <Typography variant="body2" color="textSecondary">
          {release.namespace}
        </Typography>
        <div className={classes.releaseChips}>
          <Chip label={release.chart} size="small" variant="outlined" />
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
              label={getCategoryLabel(release.category)}
              size="small"
              color={
                release.category === 'infrastructure' ? 'primary' : 'default'
              }
              variant="outlined"
              className={classes.categoryChip}
            />
          </Box>
        )}
        <Typography variant="caption" color="textSecondary" component="div">
          Revision: {release.revision}
        </Typography>
        {needsUrl && (
          <div className={classes.repoUrlWarning}>
            <WarningIcon style={{ fontSize: '0.875rem' }} />
            <span>Repo URL required</span>
          </div>
        )}
        {hasRepoUrl && !isMatched && (
          <Typography
            variant="caption"
            color="textSecondary"
            component="div"
            noWrap
            title={release.repoUrl}
            style={{ marginTop: 4 }}
          >
            {release.repoUrl}
          </Typography>
        )}
        {hasValues && (
          <div className={classes.releaseValues}>
            <Typography
              variant="caption"
              color="textSecondary"
              style={{ cursor: 'pointer' }}
              onClick={() => setValuesOpen(v => !v)}
            >
              {Object.keys(release.values!).length} custom values
              {valuesOpen ? ' (hide)' : ' (show)'}
            </Typography>
            <Collapse in={valuesOpen}>
              <pre>{JSON.stringify(release.values, null, 2)}</pre>
            </Collapse>
          </div>
        )}
      </CardContent>
      <CardActions>
        <Button
          size="small"
          color="primary"
          startIcon={<CloudUploadIcon />}
          onClick={onExport}
        >
          Export to Git
        </Button>
      </CardActions>
    </Card>
  );
}

// ===========================================================================
// GitProviderSetup
// ===========================================================================

interface GitProviderSetupProps {
  onConfigured: () => void;
}

function GitProviderSetup({ onConfigured }: GitProviderSetupProps) {
  const classes = useStyles();
  const api = useApi(butlerApiRef);

  const [providerType, setProviderType] = useState<GitProviderType>('github');
  const [token, setToken] = useState('');
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showToken, setShowToken] = useState(false);

  const handleSubmit = async () => {
    if (!token.trim()) return;
    setSaving(true);
    setErrorMsg('');
    try {
      await api.saveGitOpsConfig({
        type: providerType,
        token: token.trim(),
        url: url.trim() || undefined,
      });
      onConfigured();
    } catch (e) {
      setErrorMsg(
        e instanceof Error ? e.message : 'Failed to save configuration',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={classes.providerSetupRoot}>
      <InfoCard title="Connect to Git Provider">
        <Box textAlign="center" mb={3}>
          <SettingsIcon style={{ fontSize: 48 }} color="action" />
          <Typography variant="h6" gutterBottom style={{ marginTop: 8 }}>
            Connect to GitOps
          </Typography>
          <Typography variant="body2" color="textSecondary">
            Connect your Git repository to export cluster configurations and
            enable GitOps workflows.
          </Typography>
        </Box>

        {!showForm ? (
          <Box>
            <Box display="flex" style={{ gap: 16 }}>
              <button
                type="button"
                className={classes.providerButton}
                onClick={() => {
                  setProviderType('github');
                  setShowForm(true);
                }}
              >
                <Typography variant="subtitle1">GitHub</Typography>
                <Typography variant="caption" color="textSecondary">
                  github.com or Enterprise
                </Typography>
              </button>
              <button
                type="button"
                className={classes.providerButton}
                onClick={() => {
                  setProviderType('gitlab');
                  setShowForm(true);
                }}
              >
                <Typography variant="subtitle1">GitLab</Typography>
                <Typography variant="caption" color="textSecondary">
                  gitlab.com or self-managed
                </Typography>
              </button>
            </Box>
            <Box mt={2} textAlign="center">
              <Typography variant="caption" color="textSecondary">
                Select your Git provider to get started
              </Typography>
            </Box>
          </Box>
        ) : (
          <Box>
            <Box
              display="flex"
              alignItems="center"
              justifyContent="center"
              mb={2}
            >
              <Chip
                label={PROVIDER_LABELS[providerType]}
                variant="outlined"
                onDelete={() => setShowForm(false)}
                size="small"
              />
            </Box>

            <TextField
              label="Personal Access Token"
              type={showToken ? 'text' : 'password'}
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder={
                providerType === 'github'
                  ? 'ghp_xxxxxxxxxxxx'
                  : 'glpat-xxxxxxxxxxxx'
              }
              fullWidth
              variant="outlined"
              size="small"
              className={classes.formField}
              helperText={
                providerType === 'github'
                  ? 'Requires repo scope'
                  : 'Requires api scope'
              }
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={() => setShowToken(v => !v)}
                      edge="end"
                    >
                      {showToken ? (
                        <VisibilityOffIcon fontSize="small" />
                      ) : (
                        <VisibilityIcon fontSize="small" />
                      )}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
              autoFocus
            />

            {providerType === 'github' && (
              <TextField
                label="GitHub URL (optional)"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://github.example.com (for GitHub Enterprise)"
                fullWidth
                variant="outlined"
                size="small"
                className={classes.formField}
              />
            )}

            {errorMsg && (
              <Typography
                variant="body2"
                color="error"
                style={{ marginBottom: 16 }}
              >
                {errorMsg}
              </Typography>
            )}

            <Box display="flex" justifyContent="flex-end" style={{ gap: 8 }}>
              <Button onClick={() => setShowForm(false)}>Back</Button>
              <Button
                variant="contained"
                color="primary"
                onClick={handleSubmit}
                disabled={saving || !token.trim()}
                startIcon={
                  saving ? <CircularProgress size={16} /> : undefined
                }
              >
                {saving ? 'Connecting...' : 'Connect'}
              </Button>
            </Box>
          </Box>
        )}
      </InfoCard>

      <Box mt={3}>
        <InfoCard title="What can you do with GitOps?">
          <Typography variant="body2" component="div">
            <ul style={{ paddingLeft: 20, margin: 0 }}>
              <li>Export cluster configuration to a Git repository</li>
              <li>Generate Flux CD or Argo CD manifests automatically</li>
              <li>Migrate existing Helm releases to declarative GitOps</li>
              <li>
                Create pull requests for review before changes are applied
              </li>
            </ul>
          </Typography>
        </InfoCard>
      </Box>
    </div>
  );
}

// ===========================================================================
// EnableGitOpsDialog
// ===========================================================================

interface EnableGitOpsDialogProps {
  open: boolean;
  clusterNamespace: string;
  clusterName: string;
  repositories: Repository[];
  onClose: () => void;
  onSuccess: () => void;
}

function EnableGitOpsDialog({
  open,
  clusterNamespace,
  clusterName,
  repositories,
  onClose,
  onSuccess,
}: EnableGitOpsDialogProps) {
  const classes = useStyles();
  const api = useApi(butlerApiRef);

  const [provider, setProvider] = useState<GitOpsToolType>('flux');
  const [repository, setRepository] = useState('');
  const [branch, setBranch] = useState('main');
  const [path, setPath] = useState(`clusters/${clusterName}`);
  const [isPrivate, setIsPrivate] = useState(true);
  const [componentsExtra, setComponentsExtra] = useState<string[]>(
    FLUX_EXTRA_COMPONENTS.map(c => c.name),
  );
  const [enabling, setEnabling] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const {
    branches,
    loading: loadingBranches,
    defaultBranch,
  } = useBranchLoader(repository, repositories);

  // Set default branch when loaded
  useEffect(() => {
    if (defaultBranch) {
      setBranch(defaultBranch);
    }
  }, [defaultBranch]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setProvider('flux');
      setRepository('');
      setBranch('main');
      setPath(`clusters/${clusterName}`);
      setIsPrivate(true);
      setComponentsExtra(FLUX_EXTRA_COMPONENTS.map(c => c.name));
      setEnabling(false);
      setErrorMsg('');
    }
  }, [open, clusterName]);

  const toggleComponent = (name: string) => {
    setComponentsExtra(prev =>
      prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name],
    );
  };

  const handleEnable = async () => {
    if (!repository) return;
    setEnabling(true);
    setErrorMsg('');
    try {
      const result = await api.enableClusterGitOps(
        clusterNamespace,
        clusterName,
        {
          provider,
          repository,
          branch,
          path,
          private: isPrivate,
          componentsExtra: provider === 'flux' ? componentsExtra : undefined,
        },
      );
      if (result && result.success !== false) {
        onSuccess();
      } else {
        setErrorMsg(result?.message || 'Failed to enable GitOps');
      }
    } catch (e) {
      setErrorMsg(
        e instanceof Error ? e.message : 'Failed to enable GitOps',
      );
    } finally {
      setEnabling(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Enable GitOps on {clusterName}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="textSecondary" gutterBottom>
          Select a GitOps tool and target repository. This will install the
          GitOps engine on your cluster and configure it for continuous
          delivery.
        </Typography>

        {/* Tool Selector */}
        <Box mt={2} mb={2}>
          <Typography variant="subtitle2" gutterBottom>
            GitOps Tool
          </Typography>
          <div className={classes.toolSelector}>
            {(['flux', 'argocd'] as GitOpsToolType[]).map(tool => {
              const isSelected = provider === tool;
              const isDisabled = tool === 'argocd';
              return (
                <div
                  key={tool}
                  className={`${classes.toolCard} ${isSelected ? classes.toolCardSelected : ''} ${isDisabled ? classes.toolCardDisabled : ''}`}
                  onClick={() => !isDisabled && setProvider(tool)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => {
                    if (
                      !isDisabled &&
                      (e.key === 'Enter' || e.key === ' ')
                    ) {
                      setProvider(tool);
                    }
                  }}
                >
                  <Typography
                    variant="subtitle2"
                    color={isSelected ? 'primary' : 'textPrimary'}
                  >
                    {TOOL_LABELS[tool]}
                  </Typography>
                  {isDisabled && (
                    <Typography variant="caption" color="textSecondary">
                      Coming soon
                    </Typography>
                  )}
                </div>
              );
            })}
          </div>
        </Box>

        {/* Repository */}
        <TextField
          select
          label="Target Repository"
          value={repository}
          onChange={e => setRepository(e.target.value)}
          fullWidth
          variant="outlined"
          size="small"
          className={classes.formField}
          helperText="This repository will store your cluster's GitOps manifests"
        >
          <MenuItem value="">
            <em>Select a repository...</em>
          </MenuItem>
          {repositories.map(repo => (
            <MenuItem key={repo.fullName} value={repo.fullName}>
              {repo.fullName}
              {repo.private ? ' (private)' : ''}
            </MenuItem>
          ))}
        </TextField>

        {/* Branch and Path */}
        <Grid container spacing={2}>
          <Grid item xs={6}>
            <TextField
              select
              label="Branch"
              value={branch}
              onChange={e => setBranch(e.target.value)}
              fullWidth
              variant="outlined"
              size="small"
              disabled={loadingBranches}
              className={classes.formField}
              InputProps={{
                endAdornment: loadingBranches ? (
                  <InputAdornment position="end">
                    <CircularProgress size={16} />
                  </InputAdornment>
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
          </Grid>
          <Grid item xs={6}>
            <TextField
              label="Path"
              value={path}
              onChange={e => setPath(e.target.value)}
              placeholder="clusters/my-cluster"
              fullWidth
              variant="outlined"
              size="small"
              className={classes.formField}
            />
          </Grid>
        </Grid>

        {/* Private Repo */}
        <FormControlLabel
          control={
            <Checkbox
              checked={isPrivate}
              onChange={e => setIsPrivate(e.target.checked)}
              color="primary"
            />
          }
          label={
            <div>
              <Typography variant="body2">Private repository</Typography>
              <Typography variant="caption" color="textSecondary">
                Create deploy key for private repository access
              </Typography>
            </div>
          }
        />

        {/* Extra Components (Flux only) */}
        {provider === 'flux' && (
          <Box mt={2}>
            <Typography variant="subtitle2" gutterBottom>
              Additional Components
            </Typography>
            {FLUX_EXTRA_COMPONENTS.map(comp => (
              <FormControlLabel
                key={comp.name}
                control={
                  <Checkbox
                    checked={componentsExtra.includes(comp.name)}
                    onChange={() => toggleComponent(comp.name)}
                    color="primary"
                  />
                }
                label={
                  <div>
                    <Typography variant="body2">{comp.label}</Typography>
                    <Typography variant="caption" color="textSecondary">
                      {comp.description}
                    </Typography>
                  </div>
                }
                style={{ display: 'flex', marginBottom: 4 }}
              />
            ))}
            <Typography variant="caption" color="textSecondary">
              These controllers enable automatic image updates via GitOps
            </Typography>
          </Box>
        )}

        {/* Info Box */}
        <div className={classes.infoBox}>
          <Typography variant="body2" style={{ fontWeight: 600 }}>
            What will be installed?
          </Typography>
          <Typography
            variant="caption"
            color="textSecondary"
            component="div"
          >
            <ul style={{ paddingLeft: 20, margin: '4px 0 0 0' }}>
              <li>Flux controllers in the flux-system namespace</li>
              <li>GitRepository and Kustomization resources</li>
              <li>
                Directory structure: {path}/infrastructure and {path}/apps
              </li>
              {componentsExtra.length > 0 && (
                <li>Extra: {componentsExtra.join(', ')}</li>
              )}
            </ul>
          </Typography>
        </div>

        {errorMsg && (
          <Box mt={2}>
            <Typography variant="body2" color="error">
              {errorMsg}
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={enabling}>
          Cancel
        </Button>
        <Button
          onClick={handleEnable}
          color="primary"
          variant="contained"
          disabled={enabling || !repository}
          startIcon={
            enabling ? <CircularProgress size={16} /> : undefined
          }
        >
          {enabling ? 'Installing...' : 'Enable GitOps'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ===========================================================================
// DisableGitOpsDialog
// ===========================================================================

interface DisableGitOpsDialogProps {
  open: boolean;
  clusterName: string;
  disabling: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

function DisableGitOpsDialog({
  open,
  clusterName,
  disabling,
  onClose,
  onConfirm,
}: DisableGitOpsDialogProps) {
  const classes = useStyles();
  const [confirmText, setConfirmText] = useState('');
  const canConfirm = confirmText === clusterName;

  useEffect(() => {
    if (open) {
      setConfirmText('');
    }
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Disable GitOps</DialogTitle>
      <DialogContent>
        <Typography variant="body2" gutterBottom>
          This will uninstall the GitOps engine from{' '}
          <strong>{clusterName}</strong> and remove all GitOps controllers.
          Your Git repository will not be affected.
        </Typography>

        <div className={classes.warningBox}>
          <Typography variant="body2" color="error">
            <strong>Warning:</strong> Any resources managed by the GitOps
            engine will no longer be automatically reconciled from Git.
          </Typography>
        </div>

        <Typography variant="body2" color="textSecondary">
          Type <strong>{clusterName}</strong> to confirm:
        </Typography>
        <TextField
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
          placeholder={clusterName}
          fullWidth
          variant="outlined"
          size="small"
          className={classes.confirmInput}
          autoFocus
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={disabling}>
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          color="secondary"
          variant="contained"
          disabled={!canConfirm || disabling}
          startIcon={
            disabling ? <CircularProgress size={16} /> : undefined
          }
        >
          {disabling ? 'Disabling...' : 'Disable GitOps'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ===========================================================================
// ExportReleaseDialog
// ===========================================================================

interface ExportReleaseDialogProps {
  open: boolean;
  release: DiscoveredRelease | null;
  repositories: Repository[];
  clusterNamespace: string;
  clusterName: string;
  onClose: () => void;
  onSuccess: () => void;
}

function ExportReleaseDialog({
  open,
  release,
  repositories,
  clusterNamespace,
  clusterName,
  onClose,
  onSuccess,
}: ExportReleaseDialogProps) {
  const classes = useStyles();
  const api = useApi(butlerApiRef);

  const [repository, setRepository] = useState('');
  const [branch, setBranch] = useState('main');
  const [path, setPath] = useState('');
  const [createPR, setCreatePR] = useState(true);
  const [customRepoUrl, setCustomRepoUrl] = useState('');
  const [exporting, setExporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Preview state
  const [preview, setPreview] = useState<Record<string, string> | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const {
    branches,
    loading: loadingBranches,
    defaultBranch,
  } = useBranchLoader(repository, repositories);

  useEffect(() => {
    if (defaultBranch) {
      setBranch(defaultBranch);
    }
  }, [defaultBranch]);

  // Reset form when release changes
  useEffect(() => {
    if (open && release) {
      const defaultPath = release.platform
        ? `clusters/${clusterName}/infrastructure/${release.name}`
        : `clusters/${clusterName}/apps/${release.name}`;
      setPath(defaultPath);
      setCustomRepoUrl(release.repoUrl || '');
      setCreatePR(true);
      setExporting(false);
      setErrorMsg('');
      setPreview(null);
      setExpandedFiles(new Set());
      if (repositories.length > 0 && !repository) {
        setRepository(repositories[0].fullName);
      }
    }
  }, [open, release, clusterName, repositories, repository]);

  if (!release) return null;

  const needsRepoUrl = !release.addonDefinition && !customRepoUrl;

  const togglePreview = async () => {
    if (preview) {
      setPreview(null);
      return;
    }
    if (!repository) return;
    setLoadingPreview(true);
    try {
      const result = await api.previewManifests({
        addonName: release.name,
        repository,
        targetPath: path,
        values: release.values,
      });
      setPreview(result);
    } catch {
      /* preview is non-critical */
    } finally {
      setLoadingPreview(false);
    }
  };

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

  const handleExport = async () => {
    if (!repository || needsRepoUrl) return;
    setExporting(true);
    setErrorMsg('');
    try {
      const result = await api.exportClusterAddon(
        clusterNamespace,
        clusterName,
        {
          addonName: release.name,
          repository,
          branch,
          targetPath: path,
          values: release.values,
          createPR,
          prTitle: `Add ${release.name} addon`,
          prBody: `This PR adds the ${release.name} addon (${release.chart}:${release.chartVersion}) to the cluster.\n\nExported via Butler Portal.`,
        },
      );
      if (result.success) {
        onSuccess();
      } else {
        setErrorMsg(result.message);
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Failed to export');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Export {release.name} to Git</DialogTitle>
      <DialogContent>
        {/* Release Info */}
        <div className={classes.releaseInfo}>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <div>
              <Typography variant="body2" style={{ fontWeight: 600 }}>
                {release.name}
              </Typography>
              <Typography variant="caption" color="textSecondary">
                {release.chart}:{release.chartVersion} in {release.namespace}
              </Typography>
            </div>
            <Chip
              label={release.status}
              size="small"
              variant="outlined"
              color={release.status === 'deployed' ? 'primary' : 'default'}
            />
          </Box>
        </div>

        {/* Repository */}
        <TextField
          select
          label="Target Repository"
          value={repository}
          onChange={e => setRepository(e.target.value)}
          fullWidth
          variant="outlined"
          size="small"
          className={classes.formField}
        >
          <MenuItem value="">
            <em>Select a repository...</em>
          </MenuItem>
          {repositories.map(repo => (
            <MenuItem key={repo.fullName} value={repo.fullName}>
              {repo.fullName}
            </MenuItem>
          ))}
        </TextField>

        {/* Branch and Path */}
        <Grid container spacing={2}>
          <Grid item xs={6}>
            <TextField
              select
              label="Branch"
              value={branch}
              onChange={e => setBranch(e.target.value)}
              fullWidth
              variant="outlined"
              size="small"
              disabled={loadingBranches}
              className={classes.formField}
              InputProps={{
                endAdornment: loadingBranches ? (
                  <InputAdornment position="end">
                    <CircularProgress size={16} />
                  </InputAdornment>
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
          </Grid>
          <Grid item xs={6}>
            <TextField
              label="Path"
              value={path}
              onChange={e => setPath(e.target.value)}
              placeholder="clusters/my-cluster/apps/addon"
              fullWidth
              variant="outlined"
              size="small"
              className={classes.formField}
            />
          </Grid>
        </Grid>

        {/* Helm Repo URL for unmatched releases */}
        {!release.addonDefinition && (
          <TextField
            label="Helm Repository URL"
            value={customRepoUrl}
            onChange={e => setCustomRepoUrl(e.target.value)}
            placeholder="https://charts.example.com"
            fullWidth
            variant="outlined"
            size="small"
            className={classes.formField}
            required
            error={needsRepoUrl}
            helperText={
              needsRepoUrl
                ? 'This release does not match any known addon. Please provide the Helm repository URL.'
                : undefined
            }
          />
        )}

        {/* Create PR */}
        <FormControlLabel
          control={
            <Checkbox
              checked={createPR}
              onChange={e => setCreatePR(e.target.checked)}
              color="primary"
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

        {/* Preview Toggle */}
        {repository && (
          <Box mt={1}>
            <Button
              size="small"
              color="primary"
              onClick={togglePreview}
              disabled={loadingPreview}
              startIcon={
                loadingPreview ? (
                  <CircularProgress size={14} />
                ) : preview ? (
                  <VisibilityOffIcon fontSize="small" />
                ) : (
                  <VisibilityIcon fontSize="small" />
                )
              }
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
        {preview && (
          <div className={classes.previewContainer}>
            <div className={classes.previewHeader}>
              <Typography variant="caption" color="textSecondary">
                Generated Files
              </Typography>
            </div>
            <div style={{ maxHeight: 256, overflowY: 'auto' }}>
              {Object.entries(preview).map(([filename, content]) => {
                const isExpanded = expandedFiles.has(filename);
                return (
                  <div key={filename} className={classes.previewFileItem}>
                    <div
                      className={classes.previewFileName}
                      onClick={() => toggleFile(filename)}
                    >
                      <Typography variant="body2">{filename}</Typography>
                      <IconButton size="small">
                        {isExpanded ? (
                          <VisibilityOffIcon fontSize="small" />
                        ) : (
                          <VisibilityIcon fontSize="small" />
                        )}
                      </IconButton>
                    </div>
                    <Collapse in={isExpanded}>
                      <pre className={classes.previewCode}>{content}</pre>
                    </Collapse>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {errorMsg && (
          <Box mt={2}>
            <Typography variant="body2" color="error">
              {errorMsg}
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={exporting}>
          Cancel
        </Button>
        <Button
          onClick={handleExport}
          color="primary"
          variant="contained"
          disabled={exporting || !repository || needsRepoUrl}
          startIcon={
            exporting ? <CircularProgress size={16} /> : undefined
          }
        >
          {exporting
            ? 'Exporting...'
            : createPR
              ? 'Create Pull Request'
              : 'Export to Repository'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ===========================================================================
// MigrateAllDialog
// ===========================================================================

interface MigrateAllDialogProps {
  open: boolean;
  releases: DiscoveredRelease[];
  repositories: Repository[];
  clusterNamespace: string;
  clusterName: string;
  configuredRepository?: string;
  onClose: () => void;
  onSuccess: () => void;
}

function MigrateAllDialog({
  open,
  releases,
  repositories,
  clusterNamespace,
  clusterName,
  configuredRepository,
  onClose,
  onSuccess,
}: MigrateAllDialogProps) {
  const classes = useStyles();
  const api = useApi(butlerApiRef);

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Form
  const [repository, setRepository] = useState('');
  const [branch, setBranch] = useState('main');
  const [basePath, setBasePath] = useState(`clusters/${clusterName}`);
  const [createPR, setCreatePR] = useState(true);
  const [customRepoUrls, setCustomRepoUrls] = useState<
    Record<string, string>
  >({});

  // Status
  const [migrating, setMigrating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const {
    branches,
    loading: loadingBranches,
    defaultBranch,
  } = useBranchLoader(repository, repositories);

  useEffect(() => {
    if (defaultBranch) {
      setBranch(defaultBranch);
    }
  }, [defaultBranch]);

  const sortedReleases = useMemo(() => sortReleases(releases), [releases]);

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      // Pre-select releases that have repo URL or addon definition
      setSelected(
        new Set(
          releases
            .filter(r => r.addonDefinition || r.repoUrl)
            .map(r => `${r.namespace}/${r.name}`),
        ),
      );
      setRepository(configuredRepository || '');
      setBranch('main');
      setBasePath(`clusters/${clusterName}`);
      setCreatePR(true);
      setCustomRepoUrls({});
      setMigrating(false);
      setErrorMsg('');
    }
  }, [open, releases, clusterName, configuredRepository]);

  const selectedReleases = useMemo(
    () =>
      sortedReleases.filter(r =>
        selected.has(`${r.namespace}/${r.name}`),
      ),
    [sortedReleases, selected],
  );

  const unmatchedSelected = useMemo(
    () =>
      selectedReleases.filter(
        r =>
          !r.addonDefinition &&
          !r.repoUrl &&
          !customRepoUrls[`${r.namespace}/${r.name}`],
      ),
    [selectedReleases, customRepoUrls],
  );

  const canMigrate =
    repository && selected.size > 0 && unmatchedSelected.length === 0;

  const toggleRelease = (release: DiscoveredRelease) => {
    const key = `${release.namespace}/${release.name}`;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelected(
      new Set(sortedReleases.map(r => `${r.namespace}/${r.name}`)),
    );
  };

  const selectNone = () => {
    setSelected(new Set());
  };

  const handleMigrate = async () => {
    if (!canMigrate) return;
    setMigrating(true);
    setErrorMsg('');
    try {
      const migrationReleases: MigrationRelease[] = selectedReleases.map(
        r => ({
          name: r.name,
          namespace: r.namespace,
          repoUrl:
            r.repoUrl ||
            customRepoUrls[`${r.namespace}/${r.name}`] ||
            '',
          chartName: r.chart,
          chartVersion: r.chartVersion,
          values: r.values,
          category: r.category,
        }),
      );

      const result = await api.migrateClusterReleases(
        clusterNamespace,
        clusterName,
        {
          releases: migrationReleases,
          repository,
          branch,
          basePath,
          createPR,
          prTitle: `Migrate ${selected.size} releases to GitOps`,
        },
      );

      if (result.success) {
        onSuccess();
      } else {
        setErrorMsg(result.message);
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Failed to migrate');
    } finally {
      setMigrating(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Export All Releases to GitOps</DialogTitle>
      <DialogContent>
        {/* Summary */}
        <div className={classes.releaseInfo}>
          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
          >
            <Typography variant="body2">
              <strong>{selected.size}</strong> of{' '}
              <strong>{releases.length}</strong> releases selected
            </Typography>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button size="small" color="primary" onClick={selectAll}>
                Select All
              </Button>
              <Button size="small" onClick={selectNone}>
                Select None
              </Button>
            </div>
          </Box>
        </div>

        {/* Repository and Branch */}
        <Grid container spacing={2}>
          <Grid item xs={8}>
            <TextField
              select
              label="Target Repository"
              value={repository}
              onChange={e => setRepository(e.target.value)}
              fullWidth
              variant="outlined"
              size="small"
              className={classes.formField}
            >
              <MenuItem value="">
                <em>Select a repository...</em>
              </MenuItem>
              {repositories.map(repo => (
                <MenuItem key={repo.fullName} value={repo.fullName}>
                  {repo.fullName}
                  {repo.fullName === configuredRepository
                    ? ' (configured)'
                    : ''}
                  {repo.private ? ' (private)' : ''}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={4}>
            <TextField
              select
              label="Branch"
              value={branch}
              onChange={e => setBranch(e.target.value)}
              fullWidth
              variant="outlined"
              size="small"
              disabled={loadingBranches}
              className={classes.formField}
              InputProps={{
                endAdornment: loadingBranches ? (
                  <InputAdornment position="end">
                    <CircularProgress size={16} />
                  </InputAdornment>
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
          </Grid>
        </Grid>

        {/* Base Path */}
        <TextField
          label="Base Path"
          value={basePath}
          onChange={e => setBasePath(e.target.value)}
          placeholder="clusters/my-cluster"
          fullWidth
          variant="outlined"
          size="small"
          className={classes.formField}
          helperText={`Releases will be organized as: ${basePath}/infrastructure/[addon] and ${basePath}/apps/[addon]`}
        />

        {/* Create PR */}
        <FormControlLabel
          control={
            <Checkbox
              checked={createPR}
              onChange={e => setCreatePR(e.target.checked)}
              color="primary"
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

        {/* Release Selection List */}
        <Box mt={2}>
          <div className={classes.migrateReleaseList}>
            <div className={classes.migrateReleaseListHeader}>
              <Typography variant="subtitle2">
                Select Releases to Export
              </Typography>
            </div>
            <div className={classes.migrateReleaseScroll}>
              {sortedReleases.map(release => {
                const key = `${release.namespace}/${release.name}`;
                const isSelected = selected.has(key);
                const needsRepoUrl =
                  !release.addonDefinition && !release.repoUrl;
                const hasUrl =
                  !!release.repoUrl || !!customRepoUrls[key];

                return (
                  <div
                    key={key}
                    className={`${classes.migrateReleaseItem} ${isSelected ? classes.migrateReleaseItemSelected : ''}`}
                  >
                    <Box display="flex" alignItems="center">
                      <Checkbox
                        checked={isSelected}
                        onChange={() => toggleRelease(release)}
                        color="primary"
                        size="small"
                      />
                      <Box flex={1} ml={1} minWidth={0}>
                        <Box display="flex" alignItems="center" style={{ gap: 8 }}>
                          <Typography
                            variant="body2"
                            style={{ fontWeight: 500 }}
                            noWrap
                          >
                            {release.name}
                          </Typography>
                          {release.platform && (
                            <Chip
                              label="Platform"
                              size="small"
                              className={classes.platformChip}
                              variant="outlined"
                              style={{ height: 20, fontSize: '0.7rem' }}
                            />
                          )}
                          <Chip
                            label={getCategoryLabel(release.category)}
                            size="small"
                            variant="outlined"
                            style={{ height: 20, fontSize: '0.7rem' }}
                          />
                        </Box>
                        <Typography variant="caption" color="textSecondary">
                          {release.namespace} -- {release.chart}:
                          {release.chartVersion}
                          {release.repoUrl &&
                            !release.addonDefinition &&
                            ` -- ${release.repoUrl}`}
                        </Typography>
                      </Box>
                      {needsRepoUrl && !hasUrl && isSelected && (
                        <Typography
                          variant="caption"
                          style={{ color: '#ff9800', whiteSpace: 'nowrap' }}
                        >
                          Needs repo URL
                        </Typography>
                      )}
                    </Box>

                    {/* Inline repo URL input for unmatched releases */}
                    {needsRepoUrl && isSelected && (
                      <Box mt={1} ml={5}>
                        <TextField
                          value={customRepoUrls[key] || ''}
                          onChange={e =>
                            setCustomRepoUrls(prev => ({
                              ...prev,
                              [key]: e.target.value,
                            }))
                          }
                          placeholder="Enter Helm repository URL..."
                          fullWidth
                          variant="outlined"
                          size="small"
                          error={!hasUrl}
                        />
                      </Box>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </Box>

        {/* Validation Warning */}
        {unmatchedSelected.length > 0 && (
          <div
            className={classes.warningBanner}
            style={{ marginTop: 16, marginBottom: 0 }}
          >
            <WarningIcon className={classes.warningIcon} />
            <div>
              <Typography variant="body2" style={{ fontWeight: 600 }}>
                {unmatchedSelected.length} selected release
                {unmatchedSelected.length > 1 ? 's' : ''} need Helm
                repository URL
              </Typography>
              <Typography variant="caption" color="textSecondary">
                {unmatchedSelected.map(r => r.name).join(', ')}
              </Typography>
            </div>
          </div>
        )}

        {errorMsg && (
          <Box mt={2}>
            <Typography variant="body2" color="error">
              {errorMsg}
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={migrating}>
          Cancel
        </Button>
        <Button
          onClick={handleMigrate}
          color="primary"
          variant="contained"
          disabled={migrating || !canMigrate}
          startIcon={
            migrating ? <CircularProgress size={16} /> : undefined
          }
        >
          {migrating
            ? `Exporting ${selected.size} releases...`
            : createPR
              ? `Create PR with ${selected.size} releases`
              : `Export ${selected.size} releases`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
