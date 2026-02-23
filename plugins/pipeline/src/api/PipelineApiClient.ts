// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import { PipelineApi } from './PipelineApi';
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

export class PipelineApiClient implements PipelineApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;
  private teamContext: string | null = null;

  constructor(options: { discoveryApi: DiscoveryApi; fetchApi: FetchApi }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
  }

  private async getBaseUrl(): Promise<string> {
    return this.discoveryApi.getBaseUrl('pipeline');
  }

  private async request<T>(
    path: string,
    options?: { method?: string; body?: unknown },
  ): Promise<T> {
    const baseUrl = await this.getBaseUrl();
    const url = `${baseUrl}${path}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.teamContext) {
      headers['X-Butler-Team'] = this.teamContext;
    }

    const response = await this.fetchApi.fetch(url, {
      method: options?.method ?? 'GET',
      headers,
      body: options?.body ? JSON.stringify(options.body) : undefined,
      cache: 'no-store',
    });

    if (!response.ok) {
      let errorMessage: string;
      try {
        const errorBody = await response.json();
        errorMessage =
          errorBody.error?.message || errorBody.message || response.statusText;
      } catch {
        errorMessage = response.statusText;
      }
      throw new Error(
        `Pipeline API error (${response.status}): ${errorMessage}`,
      );
    }

    if (response.status === 204) {
      return undefined as unknown as T;
    }

    return response.json() as Promise<T>;
  }

  private get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  private post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'POST', body });
  }

  private patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body });
  }

  private del<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }

  // ── Team Context ─────────────────────────────────────────────────

  setTeamContext(team: string | null): void {
    this.teamContext = team;
  }

  getTeamContext(): string | null {
    return this.teamContext;
  }

  // ── Pipelines ────────────────────────────────────────────────────

  async listPipelines(options?: {
    cursor?: string;
    limit?: number;
    search?: string;
    status?: string;
  }): Promise<PipelineListResponse> {
    const params = new URLSearchParams();
    if (options?.cursor) params.set('cursor', options.cursor);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.search) params.set('search', options.search);
    if (options?.status) params.set('status', options.status);
    const qs = params.toString();
    return this.get(`/v1/pipelines${qs ? `?${qs}` : ''}`);
  }

  async getPipeline(id: string): Promise<Pipeline> {
    return this.get(`/v1/pipelines/${id}`);
  }

  async createPipeline(request: CreatePipelineRequest): Promise<Pipeline> {
    return this.post('/v1/pipelines', request);
  }

  async updatePipeline(
    id: string,
    data: Partial<{ name: string; description: string | null }>,
  ): Promise<Pipeline> {
    return this.patch(`/v1/pipelines/${id}`, data);
  }

  async archivePipeline(id: string): Promise<Pipeline> {
    return this.del(`/v1/pipelines/${id}`);
  }

  // ── Versions ─────────────────────────────────────────────────────

  async listVersions(pipelineId: string): Promise<PipelineVersion[]> {
    return this.get(`/v1/pipelines/${pipelineId}/versions`);
  }

  async getVersion(
    pipelineId: string,
    version: number,
  ): Promise<PipelineVersion> {
    return this.get(`/v1/pipelines/${pipelineId}/versions/${version}`);
  }

  async createVersion(
    pipelineId: string,
    request: CreateVersionRequest,
  ): Promise<PipelineVersion> {
    return this.post(`/v1/pipelines/${pipelineId}/versions`, request);
  }

  async getVersionDiff(
    pipelineId: string,
    version: number,
    compareVersion: number,
  ): Promise<DiffResult> {
    return this.get(
      `/v1/pipelines/${pipelineId}/versions/${version}/diff?compare=${compareVersion}`,
    );
  }

  // ── Validate & Preview ───────────────────────────────────────────

  async validatePipeline(
    pipelineId: string,
    dag: PipelineDag,
  ): Promise<ValidateResult> {
    return this.post(`/v1/pipelines/${pipelineId}/validate`, { dag });
  }

  async previewPipeline(
    pipelineId: string,
    request: PreviewRequest,
  ): Promise<PreviewResult> {
    return this.post(`/v1/pipelines/${pipelineId}/preview`, request);
  }

  // ── Import ───────────────────────────────────────────────────────

  async importPipeline(
    request: ImportPipelineRequest,
  ): Promise<{ pipeline: Pipeline; version: PipelineVersion }> {
    return this.post('/v1/pipelines/import', request);
  }

  async importPreview(
    config: string,
    format?: 'yaml' | 'toml',
  ): Promise<{ dag: PipelineDag }> {
    return this.post('/v1/pipelines/import/preview', { config, format });
  }

  // ── VRL ──────────────────────────────────────────────────────────

  async validateVrl(
    request: VrlValidateRequest,
  ): Promise<VrlValidateResult> {
    return this.post('/v1/vrl/validate', request);
  }

  async executeVrl(
    request: VrlExecuteRequest,
  ): Promise<VrlExecuteResult> {
    return this.post('/v1/vrl/execute', request);
  }

  // ── Components ───────────────────────────────────────────────────

  async listComponents(): Promise<ComponentSchema[]> {
    return this.get('/v1/components');
  }

  async getComponent(vectorType: string): Promise<ComponentSchema> {
    return this.get(`/v1/components/${vectorType}`);
  }

  // ── Fleet Tokens ──────────────────────────────────────────────────

  async listFleetTokens(): Promise<FleetTokenListResponse> {
    return this.get('/v1/fleet/tokens');
  }

  async createFleetToken(request: CreateFleetTokenRequest): Promise<FleetToken> {
    return this.post('/v1/fleet/tokens', request);
  }

  async revokeFleetToken(id: string): Promise<void> {
    return this.del(`/v1/fleet/tokens/${id}`);
  }

  // ── Fleet Agents ──────────────────────────────────────────────────

  async listFleetAgents(options?: {
    status?: string;
    labelKey?: string;
    labelValue?: string;
    cursor?: string;
    limit?: number;
  }): Promise<FleetAgentListResponse> {
    const params = new URLSearchParams();
    if (options?.status) params.set('status', options.status);
    if (options?.labelKey) params.set('labelKey', options.labelKey);
    if (options?.labelValue) params.set('labelValue', options.labelValue);
    if (options?.cursor) params.set('cursor', options.cursor);
    if (options?.limit) params.set('limit', String(options.limit));
    const qs = params.toString();
    return this.get(`/v1/fleet/agents${qs ? `?${qs}` : ''}`);
  }

  async getFleetAgent(id: string): Promise<FleetAgent> {
    return this.get(`/v1/fleet/agents/${id}`);
  }

  async updateFleetAgent(id: string, data: { labels: Record<string, string> }): Promise<FleetAgent> {
    return this.patch(`/v1/fleet/agents/${id}`, data);
  }

  async deleteFleetAgent(id: string): Promise<void> {
    return this.del(`/v1/fleet/agents/${id}`);
  }

  // ── Fleet Groups ──────────────────────────────────────────────────

  async listFleetGroups(): Promise<FleetGroupListResponse> {
    return this.get('/v1/fleet/groups');
  }

  async getFleetGroup(id: string): Promise<FleetGroup> {
    return this.get(`/v1/fleet/groups/${id}`);
  }

  async createFleetGroup(request: CreateFleetGroupRequest): Promise<FleetGroup> {
    return this.post('/v1/fleet/groups', request);
  }

  async updateFleetGroup(id: string, request: UpdateFleetGroupRequest): Promise<FleetGroup> {
    return this.patch(`/v1/fleet/groups/${id}`, request);
  }

  async deleteFleetGroup(id: string): Promise<void> {
    return this.del(`/v1/fleet/groups/${id}`);
  }

  // ── Deployments ───────────────────────────────────────────────────

  async deployPipeline(pipelineId: string, request: DeployPipelineRequest): Promise<DeployPipelineResponse> {
    return this.post(`/v1/pipelines/${pipelineId}/deploy`, request);
  }

  async listDeployments(pipelineId: string, options?: {
    status?: string;
    cursor?: string;
    limit?: number;
  }): Promise<DeploymentListResponse> {
    const params = new URLSearchParams();
    if (options?.status) params.set('status', options.status);
    if (options?.cursor) params.set('cursor', options.cursor);
    if (options?.limit) params.set('limit', String(options.limit));
    const qs = params.toString();
    return this.get(`/v1/pipelines/${pipelineId}/deployments${qs ? `?${qs}` : ''}`);
  }

  async rollbackDeployment(pipelineId: string, deploymentId: string): Promise<PipelineDeployment> {
    return this.post(`/v1/pipelines/${pipelineId}/deployments/${deploymentId}/rollback`);
  }

  // ── Managed Config - Agent ─────────────────────────────────────────

  async getAgentConfig(agentId: string): Promise<ManagedConfigVersion | null> {
    try {
      return await this.get(`/v1/fleet/agents/${agentId}/managed-config`);
    } catch (err) {
      if (err instanceof Error && err.message.includes('404')) return null;
      throw err;
    }
  }

  async listAgentConfigVersions(agentId: string): Promise<ManagedConfigVersion[]> {
    return this.get(`/v1/fleet/agents/${agentId}/managed-config/versions`);
  }

  async saveAgentConfig(agentId: string, request: SaveManagedConfigRequest): Promise<ManagedConfigVersion> {
    return this.post(`/v1/fleet/agents/${agentId}/managed-config/versions`, request);
  }

  async importAgentConfig(agentId: string): Promise<ManagedConfigVersion> {
    return this.post(`/v1/fleet/agents/${agentId}/managed-config/import`);
  }

  async deleteAgentConfig(agentId: string): Promise<void> {
    return this.del(`/v1/fleet/agents/${agentId}/managed-config`);
  }

  async promoteAgentConfig(agentId: string, groupId: string): Promise<ManagedConfigVersion> {
    return this.post(`/v1/fleet/agents/${agentId}/managed-config/promote`, { groupId });
  }

  // ── Managed Config - Group ─────────────────────────────────────────

  async getGroupConfig(groupId: string): Promise<ManagedConfigVersion | null> {
    try {
      return await this.get(`/v1/fleet/groups/${groupId}/managed-config`);
    } catch (err) {
      if (err instanceof Error && err.message.includes('404')) return null;
      throw err;
    }
  }

  async listGroupConfigVersions(groupId: string): Promise<ManagedConfigVersion[]> {
    return this.get(`/v1/fleet/groups/${groupId}/managed-config/versions`);
  }

  async saveGroupConfig(groupId: string, request: SaveManagedConfigRequest): Promise<ManagedConfigVersion> {
    return this.post(`/v1/fleet/groups/${groupId}/managed-config/versions`, request);
  }

  async deleteGroupConfig(groupId: string): Promise<void> {
    return this.del(`/v1/fleet/groups/${groupId}/managed-config`);
  }
}
