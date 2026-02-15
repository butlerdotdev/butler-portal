// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { createApiRef } from '@backstage/core-plugin-api';

import type {
  Cluster,
  ClusterListResponse,
  ClusterListOptions,
  CreateClusterRequest,
  Node,
  Addon,
  ClusterEvent,
  ManagementCluster,
  ManagementNode,
  ManagementPod,
} from './types/clusters';
import type {
  Provider,
  ProviderListResponse,
  CreateProviderRequest,
  ValidateResponse,
  ImageListResponse,
  NetworkListResponse,
} from './types/providers';
import type { TeamInfo } from './types/teams';
import type {
  AddonDefinition,
  InstalledAddon,
  CatalogResponse,
  AddonsListResponse,
  InstallAddonRequest,
  UpdateAddonRequest,
  ManagementAddon,
  InstallManagementAddonRequest,
} from './types/addons';
import type {
  GitProviderConfig,
  SaveGitProviderRequest,
  Repository,
  Branch,
  DiscoveryResult,
  ExportAddonRequest,
  ExportAddonResponse,
  PreviewManifestRequest,
  PreviewManifestResponse,
  MigrationRequest,
  MigrationResult,
  GitOpsStatus,
} from './types/gitops';
import type {
  ClusterCertificates,
  RotationEvent,
  CertificateCategory,
  CertificateInfo,
} from './types/certificates';
import type {
  IdentityProvider,
  IdentityProviderListResponse,
  CreateIdentityProviderRequest,
  TestDiscoveryResponse,
} from './types/identity-providers';
import type {
  Workspace,
  WorkspaceListResponse,
  CreateWorkspaceRequest,
  WorkspaceImageListResponse,
  WorkspaceTemplate,
  WorkspaceTemplateListResponse,
  CreateWorkspaceTemplateRequest,
  ClusterServiceListResponse,
  MirrordConfig,
  WorkspaceMetrics,
  SSHKeyEntry,
  SSHKeyListResponse,
  AddSSHKeyRequest,
} from './types/workspaces';

export interface ButlerApi {
  // Team context
  setTeamContext(team: string | null): void;
  getTeamContext(): string | null;

  // Auth
  getCurrentUser(): Promise<any>;
  getTeams(): Promise<{ teams: TeamInfo[] }>;
  listAllTeams(): Promise<{ teams: TeamInfo[] }>;

  /**
   * Returns the current Backstage user's Butler identity.
   * Bridges Backstage SSO auth with butler-server user/team info.
   */
  getIdentity(): Promise<{
    authenticated: boolean;
    email: string | null;
    displayName: string;
    isPlatformAdmin: boolean;
    teams: TeamInfo[];
  }>;

  // Clusters
  listClusters(options?: ClusterListOptions): Promise<ClusterListResponse>;
  getCluster(namespace: string, name: string): Promise<Cluster>;
  createCluster(data: CreateClusterRequest): Promise<Cluster>;
  deleteCluster(namespace: string, name: string): Promise<void>;
  scaleCluster(
    namespace: string,
    name: string,
    replicas: number,
  ): Promise<Cluster>;
  getClusterKubeconfig(
    namespace: string,
    name: string,
  ): Promise<{ kubeconfig: string }>;
  getClusterNodes(
    namespace: string,
    name: string,
  ): Promise<{ nodes: Node[] }>;
  getClusterAddons(
    namespace: string,
    name: string,
  ): Promise<{ addons: Addon[] }>;
  getClusterEvents(
    namespace: string,
    name: string,
  ): Promise<{ events: ClusterEvent[] }>;
  toggleClusterWorkspaces(
    namespace: string,
    name: string,
    enabled: boolean,
  ): Promise<Cluster>;

  // Management
  getManagement(): Promise<ManagementCluster>;
  getManagementNodes(): Promise<{ nodes: ManagementNode[] }>;
  getManagementPods(
    namespace: string,
  ): Promise<{ pods: ManagementPod[] }>;

