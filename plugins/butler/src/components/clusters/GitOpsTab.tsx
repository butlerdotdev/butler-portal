// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
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
  GITOPS_TOOL_CONFIG,
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
  ButlerLinkButton,
  ButlerPreviewToggle,
  ButlerSelect,
  ButlerSpinner,
  ButlerStack,
} from '../ui';

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

export const GITOPS_EMPTY_TEXT = 'No Helm releases found on this cluster';

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
    row: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
    },
    left: { display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 },
    actions: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
    // Console: p-4 bg-gradient-to-r from-blue-900/20 to-purple-900/20 border-blue-500/30
    engineCard: {
      padding: 16,
      borderColor: rgba(p.blue[500], 0.3),
      backgroundImage: `linear-gradient(to right, ${rgba(
        p.blue[500],
        0.12,
      )}, ${rgba(p.violet[500], 0.12)})`,
    },
    emoji: { fontSize: 24, lineHeight: '32px' },
    cardTitle: {
      margin: 0,
      fontSize: 16,
      lineHeight: '24px',
      fontWeight: 500,
      color: t.text.strong,
    },
    cardSub: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.muted,
    },
    cardSubMono: { fontFamily: t.fontMono, fontSize: 12 },
    engineChip: { border: `1px solid ${rgba(p.green[500], 0.3)}` },
    engineChipDegraded: { border: `1px solid ${rgba(p.yellow[500], 0.3)}` },
    // Console: p-6 border-dashed border-2 border-neutral-700 bg-neutral-900/50
    cta: {
      padding: 24,
      borderStyle: 'dashed',
      borderWidth: 2,
      borderColor: rgb(p.neutral[700]),
      backgroundColor: rgba(p.neutral[900], 0.5),
    },
    ctaIcon: {
      width: 48,
      height: 48,
      borderRadius: t.radius.lg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      color: rgb(p.blue[400]),
      backgroundImage: `linear-gradient(to bottom right, ${rgba(
        p.blue[500],
        0.2,
      )}, ${rgba(p.violet[500], 0.2)})`,
    },
    ctaTitle: {
      margin: 0,
      fontSize: 18,
      lineHeight: '28px',
      fontWeight: 500,
      color: t.text.strong,
    },
    ctaSub: { margin: '4px 0 0', color: t.text.muted },
    benefits: {
      marginTop: 24,
      paddingTop: 24,
      borderTop: `1px solid ${t.border}`,
    },
    benefitsTitle: {
      margin: '0 0 12px',
      fontSize: 14,
      lineHeight: '20px',
      fontWeight: 500,
      color: rgb(p.neutral[300]),
    },
    benefitsGrid: {
      display: 'grid',
      gridTemplateColumns: '1fr',
      gap: 16,
      '@media (min-width: 768px)': {
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      },
    },
    benefit: { display: 'flex', alignItems: 'flex-start', gap: 8 },
    benefitCheck: { color: rgb(p.green[400]), marginTop: 2, flexShrink: 0 },
    benefitTitle: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      fontWeight: 500,
      color: rgb(p.neutral[200]),
    },
    benefitDesc: {
      margin: 0,
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.subtle,
    },
    providerCard: { padding: 16 },
    providerIcon: {
      width: 40,
      height: 40,
      borderRadius: t.radius.lg,
      backgroundColor: rgb(p.neutral[800]),
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      color: t.text.muted,
    },
    gitlab: { color: rgb(p.orange[400]) },
    providerName: {
      margin: 0,
      fontSize: 16,
      lineHeight: '24px',
      fontWeight: 500,
      color: rgb(p.neutral[200]),
    },
    providerMeta: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.subtle,
    },
    sectionTitle: {
      margin: 0,
      fontSize: 18,
      lineHeight: '28px',
      fontWeight: 500,
      color: t.text.strong,
    },
    sectionSub: {
      margin: '4px 0 0',
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.muted,
    },
    warningCard: {
      padding: 16,
      borderColor: rgba(p.yellow[500], 0.3),
      backgroundColor: rgba(p.yellow[500], 0.05),
    },
    warningRow: { display: 'flex', alignItems: 'flex-start', gap: 12 },
    warningIcon: { color: rgb(p.yellow[400]), marginTop: 2, flexShrink: 0 },
    warningTitle: { margin: 0, fontWeight: 500, color: rgb(p.yellow[200]) },
    warningBody: {
      margin: '4px 0 0',
      fontSize: 14,
      lineHeight: '20px',
      color: rgba(p.yellow[300], 0.7),
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
    // Release card
    release: { padding: 16 },
    releaseNeedsUrl: { borderColor: rgba(p.yellow[500], 0.3) },
    releaseTop: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    releaseNameRow: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      minWidth: 0,
    },
    releaseName: {
      margin: 0,
      fontSize: 16,
      lineHeight: '24px',
      fontWeight: 500,
      color: t.text.strong,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    platformTag: {
      flexShrink: 0,
      padding: '2px 6px',
      borderRadius: t.radius.sm,
      fontSize: 12,
      lineHeight: '16px',
      fontWeight: 500,
      backgroundColor: rgba(p.violet[500], 0.1),
      color: rgb(p.violet[400]),
      border: `1px solid ${rgba(p.violet[500], 0.3)}`,
    },
    releaseMeta: {
      margin: '4px 0 0',
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.subtle,
    },
    releaseChips: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginTop: 8,
    },
    pill: {
      padding: '2px 8px',
      borderRadius: t.radius.pill,
      fontSize: 12,
      lineHeight: '16px',
    },
    pillInfra: {
      backgroundColor: rgba(p.blue[500], 0.1),
      color: rgb(p.blue[400]),
    },
    pillApp: { backgroundColor: rgb(p.neutral[700]), color: t.text.muted },
    pillDeployed: {
      backgroundColor: rgba(p.green[500], 0.1),
      color: rgb(p.green[400]),
    },
    pillOther: {
      backgroundColor: rgba(p.yellow[500], 0.1),
      color: rgb(p.yellow[400]),
    },
    repoWarning: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      marginTop: 8,
      fontSize: 12,
      color: rgb(p.yellow[400]),
    },
    repoUrl: {
      margin: '8px 0 0',
      fontSize: 12,
      color: rgb(p.neutral[600]),
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    values: {
      marginTop: 12,
      paddingTop: 12,
      borderTop: `1px solid ${t.border}`,
    },
    valuesSummary: {
      fontSize: 12,
      color: t.text.subtle,
      cursor: 'pointer',
      listStyle: 'none',
      '&::-webkit-details-marker': { display: 'none' },
      '&:hover': { color: t.text.muted },
    },
    valuesPre: {
      margin: '8px 0 0',
      padding: 8,
      borderRadius: t.radius.sm,
      backgroundColor: t.surface,
      fontFamily: t.fontMono,
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.muted,
      overflowX: 'auto',
      maxHeight: 128,
    },
    // Provider setup
    setupRoot: { maxWidth: 672, margin: '0 auto' },
    setupCard: { padding: 24 },
    setupHero: { textAlign: 'center', marginBottom: 24 },
    setupHeroIcon: {
      width: 64,
      height: 64,
      margin: '0 auto 16px',
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: rgba(p.green[500], 0.1),
      color: rgb(p.green[400]),
    },
    setupTitle: {
      margin: 0,
      fontSize: 20,
      lineHeight: '28px',
      fontWeight: 600,
      color: t.text.strong,
    },
    setupSub: { margin: '8px 0 0', color: t.text.muted },
    providerGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: 16,
    },
    providerButton: {
      padding: 16,
      borderRadius: t.radius.lg,
      border: `2px solid ${rgb(p.neutral[700])}`,
      backgroundColor: t.inset,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 12,
      cursor: 'pointer',
      fontFamily: t.fontSans,
      color: rgb(p.neutral[200]),
      transition: 'border-color 150ms, background-color 150ms',
      '&:hover': {
        backgroundColor: rgb(p.neutral[800]),
        color: t.text.primary,
      },
      '&:focus-visible': {
        outline: 'none',
        boxShadow: `0 0 0 2px ${t.surface}, 0 0 0 4px ${t.accent}`,
      },
    },
    providerGithub: { '&:hover': { borderColor: rgba(p.green[500], 0.5) } },
    providerGitlab: { '&:hover': { borderColor: rgba(p.orange[500], 0.5) } },
    providerButtonLabel: { fontSize: 16, fontWeight: 500 },
    providerButtonSub: { fontSize: 12, color: t.text.subtle },
    centerHint: {
      margin: 0,
      fontSize: 14,
      color: t.text.subtle,
      textAlign: 'center',
    },
    providerBadge: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: 8,
      borderRadius: t.radius.lg,
      backgroundColor: t.inset,
      color: rgb(p.neutral[300]),
      fontWeight: 500,
    },
    form: { display: 'flex', flexDirection: 'column', gap: 16 },
    formActions: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: 12,
      paddingTop: 8,
    },
    infoCard: {
      marginTop: 24,
      padding: 16,
      backgroundColor: rgba(p.neutral[900], 0.5),
    },
    infoTitle: {
      margin: '0 0 8px',
      fontSize: 14,
      lineHeight: '20px',
      fontWeight: 500,
      color: rgb(p.neutral[300]),
    },
    infoList: {
      margin: 0,
      padding: 0,
      listStyle: 'none',
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.muted,
      '& li': { display: 'flex', alignItems: 'flex-start', gap: 8 },
      '& li + li': { marginTop: 8 },
    },
    infoCheck: { color: rgb(p.green[400]), flexShrink: 0, marginTop: 2 },
    code: { fontFamily: t.fontMono, color: t.text.muted },
    link: {
      color: rgb(p.green[400]),
      '&:hover': { textDecoration: 'underline' },
    },
    linkGitlab: { color: rgb(p.orange[400]) },
    inlineError: {
      margin: 0,
      padding: 12,
      borderRadius: t.radius.lg,
      border: `1px solid ${rgba(p.red[500], 0.2)}`,
      backgroundColor: rgba(p.red[500], 0.1),
      fontSize: 14,
      color: rgb(p.red[400]),
    },
    // Dialog pieces
    dialogText: { margin: 0, color: rgb(p.neutral[300]) },
    dialogCenter: { margin: 0, color: t.text.muted, textAlign: 'center' },
    strong: { color: rgb(p.neutral[200]), fontWeight: 500 },
    toolGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: 12,
    },
    toolCard: {
      padding: 16,
      borderRadius: t.radius.lg,
      border: `2px solid ${rgb(p.neutral[700])}`,
      backgroundColor: t.inset,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      textAlign: 'left',
      cursor: 'pointer',
      fontFamily: t.fontSans,
      transition: 'border-color 150ms, background-color 150ms',
      '&:hover': { borderColor: rgb(p.neutral[600]) },
      '&:focus-visible': {
        outline: 'none',
        boxShadow: `0 0 0 2px ${t.surface}, 0 0 0 4px ${t.accent}`,
      },
      '&:disabled': {
        opacity: 0.5,
        cursor: 'not-allowed',
        backgroundColor: rgba(p.neutral[800], 0.3),
      },
    },
    toolCardSelected: {
      borderColor: rgb(p.green[500]),
      backgroundColor: rgba(p.green[500], 0.1),
      '&:hover': { borderColor: rgb(p.green[500]) },
    },
    toolLabel: { margin: 0, fontWeight: 500, color: rgb(p.neutral[200]) },
    toolLabelSelected: { color: rgb(p.green[400]) },
    toolHint: { margin: 0, fontSize: 12, color: t.text.subtle },
    componentList: { display: 'flex', flexDirection: 'column', gap: 8 },
    bullets: {
      margin: '4px 0 0',
      padding: 0,
      listStyle: 'none',
      '& li + li': { marginTop: 4 },
    },
    codeBlue: { fontFamily: t.fontMono, color: rgb(p.blue[400]) },
    releaseInfo: {
      padding: 12,
      borderRadius: t.radius.lg,
      backgroundColor: t.inset,
      border: `1px solid ${rgb(p.neutral[700])}`,
    },
    releaseInfoName: { margin: 0, fontWeight: 500, color: rgb(p.neutral[200]) },
    releaseInfoMeta: { margin: 0, fontSize: 14, color: t.text.subtle },
    confirmName: { fontFamily: t.fontMono, color: rgb(p.neutral[200]) },
    // Migrate-all list
    selectList: {
      border: `1px solid ${rgb(p.neutral[700])}`,
      borderRadius: t.radius.lg,
      overflow: 'hidden',
    },
    selectListHeader: {
      padding: '8px 12px',
      backgroundColor: rgb(p.neutral[800]),
      borderBottom: `1px solid ${rgb(p.neutral[700])}`,
      fontSize: 14,
      fontWeight: 500,
      color: rgb(p.neutral[300]),
    },
    selectListScroll: { maxHeight: 320, overflowY: 'auto' },
    selectItem: {
      padding: '8px 12px',
      borderBottom: `1px solid ${t.border}`,
      '&:last-child': { borderBottom: 'none' },
    },
    selectItemSelected: { backgroundColor: rgba(p.green[500], 0.05) },
    selectItemRow: { display: 'flex', alignItems: 'flex-start', gap: 12 },
    selectItemText: { flex: 1, minWidth: 0 },
    needsUrl: {
      fontSize: 12,
      color: rgb(p.yellow[400]),
      whiteSpace: 'nowrap',
      flexShrink: 0,
    },
    inlineUrl: { marginTop: 8, marginLeft: 28 },
    smallCheck: {
      appearance: 'none',
      width: 16,
      height: 16,
      marginTop: 4,
      flexShrink: 0,
      borderRadius: 4,
      border: `1px solid ${rgb(p.neutral[600])}`,
      backgroundColor: rgb(p.neutral[800]),
      cursor: 'pointer',
      '&:checked': {
        backgroundColor: rgb(p.green[500]),
        borderColor: rgb(p.green[500]),
      },
      '&:focus-visible': {
        outline: 'none',
        boxShadow: `0 0 0 2px ${t.accent}`,
      },
    },
  };
});

