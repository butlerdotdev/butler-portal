// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

export { registryPlugin, RegistryPage } from './plugin';
export { registryApiRef } from './api/RegistryApi';
export type { RegistryApi } from './api/RegistryApi';

// Re-export types for consumers
export type {
  Artifact,
  ArtifactVersion,
  ArtifactType,
  ArtifactStatus,
  ApprovalStatus,
  ArtifactListOptions,
  ArtifactListResponse,
  CreateArtifactRequest,
  PublishVersionRequest,
} from './api/types/artifacts';
export type {
  RegistryToken,
  TokenScope,
  CreateTokenRequest,
  CreateTokenResponse,
} from './api/types/tokens';
export type {
  GovernanceSummary,
  PendingApproval,
  ApprovalListResponse,
  StalenessAlert,
  AuditEntry,
  AuditLogResponse,
} from './api/types/governance';
export type { ScanResult, ScanGrade, CostEstimate } from './api/types/scans';
export type { DownloadStats, DownloadDataPoint } from './api/types/stats';
export type {
  IacRun,
  RunOperation,
  RunMode,
  RunStatus,
  CreateRunRequest,
  CreateRunResponse,
  RunListResponse,
  RunLogEntry,
  RunOutput,
} from './api/types/runs';
export type {
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
  CreateModuleRunRequest,
  CreateEnvironmentRunRequest,
} from './api/types/environments';
export type {
  CloudProvider,
  AuthMethod,
  CloudIntegration,
  CreateCloudIntegrationRequest,
  CloudIntegrationBinding,
} from './api/types/cloudIntegrations';
export type {
  VariableSet,
  VariableSetEntry,
  CreateVariableSetRequest,
  VariableSetBinding,
  ResolvedVariable,
} from './api/types/variableSets';
