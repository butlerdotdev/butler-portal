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

// ── DAG Model ───────────────────────────────────────────────────────
// Matches the spec exactly. Stored as JSONB in pipeline_versions.dag.

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

// ── Row Types ───────────────────────────────────────────────────────

export type PipelineStatus = 'active' | 'archived';

export interface PipelineRow {
  id: string;
  name: string;
  description: string | null;
  team: string;
  status: PipelineStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PipelineAgentRow {
  id: string;
  pipeline_id: string;
  agent_id: string;
  joined_at: string;
}

export interface PipelineVersionRow {
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

export interface PipelineAuditRow {
  id: string;
  team: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  actor: string;
  details: Record<string, unknown> | null;
  occurred_at: string;
}

// ── Fleet Row Types ─────────────────────────────────────────────────

export type AgentStatus = 'pending' | 'online' | 'offline' | 'stale';

export type DeploymentType = 'deploy' | 'rollback';
export type DeploymentStrategy = 'immediate';
export type DeploymentStatus = 'active' | 'superseded';
export type DeploymentTargetType = 'agent' | 'group';

export interface ConfigSyncResult {
  status: 'applied' | 'rejected' | 'unchanged';
  error?: string;
  appliedAt?: string;
}

export interface FleetTokenRow {
  id: string;
  team: string;
  name: string;
  token_prefix: string;
  token_hash: string;
  scopes: Record<string, unknown> | null;
  expires_at: string | null;
  created_by: string;
  created_at: string;
  revoked_at: string | null;
}

export interface FleetAgentRow {
  id: string;
  team: string;
  agent_id: string;
  hostname: string | null;
  ip_address: string | null;
  labels: Record<string, string>;
  vector_version: string | null;
  vector_config_path: string | null;
  vector_config_content: string | null;
  os: string | null;
  arch: string | null;
  status: AgentStatus;
  current_config_hash: string | null;
  config_sync_result: ConfigSyncResult | null;
  fleet_token_id: string | null;
  last_heartbeat_at: string | null;
  errors: Array<{ message: string; timestamp: string }>;
  registered_at: string;
  updated_at: string;
}

export interface FleetGroupRow {
  id: string;
  team: string;
  name: string;
  description: string | null;
  label_selector: Record<string, string> | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type ManagedConfigScopeType = 'agent' | 'group';

export interface ManagedConfigRow {
  id: string;
  team: string;
  scope_type: ManagedConfigScopeType;
  scope_id: string;
  version: number;
  dag: PipelineDag;
  vector_config: string;
  config_hash: string;
  metadata: Record<string, unknown> | null;
  change_summary: string | null;
  created_by: string;
  created_at: string;
}

export interface PipelineDeploymentRow {
  id: string;
  pipeline_id: string;
  pipeline_version_id: string;
  target_type: DeploymentTargetType;
  target_id: string;
  type: DeploymentType;
  strategy: DeploymentStrategy;
  status: DeploymentStatus;
  deployed_by: string;
  deployed_at: string;
  superseded_at: string | null;
}

// ── Query Options ───────────────────────────────────────────────────

export interface PipelineListOptions {
  cursor?: string;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  team?: string;
  status?: PipelineStatus;
  search?: string;
}

export interface AuditListOptions {
  team?: string;
  entityType?: string;
  entityId?: string;
  limit?: number;
  cursor?: string;
}

export interface FleetTokenListOptions {
  team?: string;
}

export interface FleetAgentListOptions {
  team?: string;
  status?: AgentStatus;
  labelKey?: string;
  labelValue?: string;
  cursor?: string;
  limit?: number;
}

export interface FleetGroupListOptions {
  team?: string;
}

export interface DeploymentListOptions {
  pipelineId: string;
  status?: DeploymentStatus;
  cursor?: string;
  limit?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  totalCount: number;
}
