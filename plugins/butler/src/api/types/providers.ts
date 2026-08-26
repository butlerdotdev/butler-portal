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
    };
    proxmox?: {
      endpoint?: string;
      insecure?: boolean;
      nodes?: string[];
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
    };
  };
  status?: {
    validated?: boolean;
    lastValidationTime?: string;
    conditions?: Array<{
      type: string;
      status: string;
      reason: string;
      message: string;
    }>;
  };
}

export interface ProviderListResponse {
  providers: Provider[];
}

export interface ValidateResponse {
  valid: boolean;
  message: string;
}

export interface CreateProviderRequest {
  name: string;
  namespace?: string;
  provider: 'harvester' | 'nutanix' | 'proxmox';
  // Harvester
  harvesterKubeconfig?: string;
  // Nutanix
  nutanixEndpoint?: string;
  nutanixPort?: number;
  nutanixUsername?: string;
  nutanixPassword?: string;
  nutanixInsecure?: boolean;
  // Proxmox
  proxmoxEndpoint?: string;
  proxmoxUsername?: string;
  proxmoxPassword?: string;
  proxmoxTokenId?: string;
  proxmoxTokenSecret?: string;
  proxmoxInsecure?: boolean;
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
