// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { createApiRef } from '@backstage/core-plugin-api';
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

export interface RegistryApi {
  setTeamContext(team: string | null): void;
  getTeamContext(): string | null;

  // Artifacts
  listArtifacts(options?: ArtifactListOptions): Promise<ArtifactListResponse>;
  getArtifactFacets(): Promise<FacetsResponse>;
  getArtifact(namespace: string, name: string): Promise<Artifact>;
  createArtifact(data: CreateArtifactRequest): Promise<Artifact>;
  updateArtifact(
    namespace: string,
    name: string,
    data: Partial<CreateArtifactRequest>,
  ): Promise<Artifact>;
  deleteArtifact(namespace: string, name: string): Promise<void>;
  deprecateArtifact(namespace: string, name: string): Promise<Artifact>;

  // Versions
  listVersions(
    namespace: string,
    name: string,
  ): Promise<{ versions: ArtifactVersion[] }>;
  publishVersion(
    namespace: string,
    name: string,
    data: PublishVersionRequest,
  ): Promise<ArtifactVersion>;
  approveVersion(
    namespace: string,
    name: string,
    version: string,
    comment?: string,
  ): Promise<ArtifactVersion>;
  rejectVersion(
    namespace: string,
    name: string,
    version: string,
    comment?: string,
  ): Promise<ArtifactVersion>;
  yankVersion(
    namespace: string,
    name: string,
    version: string,
    reason?: string,
  ): Promise<void>;

  // Consumers
  getConsumers(
    namespace: string,
    name: string,
  ): Promise<{ consumers: ConsumerInfo[]; anonymous: Array<{ consumer_type: string; download_count: number; last_download: string }> }>;

  // Detail data
  getReadme(
    namespace: string,
    name: string,
    version?: string,
  ): Promise<{ content: string }>;
  getScanResult(
    namespace: string,
    name: string,
    version: string,
  ): Promise<{ results: ScanResult[] }>;
  getCostEstimate(
    namespace: string,
    name: string,
    version: string,
  ): Promise<{ results: CostEstimate[] }>;
  getDownloadStats(
    namespace: string,
    name: string,
  ): Promise<DownloadStats>;
  getArtifactAuditLog(
    namespace: string,
    name: string,
  ): Promise<AuditLogResponse>;

  // Governance
  getGovernanceSummary(): Promise<GovernanceSummary>;
  listPendingApprovals(): Promise<ApprovalListResponse>;
  getStalenessAlerts(): Promise<{ alerts: StalenessAlert[] }>;
  getAuditLog(options?: AuditLogOptions): Promise<AuditLogResponse>;

  // Tokens
  listTokens(): Promise<{ tokens: RegistryToken[] }>;
  createToken(data: CreateTokenRequest): Promise<CreateTokenResponse>;
  revokeToken(tokenId: string): Promise<void>;

  // Runs (artifact-level)
  listRuns(namespace: string, name: string, options?: { status?: string }): Promise<RunListResponse>;
  createRun(namespace: string, name: string, data: CreateRunRequest): Promise<CreateRunResponse>;
  getRun(runId: string): Promise<IacRun>;
  getRunLogs(runId: string, after?: number): Promise<{ logs: RunLogEntry[] }>;
  getRunPlan(runId: string): Promise<{ plan_text: string | null; plan_json: string | null }>;
  cancelRun(runId: string): Promise<IacRun>;
  confirmRun(runId: string): Promise<IacRun>;
  generatePipeline(namespace: string, name: string, ciProvider: string, operation: string): Promise<{ pipeline_config: string; ci_provider: string }>;

  // ── Projects ──────────────────────────────────────────────────────

  listProjects(options?: { status?: string; limit?: number; cursor?: string }): Promise<ProjectListResponse>;
  createProject(data: CreateProjectRequest): Promise<Project>;
  getProject(projectId: string): Promise<Project>;
  updateProject(projectId: string, data: Partial<CreateProjectRequest>): Promise<Project>;
  deleteProject(projectId: string): Promise<void>;
  getProjectGraph(projectId: string): Promise<ProjectGraph>;

  // ── Project Modules ───────────────────────────────────────────────

