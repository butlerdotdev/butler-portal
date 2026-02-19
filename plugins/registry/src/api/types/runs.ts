// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

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

export interface IacRun {
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
  tf_version: string | null;
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

export interface RunLogEntry {
  id: string;
  sequence: number;
  stream: 'stdout' | 'stderr';
  content: string;
  created_at: string;
}

export interface RunOutput {
  output_type: string;
  content: string;
}

export interface CreateRunRequest {
  operation: RunOperation;
  mode: RunMode;
  version?: string;
  ci_provider?: string;
  tf_version?: string;
  variables?: Record<string, unknown>;
  env_vars?: Record<string, unknown>;
  working_directory?: string;
}

export interface CreateRunResponse {
  run: IacRun;
  callbackToken?: string;  // only for BYOC mode
}

export interface RunListResponse {
  items: IacRun[];
  totalCount: number;
  nextCursor: string | null;
}
