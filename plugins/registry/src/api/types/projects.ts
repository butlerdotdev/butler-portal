// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { ModuleRunStatus, StateBackendConfig, VcsTrigger, OutputMapping } from './environments';

// ── Project ─────────────────────────────────────────────────────────

export type ProjectStatus = 'active' | 'paused' | 'archived';
export type ExecutionMode = 'byoc' | 'peaas';

export interface Project {
  id: string;
  name: string;
  description: string | null;
  team: string | null;
  execution_mode: ExecutionMode;
  status: ProjectStatus;
  module_count: number;
  total_resources: number;
  last_run_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  environments?: ProjectEnvironmentSummary[];
}

export interface ProjectEnvironmentSummary {
  id: string;
  name: string;
  status: string;
  total_resources: number;
  locked: boolean;
  state_backend_type: string | null;
}

// ── Project Module ──────────────────────────────────────────────────

export type ProjectModuleStatus = 'active' | 'archived';

export interface ProjectModule {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  artifact_id: string;
  artifact_namespace: string;
  artifact_name: string;
  pinned_version: string | null;
  auto_plan_on_module_update: boolean;
  vcs_trigger: VcsTrigger | null;
  auto_plan_on_push: boolean;
  tf_version: string | null;
  working_directory: string | null;
  status: ProjectModuleStatus;
  created_at: string;
  updated_at: string;
}

export interface ProjectModuleDependency {
  module_id: string;
  depends_on_id: string;
  depends_on_name: string;
  output_mapping: OutputMapping[] | null;
}

// ── Environment Module State ────────────────────────────────────────

export interface EnvironmentModuleState {
  id: string;
  environment_id: string;
  project_module_id: string;
  module_name?: string;
  current_version: string | null;
  last_run_id: string | null;
  last_run_status: ModuleRunStatus | null;
  last_run_at: string | null;
  resource_count: number;
  drift_status: 'unknown' | 'clean' | 'drifted' | 'error';
  created_at: string;
  updated_at: string;
}

// ── Project Graph ───────────────────────────────────────────────────

export interface ProjectGraphNode {
  id: string;
  name: string;
  artifact_name: string;
  status: ProjectModuleStatus;
}

export interface ProjectGraphEdge {
  from: string;
  to: string;
}

export interface ProjectGraph {
  nodes: ProjectGraphNode[];
  edges: ProjectGraphEdge[];
}

// ── Requests ────────────────────────────────────────────────────────

export interface CreateProjectRequest {
  name: string;
  description?: string;
  execution_mode?: ExecutionMode;
  team?: string;
}

export interface AddProjectModuleRequest {
  name: string;
  description?: string;
  artifact_namespace: string;
  artifact_name: string;
  pinned_version?: string;
  auto_plan_on_module_update?: boolean;
  tf_version?: string;
  working_directory?: string;
}

export interface SetProjectModuleDependenciesRequest {
  dependencies: Array<{
    depends_on_id: string;
    output_mapping?: OutputMapping[];
  }>;
}

export interface CreateEnvironmentInProjectRequest {
  name: string;
  description?: string;
  state_backend?: StateBackendConfig;
}

// ── Responses ───────────────────────────────────────────────────────

export interface ProjectListResponse {
  items: Project[];
  totalCount: number;
  nextCursor: string | null;
}
