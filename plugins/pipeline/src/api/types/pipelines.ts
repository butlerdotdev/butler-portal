// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

// ── DAG Model ───────────────────────────────────────────────────────

export interface DagComponent {
  id: string;
  type: 'source' | 'transform' | 'sink';
  vectorType: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
  metadata: { label: string; notes?: string };
  inferredInputSchema: Record<string, string> | null;
  inferredOutputSchema: Record<string, string> | null;
}

export interface DagEdge {
  from: string;
  to: string;
  fromOutput?: string;
}

export interface PipelineDag {
  components: DagComponent[];
  edges: DagEdge[];
}

// ── Pipeline ────────────────────────────────────────────────────────

export type PipelineStatus = 'active' | 'archived';

export interface PipelineAgent {
  id: string;
  agent_id: string;
  hostname: string | null;
  status: string;
  current_config_hash: string | null;
  config_sync_result: { status: string; error?: string } | null;
  last_heartbeat_at: string | null;
  joined_at: string;
}

export interface Pipeline {
  id: string;
  name: string;
  description: string | null;
  team: string;
  status: PipelineStatus;
  agents?: PipelineAgent[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PipelineVersion {
  id: string;
  pipeline_id: string;
  version: number;
  dag: PipelineDag;
  vector_config: string;
  config_hash: string;
  metadata: Record<string, unknown> | null;
  change_summary: string | null;
  created_by: string;
  created_at: string;
}

// ── Component Schema ────────────────────────────────────────────────

export interface ComponentSchema {
  type: 'source' | 'transform' | 'sink';
  vectorType: string;
  displayName: string;
  description: string;
  category: string;
  configSchema: Record<string, unknown>;
  defaultConfig: Record<string, unknown>;
}

// ── VRL ─────────────────────────────────────────────────────────────

export interface VrlValidateResult {
  valid: boolean;
  errors: string[];
}

export interface VrlExecuteResult {
  success: boolean;
  output: Record<string, unknown>[];
  errors: string[];
}

// ── Preview ─────────────────────────────────────────────────────────

export interface PreviewStep {
  nodeId: string;
  nodeLabel: string;
  vectorType: string;
  inputEvents: Record<string, unknown>[];
  outputEvents: Record<string, unknown>[];
  droppedEvents: Record<string, unknown>[];
  errors: string[];
  skipped: boolean;
  skipReason?: string;
}

export interface PreviewResult {
  steps: PreviewStep[];
  finalEvents: Record<string, unknown>[];
}

// ── Requests ────────────────────────────────────────────────────────

export interface PipelineListResponse {
  items: Pipeline[];
  nextCursor: string | null;
  totalCount: number;
}

export interface CreatePipelineRequest {
  name: string;
  description?: string;
}

export interface CreateVersionRequest {
  dag: PipelineDag;
  change_summary?: string;
  metadata?: Record<string, unknown>;
}

export interface ImportPipelineRequest {
  config: string;
  name: string;
  description?: string;
  format?: 'yaml' | 'toml';
}

export interface PreviewRequest {
  sampleEvents: Record<string, unknown>[];
  targetNodeId?: string;
  dag?: PipelineDag;
}

export interface VrlValidateRequest {
  program: string;
}

export interface VrlExecuteRequest {
  program: string;
  events: Record<string, unknown>[];
}

export interface ValidateResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  compiledHash: string;
}

export interface DiffResult {
  versionA: { version: number; config: string };
  versionB: { version: number; config: string };
  diff: Array<{ count?: number; value: string; added?: boolean; removed?: boolean }>;
}