const CheckIcon = ({ className }: { className?: string }) => (
  <svg
    width={20}
    height={20}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    className={className}
    aria-hidden
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const SyncIcon = ({ size = 24 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    aria-hidden
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
    />
  </svg>
);

const GitHubIcon = ({ size = 20 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
    />
  </svg>
);

const GitLabIcon = ({ size = 20 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden
  >
    <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 01-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 014.82 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0118.6 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.51L23 13.45a.84.84 0 01-.35.94z" />
  </svg>
);

// ---------------------------------------------------------------------------
// Hook: useBranchLoader
// ---------------------------------------------------------------------------

function useBranchLoader(repository: string, repositories: Repository[]) {
  const api = useApi(butlerApiRef);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [defaultBranch, setDefaultBranch] = useState('main');

  useEffect(() => {
    if (!repository) {
      setBranches([]);
      return undefined;
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

// Shared select fields used by every export-style dialog.
function RepositorySelect({
  value,
  onChange,
  repositories,
  configuredRepository,
  help,
}: {
  value: string;
  onChange: (v: string) => void;
  repositories: Repository[];
  configuredRepository?: string;
  help?: string;
}) {
  return (
    <ButlerSelect
      label="Target Repository"
      help={help}
      value={value}
      onChange={e => onChange(e.target.value)}
    >
      <option value="">Select a repository...</option>
      {repositories.map(repo => (
        <option key={repo.fullName} value={repo.fullName}>
          {repo.fullName}
          {repo.fullName === configuredRepository ? ' (configured)' : ''}
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
  label = 'Branch',
  help,
}: {
  value: string;
  onChange: (v: string) => void;
  branches: Branch[];
  loading: boolean;
  label?: string;
  help?: string;
}) {
  return (
    <ButlerSelect
      label={label}
      help={help}
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

// ===========================================================================
// Main Component: GitOpsTab
// ===========================================================================

export const GitOpsTab = ({
  clusterNamespace,
  clusterName,
}: GitOpsTabProps) => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const { isAdmin, activeTeamRole } = useTeamContext();

  // Console: canMutate (platform admin) gates reconfigure and exports;
  // canOperate (platform admin, team admin or operator) gates enable/disable.
  const canMutate = isAdmin;
  const canOperate =
    isAdmin || activeTeamRole === 'admin' || activeTeamRole === 'operator';

  // Core state
  const [gitConfig, setGitConfig] = useState<GitProviderConfig | null>(null);
  const [gitOpsStatus, setGitOpsStatus] = useState<GitOpsStatus | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryResult | null>(null);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [reconfiguring, setReconfiguring] = useState(false);

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
      setError(e instanceof Error ? e.message : 'Failed to discover releases');
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
    setReconfiguring(false);
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
  const engineProvider =
    gitopsEngine?.provider || gitOpsStatus?.provider || 'flux';
  const engineVersion =
    gitopsEngine?.version || gitOpsStatus?.version || gitOpsStatus?.fluxVersion;
  const engineReady = gitopsEngine ? gitopsEngine.ready : isEnabled;
  const engineRepository = gitopsEngine?.repository || gitOpsStatus?.repository;
  const engineBranch = gitopsEngine?.branch || gitOpsStatus?.branch;
  const enginePath = gitopsEngine?.path || gitOpsStatus?.path;

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
    return (
      <div className={classes.loading} role="progressbar" aria-busy>
        <ButlerSpinner />
        <span>Loading GitOps configuration...</span>
      </div>
    );
  }

  if (!gitConfig?.configured || reconfiguring) {
    return (
      <GitProviderSetup
        onConfigured={handleGitConfigured}
        onCancel={reconfiguring ? () => setReconfiguring(false) : undefined}
      />
    );
  }

  if (error && !discovery && !gitOpsStatus) {
    return (
      <ButlerErrorState
        message={error}
        onRetry={handleRefresh}
        retryLabel="Retry Discovery"
      />
    );
  }

  const providerType = gitConfig.type ?? 'github';

  return (
    <ButlerStack>
      {isGitOpsInstalled && (
        <ButlerCard flush className={classes.engineCard}>
          <div className={classes.row}>
            <div className={classes.left}>
              <span className={classes.emoji} aria-hidden>
                {GITOPS_TOOL_CONFIG[engineProvider].icon}
              </span>
              <div>
                <h3 className={classes.cardTitle}>
                  {TOOL_LABELS[engineProvider]} Installed
                </h3>
                <p className={classes.cardSub}>
                  {engineVersion && <>Version {engineVersion} &bull; </>}
                  {gitopsEngine?.components?.length || 0} components running
                </p>
                {engineRepository && (
                  <p className={clsx(classes.cardSub, classes.cardSubMono)}>
                    {engineRepository}
                    {engineBranch && ` @ ${engineBranch}`}
                    {enginePath && ` / ${enginePath}`}
                  </p>
                )}
              </div>
            </div>
            <div className={classes.actions}>
              <ButlerChip
                tone={engineReady ? 'green' : 'yellow'}
                className={
                  engineReady ? classes.engineChip : classes.engineChipDegraded
                }
              >
                {engineReady ? 'Ready' : 'Degraded'}
              </ButlerChip>
              {canOperate && (
                <ButlerButton
                  variant="danger"
                  size="sm"
                  onClick={() => setDisableOpen(true)}
                >
                  Disable GitOps
                </ButlerButton>
              )}
            </div>
          </div>
        </ButlerCard>
      )}

      {!isGitOpsInstalled && canOperate && (
        <ButlerCard flush className={classes.cta}>
          <div className={classes.row}>
            <div className={classes.left} style={{ gap: 16 }}>
              <div className={classes.ctaIcon}>
                <SyncIcon />
              </div>
              <div>
                <h3 className={classes.ctaTitle}>GitOps Not Enabled</h3>
                <p className={classes.ctaSub}>
                  Install Flux CD to manage this cluster's configuration via Git
                </p>
              </div>
            </div>
            <ButlerButton onClick={() => setEnableOpen(true)}>
              Enable GitOps
            </ButlerButton>
          </div>
          <div className={classes.benefits}>
            <h4 className={classes.benefitsTitle}>Benefits of GitOps</h4>
            <div className={classes.benefitsGrid}>
              {[
                ['Version Control', 'Track all changes in Git'],
                ['Auto-sync', 'Automatic reconciliation'],
                ['Audit Trail', 'Complete change history'],
              ].map(([title, desc]) => (
                <div key={title} className={classes.benefit}>
                  <CheckIcon className={classes.benefitCheck} />
                  <div>
                    <p className={classes.benefitTitle}>{title}</p>
                    <p className={classes.benefitDesc}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ButlerCard>
      )}

      <ButlerCard flush className={classes.providerCard}>
        <div className={classes.row}>
          <div className={classes.left}>
            <div
              className={clsx(
                classes.providerIcon,
                providerType === 'gitlab' && classes.gitlab,
              )}
            >
              {providerType === 'gitlab' ? <GitLabIcon /> : <GitHubIcon />}
            </div>
            <div>
              <p className={classes.providerName}>
                Connected to {PROVIDER_LABELS[providerType] || providerType}
              </p>
              <p className={classes.providerMeta}>
                {gitConfig.username}
                {gitConfig.organization && (
                  <> &bull; {gitConfig.organization}</>
                )}
              </p>
            </div>
          </div>
          {canMutate && (
            <div className={classes.actions}>
              <ButlerButton
                variant="secondary"
                size="sm"
                onClick={() => setReconfiguring(true)}
              >
                Reconfigure
              </ButlerButton>
              {isGitOpsInstalled && (
                <ButlerButton
                  variant="secondary"
                  size="sm"
                  onClick={() => setMigrateOpen(true)}
                  disabled={allReleases.length === 0}
                >
                  Export Cluster to GitOps
                </ButlerButton>
              )}
            </div>
          )}
        </div>
      </ButlerCard>

      {isGitOpsInstalled && (
        <>
          <div className={classes.row}>
            <div>
              <h2 className={classes.sectionTitle}>Discovered Releases</h2>
              <p className={classes.sectionSub}>
                {allReleases.length} Helm release
                {allReleases.length !== 1 ? 's' : ''} found on this cluster
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

          {releasesNeedingUrl.length > 0 && (
            <ButlerCard flush className={classes.warningCard}>
              <div className={classes.warningRow}>
                <AlertTriangleIcon className={classes.warningIcon} />
                <div>
                  <p className={classes.warningTitle}>
                    {releasesNeedingUrl.length} release
                    {releasesNeedingUrl.length !== 1 ? 's' : ''} need repository
                    URL
                  </p>
                  <p className={classes.warningBody}>
                    These releases don't match any AddonDefinition and couldn't
                    be auto-detected. You'll need to provide the Helm repository
                    URL when exporting.
                  </p>
                </div>
              </div>
            </ButlerCard>
          )}

          {allReleases.length === 0 ? (
            <ButlerEmptyState title={GITOPS_EMPTY_TEXT} />
          ) : (
            <div className={classes.grid}>
              {allReleases.map(release => (
                <ReleaseCard
                  key={`${release.namespace}/${release.name}`}
                  release={release}
                  onExport={
                    canMutate ? () => setExportRelease(release) : undefined
                  }
                />
              ))}
            </div>
          )}
        </>
      )}

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
    </ButlerStack>
  );
};

export default GitOpsTab;

// ===========================================================================
// ReleaseCard (console DiscoveredReleaseCard)
// ===========================================================================

interface ReleaseCardProps {
  release: DiscoveredRelease;
  onExport?: () => void;
}

function ReleaseCard({ release, onExport }: ReleaseCardProps) {
  const classes = useStyles();

  const isMatched = !!release.addonDefinition;
  const isPlatform = !!release.platform;
  const hasRepoUrl = !!release.repoUrl;
  const needsUrl = !isMatched && !hasRepoUrl;
  const hasValues =
    release.values != null && Object.keys(release.values).length > 0;

  return (
    <ButlerCard
      flush
      className={clsx(classes.release, needsUrl && classes.releaseNeedsUrl)}
    >
      <div className={classes.releaseTop}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={classes.releaseNameRow}>
            <h3 className={classes.releaseName}>{release.name}</h3>
            {isPlatform && (
              <span className={classes.platformTag}>Platform</span>
            )}
          </div>
          <p className={classes.releaseMeta}>
            {release.namespace} &bull; {release.chart}:{release.chartVersion}
          </p>
          <div className={classes.releaseChips}>
            <span
              className={clsx(
                classes.pill,
                release.category === 'infrastructure'
                  ? classes.pillInfra
                  : classes.pillApp,
              )}
            >
              {getCategoryLabel(release.category)}
            </span>
            <span
              className={clsx(
                classes.pill,
                release.status === 'deployed'
                  ? classes.pillDeployed
                  : classes.pillOther,
              )}
            >
              {release.status}
            </span>
          </div>
          {needsUrl && (
            <div className={classes.repoWarning}>
              <AlertTriangleIcon size={14} />
              <span>Repo URL required</span>
            </div>
          )}
          {hasRepoUrl && (
            <p className={classes.repoUrl} title={release.repoUrl}>
              {release.repoUrl}
            </p>
          )}
        </div>
        {onExport && (
          <ButlerButton variant="secondary" size="sm" onClick={onExport}>
            Export
          </ButlerButton>
        )}
      </div>
      {hasValues && (
        <details className={classes.values}>
          <summary className={classes.valuesSummary}>
            {Object.keys(release.values!).length} custom values
          </summary>
          <pre className={classes.valuesPre}>
            {JSON.stringify(release.values, null, 2)}
          </pre>
        </details>
      )}
    </ButlerCard>
  );
}

// ===========================================================================
// GitProviderSetup (console gitops/GitProviderSetup.tsx)
// ===========================================================================

interface GitProviderSetupProps {
  onConfigured: () => void;
  onCancel?: () => void;
}

function GitProviderSetup({ onConfigured, onCancel }: GitProviderSetupProps) {
  const classes = useStyles();
  const api = useApi(butlerApiRef);

  const [providerType, setProviderType] = useState<GitProviderType>('github');
  const [token, setToken] = useState('');
  const [url, setUrl] = useState('');
  const [organization, setOrganization] = useState('');
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const choose = (type: GitProviderType) => {
    setProviderType(type);
    setToken('');
    setUrl('');
    setOrganization('');
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!token.trim()) return;
    setSaving(true);
    setErrorMsg('');
    try {
      await api.saveGitOpsConfig({
        type: providerType,
        token: token.trim(),
        url: url.trim() || undefined,
        organization: organization.trim() || undefined,
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

  const isGithub = providerType === 'github';
  const tokenUrl = isGithub
    ? 'https://github.com/settings/tokens/new?scopes=repo&description=Butler%20Portal'
    : `${
        /^https?:\/\//i.test(url.trim()) ? url.trim() : 'https://gitlab.com'
      }/-/profile/personal_access_tokens`;

  return (
    <div className={classes.setupRoot}>
      <ButlerCard flush className={classes.setupCard}>
        <div className={classes.setupHero}>
          <div className={classes.setupHeroIcon}>
            <SyncIcon size={32} />
          </div>
          <h2 className={classes.setupTitle}>Connect to GitOps</h2>
          <p className={classes.setupSub}>
            Connect your Git repository to export cluster configurations and
            enable GitOps workflows.
          </p>
        </div>

        {!showForm ? (
          <ButlerStack gap={16}>
            <div className={classes.providerGrid}>
              <button
                type="button"
                className={clsx(classes.providerButton, classes.providerGithub)}
                onClick={() => choose('github')}
              >
                <GitHubIcon size={32} />
                <span className={classes.providerButtonLabel}>GitHub</span>
                <span className={classes.providerButtonSub}>
                  github.com or Enterprise
                </span>
              </button>
              <button
                type="button"
                className={clsx(classes.providerButton, classes.providerGitlab)}
                onClick={() => choose('gitlab')}
              >
                <span className={classes.gitlab}>
                  <GitLabIcon size={32} />
                </span>
                <span className={classes.providerButtonLabel}>GitLab</span>
                <span className={classes.providerButtonSub}>
                  gitlab.com or self-managed
                </span>
              </button>
            </div>
            <p className={classes.centerHint}>
              Select your Git provider to get started
            </p>
            {onCancel && (
              <div style={{ textAlign: 'center' }}>
                <ButlerButton variant="secondary" size="sm" onClick={onCancel}>
                  Cancel
                </ButlerButton>
              </div>
            )}
          </ButlerStack>
        ) : (
          <form
            className={classes.form}
            onSubmit={e => {
              e.preventDefault();
              handleSubmit();
            }}
          >
            <div className={classes.providerBadge}>
              {isGithub ? <GitHubIcon /> : <GitLabIcon />}
              <span>{PROVIDER_LABELS[providerType]}</span>
              <ButlerLinkButton tone="muted" onClick={() => setShowForm(false)}>
                Change
              </ButlerLinkButton>
            </div>

            <ButlerInput
              label="Personal Access Token"
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder={isGithub ? 'ghp_xxxxxxxxxxxx' : 'glpat-xxxxxxxxxxxx'}
              autoFocus
              autoComplete="off"
              help={
                <>
                  Requires{' '}
                  <code className={classes.code}>
                    {isGithub ? 'repo' : 'api'}
                  </code>{' '}
                  scope.{' '}
                  <a
                    href={tokenUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={clsx(
                      classes.link,
                      !isGithub && classes.linkGitlab,
                    )}
                  >
                    Create token &rarr;
                  </a>
                </>
              }
            />

            <ButlerField
              label={`${PROVIDER_LABELS[providerType]} URL`}
              optional
            >
              <ButlerInput
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder={
                  isGithub
                    ? 'https://github.example.com'
                    : 'https://gitlab.example.com'
                }
              />
            </ButlerField>

            <ButlerField
              label={isGithub ? 'Organization' : 'Group'}
              optional
              help={`Scope repository list to a specific ${
                isGithub ? 'organization' : 'group'
              }`}
            >
              <ButlerInput
                value={organization}
                onChange={e => setOrganization(e.target.value)}
                placeholder={isGithub ? 'my-org' : 'my-group'}
              />
            </ButlerField>

            {errorMsg && (
              <p className={classes.inlineError} role="alert">
                {errorMsg}
              </p>
            )}

            <div className={classes.formActions}>
              <ButlerButton
                variant="secondary"
                onClick={() => setShowForm(false)}
              >
                Back
              </ButlerButton>
              <ButlerButton type="submit" disabled={saving || !token.trim()}>
                {saving ? (
                  <>
                    <ButlerSpinner small />
                    Connecting...
                  </>
                ) : (
                  'Connect'
                )}
              </ButlerButton>
            </div>
          </form>
        )}
      </ButlerCard>

      <ButlerCard flush className={classes.infoCard}>
        <h3 className={classes.infoTitle}>What can you do with GitOps?</h3>
        <ul className={classes.infoList}>
          {[
            'Export cluster configuration to a Git repository',
            'Generate Flux CD or Argo CD manifests automatically',
            'Migrate existing Helm releases to declarative GitOps',
            'Create pull requests for review before changes are applied',
          ].map(item => (
            <li key={item}>
              <CheckIcon className={classes.infoCheck} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </ButlerCard>
    </div>
  );
}

// ===========================================================================
// EnableGitOpsDialog (console EnableGitOpsModal)
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

  useEffect(() => {
    if (defaultBranch) {
      setBranch(defaultBranch);
    }
  }, [defaultBranch]);

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
      setErrorMsg(e instanceof Error ? e.message : 'Failed to enable GitOps');
    } finally {
      setEnabling(false);
    }
  };

  return (
    <ButlerDialog
      open={open}
      onClose={onClose}
      busy={enabling}
      width={512}
      title={`Enable GitOps on ${clusterName}`}
      footer={
        <>
          <ButlerButton
            variant="secondary"
            onClick={onClose}
            disabled={enabling}
          >
            Cancel
          </ButlerButton>
          <ButlerButton
            onClick={handleEnable}
            disabled={enabling || !repository}
          >
            {enabling ? (
              <>
                <ButlerSpinner small />
                Installing...
              </>
            ) : (
              'Enable GitOps'
            )}
          </ButlerButton>
        </>
      }
    >
      <ButlerField label="GitOps Tool">
        <div
          className={classes.toolGrid}
          role="radiogroup"
          aria-label="GitOps Tool"
        >
          {(['flux', 'argocd'] as GitOpsToolType[]).map(tool => {
            const isSelected = provider === tool;
            const isDisabled = tool === 'argocd';
            return (
              <button
                key={tool}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={isDisabled}
                className={clsx(
                  classes.toolCard,
                  isSelected && classes.toolCardSelected,
                )}
                onClick={() => !isDisabled && setProvider(tool)}
              >
                <span className={classes.emoji} aria-hidden>
                  {GITOPS_TOOL_CONFIG[tool].icon}
                </span>
                <span>
                  <p
                    className={clsx(
                      classes.toolLabel,
                      isSelected && classes.toolLabelSelected,
                    )}
                  >
                    {TOOL_LABELS[tool]}
                  </p>
                  {isDisabled && (
                    <p className={classes.toolHint}>Coming soon</p>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </ButlerField>

      <RepositorySelect
        value={repository}
        onChange={setRepository}
        repositories={repositories}
        help="This repository will store your cluster's GitOps manifests"
      />

      <ButlerFormRow>
        <BranchSelect
          value={branch}
          onChange={setBranch}
          branches={branches}
          loading={loadingBranches}
        />
        <ButlerInput
          label="Path"
          value={path}
          onChange={e => setPath(e.target.value)}
          placeholder="clusters/my-cluster"
        />
      </ButlerFormRow>

      <ButlerCheckbox
        checked={isPrivate}
        onChange={e => setIsPrivate(e.target.checked)}
        label="Private repository"
        description="Create deploy key for private repository access"
      />

      {provider === 'flux' && (
        <ButlerField
          label="Additional Components"
          help="These controllers enable automatic image updates via GitOps"
        >
          <div className={classes.componentList}>
            {FLUX_EXTRA_COMPONENTS.map(comp => (
              <ButlerCheckbox
                key={comp.name}
                card
                checked={componentsExtra.includes(comp.name)}
                onChange={() => toggleComponent(comp.name)}
                label={comp.label}
                description={comp.description}
              />
            ))}
          </div>
        </ButlerField>
      )}

      <ButlerCallout tone="info" title="What will be installed?">
        <ul className={classes.bullets}>
          <li>
            &bull; Flux controllers in the{' '}
            <code className={classes.codeBlue}>flux-system</code> namespace
          </li>
          <li>&bull; GitRepository and Kustomization resources</li>
          <li>
            &bull; Directory structure:{' '}
            <code className={classes.codeBlue}>{path}/infrastructure</code> and{' '}
            <code className={classes.codeBlue}>{path}/apps</code>
          </li>
          {componentsExtra.length > 0 && (
            <li>&bull; Extra: {componentsExtra.join(', ')}</li>
          )}
        </ul>
      </ButlerCallout>

      {errorMsg && (
        <p className={classes.inlineError} role="alert">
          {errorMsg}
        </p>
      )}
    </ButlerDialog>
  );
}

// ===========================================================================
// DisableGitOpsDialog (console DisableGitOpsModal, type-to-confirm)
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
    <ButlerDialog
      open={open}
      onClose={onClose}
      busy={disabling}
      title="Disable GitOps?"
      subtitle="Flux will be removed from this cluster"
      icon={<AlertTriangleIcon />}
      iconTone="danger"
      footer={
        <>
          <ButlerButton
            variant="secondary"
            onClick={onClose}
            disabled={disabling}
          >
            Cancel
          </ButlerButton>
          <ButlerButton
            variant="danger"
            onClick={onConfirm}
            disabled={!canConfirm || disabling}
          >
            {disabling ? (
              <>
                <ButlerSpinner small />
                Disabling...
              </>
            ) : (
              'Disable GitOps'
            )}
          </ButlerButton>
        </>
      }
    >
      <p className={classes.dialogText}>
        This will uninstall Flux from{' '}
        <span className={classes.strong}>{clusterName}</span> and remove all
        GitOps controllers. Your Git repository will not be affected.
      </p>
      <ButlerCallout tone="danger" compact>
        <p>
          <strong>Warning:</strong> Any resources managed by Flux will no longer
          be automatically reconciled from Git.
        </p>
      </ButlerCallout>
      <ButlerInput
        id="disable-gitops-confirm"
        label={
          <>
            Type <span className={classes.confirmName}>{clusterName}</span> to
            confirm
          </>
        }
        tone="danger"
        value={confirmText}
        onChange={e => setConfirmText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && canConfirm && !disabling) onConfirm();
        }}
        placeholder={clusterName}
        disabled={disabling}
        autoFocus
        autoComplete="off"
      />
    </ButlerDialog>
  );
}

// ===========================================================================
// ExportReleaseDialog (console ExportModal)
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
    <ButlerDialog
      open={open}
      onClose={onClose}
      busy={exporting}
      width={512}
      title="Export to GitOps"
      subtitle={release.name}
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
            disabled={exporting || !repository || needsRepoUrl}
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
      <div className={clsx(classes.releaseInfo, classes.row)}>
        <div>
          <p className={classes.releaseInfoName}>{release.name}</p>
          <p className={classes.releaseInfoMeta}>
            {release.chart}:{release.chartVersion} in {release.namespace}
          </p>
        </div>
        <ButlerChip tone={release.status === 'deployed' ? 'green' : 'yellow'}>
          {release.status}
        </ButlerChip>
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
          label={createPR ? 'Target Branch' : 'Branch'}
          help={createPR ? 'PR will be opened against this branch' : undefined}
        />
        <ButlerInput
          label="Path"
          value={path}
          onChange={e => setPath(e.target.value)}
          placeholder="clusters/my-cluster/apps/addon"
        />
      </ButlerFormRow>

      {!release.addonDefinition && (
        <ButlerField
          label="Helm Repository URL"
          error={
            needsRepoUrl
              ? 'This release does not match any known addon. Please provide the Helm repository URL.'
              : undefined
          }
        >
          <ButlerInput
            type="url"
            value={customRepoUrl}
            onChange={e => setCustomRepoUrl(e.target.value)}
            placeholder="https://charts.example.com"
            required
          />
        </ButlerField>
      )}

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
          onToggle={togglePreview}
        />
      )}

      {preview && <ButlerFilePreview files={preview} />}

      {errorMsg && (
        <p className={classes.inlineError} role="alert">
          {errorMsg}
        </p>
      )}
    </ButlerDialog>
  );
}

// ===========================================================================
// MigrateAllDialog (console PreviewClusterModal, cluster-wide export)
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
  const [customRepoUrls, setCustomRepoUrls] = useState<Record<string, string>>(
    {},
  );

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

  useEffect(() => {
    if (open) {
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
    () => sortedReleases.filter(r => selected.has(`${r.namespace}/${r.name}`)),
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
    setSelected(new Set(sortedReleases.map(r => `${r.namespace}/${r.name}`)));
  };

  const selectNone = () => {
    setSelected(new Set());
  };

  const handleMigrate = async () => {
    if (!canMigrate) return;
    setMigrating(true);
    setErrorMsg('');
    try {
      const migrationReleases: MigrationRelease[] = selectedReleases.map(r => ({
        name: r.name,
        namespace: r.namespace,
        repoUrl: r.repoUrl || customRepoUrls[`${r.namespace}/${r.name}`] || '',
        chartName: r.chart,
        chartVersion: r.chartVersion,
        values: r.values,
        category: r.category,
      }));

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
    <ButlerDialog
      open={open}
      onClose={onClose}
      busy={migrating}
      width={768}
      title="Export Cluster to GitOps"
      subtitle={`${selected.size} of ${releases.length} releases selected`}
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
            disabled={migrating || !canMigrate}
          >
            {migrating ? (
              <>
                <ButlerSpinner small />
                Exporting {selected.size} releases...
              </>
            ) : createPR ? (
              `Create PR with ${selected.size} releases`
            ) : (
              `Export ${selected.size} releases`
            )}
          </ButlerButton>
        </>
      }
    >
      <ButlerFormRow>
        <RepositorySelect
          value={repository}
          onChange={setRepository}
          repositories={repositories}
          configuredRepository={configuredRepository}
        />
        <BranchSelect
          value={branch}
          onChange={setBranch}
          branches={branches}
          loading={loadingBranches}
        />
      </ButlerFormRow>

      <ButlerInput
        label="Base Path"
        value={basePath}
        onChange={e => setBasePath(e.target.value)}
        placeholder="clusters/my-cluster"
        help={`Releases will be organized as: ${basePath}/infrastructure/[addon] and ${basePath}/apps/[addon]`}
      />

      <ButlerCheckbox
        checked={createPR}
        onChange={e => setCreatePR(e.target.checked)}
        label="Create Pull Request"
        description="Create a PR for review instead of committing directly"
      />

      <div className={classes.selectList}>
        <div className={clsx(classes.selectListHeader, classes.row)}>
          <span>Select Releases to Export</span>
          <span className={classes.actions}>
            <ButlerLinkButton onClick={selectAll}>Select All</ButlerLinkButton>
            <ButlerLinkButton tone="muted" onClick={selectNone}>
              Select None
            </ButlerLinkButton>
          </span>
        </div>
        <div className={classes.selectListScroll}>
          {sortedReleases.map(release => {
            const key = `${release.namespace}/${release.name}`;
            const isSelected = selected.has(key);
            const needsRepoUrl = !release.addonDefinition && !release.repoUrl;
            const hasUrl = !!release.repoUrl || !!customRepoUrls[key];
            const inputId = `migrate-${key.replace(/[^a-z0-9]/gi, '-')}`;

            return (
              <div
                key={key}
                className={clsx(
                  classes.selectItem,
                  isSelected && classes.selectItemSelected,
                )}
              >
                <label className={classes.selectItemRow} htmlFor={inputId}>
                  <input
                    id={inputId}
                    type="checkbox"
                    className={classes.smallCheck}
                    checked={isSelected}
                    onChange={() => toggleRelease(release)}
                  />
                  <span className={classes.selectItemText}>
                    <span className={classes.releaseNameRow}>
                      <span className={classes.releaseInfoName}>
                        {release.name}
                      </span>
                      {release.platform && (
                        <span className={classes.platformTag}>Platform</span>
                      )}
                      <ButlerChip
                        tone={
                          release.category === 'infrastructure'
                            ? 'blue'
                            : 'neutral'
                        }
                      >
                        {getCategoryLabel(release.category)}
                      </ButlerChip>
                    </span>
                    <span className={classes.releaseInfoMeta}>
                      {release.namespace} &bull; {release.chart}:
                      {release.chartVersion}
                      {release.repoUrl &&
                        !release.addonDefinition &&
                        ` • ${release.repoUrl}`}
                    </span>
                  </span>
                  {needsRepoUrl && !hasUrl && isSelected && (
                    <span className={classes.needsUrl}>Needs repo URL</span>
                  )}
                </label>

                {needsRepoUrl && isSelected && (
                  <div className={classes.inlineUrl}>
                    <ButlerInput
                      aria-label={`Helm repository URL for ${release.name}`}
                      value={customRepoUrls[key] || ''}
                      onChange={e =>
                        setCustomRepoUrls(prev => ({
                          ...prev,
                          [key]: e.target.value,
                        }))
                      }
                      placeholder="Enter Helm repository URL..."
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {unmatchedSelected.length > 0 && (
        <ButlerCallout
          tone="warning"
          title={`${unmatchedSelected.length} selected release${
            unmatchedSelected.length > 1 ? 's' : ''
          } need Helm repository URL`}
        >
          <p>{unmatchedSelected.map(r => r.name).join(', ')}</p>
        </ButlerCallout>
      )}

      {errorMsg && (
        <p className={classes.inlineError} role="alert">
          {errorMsg}
        </p>
      )}
    </ButlerDialog>
  );
}