  listProjectModules(projectId: string): Promise<{ modules: ProjectModule[] }>;
  addProjectModule(projectId: string, data: AddProjectModuleRequest): Promise<ProjectModule>;
  getProjectModule(projectId: string, moduleId: string): Promise<ProjectModule>;
  updateProjectModule(projectId: string, moduleId: string, data: Partial<AddProjectModuleRequest>): Promise<ProjectModule>;
  removeProjectModule(projectId: string, moduleId: string): Promise<void>;

  // ── Project Module Dependencies ───────────────────────────────────

  getProjectModuleDependencies(projectId: string, moduleId: string): Promise<{ dependencies: ProjectModuleDependency[] }>;
  setProjectModuleDependencies(projectId: string, moduleId: string, data: SetProjectModuleDependenciesRequest): Promise<{ dependencies: ProjectModuleDependency[] }>;

  // ── Environments (project-scoped creation, flat access) ───────────

  listProjectEnvironments(projectId: string): Promise<EnvironmentListResponse>;
  createProjectEnvironment(projectId: string, data: CreateEnvironmentInProjectRequest): Promise<Environment>;
  listEnvironments(options?: { status?: string; limit?: number; cursor?: string }): Promise<EnvironmentListResponse>;
  getEnvironment(envId: string): Promise<Environment & { module_states?: EnvironmentModuleState[] }>;
  updateEnvironment(envId: string, data: Partial<{ name: string; description: string; state_backend: object }>): Promise<Environment>;
  deleteEnvironment(envId: string): Promise<void>;
  lockEnvironment(envId: string, reason?: string): Promise<Environment>;
  unlockEnvironment(envId: string): Promise<Environment>;

  // ── Module Variables (env-scoped) ─────────────────────────────────

  listModuleVariables(envId: string, moduleId: string): Promise<{ variables: ModuleVariable[] }>;
  updateModuleVariables(envId: string, moduleId: string, variables: ModuleVariable[]): Promise<{ variables: ModuleVariable[] }>;
  deleteModuleVariable(envId: string, moduleId: string, key: string, category?: string): Promise<void>;

  // ── Module Outputs & State (env-scoped) ───────────────────────────

  getModuleLatestOutputs(envId: string, moduleId: string): Promise<{ outputs: Record<string, unknown> }>;
  forceUnlockModule(envId: string, moduleId: string): Promise<void>;

  // ── Module Runs (env-scoped) ──────────────────────────────────────

  listModuleRuns(envId: string, moduleId: string, options?: { status?: string }): Promise<ModuleRunListResponse>;
  createModuleRun(envId: string, moduleId: string, data: CreateModuleRunRequest): Promise<CreateModuleRunResponse>;
  getModuleRun(runId: string): Promise<ModuleRun>;
  getModuleRunLogs(runId: string, after?: number): Promise<{ logs: ModuleRunLogEntry[] }>;
  getModuleRunPlan(runId: string): Promise<{ plan_text: string | null; plan_json: string | null }>;
  getModuleRunOutputs(runId: string): Promise<{ outputs: Record<string, unknown> }>;
  confirmModuleRun(runId: string): Promise<ModuleRun>;
  discardModuleRun(runId: string): Promise<ModuleRun>;
  cancelModuleRun(runId: string): Promise<ModuleRun>;

  // ── Environment Runs (DAG-wide) ──────────────────────────────────

  listEnvironmentRuns(envId: string): Promise<{ runs: EnvironmentRun[] }>;
  createEnvironmentRun(envId: string, data: CreateEnvironmentRunRequest): Promise<EnvironmentRun>;
  getEnvironmentRun(runId: string): Promise<EnvironmentRun>;
  confirmEnvironmentRun(runId: string, excludeModules?: string[]): Promise<EnvironmentRun>;
  cancelEnvironmentRun(runId: string): Promise<EnvironmentRun>;

  // ── State Backend ────────────────────────────────────────────────

  testStateBackend(data: TestStateBackendRequest): Promise<TestStateBackendResult>;

  // ── Cross-reference ──────────────────────────────────────────────

  listProjectsForArtifact(namespace: string, name: string): Promise<{ projects: Array<{ project_id: string; project_name: string; module_id: string; module_name: string }> }>;

  // ── Cloud Integrations ───────────────────────────────────────────

