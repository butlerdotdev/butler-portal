// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import { RegistryApi } from './RegistryApi';
import type {
  Artifact,
  ArtifactVersion,
  ArtifactListOptions,
  ArtifactListResponse,
  CreateArtifactRequest,
  PublishVersionRequest,
  ConsumerInfo,
  FacetsResponse,
} from './types/artifacts';
import type {
  RegistryToken,
  CreateTokenRequest,
  CreateTokenResponse,
} from './types/tokens';
import type {
  GovernanceSummary,
  ApprovalListResponse,
  StalenessAlert,
  AuditLogResponse,
  AuditLogOptions,
} from './types/governance';
import type { ScanResult, CostEstimate } from './types/scans';
import type { DownloadStats } from './types/stats';
import type {
  IacRun,
  CreateRunRequest,
  CreateRunResponse,
  RunListResponse,
  RunLogEntry,
} from './types/runs';
import type {
  Environment,
  EnvironmentRun,
  ModuleRun,
  ModuleVariable,
  EnvironmentListResponse,
  ModuleRunListResponse,
  CreateModuleRunRequest,
  CreateModuleRunResponse,
  CreateEnvironmentRunRequest,
  RunLogEntry as ModuleRunLogEntry,
  TestStateBackendRequest,
  TestStateBackendResult,
} from './types/environments';
import type {
  Project,
  ProjectModule,
  ProjectModuleDependency,
  EnvironmentModuleState,
  ProjectGraph,
  ProjectListResponse,
  CreateProjectRequest,
  AddProjectModuleRequest,
  SetProjectModuleDependenciesRequest,
  CreateEnvironmentInProjectRequest,
} from './types/projects';
import type {
  CloudIntegration,
  CreateCloudIntegrationRequest,
  CloudIntegrationBinding,
  ValidateCloudIntegrationResponse,
  TestCloudIntegrationRequest,
  TestCloudIntegrationResult,
} from './types/cloudIntegrations';
import type {
  VariableSet,
  VariableSetEntry,
  CreateVariableSetRequest,
  VariableSetBinding,
  ResolvedVariable,
} from './types/variableSets';
import type {
  PolicyTemplate,
  PolicyBinding,
  CreatePolicyTemplateRequest,
  CreatePolicyBindingRequest,
  EffectivePolicy,
  PolicyEvaluation,
} from './types/policies';

