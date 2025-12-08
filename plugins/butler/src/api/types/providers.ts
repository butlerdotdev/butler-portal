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

export interface ImageListResponse {
  images: ImageInfo[];
}

export interface NetworkInfo {
  name: string;
  id: string;
  vlan?: number;
  description?: string;
}

export interface NetworkListResponse {
  networks: NetworkInfo[];
}
