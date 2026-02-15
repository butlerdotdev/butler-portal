// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

export { butlerPlugin, ButlerPage } from './plugin';
export { butlerApiRef } from './api/ButlerApi';

// Types for plugin-workspaces
export type { ButlerApi } from './api/ButlerApi';
export type {
  Workspace,
  WorkspacePhase,
  WorkspaceListResponse,
  CreateWorkspaceRequest,
  WorkspaceImage,
  WorkspaceImageListResponse,
  WorkspaceTemplate,
  WorkspaceTemplateListResponse,
  CreateWorkspaceTemplateRequest,
  ClusterService,
  ClusterServiceListResponse,
  MirrordConfig,
  WorkspaceMetrics,
  WorkspaceResources,
  WorkspaceRepository,
  DotfilesSpec,
  EditorConfig,
  SSHKeyEntry,
  SSHKeyListResponse,
  AddSSHKeyRequest,
} from './api/types/workspaces';
export type { Cluster } from './api/types/clusters';

// Shared UI components
export { StatusBadge } from './components/StatusBadge/StatusBadge';
export {
  WorkspaceTerminalDialog,
} from './components/shared/WorkspaceTerminalDialog';
export type { TerminalTarget } from './components/shared/WorkspaceTerminalDialog';
