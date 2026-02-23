// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { createApiRef } from '@backstage/core-plugin-api';
import type {
  Pipeline,
  PipelineVersion,
  PipelineListResponse,
  CreatePipelineRequest,
  CreateVersionRequest,
  ImportPipelineRequest,
  PreviewRequest,
  PreviewResult,
  ValidateResult,
  DiffResult,
  ComponentSchema,
  VrlValidateRequest,
  VrlValidateResult,
  VrlExecuteRequest,
  VrlExecuteResult,
  PipelineDag,
} from './types/pipelines';
import type {
  FleetToken,
  FleetAgent,
  FleetGroup,
  PipelineDeployment,
  FleetTokenListResponse,
  FleetAgentListResponse,
  FleetGroupListResponse,
  DeploymentListResponse,
  CreateFleetTokenRequest,
  CreateFleetGroupRequest,
  UpdateFleetGroupRequest,
  DeployPipelineRequest,
  DeployPipelineResponse,
  ManagedConfigVersion,
  SaveManagedConfigRequest,
} from './types/fleet';

export interface PipelineApi {
  // Team context
  setTeamContext(team: string | null): void;
  getTeamContext(): string | null;

  // Pipelines
  listPipelines(options?: {
    cursor?: string;
    limit?: number;
    search?: string;
    status?: string;
  }): Promise<PipelineListResponse>;
  getPipeline(id: string): Promise<Pipeline>;
  createPipeline(request: CreatePipelineRequest): Promise<Pipeline>;
  updatePipeline(
    id: string,
    data: Partial<{ name: string; description: string | null }>,
  ): Promise<Pipeline>;
  archivePipeline(id: string): Promise<Pipeline>;

  // Versions
  listVersions(pipelineId: string): Promise<PipelineVersion[]>;
  getVersion(pipelineId: string, version: number): Promise<PipelineVersion>;
  createVersion(
    pipelineId: string,
    request: CreateVersionRequest,
  ): Promise<PipelineVersion>;
  getVersionDiff(
    pipelineId: string,
    version: number,
    compareVersion: number,
  ): Promise<DiffResult>;

  // Validate & Preview
  validatePipeline(
    pipelineId: string,
    dag: PipelineDag,
  ): Promise<ValidateResult>;
  previewPipeline(
    pipelineId: string,
    request: PreviewRequest,
  ): Promise<PreviewResult>;

  // Import
  importPipeline(request: ImportPipelineRequest): Promise<{
    pipeline: Pipeline;
    version: PipelineVersion;
  }>;
  importPreview(
    config: string,
    format?: 'yaml' | 'toml',
  ): Promise<{ dag: PipelineDag }>;

  // VRL
  validateVrl(request: VrlValidateRequest): Promise<VrlValidateResult>;
  executeVrl(request: VrlExecuteRequest): Promise<VrlExecuteResult>;

  // Components
  listComponents(): Promise<ComponentSchema[]>;
  getComponent(vectorType: string): Promise<ComponentSchema>;

  // Fleet Tokens
  listFleetTokens(): Promise<FleetTokenListResponse>;
  createFleetToken(request: CreateFleetTokenRequest): Promise<FleetToken>;
  revokeFleetToken(id: string): Promise<void>;

  // Fleet Agents
  listFleetAgents(options?: {
    status?: string;
    labelKey?: string;
    labelValue?: string;
    cursor?: string;
    limit?: number;
  }): Promise<FleetAgentListResponse>;
  getFleetAgent(id: string): Promise<FleetAgent>;
  updateFleetAgent(id: string, data: { labels: Record<string, string> }): Promise<FleetAgent>;
  deleteFleetAgent(id: string): Promise<void>;

  // Fleet Groups
  listFleetGroups(): Promise<FleetGroupListResponse>;
  getFleetGroup(id: string): Promise<FleetGroup>;
  createFleetGroup(request: CreateFleetGroupRequest): Promise<FleetGroup>;
  updateFleetGroup(id: string, request: UpdateFleetGroupRequest): Promise<FleetGroup>;
  deleteFleetGroup(id: string): Promise<void>;

  // Deployments
  deployPipeline(pipelineId: string, request: DeployPipelineRequest): Promise<DeployPipelineResponse>;
  listDeployments(pipelineId: string, options?: {
    status?: string;
    cursor?: string;
    limit?: number;
  }): Promise<DeploymentListResponse>;
  rollbackDeployment(pipelineId: string, deploymentId: string): Promise<PipelineDeployment>;

  // Managed Config - Agent
  getAgentConfig(agentId: string): Promise<ManagedConfigVersion | null>;
  listAgentConfigVersions(agentId: string): Promise<ManagedConfigVersion[]>;
  saveAgentConfig(agentId: string, request: SaveManagedConfigRequest): Promise<ManagedConfigVersion>;
  importAgentConfig(agentId: string): Promise<ManagedConfigVersion>;
  deleteAgentConfig(agentId: string): Promise<void>;
  promoteAgentConfig(agentId: string, groupId: string): Promise<ManagedConfigVersion>;

  // Managed Config - Group
  getGroupConfig(groupId: string): Promise<ManagedConfigVersion | null>;
  listGroupConfigVersions(groupId: string): Promise<ManagedConfigVersion[]>;
  saveGroupConfig(groupId: string, request: SaveManagedConfigRequest): Promise<ManagedConfigVersion>;
  deleteGroupConfig(groupId: string): Promise<void>;
}

export const pipelineApiRef = createApiRef<PipelineApi>({
  id: 'plugin.pipeline.api',
});
