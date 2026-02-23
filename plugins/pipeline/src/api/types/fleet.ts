// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { PipelineDag } from './pipelines';

// ── Fleet Token ────────────────────────────────────────────────────

export interface FleetToken {
  id: string;
  team: string;
  name: string;
  token_prefix: string;
  token?: string; // only present on create response
  expires_at: string | null;
  created_by: string;
  created_at: string;
  revoked_at: string | null;
}

// ── Fleet Agent ────────────────────────────────────────────────────

export type AgentStatus = 'pending' | 'online' | 'offline' | 'stale';

export interface ConfigSyncResult {
  status: 'applied' | 'rejected' | 'unchanged';
  error?: string;
  appliedAt?: string;
}

export interface FleetAgent {
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
  managedConfig?: { version: number; config_hash: string; created_by: string; created_at: string } | null;
  // Enriched fields (detail endpoint only)
  matchingGroups?: Array<{ id: string; name: string; description: string | null }>;
  activeDeployments?: Array<{
    id: string;
    pipeline_id: string;
    pipeline_name: string;
    target_type: DeploymentTargetType;
    target_id: string;
    type: DeploymentType;
    status: DeploymentStatus;
    deployed_by: string;
    deployed_at: string;
  }>;
}

// ── Fleet Group ────────────────────────────────────────────────────

export interface FleetGroup {
  id: string;
  team: string;
  name: string;
  description: string | null;
  label_selector: Record<string, string> | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  agentCount?: number;
  agents?: FleetAgent[];
  managedConfig?: { version: number; config_hash: string; created_by: string; created_at: string } | null;
}

// ── Pipeline Deployment ────────────────────────────────────────────

export type DeploymentType = 'deploy' | 'rollback';
export type DeploymentStrategy = 'immediate';
export type DeploymentStatus = 'active' | 'superseded';
export type DeploymentTargetType = 'agent' | 'group';

export interface PipelineDeployment {
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

// ── Request/Response ───────────────────────────────────────────────

export interface FleetTokenListResponse {
  items: FleetToken[];
}

export interface FleetAgentListResponse {
  items: FleetAgent[];
  nextCursor: string | null;
  totalCount: number;
}

export interface FleetGroupListResponse {
  items: FleetGroup[];
}

export interface DeploymentListResponse {
  items: PipelineDeployment[];
  nextCursor: string | null;
  totalCount: number;
}

export interface CreateFleetTokenRequest {
  name: string;
  expires_at?: string;
  team?: string;
}

export interface CreateFleetGroupRequest {
  name: string;
  description?: string;
  label_selector?: Record<string, string>;
  team?: string;
}

export interface UpdateFleetGroupRequest {
  name?: string;
  description?: string | null;
  label_selector?: Record<string, string> | null;
}

export interface DeployPipelineRequest {
  targets?: Array<{ type: DeploymentTargetType; id: string }>;
  version?: number;
}

export interface DeployPipelineResponse {
  deployments: PipelineDeployment[];
}

// ── Managed Config ────────────────────────────────────────────────────

export interface ManagedConfigVersion {
  id: string;
  team: string;
  scope_type: 'agent' | 'group';
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

export interface SaveManagedConfigRequest {
  dag: PipelineDag;
  change_summary?: string;
}
