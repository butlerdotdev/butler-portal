/*
 * Copyright 2026 The Butler Authors.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Platform configuration as returned by GET /api/admin/config.
 * Mirrors butler-server handlers/config.go ButlerConfigResponse.
 */
export interface PlatformConfig {
  multiTenancy: { mode: string } | null;
  defaultNamespace: string;
  defaultProviderRef?: { name: string };
  controlPlaneExposure?: {
    mode: string;
    hostname: string;
    ingressClassName: string;
    controllerType: string;
    gatewayRef: string;
  };
  defaultAddonVersions?: {
    cilium?: string;
    metallb?: string;
    certManager?: string;
    longhorn?: string;
    traefik?: string;
    fluxcd?: string;
  };
  defaultTeamLimits?: {
    maxClusters?: number;
    maxWorkersPerCluster?: number;
    maxTotalCPU?: string;
    maxTotalMemory?: string;
    maxTotalStorage?: string;
  };
  defaultControlPlaneResources?: {
    apiServer?: ComponentResources;
    controllerManager?: ComponentResources;
    scheduler?: ComponentResources;
  };
  imageFactory?: {
    url: string;
    credentialsRef: string;
    defaultSchematicID: string;
    autoSync?: boolean;
  };
  audit?: { enabled?: boolean; webhookURL?: string; bufferSize?: number };
  notifications?: { webhookURL?: string };
  sshAuthorizedKey?: string;
  status: {
    teamCount: number;
    clusterCount: number;
    controlPlaneExposureMode?: string;
    tcpProxyRequired: boolean;
  } | null;
}

export interface ComponentResources {
  requests?: { cpu?: string; memory?: string };
  limits?: { cpu?: string; memory?: string };
}
