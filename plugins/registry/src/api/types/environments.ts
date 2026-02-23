// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

// ── Enums ────────────────────────────────────────────────────────────

export type EnvironmentStatus = 'active' | 'paused' | 'archived';

export type ModuleRunOperation =
  | 'plan'
  | 'apply'
  | 'destroy'
  | 'refresh'
  | 'drift-check';

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

export type EnvironmentRunOperation =
  | 'plan-all'
  | 'apply-all'
  | 'destroy-all';

export type EnvironmentRunStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'partial_failure'
  | 'failed'
  | 'cancelled'
  | 'expired';

export type TriggerSource =
  | 'manual'
  | 'module_update'
  | 'api'
  | 'env_run'
  | 'schedule';

export type RunPriority = 'user' | 'cascade';

// ── Nested Config Types ──────────────────────────────────────────────

export interface VcsTrigger {
  repositoryUrl: string;
  branch?: string;
  path?: string;
  provider?: 'github' | 'gitlab' | 'bitbucket';
}

export interface StateBackendConfig {
  type: 's3' | 'gcs' | 'azurerm' | 'consul' | 'http' | string;
  config?: Record<string, unknown>;
}

export interface OutputMapping {
  upstream_output: string;
  downstream_variable: string;
}

export interface TestStateBackendRequest {
  type: string;
  config?: Record<string, unknown>;
}

export interface TestStateBackendResult {
  ok: boolean;
  message: string;
  latencyMs?: number;
}

// ── Environment ──────────────────────────────────────────────────────

export interface Environment {
  id: string;
  name: string;
  description: string | null;
  project_id: string;
  project_name?: string;
  team: string | null;
  status: EnvironmentStatus;
  locked: boolean;
  locked_by: string | null;
  locked_at: string | null;
  lock_reason: string | null;
  state_backend: StateBackendConfig | null;
  total_resources: number;
  last_run_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ModuleVariable {
  id: string;
  environment_id: string;
  project_module_id: string;
  key: string;
  value: string | null;
  sensitive: boolean;
  hcl: boolean;
  category: 'terraform' | 'env';
  description: string | null;
  secret_ref: string | null;
}

// ── Module Run ───────────────────────────────────────────────────────

export interface ModuleRun {
  id: string;
  project_module_id: string;
  environment_id: string;
  environment_run_id: string | null;
  module_name: string;
  artifact_namespace: string;
  artifact_name: string;
  module_version: string | null;
  operation: ModuleRunOperation;
  mode: 'byoc' | 'peaas';
  status: ModuleRunStatus;
  triggered_by: string | null;
  trigger_source: TriggerSource;
  priority: RunPriority;
  queue_position: number | null;
  skip_reason: string | null;
  exit_code: number | null;
  resources_to_add: number | null;
  resources_to_change: number | null;
  resources_to_destroy: number | null;
  resource_count_after: number | null;
  plan_summary: string | null;
  auto_confirmed: boolean;
  confirmed_by: string | null;
  queued_at: string | null;
  started_at: string | null;
  planned_at: string | null;
  confirmed_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  created_at: string;
  updated_at: string;
}

// ── Environment Run ──────────────────────────────────────────────────

export interface EnvironmentRun {
  id: string;
  environment_id: string;
  environment_name: string;
  operation: EnvironmentRunOperation;
  status: EnvironmentRunStatus;
  triggered_by: string | null;
  trigger_source: TriggerSource;
  total_modules: number;
  completed_modules: number;
  failed_modules: number;
  skipped_modules: number;
  execution_order: string[];
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  created_at: string;
  updated_at: string;
  module_runs?: ModuleRun[];
}

// ── Requests ─────────────────────────────────────────────────────────

export interface CreateModuleRunRequest {
  operation: 'plan' | 'apply' | 'destroy' | 'refresh';
  module_version?: string;
  auto_confirm?: boolean;
  ci_provider?: string;
}

export interface CreateEnvironmentRunRequest {
  operation: EnvironmentRunOperation;
  auto_confirm?: boolean;
}

export interface CreateModuleRunResponse {
  run: ModuleRun;
  callbackToken?: string;
}

// ── Responses ────────────────────────────────────────────────────────

export interface EnvironmentListResponse {
  items: Environment[];
  totalCount: number;
  nextCursor: string | null;
}

export interface ModuleRunListResponse {
  items: ModuleRun[];
  totalCount: number;
  nextCursor: string | null;
}

export interface RunLogEntry {
  id: string;
  sequence: number;
  stream: 'stdout' | 'stderr';
  content: string;
  created_at: string;
}
