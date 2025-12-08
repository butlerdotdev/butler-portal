/*
 * Copyright 2026 The Butler Authors.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Git provider type (GitHub, GitLab, etc.)
 */
export type GitProviderType = 'github' | 'gitlab';

/**
 * GitOps tool type (Flux, ArgoCD)
 */
export type GitOpsToolType = 'flux' | 'argocd';

/**
 * Configuration status for Git provider
 */
export interface GitProviderConfig {
  configured: boolean;
  type?: GitProviderType;
  url?: string;
  username?: string;
  organization?: string;
}

/**
 * Request to save Git provider configuration
 */
export interface SaveGitProviderRequest {
  type: GitProviderType;
  token: string;
  url?: string; // For GitHub Enterprise
  organization?: string;
}

/**
 * Git repository information
 */
export interface Repository {
  name: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
  cloneUrl: string;
  sshUrl: string;
  htmlUrl: string;
  updatedAt: string;
}

/**
 * Git branch information
 */
export interface Branch {
  name: string;
  sha: string;
  protected: boolean;
}

/**
 * GitOps engine status on a cluster
 */
export interface GitOpsEngineStatus {
  provider?: GitOpsToolType;
  installed: boolean;
  ready: boolean;
  version?: string;
  components?: string[];
  repository?: string; // owner/repo format
  branch?: string;
  path?: string;
}

/**
 * Discovered Helm release on a cluster
 */
export interface DiscoveredRelease {
  name: string;
  namespace: string;
  chart: string;
  chartVersion: string;
  appVersion?: string;
  status: string;
  revision: number;
  values?: Record<string, unknown>;
  repoUrl?: string;
  category?: string;
  addonDefinition?: string;
  platform?: boolean;
}

/**
 * Discovery result from a cluster
 */
export interface DiscoveryResult {
  matched: DiscoveredRelease[];
  unmatched: DiscoveredRelease[];
  gitopsEngine?: GitOpsEngineStatus;
}

/**
 * Request to export an addon to GitOps
 */
export interface ExportAddonRequest {
  addonName: string;
  repository: string;
  branch: string;
  targetPath: string;
  values?: Record<string, unknown>;
  createPR?: boolean;
  prTitle?: string;
  prBody?: string;
}

/**
 * Response from export operation
 */
export interface ExportAddonResponse {
  success: boolean;
  message: string;
  files?: string[];
  commitSha?: string;
  commitUrl?: string;
  prUrl?: string;
  prNumber?: number;
}

/**
 * Request to preview manifests
 */
export interface PreviewManifestRequest {
  addonName: string;
  repository: string;
  targetPath: string;
  values?: Record<string, unknown>;
  tool?: GitOpsToolType;
}

/**
 * Preview manifest response - filename to content mapping
 */
export type PreviewManifestResponse = Record<string, string>;

/**
 * Request to migrate releases to GitOps
 */
export interface MigrationRequest {
  releases: MigrationRelease[];
  repository: string;
  branch: string;
  basePath: string;
  createPR?: boolean;
  prTitle?: string;
}

/**
 * Single release to migrate
 */
export interface MigrationRelease {
  name: string;
  namespace: string;
  repoUrl: string;
  chartName?: string;
  chartVersion?: string;
  values?: Record<string, unknown>;
  category?: string;
}

/**
 * Migration result
 */
export interface MigrationResult {
  success: boolean;
  message: string;
  filesCreated?: string[];
  commitSha?: string;
  prUrl?: string;
  prNumber?: number;
  errors?: string[];
}

/**
 * GitOps status for a cluster
 */
export interface GitOpsStatus {
  enabled: boolean;
  provider?: GitOpsToolType;
  repository?: string;
  branch?: string;
  path?: string;
  status?: string;
  version?: string;
  fluxVersion?: string; // Deprecated, use version
  providerStatus?: GitOpsEngineStatus;
}

/**
 * Display configuration for GitOps tools
 */
export const GITOPS_TOOL_CONFIG: Record<
  GitOpsToolType,
  { label: string; icon: string; color: string }
> = {
  flux: {
    label: 'Flux CD',
    icon: '\u{1F504}',
    color: 'text-blue-400',
  },
  argocd: {
    label: 'Argo CD',
    icon: '\u{1F419}',
    color: 'text-orange-400',
  },
};

/**
 * Display configuration for Git providers
 */
export const GIT_PROVIDER_CONFIG: Record<
  GitProviderType,
  { label: string; icon: string; url: string }
> = {
  github: {
    label: 'GitHub',
    icon: '\u{1F419}',
    url: 'https://github.com',
  },
  gitlab: {
    label: 'GitLab',
    icon: '\u{1F98A}',
    url: 'https://gitlab.com',
  },
};

/**
 * Category display info
 */
export const CATEGORY_CONFIG: Record<
  string,
  { label: string; order: number }
> = {
  infrastructure: {
    label: 'Infrastructure',
    order: 1,
  },
  apps: {
    label: 'Applications',
    order: 2,
  },
};

/**
 * Get category label
 */
export function getCategoryLabel(category?: string): string {
  if (!category) return 'Unknown';
  return CATEGORY_CONFIG[category]?.label || category;
}

/**
 * Sort releases by category and name
 */
export function sortReleases(
  releases: DiscoveredRelease[],
): DiscoveredRelease[] {
  return [...releases].sort((a, b) => {
    const orderA = CATEGORY_CONFIG[a.category || 'apps']?.order || 99;
    const orderB = CATEGORY_CONFIG[b.category || 'apps']?.order || 99;
    if (orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name);
  });
}