  // Providers
  listProviders(): Promise<ProviderListResponse>;
  getProvider(namespace: string, name: string): Promise<Provider>;
  createProvider(data: CreateProviderRequest): Promise<Provider>;
  deleteProvider(namespace: string, name: string): Promise<void>;
  validateProvider(
    namespace: string,
    name: string,
  ): Promise<ValidateResponse>;
  testProviderConnection(
    data: CreateProviderRequest,
  ): Promise<ValidateResponse>;
  listProviderImages(
    namespace: string,
    name: string,
  ): Promise<ImageListResponse>;
  listProviderNetworks(
    namespace: string,
    name: string,
  ): Promise<NetworkListResponse>;

  // Addons
  getAddonCatalog(): Promise<CatalogResponse>;
  getAddonDefinition(name: string): Promise<AddonDefinition>;
  listClusterAddons(
    namespace: string,
    clusterName: string,
  ): Promise<AddonsListResponse>;
  installAddon(
    namespace: string,
    clusterName: string,
    data: InstallAddonRequest,
  ): Promise<unknown>;
  getAddonDetails(
    namespace: string,
    clusterName: string,
    addonName: string,
  ): Promise<InstalledAddon>;
  updateAddon(
    namespace: string,
    clusterName: string,
    addonName: string,
    data: UpdateAddonRequest,
  ): Promise<unknown>;
  uninstallAddon(
    namespace: string,
    clusterName: string,
    addonName: string,
  ): Promise<void>;
  getManagementAddons(): Promise<{ addons: ManagementAddon[] }>;
  installManagementAddon(
    data: InstallManagementAddonRequest,
  ): Promise<ManagementAddon>;
  uninstallManagementAddon(name: string): Promise<void>;

  // GitOps
  getGitOpsConfig(): Promise<GitProviderConfig>;
  saveGitOpsConfig(
    request: SaveGitProviderRequest,
  ): Promise<GitProviderConfig>;
  clearGitOpsConfig(): Promise<void>;
  listRepositories(): Promise<Repository[]>;
  listBranches(owner: string, repo: string): Promise<Branch[]>;
  previewManifests(
    request: PreviewManifestRequest,
  ): Promise<PreviewManifestResponse>;
  getClusterGitOpsStatus(
    namespace: string,
    name: string,
  ): Promise<GitOpsStatus>;
  discoverClusterReleases(
    namespace: string,
    name: string,
  ): Promise<DiscoveryResult>;
  exportClusterAddon(
    namespace: string,
    name: string,
    request: ExportAddonRequest,
  ): Promise<ExportAddonResponse>;
  exportClusterRelease(
    namespace: string,
    name: string,
    request: any,
  ): Promise<ExportAddonResponse>;
  migrateClusterReleases(
    namespace: string,
    name: string,
    request: MigrationRequest,
  ): Promise<MigrationResult>;
  enableClusterGitOps(
    namespace: string,
    name: string,
    config: any,
  ): Promise<{ success: boolean; message: string }>;
  disableClusterGitOps(namespace: string, name: string): Promise<void>;
  getManagementGitOpsStatus(): Promise<GitOpsStatus>;
  discoverManagementReleases(): Promise<DiscoveryResult>;
  exportManagementAddon(
    request: ExportAddonRequest,
  ): Promise<ExportAddonResponse>;
  exportManagementRelease(request: any): Promise<ExportAddonResponse>;
  migrateManagementReleases(
    request: MigrationRequest,
  ): Promise<MigrationResult>;
  enableManagementGitOps(
    config: any,
  ): Promise<{ success: boolean; message: string }>;
  disableManagementGitOps(): Promise<void>;

  // Certificates
  getClusterCertificates(
    namespace: string,
    name: string,
  ): Promise<ClusterCertificates>;
  getCertificatesByCategory(
    namespace: string,
    name: string,
    category: CertificateCategory,
  ): Promise<{
    category: CertificateCategory;
    certificates: CertificateInfo[];
  }>;
  rotateCertificates(
    namespace: string,
    name: string,
    type: string,
    acknowledge?: boolean,
  ): Promise<RotationEvent>;
  getRotationStatus(
    namespace: string,
    name: string,
  ): Promise<RotationEvent>;

  // Identity Providers
  listIdentityProviders(): Promise<IdentityProviderListResponse>;
  getIdentityProvider(name: string): Promise<IdentityProvider>;
  createIdentityProvider(
    data: CreateIdentityProviderRequest,
  ): Promise<IdentityProvider>;
  deleteIdentityProvider(
    name: string,
  ): Promise<{ status: string; message: string }>;
  testIdPDiscovery(issuerURL: string): Promise<TestDiscoveryResponse>;
  validateIdentityProvider(
    name: string,
  ): Promise<TestDiscoveryResponse>;

