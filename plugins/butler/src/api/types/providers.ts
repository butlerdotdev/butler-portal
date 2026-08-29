// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

export interface Provider {
  metadata: {
    name: string;
    namespace: string;
    uid?: string;
    creationTimestamp?: string;
  };
  spec: {
    provider: string;
    credentialsRef?: {
      name: string;
      namespace?: string;
      key?: string;
    };
    nutanix?: {
      endpoint?: string;
      port?: number;
      insecure?: boolean;
      clusterUUID?: string;
      subnetUUID?: string;
      imageUUID?: string;
      storageContainerUUID?: string;
    };
    proxmox?: {
      endpoint?: string;
      insecure?: boolean;
      nodes?: string[];
      storage?: string;
      templateID?: number;
    };
    /**
     * How addresses are handed out. `ipam` means the platform allocates
     * from a pool, `cloud` means the cloud owns addressing; anything else
     * expects the caller to name a range.
     */
    network?: {
      mode?: string;
      subnet?: string;
      gateway?: string;
      dnsServers?: string[];
      timeServers?: string[];
      poolRefs?: Array<{ name: string; priority?: number }>;
      loadBalancer?: {
        defaultPoolSize?: number;
        allocationMode?: string;
        initialPoolSize?: number;
        growthIncrement?: number;
      };
      quotaPerTenant?: { maxNodeIPs?: number; maxLoadBalancerIPs?: number };
    };
    /** Per-team ceilings the platform enforces for this provider. */
    limits?: { maxClustersPerTeam?: number; maxNodesPerTeam?: number };
    harvester?: {
      endpoint?: string;
      namespace?: string;
      networkName?: string;
      imageName?: string;
      storageClassName?: string;
    };
    /**
     * Who may create clusters against this provider. Absent means
     * `platform`, which every team may use. A `team` provider belongs to
     * exactly one team; the admission webhook refuses a cluster from any
     * other team that references it.
     */
    scope?: {
      type?: 'platform' | 'team' | string;
      teamRef?: { name: string };
    };
    aws?: {
      region?: string;
      vpcID?: string;
      vpcId?: string;
      subnetIDs?: string[];
      securityGroupIDs?: string[];
    };
    azure?: {
      subscriptionID?: string;
      resourceGroup?: string;
      location?: string;
      vnetName?: string;
      subnetName?: string;
      vmSize?: string;
      imageURN?: string;
    };
    gcp?: {
      projectID?: string;
      region?: string;
      zone?: string;
      network?: string;
      subnetwork?: string;
      machineType?: string;
      imageProject?: string;
      imageFamily?: string;
      image?: string;
      serviceAccount?: string;
      tags?: string[];
    };
  };
  status?: {
    validated?: boolean;
    lastValidationTime?: string;
    /** Set by the controller once the provider is usable. */
    ready?: boolean;
    /** When the controller last probed the provider itself. */
    lastProbeTime?: string;
    providerVersion?: string;
    conditions?: Array<{
      type: string;
      status: string;
      reason: string;
      message: string;
    }>;
    capacity?: { availableIPs?: number; estimatedTenants?: number };
  };
}

export type ProviderScope = 'platform' | 'team';

/** The scope a provider carries, with the server's default applied. */
export function providerScope(provider: Provider): ProviderScope {
  return provider.spec.scope?.type === 'team' ? 'team' : 'platform';
}

/** Whether a team may create clusters against this provider. */
export function providerUsableByTeam(
  provider: Provider,
  team: string,
): boolean {
  if (providerScope(provider) === 'platform') return true;
  return provider.spec.scope?.teamRef?.name === team;
}

export interface ProviderListResponse {
  providers: Provider[];
}

export interface ValidateResponse {
  valid: boolean;
  message: string;
  /** Which stage failed: tls, network, auth or parse. */
  category?: 'tls' | 'network' | 'auth' | 'parse' | string;
  detail?: unknown;
}

export type ProviderType =
  | 'harvester'
  | 'nutanix'
  | 'proxmox'
  | 'aws'
  | 'azure'
  | 'gcp';

/**
 * The body butler-server accepts for creating a provider, and, as a
 * partial, for updating one. Credentials travel in this body only on the
 * way in; the server writes them to a Secret and never returns them. On
 * update every field is optional and an absent or empty field leaves the
 * stored value alone, so the same shape serves both without a merge on
 * the client.
 */
