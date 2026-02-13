// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import { ButlerApi } from './ButlerApi';

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

export class ButlerApiClient implements ButlerApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;
  private teamContext: string | null = null;

  constructor(options: { discoveryApi: DiscoveryApi; fetchApi: FetchApi }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
  }

  private async getBaseUrl(): Promise<string> {
    return this.discoveryApi.getBaseUrl('butler');
  }

  private async request<T>(
    path: string,
    options?: {
      method?: string;
      body?: unknown;
    },
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
          errorBody.message || errorBody.error || response.statusText;
      } catch {
        errorMessage = response.statusText;
      }
      throw new Error(
        `Butler API error (${response.status}): ${errorMessage}`,
      );
    }

    // Handle 204 No Content
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

  private put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PUT', body });
  }

  private patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body });
  }

  private del<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }

  // ---- Team context ----

  setTeamContext(team: string | null): void {
    this.teamContext = team;
  }

  getTeamContext(): string | null {
    return this.teamContext;
  }

  // ---- Auth ----

  async getCurrentUser(): Promise<any> {
    return this.get('/auth/me');
  }

  async getTeams(): Promise<{ teams: TeamInfo[] }> {
    return this.get('/auth/teams');
  }

  async listAllTeams(): Promise<{ teams: TeamInfo[] }> {
    return this.get('/teams');
  }

  async getIdentity(): Promise<{
    authenticated: boolean;
    email: string | null;
    displayName: string;
    isPlatformAdmin: boolean;
    teams: TeamInfo[];
  }> {
    return this.get('/_identity');
  }

  // ---- Clusters ----

  async listClusters(
    options?: ClusterListOptions,
  ): Promise<ClusterListResponse> {
    const params = new URLSearchParams();
    if (options?.namespace) {
      params.set('namespace', options.namespace);
    }
    if (options?.team) {
      params.set('team', options.team);
    }
    const queryString = params.toString();
    return this.get<ClusterListResponse>(
      `/clusters${queryString ? `?${queryString}` : ''}`,
    );
  }

  async getCluster(namespace: string, name: string): Promise<Cluster> {
    return this.get<Cluster>(`/clusters/${namespace}/${name}`);
  }

  async createCluster(data: CreateClusterRequest): Promise<Cluster> {
    return this.post<Cluster>('/clusters', data);
  }

  async deleteCluster(namespace: string, name: string): Promise<void> {
    return this.del(`/clusters/${namespace}/${name}`);
  }

  async scaleCluster(
    namespace: string,
    name: string,
    replicas: number,
  ): Promise<Cluster> {
    return this.patch<Cluster>(`/clusters/${namespace}/${name}/scale`, {
      replicas,
    });
  }

  async getClusterKubeconfig(
    namespace: string,
    name: string,
  ): Promise<{ kubeconfig: string }> {
    return this.get<{ kubeconfig: string }>(
      `/clusters/${namespace}/${name}/kubeconfig`,
    );
  }

  async getClusterNodes(
    namespace: string,
    name: string,
  ): Promise<{ nodes: Node[] }> {
    return this.get<{ nodes: Node[] }>(
      `/clusters/${namespace}/${name}/nodes`,
    );
  }

  async getClusterAddons(
    namespace: string,
    name: string,
  ): Promise<{ addons: Addon[] }> {
    return this.get<{ addons: Addon[] }>(
      `/clusters/${namespace}/${name}/addons`,
    );
  }

  async getClusterEvents(
    namespace: string,
    name: string,
  ): Promise<{ events: ClusterEvent[] }> {
    return this.get<{ events: ClusterEvent[] }>(
      `/clusters/${namespace}/${name}/events`,
    );
  }

  // ---- Management ----

  async getManagement(): Promise<ManagementCluster> {
    return this.get<ManagementCluster>('/management');
  }

  async getManagementNodes(): Promise<{ nodes: ManagementNode[] }> {
    return this.get<{ nodes: ManagementNode[] }>('/management/nodes');
  }

  async getManagementPods(
    namespace: string,
  ): Promise<{ pods: ManagementPod[] }> {
    return this.get<{ pods: ManagementPod[] }>(
      `/management/pods/${namespace}`,
    );
  }

  // ---- Providers ----

  async listProviders(): Promise<ProviderListResponse> {
    return this.get<ProviderListResponse>('/providers');
  }

  async getProvider(namespace: string, name: string): Promise<Provider> {
    return this.get<Provider>(`/providers/${namespace}/${name}`);
  }

  async createProvider(data: CreateProviderRequest): Promise<Provider> {
    return this.post<Provider>('/providers', data);
  }

  async deleteProvider(namespace: string, name: string): Promise<void> {
    return this.del(`/providers/${namespace}/${name}`);
  }

  async validateProvider(
    namespace: string,
    name: string,
  ): Promise<ValidateResponse> {
    return this.post<ValidateResponse>(
      `/providers/${namespace}/${name}/validate`,
      {},
    );
  }

  async testProviderConnection(
    data: CreateProviderRequest,
  ): Promise<ValidateResponse> {
    return this.post<ValidateResponse>('/providers/test', data);
  }

  async listProviderImages(
    namespace: string,
    name: string,
  ): Promise<ImageListResponse> {
    return this.get<ImageListResponse>(
      `/providers/${namespace}/${name}/images`,
    );
  }

  async listProviderNetworks(
    namespace: string,
    name: string,
  ): Promise<NetworkListResponse> {
    return this.get<NetworkListResponse>(
      `/providers/${namespace}/${name}/networks`,
    );
  }

  // ---- Addons ----

  async getAddonCatalog(): Promise<CatalogResponse> {
    return this.get<CatalogResponse>('/addons/catalog');
  }

  async getAddonDefinition(name: string): Promise<AddonDefinition> {
    return this.get<AddonDefinition>(`/addons/catalog/${name}`);
  }

  async listClusterAddons(
    namespace: string,
    clusterName: string,
  ): Promise<AddonsListResponse> {
    return this.get<AddonsListResponse>(
      `/clusters/${namespace}/${clusterName}/addons`,
    );
  }

  async installAddon(
    namespace: string,
    clusterName: string,
    data: InstallAddonRequest,
  ): Promise<unknown> {
    return this.post(
      `/clusters/${namespace}/${clusterName}/addons`,
      data,
    );
  }

  async getAddonDetails(
    namespace: string,
    clusterName: string,
    addonName: string,
  ): Promise<InstalledAddon> {
    return this.get<InstalledAddon>(
      `/clusters/${namespace}/${clusterName}/addons/${addonName}`,
    );
  }

  async updateAddon(
    namespace: string,
    clusterName: string,
    addonName: string,
    data: UpdateAddonRequest,
  ): Promise<unknown> {
    return this.put(
      `/clusters/${namespace}/${clusterName}/addons/${addonName}`,
      data,
    );
  }

  async uninstallAddon(
    namespace: string,
    clusterName: string,
    addonName: string,
  ): Promise<void> {
    return this.del(
      `/clusters/${namespace}/${clusterName}/addons/${addonName}`,
    );
  }

  async getManagementAddons(): Promise<{ addons: ManagementAddon[] }> {
    return this.get<{ addons: ManagementAddon[] }>('/management/addons');
  }

  async installManagementAddon(
    data: InstallManagementAddonRequest,
  ): Promise<ManagementAddon> {
    return this.post<ManagementAddon>('/management/addons', data);
  }

  async uninstallManagementAddon(name: string): Promise<void> {
    return this.del(`/management/addons/${name}`);
  }

  // ---- GitOps ----

  async getGitOpsConfig(): Promise<GitProviderConfig> {
    return this.get<GitProviderConfig>('/gitops/config');
  }

  async saveGitOpsConfig(
    request: SaveGitProviderRequest,
  ): Promise<GitProviderConfig> {
    return this.post<GitProviderConfig>('/gitops/config', request);
  }

  async clearGitOpsConfig(): Promise<void> {
    return this.del('/gitops/config');
  }

  async listRepositories(): Promise<Repository[]> {
    return this.get<Repository[]>('/gitops/repos');
  }

  async listBranches(owner: string, repo: string): Promise<Branch[]> {
    return this.get<Branch[]>(`/gitops/repos/${owner}/${repo}/branches`);
  }

  async previewManifests(
    request: PreviewManifestRequest,
  ): Promise<PreviewManifestResponse> {
    return this.post<PreviewManifestResponse>('/gitops/preview', request);
  }

  async getClusterGitOpsStatus(
    namespace: string,
    name: string,
  ): Promise<GitOpsStatus> {
    return this.get<GitOpsStatus>(
      `/clusters/${namespace}/${name}/gitops/status`,
    );
  }

  async discoverClusterReleases(
    namespace: string,
    name: string,
  ): Promise<DiscoveryResult> {
    return this.get<DiscoveryResult>(
      `/clusters/${namespace}/${name}/gitops/discover`,
    );
  }

  async exportClusterAddon(
    namespace: string,
    name: string,
    request: ExportAddonRequest,
  ): Promise<ExportAddonResponse> {
    return this.post<ExportAddonResponse>(
      `/clusters/${namespace}/${name}/gitops/export`,
      request,
    );
  }

  async exportClusterRelease(
    namespace: string,
    name: string,
    request: any,
  ): Promise<ExportAddonResponse> {
    return this.post<ExportAddonResponse>(
      `/clusters/${namespace}/${name}/gitops/export-release`,
      request,
    );
  }

  async migrateClusterReleases(
    namespace: string,
    name: string,
    request: MigrationRequest,
  ): Promise<MigrationResult> {
    return this.post<MigrationResult>(
      `/clusters/${namespace}/${name}/gitops/migrate`,
      request,
    );
  }

  async enableClusterGitOps(
    namespace: string,
    name: string,
    config: any,
  ): Promise<{ success: boolean; message: string }> {
    return this.post(
      `/clusters/${namespace}/${name}/gitops/enable`,
      config,
    );
  }

  async disableClusterGitOps(
    namespace: string,
    name: string,
  ): Promise<void> {
    return this.del(`/clusters/${namespace}/${name}/gitops`);
  }

  async getManagementGitOpsStatus(): Promise<GitOpsStatus> {
    return this.get<GitOpsStatus>('/management/gitops/status');
  }

  async discoverManagementReleases(): Promise<DiscoveryResult> {
    return this.get<DiscoveryResult>('/management/gitops/discover');
  }

  async exportManagementAddon(
    request: ExportAddonRequest,
  ): Promise<ExportAddonResponse> {
    return this.post<ExportAddonResponse>(
      '/management/gitops/export-catalog',
      request,
    );
  }

  async exportManagementRelease(
    request: any,
  ): Promise<ExportAddonResponse> {
    return this.post<ExportAddonResponse>(
      '/management/gitops/export',
      request,
    );
  }

  async migrateManagementReleases(
    request: MigrationRequest,
  ): Promise<MigrationResult> {
    return this.post<MigrationResult>(
      '/management/gitops/migrate',
      request,
    );
  }

  async enableManagementGitOps(
    config: any,
  ): Promise<{ success: boolean; message: string }> {
    return this.post('/management/gitops/enable', config);
  }

  async disableManagementGitOps(): Promise<void> {
    return this.del('/management/gitops');
  }

  // ---- Certificates ----

  async getClusterCertificates(
    namespace: string,
    name: string,
  ): Promise<ClusterCertificates> {
    return this.get<ClusterCertificates>(
      `/clusters/${namespace}/${name}/certificates`,
    );
  }

  async getCertificatesByCategory(
    namespace: string,
    name: string,
    category: CertificateCategory,
  ): Promise<{
    category: CertificateCategory;
    certificates: CertificateInfo[];
  }> {
    return this.get(
      `/clusters/${namespace}/${name}/certificates/${category}`,
    );
  }

  async rotateCertificates(
    namespace: string,
    name: string,
    type: string,
    acknowledge: boolean = false,
  ): Promise<RotationEvent> {
    return this.post<RotationEvent>(
      `/clusters/${namespace}/${name}/certificates/rotate`,
      { type, acknowledge },
    );
  }

  async getRotationStatus(
    namespace: string,
    name: string,
  ): Promise<RotationEvent> {
    return this.get<RotationEvent>(
      `/clusters/${namespace}/${name}/certificates/rotation-status`,
    );
  }

  // ---- Identity Providers ----

  async listIdentityProviders(): Promise<IdentityProviderListResponse> {
    return this.get<IdentityProviderListResponse>(
      '/admin/identity-providers',
    );
  }

  async getIdentityProvider(name: string): Promise<IdentityProvider> {
    return this.get<IdentityProvider>(
      `/admin/identity-providers/${name}`,
    );
  }

  async createIdentityProvider(
    data: CreateIdentityProviderRequest,
  ): Promise<IdentityProvider> {
    return this.post<IdentityProvider>(
      '/admin/identity-providers',
      data,
    );
  }

  async deleteIdentityProvider(
    name: string,
  ): Promise<{ status: string; message: string }> {
    return this.del(`/admin/identity-providers/${name}`);
  }

  async testIdPDiscovery(
    issuerURL: string,
  ): Promise<TestDiscoveryResponse> {
    return this.post<TestDiscoveryResponse>(
      '/admin/identity-providers/test',
      { issuerURL },
    );
  }

  async validateIdentityProvider(
    name: string,
  ): Promise<TestDiscoveryResponse> {
    return this.post<TestDiscoveryResponse>(
      `/admin/identity-providers/${name}/validate`,
      {},
    );
  }

  // ---- Settings ----

  async getSettings(): Promise<any> {
    return this.get('/admin/settings');
  }

  // ---- Users ----

  async listUsers(): Promise<any> {
    return this.get('/users');
  }

  async createUser(data: {
    email: string;
    name?: string;
  }): Promise<{ user: any; inviteUrl?: string }> {
    return this.post('/admin/users', data);
  }

  async deleteUser(username: string): Promise<void> {
    return this.del(`/admin/users/${username}`);
  }

  async disableUser(username: string): Promise<void> {
    return this.post(`/admin/users/${username}/disable`, {});
  }

  async enableUser(username: string): Promise<void> {
    return this.post(`/admin/users/${username}/enable`, {});
  }

  async resendInvite(username: string): Promise<{ inviteUrl: string }> {
    return this.post(`/admin/users/${username}/invite`, {});
  }

  // ---- Teams ----

  async getTeam(name: string): Promise<any> {
    return this.get(`/teams/${name}`);
  }

  async createTeam(data: {
    name: string;
    displayName?: string;
    description?: string;
  }): Promise<any> {
    return this.post('/admin/teams', data);
  }

  async updateTeam(
    name: string,
    data: { displayName?: string; description?: string },
  ): Promise<any> {
    return this.put(`/teams/${name}`, data);
  }

  async deleteTeam(name: string): Promise<void> {
    return this.del(`/admin/teams/${name}`);
  }

  async getTeamClusters(name: string): Promise<ClusterListResponse> {
    return this.get<ClusterListResponse>(
      `/teams/${name}/clusters`,
    );
  }

  async getTeamMembers(name: string): Promise<any> {
    return this.get(`/teams/${name}/members`);
  }

  async addTeamMember(
    teamName: string,
    data: { email: string; role: string },
  ): Promise<void> {
    return this.post(`/admin/teams/${teamName}/members`, data);
  }

  async removeTeamMember(teamName: string, email: string): Promise<void> {
    return this.del(`/admin/teams/${teamName}/members/${encodeURIComponent(email)}`);
  }

  async updateMemberRole(
    teamName: string,
    email: string,
    role: string,
  ): Promise<void> {
    return this.patch(`/admin/teams/${teamName}/members/${encodeURIComponent(email)}`, { role });
  }

  async getTeamGroupSyncs(name: string): Promise<any> {
    return this.get(`/teams/${name}/groups`);
  }

  async addGroupSync(
    teamName: string,
    data: { group: string; role: string; identityProvider?: string },
  ): Promise<void> {
    return this.post(`/admin/teams/${teamName}/groups`, data);
  }

  async removeGroupSync(teamName: string, groupName: string): Promise<void> {
    return this.del(`/admin/teams/${teamName}/groups/${encodeURIComponent(groupName)}`);
  }

  async updateGroupSyncRole(
    teamName: string,
    groupName: string,
    role: string,
  ): Promise<void> {
    return this.patch(`/admin/teams/${teamName}/groups/${encodeURIComponent(groupName)}`, { role });
  }

  // ---- Workspaces ----

  async listWorkspaces(
    namespace: string,
    clusterName: string,
  ): Promise<WorkspaceListResponse> {
    return this.get<WorkspaceListResponse>(
      `/clusters/${namespace}/${clusterName}/workspaces`,
    );
  }

  async getWorkspace(
    namespace: string,
    clusterName: string,
    workspaceName: string,
  ): Promise<Workspace> {
    return this.get<Workspace>(
      `/clusters/${namespace}/${clusterName}/workspaces/${workspaceName}`,
    );
  }

  async createWorkspace(
    namespace: string,
    clusterName: string,
    data: CreateWorkspaceRequest,
  ): Promise<Workspace> {
    return this.post<Workspace>(
      `/clusters/${namespace}/${clusterName}/workspaces`,
      data,
    );
  }

  async deleteWorkspace(
    namespace: string,
    clusterName: string,
    workspaceName: string,
  ): Promise<void> {
    return this.del(
      `/clusters/${namespace}/${clusterName}/workspaces/${workspaceName}`,
    );
  }

  async connectWorkspace(
    namespace: string,
    clusterName: string,
    workspaceName: string,
  ): Promise<Workspace> {
    return this.post<Workspace>(
      `/clusters/${namespace}/${clusterName}/workspaces/${workspaceName}/connect`,
      {},
    );
  }

  async disconnectWorkspace(
    namespace: string,
    clusterName: string,
    workspaceName: string,
  ): Promise<Workspace> {
    return this.post<Workspace>(
      `/clusters/${namespace}/${clusterName}/workspaces/${workspaceName}/disconnect`,
      {},
    );
  }

  async startWorkspace(
    namespace: string,
    clusterName: string,
    workspaceName: string,
  ): Promise<Workspace> {
    return this.post<Workspace>(
      `/clusters/${namespace}/${clusterName}/workspaces/${workspaceName}/start`,
      {},
    );
  }

  async getWorkspaceMetrics(
    namespace: string,
    clusterName: string,
    workspaceName: string,
  ): Promise<WorkspaceMetrics> {
    return this.get<WorkspaceMetrics>(
      `/clusters/${namespace}/${clusterName}/workspaces/${workspaceName}/metrics`,
    );
  }

  // ---- Cluster Services ----

  async listClusterServices(
    namespace: string,
    clusterName: string,
  ): Promise<ClusterServiceListResponse> {
    return this.get<ClusterServiceListResponse>(
      `/clusters/${namespace}/${clusterName}/services`,
    );
  }

  async generateMirrordConfig(
    namespace: string,
    clusterName: string,
    serviceName: string,
    serviceNamespace: string,
  ): Promise<MirrordConfig> {
    return this.post<MirrordConfig>(
      `/clusters/${namespace}/${clusterName}/mirrord-config`,
      { serviceName, serviceNamespace },
    );
  }

  // ---- Workspace Images ----

  async listWorkspaceImages(): Promise<WorkspaceImageListResponse> {
    return this.get<WorkspaceImageListResponse>('/workspace-images');
  }

  // ---- Workspace Templates ----

  async listWorkspaceTemplates(): Promise<WorkspaceTemplateListResponse> {
    return this.get<WorkspaceTemplateListResponse>('/workspace-templates');
  }

  async createWorkspaceTemplate(
    data: CreateWorkspaceTemplateRequest,
  ): Promise<WorkspaceTemplate> {
    return this.post<WorkspaceTemplate>('/workspace-templates', data);
  }

  async deleteWorkspaceTemplate(
    namespace: string,
    name: string,
  ): Promise<void> {
    return this.del(`/workspace-templates/${namespace}/${name}`);
  }

  // ---- SSH Keys ----

  async listSSHKeys(): Promise<SSHKeyListResponse> {
    return this.get<SSHKeyListResponse>('/auth/ssh-keys');
  }

  async addSSHKey(data: AddSSHKeyRequest): Promise<SSHKeyEntry> {
    return this.post<SSHKeyEntry>('/auth/ssh-keys', data);
  }

  async removeSSHKey(fingerprint: string): Promise<void> {
    return this.del(`/auth/ssh-keys/${encodeURIComponent(fingerprint)}`);
  }
}