  // Settings
  getSettings(): Promise<any>;

  // Users
  listUsers(): Promise<any>;
  createUser(data: {
    email: string;
    name?: string;
  }): Promise<{ user: any; inviteUrl?: string }>;
  deleteUser(username: string): Promise<void>;
  disableUser(username: string): Promise<void>;
  enableUser(username: string): Promise<void>;
  resendInvite(username: string): Promise<{ inviteUrl: string }>;

  // Teams
  getTeam(name: string): Promise<any>;
  createTeam(data: {
    name: string;
    displayName?: string;
    description?: string;
  }): Promise<any>;
  updateTeam(
    name: string,
    data: { displayName?: string; description?: string },
  ): Promise<any>;
  deleteTeam(name: string): Promise<void>;
  getTeamClusters(name: string): Promise<ClusterListResponse>;
  getTeamMembers(name: string): Promise<any>;
  addTeamMember(
    teamName: string,
    data: { email: string; role: string },
  ): Promise<void>;
  removeTeamMember(teamName: string, email: string): Promise<void>;
  updateMemberRole(
    teamName: string,
    email: string,
    role: string,
  ): Promise<void>;
  getTeamGroupSyncs(name: string): Promise<any>;
  addGroupSync(
    teamName: string,
    data: { group: string; role: string; identityProvider?: string },
  ): Promise<void>;
  removeGroupSync(teamName: string, groupName: string): Promise<void>;
  updateGroupSyncRole(
    teamName: string,
    groupName: string,
    role: string,
  ): Promise<void>;

  // Workspaces
  listWorkspaces(
    namespace: string,
    clusterName: string,
  ): Promise<WorkspaceListResponse>;
  getWorkspace(
    namespace: string,
    clusterName: string,
    workspaceName: string,
  ): Promise<Workspace>;
  createWorkspace(
    namespace: string,
    clusterName: string,
    data: CreateWorkspaceRequest,
  ): Promise<Workspace>;
  deleteWorkspace(
    namespace: string,
    clusterName: string,
    workspaceName: string,
  ): Promise<void>;
  connectWorkspace(
    namespace: string,
    clusterName: string,
    workspaceName: string,
  ): Promise<Workspace>;
  disconnectWorkspace(
    namespace: string,
    clusterName: string,
    workspaceName: string,
  ): Promise<Workspace>;
  startWorkspace(
    namespace: string,
    clusterName: string,
    workspaceName: string,
  ): Promise<Workspace>;
  getWorkspaceMetrics(
    namespace: string,
    clusterName: string,
    workspaceName: string,
  ): Promise<WorkspaceMetrics>;
  syncWorkspaceSSHKeys(
    namespace: string,
    clusterName: string,
    workspaceName: string,
  ): Promise<{ synced: boolean; keys: number; message: string }>;

  // Cluster Services
  listClusterServices(
    namespace: string,
    clusterName: string,
  ): Promise<ClusterServiceListResponse>;
  generateMirrordConfig(
    namespace: string,
    clusterName: string,
    serviceName: string,
    serviceNamespace: string,
  ): Promise<MirrordConfig>;

  // Workspace Images
  listWorkspaceImages(): Promise<WorkspaceImageListResponse>;

  // Workspace Templates
  listWorkspaceTemplates(): Promise<WorkspaceTemplateListResponse>;
  createWorkspaceTemplate(
    data: CreateWorkspaceTemplateRequest,
  ): Promise<WorkspaceTemplate>;
  updateWorkspaceTemplate(
    namespace: string,
    name: string,
    data: Partial<CreateWorkspaceTemplateRequest>,
  ): Promise<WorkspaceTemplate>;
  deleteWorkspaceTemplate(
    namespace: string,
    name: string,
  ): Promise<void>;

  // SSH Keys
  listSSHKeys(): Promise<SSHKeyListResponse>;
  addSSHKey(data: AddSSHKeyRequest): Promise<SSHKeyEntry>;
  removeSSHKey(fingerprint: string): Promise<void>;
}

export const butlerApiRef = createApiRef<ButlerApi>({
  id: 'plugin.butler.api',
});
