// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

export interface Workspace {
  metadata: {
    name: string;
    namespace: string;
    uid?: string;
    creationTimestamp?: string;
    annotations?: Record<string, string>;
    labels?: Record<string, string>;
  };
  spec: {
    clusterRef: {
      name: string;
      namespace?: string;
    };
    owner: string;
    image: string;
    repository?: WorkspaceRepository;
    envFrom?: WorkspaceEnvSource[];
    resources?: WorkspaceResources;
    dotfiles?: DotfilesSpec;
    idleTimeout?: string;
    autoStopAfter?: string;
    storageSize?: string;
    sshPublicKeys?: string[];
  };
  status?: {
    phase?: WorkspacePhase;
    podName?: string;
    pvcName?: string;
    serviceName?: string;
    sshEndpoint?: string;
    connected?: boolean;
    lastActivityTime?: string;
    lastDisconnectTime?: string;
    observedGeneration?: number;
    conditions?: WorkspaceCondition[];
  };
}

export type WorkspacePhase =
  | 'Pending'
  | 'Creating'
  | 'Running'
  | 'Starting'
  | 'Stopped'
  | 'Failed';

export interface WorkspaceCondition {
  type: string;
  status: string;
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
}

export interface WorkspaceRepository {
  url: string;
  branch?: string;
  secretRef?: {
    name: string;
    namespace?: string;
  };
}

export interface WorkspaceEnvSource {
  deploymentRef: {
    name: string;
    namespace?: string;
  };
  containerName?: string;
}

export interface WorkspaceResources {
  cpu?: string;
  memory?: string;
}

export interface DotfilesSpec {
  repository: string;
  branch?: string;
  installCommand?: string;
}

export interface WorkspaceListResponse {
  workspaces: Workspace[];
}

export interface CreateWorkspaceRequest {
  name: string;
  image: string;
  repository?: WorkspaceRepository;
  envFrom?: WorkspaceEnvSource[];
  resources?: WorkspaceResources;
  dotfiles?: DotfilesSpec;
  idleTimeout?: string;
  autoStopAfter?: string;
  storageSize?: string;
  sshPublicKeys?: string[];
  templateName?: string;
}

export interface WorkspaceImage {
  name: string;
  displayName: string;
  description: string;
  image: string;
  tags: string[];
  category: string;
}

export interface WorkspaceImageListResponse {
  images: WorkspaceImage[];
}

export interface WorkspaceTemplate {
  metadata: {
    name: string;
    namespace: string;
    uid?: string;
    creationTimestamp?: string;
  };
  spec: {
    displayName: string;
    description?: string;
    icon?: string;
    category?: string;
    scope?: 'cluster' | 'team';
    template: {
      image: string;
      repository?: WorkspaceRepository;
      envFrom?: WorkspaceEnvSource[];
      dotfiles?: DotfilesSpec;
      resources?: WorkspaceResources;
      storageSize?: string;
    };
  };
}

export interface WorkspaceTemplateListResponse {
  templates: WorkspaceTemplate[];
}

export interface CreateWorkspaceTemplateRequest {
  name: string;
  displayName: string;
  description?: string;
  icon?: string;
  category?: string;
  scope?: 'cluster' | 'team';
  template: {
    image: string;
    repository?: WorkspaceRepository;
    envFrom?: WorkspaceEnvSource[];
    dotfiles?: DotfilesSpec;
    resources?: WorkspaceResources;
    storageSize?: string;
  };
}

export interface ClusterService {
  name: string;
  namespace: string;
  type: string;
  clusterIP: string;
  ports: ServicePort[];
  selector?: Record<string, string>;
  creationTimestamp?: string;
}

export interface ServicePort {
  name?: string;
  port: number;
  targetPort: number | string;
  protocol: string;
}

export interface ClusterServiceListResponse {
  services: ClusterService[];
}

export interface MirrordConfig {
  config: string;
  kubeconfig: string;
  filename: string;
}

export interface WorkspaceMetrics {
  cpu: string;
  memory: string;
  uptime: string;
  storage?: string;
}

export interface SSHKeyEntry {
  name: string;
  publicKey: string;
  fingerprint: string;
  addedAt: string;
}

export interface SSHKeyListResponse {
  keys: SSHKeyEntry[];
}

export interface AddSSHKeyRequest {
  name: string;
  publicKey: string;
}