  listCloudIntegrations(options?: { provider?: string }): Promise<{ integrations: CloudIntegration[] }>;
  createCloudIntegration(data: CreateCloudIntegrationRequest): Promise<CloudIntegration>;
  getCloudIntegration(id: string): Promise<CloudIntegration>;
  updateCloudIntegration(id: string, data: Partial<CreateCloudIntegrationRequest>): Promise<CloudIntegration>;
  deleteCloudIntegration(id: string): Promise<void>;
  validateCloudIntegration(id: string): Promise<ValidateCloudIntegrationResponse>;
  testCloudIntegration(data: TestCloudIntegrationRequest): Promise<TestCloudIntegrationResult>;

  // ── Variable Sets ────────────────────────────────────────────────

  listVariableSets(): Promise<{ variableSets: VariableSet[] }>;
  createVariableSet(data: CreateVariableSetRequest): Promise<VariableSet>;
  getVariableSet(id: string): Promise<VariableSet>;
  updateVariableSet(id: string, data: Partial<CreateVariableSetRequest>): Promise<VariableSet>;
  deleteVariableSet(id: string): Promise<void>;
  listVariableSetEntries(setId: string): Promise<{ entries: VariableSetEntry[] }>;
  updateVariableSetEntries(setId: string, entries: VariableSetEntry[]): Promise<{ entries: VariableSetEntry[] }>;
  deleteVariableSetEntry(setId: string, key: string): Promise<void>;

  // ── Environment Cloud Integration Bindings ───────────────────────

  listEnvCloudIntegrations(envId: string): Promise<{ bindings: CloudIntegrationBinding[] }>;
  bindCloudIntegrationToEnv(envId: string, integrationId: string, priority?: number): Promise<void>;
  unbindCloudIntegrationFromEnv(envId: string, bindingId: string): Promise<void>;

  // ── Environment Variable Set Bindings ────────────────────────────

  listEnvVariableSets(envId: string): Promise<{ bindings: VariableSetBinding[] }>;
  bindVariableSetToEnv(envId: string, setId: string, priority?: number): Promise<void>;
  unbindVariableSetFromEnv(envId: string, bindingId: string): Promise<void>;

  // ── Module Cloud Integration Bindings (project-scoped) ───────────

  listModuleCloudIntegrations(projectId: string, moduleId: string): Promise<{ bindings: CloudIntegrationBinding[] }>;
  bindCloudIntegrationToModule(projectId: string, moduleId: string, integrationId: string, priority?: number): Promise<void>;
  unbindCloudIntegrationFromModule(projectId: string, moduleId: string, bindingId: string): Promise<void>;

  // ── Module Variable Set Bindings (project-scoped) ────────────────

  listModuleVariableSets(projectId: string, moduleId: string): Promise<{ bindings: VariableSetBinding[] }>;
  bindVariableSetToModule(projectId: string, moduleId: string, setId: string, priority?: number): Promise<void>;
  unbindVariableSetFromModule(projectId: string, moduleId: string, bindingId: string): Promise<void>;

  // ── Resolved Variables ───────────────────────────────────────────

  getResolvedVariables(envId: string, moduleId: string): Promise<{ variables: ResolvedVariable[] }>;

  // ── Policies ─────────────────────────────────────────────────────

  listPolicies(): Promise<{ policies: PolicyTemplate[] }>;
  createPolicy(data: CreatePolicyTemplateRequest): Promise<PolicyTemplate>;
  getPolicy(id: string): Promise<PolicyTemplate>;
  updatePolicy(id: string, data: Partial<CreatePolicyTemplateRequest>): Promise<PolicyTemplate>;
  deletePolicy(id: string): Promise<void>;
  listPolicyBindings(policyId: string): Promise<{ bindings: PolicyBinding[] }>;
  createPolicyBinding(policyId: string, data: CreatePolicyBindingRequest): Promise<PolicyBinding>;
  deletePolicyBinding(policyId: string, bindingId: string): Promise<void>;
  getEffectivePolicy(namespace: string, name: string): Promise<EffectivePolicy>;
  listPolicyEvaluations(namespace: string, name: string, options?: { limit?: number; outcome?: string }): Promise<{ evaluations: PolicyEvaluation[] }>;
}

export const registryApiRef = createApiRef<RegistryApi>({
  id: 'plugin.registry.api',
});
