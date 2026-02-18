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
  EnvironmentModule,
  EnvironmentRun,
  ModuleRun,
  ModuleDependency,
  ModuleVariable,
  EnvironmentGraph,
  EnvironmentListResponse,
  ModuleRunListResponse,
  CreateEnvironmentRequest,
  AddModuleRequest,
  SetDependenciesRequest,
  CreateModuleRunRequest,
  CreateModuleRunResponse,
  CreateEnvironmentRunRequest,
  RunLogEntry as ModuleRunLogEntry,
} from './types/environments';
import type {
  CloudIntegration,
  CreateCloudIntegrationRequest,
  CloudIntegrationBinding,
  ValidateCloudIntegrationResponse,
} from './types/cloudIntegrations';
import type {
  VariableSet,
  VariableSetEntry,
  CreateVariableSetRequest,
  VariableSetBinding,
  ResolvedVariable,
} from './types/variableSets';

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

  // Runs
  listRuns(namespace: string, name: string, options?: { status?: string }): Promise<RunListResponse>;
  createRun(namespace: string, name: string, data: CreateRunRequest): Promise<CreateRunResponse>;
  getRun(runId: string): Promise<IacRun>;
  getRunLogs(runId: string, after?: number): Promise<{ logs: RunLogEntry[] }>;
  getRunPlan(runId: string): Promise<{ plan_text: string | null; plan_json: string | null }>;
  cancelRun(runId: string): Promise<IacRun>;
  confirmRun(runId: string): Promise<IacRun>;
  generatePipeline(namespace: string, name: string, ciProvider: string, operation: string): Promise<{ pipeline_config: string; ci_provider: string }>;

  // Environments
  listEnvironments(options?: { status?: string; limit?: number; cursor?: string }): Promise<EnvironmentListResponse>;
  createEnvironment(data: CreateEnvironmentRequest): Promise<Environment>;
  getEnvironment(envId: string): Promise<Environment>;
  updateEnvironment(envId: string, data: Partial<CreateEnvironmentRequest>): Promise<Environment>;
  deleteEnvironment(envId: string): Promise<void>;
  lockEnvironment(envId: string, reason?: string): Promise<Environment>;
  unlockEnvironment(envId: string): Promise<Environment>;
  getEnvironmentGraph(envId: string): Promise<EnvironmentGraph>;

  // Environment Modules
  listEnvironmentModules(envId: string): Promise<{ modules: EnvironmentModule[] }>;
  addModule(envId: string, data: AddModuleRequest): Promise<EnvironmentModule>;
  getModule(envId: string, moduleId: string): Promise<EnvironmentModule>;
  updateModule(envId: string, moduleId: string, data: Partial<AddModuleRequest>): Promise<EnvironmentModule>;
  removeModule(envId: string, moduleId: string): Promise<void>;
  getModuleLatestOutputs(envId: string, moduleId: string): Promise<{ outputs: Record<string, unknown> }>;
  forceUnlockModule(envId: string, moduleId: string): Promise<void>;

  // Module Dependencies
  getModuleDependencies(envId: string, moduleId: string): Promise<{ dependencies: ModuleDependency[] }>;
  setModuleDependencies(envId: string, moduleId: string, data: SetDependenciesRequest): Promise<{ dependencies: ModuleDependency[] }>;

  // Module Variables
  listModuleVariables(envId: string, moduleId: string): Promise<{ variables: ModuleVariable[] }>;
  updateModuleVariables(envId: string, moduleId: string, variables: ModuleVariable[]): Promise<{ variables: ModuleVariable[] }>;
  deleteModuleVariable(envId: string, moduleId: string, key: string, category?: string): Promise<void>;

  // Module Runs
  listModuleRuns(envId: string, moduleId: string, options?: { status?: string }): Promise<ModuleRunListResponse>;
  createModuleRun(envId: string, moduleId: string, data: CreateModuleRunRequest): Promise<CreateModuleRunResponse>;
  getModuleRun(runId: string): Promise<ModuleRun>;
  getModuleRunLogs(runId: string, after?: number): Promise<{ logs: ModuleRunLogEntry[] }>;
  getModuleRunPlan(runId: string): Promise<{ plan_text: string | null; plan_json: string | null }>;
  getModuleRunOutputs(runId: string): Promise<{ outputs: Record<string, unknown> }>;
  confirmModuleRun(runId: string): Promise<ModuleRun>;
  discardModuleRun(runId: string): Promise<ModuleRun>;
  cancelModuleRun(runId: string): Promise<ModuleRun>;

  // Environment Runs (DAG-wide)
  listEnvironmentRuns(envId: string): Promise<{ runs: EnvironmentRun[] }>;
  createEnvironmentRun(envId: string, data: CreateEnvironmentRunRequest): Promise<EnvironmentRun>;
  getEnvironmentRun(runId: string): Promise<EnvironmentRun>;
  confirmEnvironmentRun(runId: string, excludeModules?: string[]): Promise<EnvironmentRun>;
  cancelEnvironmentRun(runId: string): Promise<EnvironmentRun>;

  // Cross-reference
  listModulesForArtifact(namespace: string, name: string): Promise<{ modules: EnvironmentModule[] }>;

  // Cloud Integrations
  listCloudIntegrations(options?: { provider?: string }): Promise<{ integrations: CloudIntegration[] }>;
  createCloudIntegration(data: CreateCloudIntegrationRequest): Promise<CloudIntegration>;
  getCloudIntegration(id: string): Promise<CloudIntegration>;
  updateCloudIntegration(id: string, data: Partial<CreateCloudIntegrationRequest>): Promise<CloudIntegration>;
  deleteCloudIntegration(id: string): Promise<void>;
  validateCloudIntegration(id: string): Promise<ValidateCloudIntegrationResponse>;

  // Variable Sets
  listVariableSets(): Promise<{ variableSets: VariableSet[] }>;
  createVariableSet(data: CreateVariableSetRequest): Promise<VariableSet>;
  getVariableSet(id: string): Promise<VariableSet>;
  updateVariableSet(id: string, data: Partial<CreateVariableSetRequest>): Promise<VariableSet>;
  deleteVariableSet(id: string): Promise<void>;
  listVariableSetEntries(setId: string): Promise<{ entries: VariableSetEntry[] }>;
  updateVariableSetEntries(setId: string, entries: VariableSetEntry[]): Promise<{ entries: VariableSetEntry[] }>;
  deleteVariableSetEntry(setId: string, key: string): Promise<void>;

  // Environment Cloud Integration Bindings
  listEnvCloudIntegrations(envId: string): Promise<{ bindings: CloudIntegrationBinding[] }>;
  bindCloudIntegrationToEnv(envId: string, integrationId: string, priority?: number): Promise<void>;
  unbindCloudIntegrationFromEnv(envId: string, bindingId: string): Promise<void>;

  // Environment Variable Set Bindings
  listEnvVariableSets(envId: string): Promise<{ bindings: VariableSetBinding[] }>;
  bindVariableSetToEnv(envId: string, setId: string, priority?: number): Promise<void>;
  unbindVariableSetFromEnv(envId: string, bindingId: string): Promise<void>;

  // Module Cloud Integration Bindings
  listModuleCloudIntegrations(envId: string, moduleId: string): Promise<{ bindings: CloudIntegrationBinding[] }>;
  bindCloudIntegrationToModule(envId: string, moduleId: string, integrationId: string, priority?: number): Promise<void>;
  unbindCloudIntegrationFromModule(envId: string, moduleId: string, bindingId: string): Promise<void>;

  // Module Variable Set Bindings
  listModuleVariableSets(envId: string, moduleId: string): Promise<{ bindings: VariableSetBinding[] }>;
  bindVariableSetToModule(envId: string, moduleId: string, setId: string, priority?: number): Promise<void>;
  unbindVariableSetFromModule(envId: string, moduleId: string, bindingId: string): Promise<void>;

  // Resolved Variables
  getResolvedVariables(envId: string, moduleId: string): Promise<{ variables: ResolvedVariable[] }>;
}

export const registryApiRef = createApiRef<RegistryApi>({
  id: 'plugin.registry.api',
});
