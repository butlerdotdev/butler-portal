/*
 * Copyright 2026 The Butler Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export type ArtifactType =
  | 'terraform-module'
  | 'terraform-provider'
  | 'helm-chart'
  | 'opa-bundle'
  | 'oci-artifact';

export type ArtifactStatus = 'active' | 'deprecated' | 'archived';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export type TokenScope = 'read' | 'write' | 'admin';

export interface ArtifactRow {
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

export interface VersionRow {
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
  helm_metadata: HelmMetadata | null;
  opa_metadata: OpaMetadata | null;
  storage_ref: Record<string, unknown> | null;
  examples: ExampleConfig[] | null;
  dependencies: DependencyRef[] | null;
  size_bytes: number | null;
  created_at: string;
  updated_at: string;
}

export interface TokenRow {
  id: string;
  name: string;
  token_hash: string;
  token_prefix: string;
  scopes: TokenScope[];
  namespace: string | null;
  team: string | null;
  created_by: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

export interface DownloadLogRow {
  id: string;
  artifact_id: string;
  version_id: string | null;
  version: string;
  consumer_type: string | null;
  token_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  downloaded_at: string;
}

export interface AuditLogRow {
  id: string;
  actor: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  resource_name: string | null;
  resource_namespace: string | null;
  version: string | null;
  details: Record<string, unknown> | null;
  occurred_at: string;
}

export interface CiResultRow {
  id: string;
  version_id: string;
  result_type: string;
  scanner: string | null;
  grade: string | null;
  summary: Record<string, unknown>;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface StorageConfig {
  backend: 'git' | 'oci';
  git?: {
    repositoryUrl: string;
    path?: string;
    tagPrefix?: string;
  };
  oci?: {
    registryUrl: string;
    repository: string;
  };
}

export interface SourceConfig {
  vcsProvider: 'github' | 'gitlab' | 'bitbucket';
  repositoryUrl: string;
  branch?: string;
  path?: string;
}

export type EnforcementLevel = 'block' | 'warn' | 'audit';

export interface ApprovalPolicy {
  enforcementLevel?: EnforcementLevel;
  minApprovers?: number;
  autoApprovePatches?: boolean;
  requiredScanGrade?: string;
  requirePassingTests?: boolean;
  requirePassingValidate?: boolean;
  preventSelfApproval?: boolean;
}

export interface VersionApprovalRow {
  id: string;
  version_id: string;
  actor: string;
  comment: string | null;
  created_at: string;
}

export interface ProviderPlatform {
  os: string;
  arch: string;
  filename: string;
  download_url?: string;
  shasum: string;
}

export interface TerraformMetadata {
  providers?: Array<{
    name: string;
    source: string;
    versionConstraint?: string;
  }>;
  inputs?: Array<{
    name: string;
    type: string;
    description?: string;
    default?: string;
    required: boolean;
    sensitive?: boolean;
  }>;
  outputs?: Array<{
    name: string;
    type?: string;
    description?: string;
    sensitive?: boolean;
  }>;
  resources?: string[];
  requiredVersion?: string;
  platforms?: ProviderPlatform[];
}

export interface HelmMetadata {
  appVersion?: string;
  apiVersion?: string;
  dependencies?: Array<{
    name: string;
    version: string;
    repository: string;
  }>;
}

export interface OpaMetadata {
  entrypoint?: string;
  capabilities?: string[];
  packages?: string[];
}

export interface ExampleConfig {
  name: string;
  description?: string;
  source: string; // HCL/YAML code
  path?: string;  // file path in repo
}

export interface DependencyRef {
  source: string;       // module source (e.g. "hashicorp/consul/aws")
  version?: string;     // version constraint
  name?: string;        // local module name
}

export interface ConsumerInfo {
  token_name: string;
  token_prefix: string;
  last_download: string;
  download_count: number;
  consumer_types: string[];
}

export interface ListOptions {
  cursor?: string;
  limit?: number;
  sortBy?: string;
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

export interface FacetsResult {
  tags: FacetCount[];
  categories: FacetCount[];
  types: FacetCount[];
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  totalCount: number;
}

// ── IaC Runs ──────────────────────────────────────────────────────────

export type RunOperation = 'plan' | 'apply' | 'validate' | 'test' | 'destroy';
export type RunMode = 'byoc' | 'peaas';
export type RunStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'timed_out'
  | 'expired';

export interface SecretRef {
  source: 'secret';
  ref: string;    // namespace/name
  key: string;
}

export interface LiteralRef {
  source: 'literal';
  value: string;
}

export type EnvVarValue = SecretRef | LiteralRef;

export interface RunRow {
  id: string;
  artifact_id: string;
  version_id: string | null;
  artifact_namespace: string;
  artifact_name: string;
  version: string | null;
  operation: RunOperation;
  mode: RunMode;
  status: RunStatus;
  triggered_by: string | null;
  team: string | null;
  ci_provider: string | null;
  pipeline_config: string | null;
  callback_token_hash: string | null;
  k8s_job_name: string | null;
  k8s_namespace: string | null;
  tf_version: string | null;
  variables: Record<string, unknown> | null;
  env_vars: Record<string, EnvVarValue> | null;
  working_directory: string | null;
  exit_code: number | null;
  resources_to_add: number | null;
  resources_to_change: number | null;
  resources_to_destroy: number | null;
  queued_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  created_at: string;
  updated_at: string;
}

export interface RunOutputRow {
  id: string;
  run_id: string;
  output_type: string;
  content: string;
  created_at: string;
}

export interface RunLogRow {
  id: string;
  run_id: string;
  sequence: number;
  stream: 'stdout' | 'stderr';
  content: string;
  created_at: string;
}

// ── IaC Environments ─────────────────────────────────────────────────

export type EnvironmentStatus = 'active' | 'paused' | 'archived';
export type EnvironmentModuleStatus = 'active' | 'destroyed' | 'archived';
export type ModuleRunOperation = 'plan' | 'apply' | 'destroy' | 'refresh' | 'drift-check';
export type ModuleRunStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'planned'
  | 'confirmed'
  | 'applying'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'timed_out'
  | 'discarded'
  | 'skipped';
export type EnvironmentRunOperation = 'plan-all' | 'apply-all' | 'destroy-all';
export type EnvironmentRunStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'partial_failure'
  | 'failed'
  | 'cancelled'
  | 'expired';
export type RunPriority = 'user' | 'cascade';
export type TriggerSource = 'manual' | 'module_update' | 'api' | 'env_run' | 'schedule';

export interface VcsTrigger {
  repositoryUrl: string;
  branch?: string;
  path?: string;
  provider?: 'github' | 'gitlab' | 'bitbucket';
}

export interface StateBackendConfig {
  type: 'pg' | 's3' | 'gcs' | 'azurerm';
  config?: Record<string, unknown>;
}

export interface OutputMappingEntry {
  upstream_output: string;
  downstream_variable: string;
}

export interface EnvironmentRow {
  id: string;
  name: string;
  description: string | null;
  team: string | null;
  status: EnvironmentStatus;
  locked: boolean;
  locked_by: string | null;
  locked_at: string | null;
  lock_reason: string | null;
  module_count: number;
  total_resources: number;
  last_run_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnvironmentModuleRow {
  id: string;
  environment_id: string;
  name: string;
  description: string | null;
  artifact_id: string;
  artifact_namespace: string;
  artifact_name: string;
  pinned_version: string | null;
  current_version: string | null;
  auto_plan_on_module_update: boolean;
  vcs_trigger: VcsTrigger | null;
  auto_plan_on_push: boolean;
  execution_mode: RunMode;
  tf_version: string | null;
  working_directory: string | null;
  state_backend: StateBackendConfig | null;
  last_run_id: string | null;
  last_run_status: string | null;
  last_run_at: string | null;
  resource_count: number;
  drift_status: string;
  status: EnvironmentModuleStatus;
  created_at: string;
  updated_at: string;
}

export interface ModuleDependencyRow {
  id: string;
  module_id: string;
  depends_on_id: string;
  output_mapping: OutputMappingEntry[] | null;
  created_at: string;
}

export interface EnvironmentModuleVariableRow {
  id: string;
  module_id: string;
  key: string;
  value: string | null;
  sensitive: boolean;
  hcl: boolean;
  category: 'terraform' | 'env';
  description: string | null;
  secret_ref: string | null;
  created_at: string;
  updated_at: string;
}

export interface ModuleRunRow {
  id: string;
  module_id: string;
  environment_id: string;
  environment_run_id: string | null;
  module_name: string;
  artifact_namespace: string;
  artifact_name: string;
  module_version: string | null;
  operation: ModuleRunOperation;
  mode: RunMode;
  status: ModuleRunStatus;
  triggered_by: string | null;
  trigger_source: TriggerSource | null;
  priority: RunPriority;
  queue_position: number | null;
  skip_reason: string | null;
  ci_provider: string | null;
  pipeline_config: string | null;
  callback_token_hash: string | null;
  k8s_job_name: string | null;
  k8s_namespace: string | null;
  tf_version: string | null;
  variables_snapshot: Record<string, unknown> | null;
  env_vars_snapshot: Record<string, unknown> | null;
  state_backend_snapshot: StateBackendConfig | null;
  exit_code: number | null;
  resources_to_add: number | null;
  resources_to_change: number | null;
  resources_to_destroy: number | null;
  resource_count_after: number | null;
  plan_summary: string | null;
  tf_outputs: Record<string, unknown> | null;
  queued_at: string | null;
  started_at: string | null;
  planned_at: string | null;
  confirmed_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  confirmed_by: string | null;
  auto_confirmed: boolean;
  created_at: string;
  updated_at: string;
}

export interface EnvironmentRunRow {
  id: string;
  environment_id: string;
  environment_name: string;
  operation: EnvironmentRunOperation;
  status: EnvironmentRunStatus;
  triggered_by: string | null;
  trigger_source: TriggerSource | null;
  total_modules: number;
  completed_modules: number;
  failed_modules: number;
  skipped_modules: number;
  execution_order: string[] | null;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  created_at: string;
  updated_at: string;
}

export interface ModuleRunOutputRow {
  id: string;
  run_id: string;
  output_type: string;
  content: string;
  created_at: string;
}

export interface ModuleRunLogRow {
  id: string;
  run_id: string;
  sequence: number;
  stream: 'stdout' | 'stderr';
  content: string;
  created_at: string;
}

export interface TerraformStateRow {
  id: string;
  module_id: string;
  workspace: string;
  lock_id: string | null;
  locked_by: string | null;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Cloud Integrations + Variable Sets ──────────────────────────────

export type CloudProvider = 'aws' | 'gcp' | 'azure' | 'custom';
export type AuthMethod = 'oidc' | 'static' | 'assume_role';
export type CloudIntegrationStatus = 'active' | 'disabled' | 'error';
export type VariableSetStatus = 'active' | 'archived';

export interface CloudIntegrationRow {
  id: string;
  name: string;
  description: string | null;
  team: string | null;
  provider: CloudProvider;
  auth_method: AuthMethod;
  credential_config: Record<string, unknown>;
  supported_ci_providers: string[] | null;
  status: CloudIntegrationStatus;
  last_validated_at: string | null;
  validation_error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface VariableSetRow {
  id: string;
  name: string;
  description: string | null;
  team: string | null;
  auto_attach: boolean;
  status: VariableSetStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface VariableSetEntryRow {
  id: string;
  variable_set_id: string;
  key: string;
  value: string | null;
  sensitive: boolean;
  hcl: boolean;
  category: 'terraform' | 'env';
  description: string | null;
  ci_secret_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface CloudIntegrationBindingRow {
  id: string;
  cloud_integration_id: string;
  priority: number;
  created_at: string;
}

export interface VariableSetBindingRow {
  id: string;
  variable_set_id: string;
  priority: number;
  created_at: string;
}

export interface CiSecretRef {
  source: 'ci_secret';
  name: string;
}

export type EnvVarSource = SecretRef | LiteralRef | CiSecretRef;