export class RegistryApiClient implements RegistryApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;
  private teamContext: string | null = null;

  constructor(options: { discoveryApi: DiscoveryApi; fetchApi: FetchApi }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
  }

  private async getBaseUrl(): Promise<string> {
    return this.discoveryApi.getBaseUrl('registry');
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
        `Registry API error (${response.status}): ${errorMessage}`,
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

  // ── Team context ──

  setTeamContext(team: string | null): void {
    this.teamContext = team;
  }

  getTeamContext(): string | null {
    return this.teamContext;
  }

  // ── Artifacts ──

  async listArtifacts(
    options?: ArtifactListOptions,
  ): Promise<ArtifactListResponse> {
    const params = new URLSearchParams();
    if (options?.cursor) params.set('cursor', options.cursor);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.sortBy) params.set('sortBy', options.sortBy);
    if (options?.sortOrder) params.set('sortOrder', options.sortOrder);
    if (options?.type) params.set('type', options.type);
    if (options?.status) params.set('status', options.status);
    if (options?.team) params.set('team', options.team);
    if (options?.search) params.set('search', options.search);
    if (options?.tags && options.tags.length > 0) params.set('tags', options.tags.join(','));
    if (options?.category) params.set('category', options.category);
    const qs = params.toString();
    return this.get(`/v1/artifacts${qs ? `?${qs}` : ''}`);
  }

  async getArtifactFacets(): Promise<FacetsResponse> {
    return this.get('/v1/artifacts/facets');
  }

  async getArtifact(namespace: string, name: string): Promise<Artifact> {
    return this.get(`/v1/artifacts/${namespace}/${name}`);
  }

  async createArtifact(data: CreateArtifactRequest): Promise<Artifact> {
    return this.post('/v1/artifacts', data);
  }

  async updateArtifact(
    namespace: string,
    name: string,
    data: Partial<CreateArtifactRequest>,
  ): Promise<Artifact> {
    return this.patch(`/v1/artifacts/${namespace}/${name}`, data);
  }

  async deleteArtifact(namespace: string, name: string): Promise<void> {
    return this.del(`/v1/artifacts/${namespace}/${name}`);
  }

  async deprecateArtifact(
    namespace: string,
    name: string,
  ): Promise<Artifact> {
    return this.post(`/v1/artifacts/${namespace}/${name}/deprecate`);
  }

  // ── Versions ──

  async listVersions(
    namespace: string,
    name: string,
  ): Promise<{ versions: ArtifactVersion[] }> {
    return this.get(`/v1/artifacts/${namespace}/${name}/versions`);
  }

  async publishVersion(
    namespace: string,
    name: string,
    data: PublishVersionRequest,
  ): Promise<ArtifactVersion> {
    return this.post(`/v1/artifacts/${namespace}/${name}/versions`, data);
  }

  async approveVersion(
    namespace: string,
    name: string,
    version: string,
    comment?: string,
  ): Promise<ArtifactVersion> {
    return this.post(
      `/v1/artifacts/${namespace}/${name}/versions/${version}/approve`,
      comment ? { comment } : undefined,
    );
  }

  async rejectVersion(
    namespace: string,
    name: string,
    version: string,
    comment?: string,
  ): Promise<ArtifactVersion> {
    return this.post(
      `/v1/artifacts/${namespace}/${name}/versions/${version}/reject`,
      comment ? { comment } : undefined,
    );
  }

  async yankVersion(
    namespace: string,
    name: string,
    version: string,
    reason?: string,
  ): Promise<void> {
    return this.post(
      `/v1/artifacts/${namespace}/${name}/versions/${version}/yank`,
      reason ? { reason } : undefined,
    );
  }

  async getConsumers(
    namespace: string,
    name: string,
  ): Promise<{ consumers: ConsumerInfo[]; anonymous: Array<{ consumer_type: string; download_count: number; last_download: string }> }> {
    return this.get(`/v1/artifacts/${namespace}/${name}/consumers`);
  }

  // ── Detail data ──

  async getReadme(
    namespace: string,
    name: string,
    version?: string,
  ): Promise<{ content: string }> {
    const versionPath = version ? `/versions/${version}` : '';
    return this.get(
      `/v1/artifacts/${namespace}/${name}${versionPath}/readme`,
    );
  }

  async getScanResult(
    namespace: string,
    name: string,
    version: string,
  ): Promise<{ results: ScanResult[] }> {
    return this.get(
      `/v1/artifacts/${namespace}/${name}/versions/${version}/scan`,
    );
  }

  async getCostEstimate(
    namespace: string,
    name: string,
    version: string,
  ): Promise<{ results: CostEstimate[] }> {
    return this.get(
      `/v1/artifacts/${namespace}/${name}/versions/${version}/cost`,
    );
  }

  async getDownloadStats(
    namespace: string,
    name: string,
  ): Promise<DownloadStats> {
    return this.get(`/v1/artifacts/${namespace}/${name}/stats`);
  }

  async getArtifactAuditLog(
    namespace: string,
    name: string,
  ): Promise<AuditLogResponse> {
    return this.get(`/v1/artifacts/${namespace}/${name}/audit`);
  }

  // ── Governance ──

  async getGovernanceSummary(): Promise<GovernanceSummary> {
    return this.get('/v1/governance/summary');
  }

  async listPendingApprovals(): Promise<ApprovalListResponse> {
    return this.get('/v1/governance/approvals');
  }

  async getStalenessAlerts(): Promise<{ alerts: StalenessAlert[] }> {
    return this.get('/v1/governance/staleness');
  }

  async getAuditLog(options?: AuditLogOptions): Promise<AuditLogResponse> {
    const params = new URLSearchParams();
    if (options?.cursor) params.set('cursor', options.cursor);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.resource_type) params.set('resource_type', options.resource_type);
    if (options?.action) params.set('action', options.action);
    const qs = params.toString();
    return this.get(`/v1/audit${qs ? `?${qs}` : ''}`);
  }

  // ── Tokens ──

  async listTokens(): Promise<{ tokens: RegistryToken[] }> {
    return this.get('/v1/tokens');
  }

  async createToken(data: CreateTokenRequest): Promise<CreateTokenResponse> {
    return this.post('/v1/tokens', data);
  }

  async revokeToken(tokenId: string): Promise<void> {
    return this.del(`/v1/tokens/${tokenId}`);
  }

  // ── Runs (artifact-level) ──

  async listRuns(
    namespace: string,
    name: string,
    options?: { status?: string },
  ): Promise<RunListResponse> {
    const params = new URLSearchParams();
    if (options?.status) params.set('status', options.status);
    const qs = params.toString();
    return this.get(`/v1/artifacts/${namespace}/${name}/runs${qs ? `?${qs}` : ''}`);
  }

  async createRun(
    namespace: string,
    name: string,
    data: CreateRunRequest,
  ): Promise<CreateRunResponse> {
    return this.post(`/v1/artifacts/${namespace}/${name}/runs`, data);
  }

  async getRun(runId: string): Promise<IacRun> {
    return this.get(`/v1/runs/${runId}`);
  }

  async getRunLogs(
    runId: string,
    after?: number,
  ): Promise<{ logs: RunLogEntry[] }> {
    const qs = after !== undefined ? `?after=${after}` : '';
    return this.get(`/v1/runs/${runId}/logs${qs}`);
  }

  async getRunPlan(
    runId: string,
  ): Promise<{ plan_text: string | null; plan_json: string | null }> {
    return this.get(`/v1/runs/${runId}/plan`);
  }

  async cancelRun(runId: string): Promise<IacRun> {
    return this.post(`/v1/runs/${runId}/cancel`);
  }

  async confirmRun(runId: string): Promise<IacRun> {
    return this.post(`/v1/runs/${runId}/confirm`);
  }

  async generatePipeline(
    namespace: string,
    name: string,
    ciProvider: string,
    operation: string,
  ): Promise<{ pipeline_config: string; ci_provider: string }> {
    return this.get(
      `/v1/runs/generate-pipeline?ci_provider=${encodeURIComponent(ciProvider)}&operation=${encodeURIComponent(operation)}&namespace=${encodeURIComponent(namespace)}&name=${encodeURIComponent(name)}`,
    );
  }

  // ── Projects ──

  async listProjects(
    options?: { status?: string; limit?: number; cursor?: string },
  ): Promise<ProjectListResponse> {
    const params = new URLSearchParams();
    if (options?.status) params.set('status', options.status);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.cursor) params.set('cursor', options.cursor);
    const qs = params.toString();
    return this.get(`/v1/projects${qs ? `?${qs}` : ''}`);
  }

  async createProject(data: CreateProjectRequest): Promise<Project> {
    return this.post('/v1/projects', data);
  }

  async getProject(projectId: string): Promise<Project> {
    return this.get(`/v1/projects/${projectId}`);
  }

  async updateProject(
    projectId: string,
    data: Partial<CreateProjectRequest>,
  ): Promise<Project> {
    return this.patch(`/v1/projects/${projectId}`, data);
  }

  async deleteProject(projectId: string): Promise<void> {
    return this.del(`/v1/projects/${projectId}`);
  }

  async getProjectGraph(projectId: string): Promise<ProjectGraph> {
    return this.get(`/v1/projects/${projectId}/graph`);
  }

  // ── Project Modules ──

  async listProjectModules(
    projectId: string,
  ): Promise<{ modules: ProjectModule[] }> {
    return this.get(`/v1/projects/${projectId}/modules`);
  }

  async addProjectModule(
    projectId: string,
    data: AddProjectModuleRequest,
  ): Promise<ProjectModule> {
    return this.post(`/v1/projects/${projectId}/modules`, data);
  }

  async getProjectModule(
    projectId: string,
    moduleId: string,
  ): Promise<ProjectModule> {
    return this.get(`/v1/projects/${projectId}/modules/${moduleId}`);
  }

  async updateProjectModule(
    projectId: string,
    moduleId: string,
    data: Partial<AddProjectModuleRequest>,
  ): Promise<ProjectModule> {
    return this.patch(
      `/v1/projects/${projectId}/modules/${moduleId}`,
      data,
    );
  }

  async removeProjectModule(
    projectId: string,
    moduleId: string,
  ): Promise<void> {
    return this.del(`/v1/projects/${projectId}/modules/${moduleId}`);
  }

  // ── Project Module Dependencies ──

  async getProjectModuleDependencies(
    projectId: string,
    moduleId: string,
  ): Promise<{ dependencies: ProjectModuleDependency[] }> {
    return this.get(
      `/v1/projects/${projectId}/modules/${moduleId}/dependencies`,
    );
  }

  async setProjectModuleDependencies(
    projectId: string,
    moduleId: string,
    data: SetProjectModuleDependenciesRequest,
  ): Promise<{ dependencies: ProjectModuleDependency[] }> {
    return this.request(
      `/v1/projects/${projectId}/modules/${moduleId}/dependencies`,
      { method: 'PUT', body: data },
    );
  }

  // ── Environments ──

  async listProjectEnvironments(
    projectId: string,
  ): Promise<EnvironmentListResponse> {
    return this.get(`/v1/projects/${projectId}/environments`);
  }

  async createProjectEnvironment(
    projectId: string,
    data: CreateEnvironmentInProjectRequest,
  ): Promise<Environment> {
    return this.post(`/v1/projects/${projectId}/environments`, data);
  }

  async listEnvironments(
    options?: { status?: string; limit?: number; cursor?: string },
  ): Promise<EnvironmentListResponse> {
    const params = new URLSearchParams();
    if (options?.status) params.set('status', options.status);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.cursor) params.set('cursor', options.cursor);
    const qs = params.toString();
    return this.get(`/v1/environments${qs ? `?${qs}` : ''}`);
  }

  async getEnvironment(
    envId: string,
  ): Promise<Environment & { module_states?: EnvironmentModuleState[] }> {
    return this.get(`/v1/environments/${envId}`);
  }

  async updateEnvironment(
    envId: string,
    data: Partial<{ name: string; description: string; state_backend: object }>,
  ): Promise<Environment> {
    return this.patch(`/v1/environments/${envId}`, data);
  }

  async deleteEnvironment(envId: string): Promise<void> {
    return this.del(`/v1/environments/${envId}`);
  }

  async lockEnvironment(
    envId: string,
    reason?: string,
  ): Promise<Environment> {
    return this.post(
      `/v1/environments/${envId}/lock`,
      reason ? { reason } : undefined,
    );
  }

  async unlockEnvironment(envId: string): Promise<Environment> {
    return this.post(`/v1/environments/${envId}/unlock`);
  }

  // ── State Backend ──

  async testStateBackend(
    data: TestStateBackendRequest,
  ): Promise<TestStateBackendResult> {
    return this.post('/v1/state-backend/test', data);
  }

  // ── Module Variables (env-scoped) ──

  async listModuleVariables(
    envId: string,
    moduleId: string,
  ): Promise<{ variables: ModuleVariable[] }> {
    return this.get(
      `/v1/environments/${envId}/modules/${moduleId}/variables`,
    );
  }

  async updateModuleVariables(
    envId: string,
    moduleId: string,
    variables: ModuleVariable[],
  ): Promise<{ variables: ModuleVariable[] }> {
    return this.request(
      `/v1/environments/${envId}/modules/${moduleId}/variables`,
      { method: 'PUT', body: { variables } },
    );
  }

  async deleteModuleVariable(
    envId: string,
    moduleId: string,
    key: string,
    category?: string,
  ): Promise<void> {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    const qs = params.toString();
    return this.del(
      `/v1/environments/${envId}/modules/${moduleId}/variables/${encodeURIComponent(key)}${qs ? `?${qs}` : ''}`,
    );
  }

  // ── Module Outputs & State (env-scoped) ──

  async getModuleLatestOutputs(
    envId: string,
    moduleId: string,
  ): Promise<{ outputs: Record<string, unknown> }> {
    return this.get(
      `/v1/environments/${envId}/modules/${moduleId}/latest-outputs`,
    );
  }

  async forceUnlockModule(
    envId: string,
    moduleId: string,
  ): Promise<void> {
    return this.post(
      `/v1/environments/${envId}/modules/${moduleId}/force-unlock`,
    );
  }

  // ── Module Runs (env-scoped) ──

  async listModuleRuns(
    envId: string,
    moduleId: string,
    options?: { status?: string },
  ): Promise<ModuleRunListResponse> {
    const params = new URLSearchParams();
    if (options?.status) params.set('status', options.status);
    const qs = params.toString();
    return this.get(
      `/v1/environments/${envId}/modules/${moduleId}/runs${qs ? `?${qs}` : ''}`,
    );
  }

  async createModuleRun(
    envId: string,
    moduleId: string,
    data: CreateModuleRunRequest,
  ): Promise<CreateModuleRunResponse> {
    return this.post(
      `/v1/environments/${envId}/modules/${moduleId}/runs`,
      data,
    );
  }

  async getModuleRun(runId: string): Promise<ModuleRun> {
    return this.get(`/v1/module-runs/${runId}`);
  }

  async getModuleRunLogs(
    runId: string,
    after?: number,
  ): Promise<{ logs: ModuleRunLogEntry[] }> {
    const qs = after !== undefined ? `?after=${after}` : '';
    return this.get(`/v1/module-runs/${runId}/logs${qs}`);
  }

  async getModuleRunPlan(
    runId: string,
  ): Promise<{ plan_text: string | null; plan_json: string | null }> {
    return this.get(`/v1/module-runs/${runId}/plan`);
  }

  async getModuleRunOutputs(
    runId: string,
  ): Promise<{ outputs: Record<string, unknown> }> {
    return this.get(`/v1/module-runs/${runId}/outputs`);
  }

  async confirmModuleRun(runId: string): Promise<ModuleRun> {
    return this.post(`/v1/module-runs/${runId}/confirm`);
  }

  async discardModuleRun(runId: string): Promise<ModuleRun> {
    return this.post(`/v1/module-runs/${runId}/discard`);
  }

  async cancelModuleRun(runId: string): Promise<ModuleRun> {
    return this.post(`/v1/module-runs/${runId}/cancel`);
  }

  // ── Environment Runs (DAG-wide) ──

  async listEnvironmentRuns(
    envId: string,
  ): Promise<{ runs: EnvironmentRun[] }> {
    return this.get(`/v1/environments/${envId}/runs`);
  }

  async createEnvironmentRun(
    envId: string,
    data: CreateEnvironmentRunRequest,
  ): Promise<EnvironmentRun> {
    return this.post(`/v1/environments/${envId}/runs`, data);
  }

  async getEnvironmentRun(runId: string): Promise<EnvironmentRun> {
    return this.get(`/v1/environment-runs/${runId}`);
  }

  async confirmEnvironmentRun(
    runId: string,
    excludeModules?: string[],
  ): Promise<EnvironmentRun> {
    return this.post(
      `/v1/environment-runs/${runId}/confirm`,
      excludeModules ? { excludeModules } : undefined,
    );
  }

  async cancelEnvironmentRun(runId: string): Promise<EnvironmentRun> {
    return this.post(`/v1/environment-runs/${runId}/cancel`);
  }

  // ── Cross-reference ──

  async listProjectsForArtifact(
    namespace: string,
    name: string,
  ): Promise<{ projects: Array<{ project_id: string; project_name: string; module_id: string; module_name: string }> }> {
    return this.get(
      `/v1/artifacts/${namespace}/${name}/projects`,
    );
  }

  // ── Cloud Integrations ──

  async listCloudIntegrations(
    options?: { provider?: string },
  ): Promise<{ integrations: CloudIntegration[] }> {
    const params = new URLSearchParams();
    if (options?.provider) params.set('provider', options.provider);
    const qs = params.toString();
    return this.get(`/v1/cloud-integrations${qs ? `?${qs}` : ''}`);
  }

  async createCloudIntegration(
    data: CreateCloudIntegrationRequest,
  ): Promise<CloudIntegration> {
    return this.post('/v1/cloud-integrations', data);
  }

  async getCloudIntegration(id: string): Promise<CloudIntegration> {
    return this.get(`/v1/cloud-integrations/${id}`);
  }

  async updateCloudIntegration(
    id: string,
    data: Partial<CreateCloudIntegrationRequest>,
  ): Promise<CloudIntegration> {
    return this.patch(`/v1/cloud-integrations/${id}`, data);
  }

  async deleteCloudIntegration(id: string): Promise<void> {
    return this.del(`/v1/cloud-integrations/${id}`);
  }

  async validateCloudIntegration(
    id: string,
  ): Promise<ValidateCloudIntegrationResponse> {
    return this.post(`/v1/cloud-integrations/${id}/validate`);
  }

  async testCloudIntegration(
    data: TestCloudIntegrationRequest,
  ): Promise<TestCloudIntegrationResult> {
    return this.post('/v1/cloud-integrations/test', data);
  }

  // ── Variable Sets ──

  async listVariableSets(): Promise<{ variableSets: VariableSet[] }> {
    return this.get('/v1/variable-sets');
  }

  async createVariableSet(
    data: CreateVariableSetRequest,
  ): Promise<VariableSet> {
    return this.post('/v1/variable-sets', data);
  }

  async getVariableSet(id: string): Promise<VariableSet> {
    return this.get(`/v1/variable-sets/${id}`);
  }

  async updateVariableSet(
    id: string,
    data: Partial<CreateVariableSetRequest>,
  ): Promise<VariableSet> {
    return this.patch(`/v1/variable-sets/${id}`, data);
  }

  async deleteVariableSet(id: string): Promise<void> {
    return this.del(`/v1/variable-sets/${id}`);
  }

  async listVariableSetEntries(
    setId: string,
  ): Promise<{ entries: VariableSetEntry[] }> {
    return this.get(`/v1/variable-sets/${setId}/entries`);
  }

  async updateVariableSetEntries(
    setId: string,
    entries: VariableSetEntry[],
  ): Promise<{ entries: VariableSetEntry[] }> {
    return this.request(`/v1/variable-sets/${setId}/entries`, {
      method: 'PUT',
      body: { entries },
    });
  }

  async deleteVariableSetEntry(
    setId: string,
    key: string,
  ): Promise<void> {
    return this.del(`/v1/variable-sets/${setId}/entries/${encodeURIComponent(key)}`);
  }

  // ── Environment Cloud Integration Bindings ──

  async listEnvCloudIntegrations(
    envId: string,
  ): Promise<{ bindings: CloudIntegrationBinding[] }> {
    return this.get(`/v1/environments/${envId}/cloud-integrations`);
  }

  async bindCloudIntegrationToEnv(
    envId: string,
    integrationId: string,
    priority?: number,
  ): Promise<void> {
    return this.post(`/v1/environments/${envId}/cloud-integrations`, {
      cloud_integration_id: integrationId,
      priority: priority ?? 0,
    });
  }

  async unbindCloudIntegrationFromEnv(
    envId: string,
    bindingId: string,
  ): Promise<void> {
    return this.del(
      `/v1/environments/${envId}/cloud-integrations/${bindingId}`,
    );
  }

  // ── Environment Variable Set Bindings ──

  async listEnvVariableSets(
    envId: string,
  ): Promise<{ bindings: VariableSetBinding[] }> {
    return this.get(`/v1/environments/${envId}/variable-sets`);
  }

  async bindVariableSetToEnv(
    envId: string,
    setId: string,
    priority?: number,
  ): Promise<void> {
    return this.post(`/v1/environments/${envId}/variable-sets`, {
      variable_set_id: setId,
      priority: priority ?? 0,
    });
  }

  async unbindVariableSetFromEnv(
    envId: string,
    bindingId: string,
  ): Promise<void> {
    return this.del(
      `/v1/environments/${envId}/variable-sets/${bindingId}`,
    );
  }

  // ── Module Cloud Integration Bindings (project-scoped) ──

  async listModuleCloudIntegrations(
    projectId: string,
    moduleId: string,
  ): Promise<{ bindings: CloudIntegrationBinding[] }> {
    return this.get(
      `/v1/projects/${projectId}/modules/${moduleId}/cloud-integrations`,
    );
  }

  async bindCloudIntegrationToModule(
    projectId: string,
    moduleId: string,
    integrationId: string,
    priority?: number,
  ): Promise<void> {
    return this.post(
      `/v1/projects/${projectId}/modules/${moduleId}/cloud-integrations`,
      { cloud_integration_id: integrationId, priority: priority ?? 0 },
    );
  }

  async unbindCloudIntegrationFromModule(
    projectId: string,
    moduleId: string,
    bindingId: string,
  ): Promise<void> {
    return this.del(
      `/v1/projects/${projectId}/modules/${moduleId}/cloud-integrations/${bindingId}`,
    );
  }

  // ── Module Variable Set Bindings (project-scoped) ──

  async listModuleVariableSets(
    projectId: string,
    moduleId: string,
  ): Promise<{ bindings: VariableSetBinding[] }> {
    return this.get(
      `/v1/projects/${projectId}/modules/${moduleId}/variable-sets`,
    );
  }

  async bindVariableSetToModule(
    projectId: string,
    moduleId: string,
    setId: string,
    priority?: number,
  ): Promise<void> {
    return this.post(
      `/v1/projects/${projectId}/modules/${moduleId}/variable-sets`,
      { variable_set_id: setId, priority: priority ?? 0 },
    );
  }

  async unbindVariableSetFromModule(
    projectId: string,
    moduleId: string,
    bindingId: string,
  ): Promise<void> {
    return this.del(
      `/v1/projects/${projectId}/modules/${moduleId}/variable-sets/${bindingId}`,
    );
  }

  // ── Resolved Variables ──

  async getResolvedVariables(
    envId: string,
    moduleId: string,
  ): Promise<{ variables: ResolvedVariable[] }> {
    return this.get(
      `/v1/environments/${envId}/modules/${moduleId}/resolved-vars`,
    );
  }

  // ── Policies ──

  async listPolicies(): Promise<{ policies: PolicyTemplate[] }> {
    return this.get('/v1/policies');
  }

  async createPolicy(
    data: CreatePolicyTemplateRequest,
  ): Promise<PolicyTemplate> {
    return this.post('/v1/policies', data);
  }

  async getPolicy(id: string): Promise<PolicyTemplate> {
    return this.get(`/v1/policies/${encodeURIComponent(id)}`);
  }

  async updatePolicy(
    id: string,
    data: Partial<CreatePolicyTemplateRequest>,
  ): Promise<PolicyTemplate> {
    return this.request(`/v1/policies/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: data,
    });
  }

  async deletePolicy(id: string): Promise<void> {
    return this.del(`/v1/policies/${encodeURIComponent(id)}`);
  }

  async listPolicyBindings(
    policyId: string,
  ): Promise<{ bindings: PolicyBinding[] }> {
    return this.get(
      `/v1/policies/${encodeURIComponent(policyId)}/bindings`,
    );
  }

  async createPolicyBinding(
    policyId: string,
    data: CreatePolicyBindingRequest,
  ): Promise<PolicyBinding> {
    return this.post(
      `/v1/policies/${encodeURIComponent(policyId)}/bindings`,
      data,
    );
  }

  async deletePolicyBinding(
    policyId: string,
    bindingId: string,
  ): Promise<void> {
    return this.del(
      `/v1/policies/${encodeURIComponent(policyId)}/bindings/${encodeURIComponent(bindingId)}`,
    );
  }

  async getEffectivePolicy(
    namespace: string,
    name: string,
  ): Promise<EffectivePolicy> {
    return this.get(
      `/v1/artifacts/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/effective-policy`,
    );
  }

  async listPolicyEvaluations(
    namespace: string,
    name: string,
    options?: { limit?: number; outcome?: string },
  ): Promise<{ evaluations: PolicyEvaluation[] }> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.outcome) params.set('outcome', options.outcome);
    const qs = params.toString();
    return this.get(
      `/v1/artifacts/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/evaluations${qs ? `?${qs}` : ''}`,
    );
  }
}