export interface CreateProviderRequest {
  name: string;
  namespace?: string;
  provider: ProviderType;
  // Harvester
  harvesterKubeconfig?: string;
  // Nutanix
  nutanixEndpoint?: string;
  nutanixPort?: number;
  nutanixUsername?: string;
  nutanixPassword?: string;
  nutanixInsecure?: boolean;
  nutanixCABundle?: string;
  removeCABundle?: boolean;
  // Proxmox
  proxmoxEndpoint?: string;
  proxmoxUsername?: string;
  proxmoxPassword?: string;
  proxmoxTokenId?: string;
  proxmoxTokenSecret?: string;
  proxmoxInsecure?: boolean;
  // AWS
  awsRegion?: string;
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  awsVpcId?: string;
  awsSubnetIds?: string[];
  awsSecurityGroupIds?: string[];
  // Azure
  azureSubscriptionId?: string;
  azureTenantId?: string;
  azureClientId?: string;
  azureClientSecret?: string;
  azureResourceGroup?: string;
  azureLocation?: string;
  azureVnetName?: string;
  azureSubnetName?: string;
  azureVmSize?: string;
  azureImageUrn?: string;
  // GCP
  gcpProjectId?: string;
  gcpRegion?: string;
  gcpServiceAccount?: string;
  gcpNetwork?: string;
  gcpSubnetwork?: string;
  gcpZone?: string;
  gcpMachineType?: string;
  gcpImageProject?: string;
  gcpImageFamily?: string;
  gcpImage?: string;
  gcpTags?: string[];
  // Network
  networkMode?: 'ipam' | 'cloud';
  networkSubnet?: string;
  networkGateway?: string;
  networkDnsServers?: string[];
  poolRefs?: Array<{ name: string; priority?: number }>;
  lbDefaultPoolSize?: number;
  quotaMaxNodeIPs?: number;
  quotaMaxLoadBalancerIPs?: number;
  // Scope, fixed after creation
  scopeType?: 'platform' | 'team';
  scopeTeamRef?: string;
  // Limits
  maxClustersPerTeam?: number;
  maxNodesPerTeam?: number;
}

/** An update carries only what changes; provider and scope cannot change. */
export type UpdateProviderRequest = Partial<
  Omit<
    CreateProviderRequest,
    'name' | 'provider' | 'scopeType' | 'scopeTeamRef'
  >
>;

/** What `GET /providers/{ns}/{name}/ca-info` reports about a CA bundle. */
export interface CAInfoResponse {
  configured: boolean;
  certificates?: Array<{
    subject?: string;
    issuer?: string;
    notBefore?: string;
    notAfter?: string;
    isCA?: boolean;
  }>;
  health?: string;
  nearestExpiry?: string;
}

export interface ImageInfo {
  name: string;
  id: string;
  description?: string;
  os?: string;
}

/**
 * How a ClusterCreationPolicy shaped an option list (ADR-018).
 *
 * The server has already applied the rule before answering: `pin` and
 * `allowList` mean the list arrives filtered, `recommended` means it
 * arrives reordered with the recommended entries first, and `default`
 * leaves the list alone and only names a suggestion. So this is what the
 * platform decided, not a control the caller gets to set.
 */
export type PolicyMode = 'pin' | 'allowList' | 'recommended' | 'default';

export interface PolicyMetadata {
  name: string;
  mode: PolicyMode | string;
  values?: string[];
  default?: string;
  recommendedReason?: string;
}

export interface ImageListResponse {
  images: ImageInfo[];
  policy?: PolicyMetadata;
}

export interface NetworkInfo {
  name: string;
  id: string;
  vlan?: number;
  description?: string;
}

export interface NetworkListResponse {
  networks: NetworkInfo[];
  policy?: PolicyMetadata;
}

/** A Nutanix Prism cluster a tenant cluster's machines may be placed in. */
export interface ProviderClusterInfo {
  name: string;
  id: string;
}

export interface ProviderClusterListResponse {
  clusters: ProviderClusterInfo[];
  policy?: PolicyMetadata;
}

export interface StorageContainerInfo {
  name: string;
  id: string;
}

export interface StorageContainerListResponse {
  storageContainers: StorageContainerInfo[];
  policy?: PolicyMetadata;
}

/**
 * Scope for an option-list read. The server resolves cluster creation
 * policy from the team and environment on the request, so a read made
 * without the environment the cluster will be created in can show a
 * list the create will not get.
 */
export interface OptionListScope {
  environment?: string;
}
