// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

export type ArtifactType =
  | 'terraform-module'
  | 'terraform-provider'
  | 'helm-chart'
  | 'opa-bundle'
  | 'oci-artifact';

export type ArtifactStatus = 'active' | 'deprecated' | 'archived';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface StorageConfig {
  backend: 'git' | 'oci';
  git?: {
    repositoryUrl: string;
    branch?: string;
    path?: string;
  };
  oci?: {
    registryUrl?: string;
    repository?: string;
  };
}

export interface SourceConfig {
  vcsProvider?: 'github' | 'gitlab' | 'bitbucket';
  repositoryUrl?: string;
  branch?: string;
  path?: string;
}

export interface ApprovalPolicy {
  minApprovers?: number;
  autoApprovePatches?: boolean;
  requiredScanGrade?: string;
  requirePassingTests?: boolean;
  requirePassingValidate?: boolean;
}

export interface Artifact {
  id: string;
  namespace: string;
  name: string;
  provider: string | null;
  type: ArtifactType;
  description: string | null;
  readme: string | null;
  team: string | null;
  status: ArtifactStatus;
  storage_config: StorageConfig;
  approval_policy: ApprovalPolicy | null;
  source_config: SourceConfig | null;
  tags: string[];
  category: string | null;
  download_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TerraformInput {
  name: string;
  type: string;
  description?: string;
  default?: string;
  required: boolean;
  sensitive?: boolean;
}

export interface TerraformOutput {
  name: string;
  type?: string;
  description?: string;
  sensitive?: boolean;
}

export interface TerraformProvider {
  name: string;
  source: string;
  versionConstraint?: string;
}

export interface ProviderPlatform {
  os: string;
  arch: string;
  filename: string;
  download_url?: string;
  shasum: string;
}

export interface TerraformMetadata {
  providers?: TerraformProvider[];
  inputs?: TerraformInput[];
  outputs?: TerraformOutput[];
  resources?: string[];
  requiredVersion?: string;
  platforms?: ProviderPlatform[];
}

export interface ExampleConfig {
  name: string;
  description?: string;
  source: string;
  path?: string;
}

export interface DependencyRef {
  source: string;
  version?: string;
  name?: string;
}

export interface ConsumerInfo {
  token_name: string;
  token_prefix: string;
  last_download: string;
  download_count: number;
  consumer_types: string[];
}

export interface ArtifactVersion {
  id: string;
  artifact_id: string;
  version: string;
  version_major: number;
  version_minor: number;
  version_patch: number;
  version_pre: string | null;
  approval_status: ApprovalStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  approval_comment: string | null;
  is_latest: boolean;
  is_bad: boolean;
  yank_reason: string | null;
  digest: string | null;
  published_by: string | null;
  changelog: string | null;
  terraform_metadata: TerraformMetadata | null;
  helm_metadata: Record<string, unknown> | null;
  opa_metadata: Record<string, unknown> | null;
  storage_ref: Record<string, unknown> | null;
  examples: ExampleConfig[] | null;
  dependencies: DependencyRef[] | null;
  size_bytes: number | null;
  created_at: string;
  updated_at: string;
}

export interface ArtifactListOptions {
  cursor?: string;
  limit?: number;
  sortBy?: 'name' | 'downloads' | 'updated' | 'created' | string;
  sortOrder?: 'asc' | 'desc';
  type?: ArtifactType;
  status?: ArtifactStatus;
  team?: string;
  search?: string;
  tags?: string[];
  category?: string;
}

export interface FacetCount {
  name: string;
  count: number;
}

export interface FacetsResponse {
  tags: FacetCount[];
  categories: FacetCount[];
  types: FacetCount[];
}

export interface ArtifactListResponse {
  items: Artifact[];
  totalCount: number;
  nextCursor: string | null;
}

export interface CreateArtifactRequest {
  namespace: string;
  name: string;
  provider?: string;
  type: ArtifactType;
  description?: string;
  team?: string;
  storage_config: StorageConfig;
  approval_policy?: ApprovalPolicy;
  source_config?: SourceConfig;
  tags?: string[];
  category?: string;
}

export interface PublishVersionRequest {
  version: string;
  changelog?: string;
  digest?: string;
  storage_ref?: Record<string, unknown>;
}
