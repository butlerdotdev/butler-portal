// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

export interface AddonDefinition {
  name: string;
  displayName: string;
  description: string;
  category: AddonCategory;
  icon?: string;
  chartRepository: string;
  chartName: string;
  defaultVersion: string;
  availableVersions?: string[];
  defaultNamespace?: string;
  platform: boolean;
  dependsOn?: string[];
  source: 'builtin' | 'custom';
  links?: {
    documentation?: string;
    source?: string;
    homepage?: string;
  };
}

export type AddonCategory =
  | 'cni'
  | 'loadbalancer'
  | 'storage'
  | 'certmanager'
  | 'ingress'
  | 'observability'
  | 'backup'
  | 'gitops'
  | 'security'
  | 'other';

export interface CategoryInfo {
  name: AddonCategory;
  displayName: string;
  description: string;
  icon: string;
}

export interface InstalledAddon {
  name: string;
  displayName?: string;
  status: AddonStatus;
  phase?: string;
  version?: string;
  installedVersion?: string;
  managedBy?: 'butler' | 'platform' | 'gitops';
  namespace?: string;
  message?: string;
  helmRelease?: {
    name: string;
    namespace: string;
    revision: number;
    status: string;
  };
  conditions?: AddonCondition[];
}

export type AddonStatus =
  | 'Installed'
  | 'Installing'
  | 'Upgrading'
  | 'Pending'
  | 'Failed'
  | 'Degraded'
  | 'Deleting'
  | 'Unknown';

export interface AddonCondition {
  type: string;
  status: 'True' | 'False' | 'Unknown';
  reason?: string;
  message?: string;
}

export interface InstallAddonRequest {
  addon?: string;
  version?: string;
  values?: Record<string, unknown>;
  helm?: {
    repository: string;
    chart: string;
    version?: string;
    releaseName?: string;
    namespace?: string;
    createNamespace?: boolean;
  };
}

export interface UpdateAddonRequest {
  values?: Record<string, unknown>;
  version?: string;
}

export interface ManagementAddon {
  name: string;
  addon: string;
  version?: string;
  values?: Record<string, unknown>;
  status: {
    phase: string;
    installedVersion?: string;
    message?: string;
  };
}

export interface InstallManagementAddonRequest {
  name: string;
  addon: string;
  version?: string;
  values?: Record<string, unknown>;
}

export interface CatalogResponse {
  addons: AddonDefinition[];
  categories: CategoryInfo[];
}

export interface AddonsListResponse {
  addons: InstalledAddon[];
}

export const CATEGORY_INFO: Record<AddonCategory, CategoryInfo> = {
  cni: {
    name: 'cni',
    displayName: 'Networking (CNI)',
    description: 'Container Network Interface plugins',
    icon: '\u{1F310}',
  },
  loadbalancer: {
    name: 'loadbalancer',
    displayName: 'Load Balancer',
    description: 'Load balancer implementations',
    icon: '\u2696\uFE0F',
  },
  storage: {
    name: 'storage',
    displayName: 'Storage',
    description: 'Persistent storage solutions',
    icon: '\u{1F4BE}',
  },
  certmanager: {
    name: 'certmanager',
    displayName: 'Certificate Management',
    description: 'TLS certificate automation',
    icon: '\u{1F510}',
  },
  ingress: {
    name: 'ingress',
    displayName: 'Ingress',
    description: 'Ingress controllers',
    icon: '\u{1F6AA}',
  },
  observability: {
    name: 'observability',
    displayName: 'Observability',
    description: 'Monitoring, logging, and tracing',
    icon: '\u{1F4CA}',
  },
  backup: {
    name: 'backup',
    displayName: 'Backup & Recovery',
    description: 'Data protection and disaster recovery',
    icon: '\u{1F6E1}\uFE0F',
  },
  gitops: {
    name: 'gitops',
    displayName: 'GitOps',
    description: 'Continuous delivery and deployment automation',
    icon: '\u{1F504}',
  },
  security: {
    name: 'security',
    displayName: 'Security',
    description: 'Security and policy enforcement',
    icon: '\u{1F512}',
  },
  other: {
    name: 'other',
    displayName: 'Other',
    description: 'Other addons',
    icon: '\u{1F4E6}',
  },
};

export function groupAddonsByCategory(
  addons: AddonDefinition[],
): Record<AddonCategory, AddonDefinition[]> {
  const groups: Record<string, AddonDefinition[]> = {};

  for (const addon of addons) {
    const category = addon.category;
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(addon);
  }

  return groups as Record<AddonCategory, AddonDefinition[]>;
}

export function getPlatformAddons(
  catalog: AddonDefinition[],
): AddonDefinition[] {
  return catalog.filter(addon => addon.platform);
}

export function getOptionalAddons(
  catalog: AddonDefinition[],
): AddonDefinition[] {
  return catalog.filter(addon => !addon.platform);
}

export function getBuiltinAddons(
  catalog: AddonDefinition[],
): AddonDefinition[] {
  return catalog.filter(addon => addon.source === 'builtin');
}

export function getCustomAddons(
  catalog: AddonDefinition[],
): AddonDefinition[] {
  return catalog.filter(addon => addon.source === 'custom');
}

export function isAddonInstalled(
  addonName: string,
  installedAddons: InstalledAddon[],
): boolean {
  return installedAddons.some(
    addon => addon.name === addonName && addon.status === 'Installed',
  );
}

export function getInstalledAddon(
  addonName: string,
  installedAddons: InstalledAddon[],
): InstalledAddon | undefined {
  return installedAddons.find(addon => addon.name === addonName);
}

export function getStatusColor(status: AddonStatus): string {
  switch (status) {
    case 'Installed':
      return 'text-green-400';
    case 'Installing':
    case 'Upgrading':
    case 'Pending':
      return 'text-yellow-400';
    case 'Failed':
    case 'Degraded':
      return 'text-red-400';
    case 'Deleting':
      return 'text-orange-400';
    default:
      return 'text-neutral-400';
  }
}

export function getStatusBgColor(status: AddonStatus): string {
  switch (status) {
    case 'Installed':
      return 'bg-green-500/10 border-green-500/30';
    case 'Installing':
    case 'Upgrading':
    case 'Pending':
      return 'bg-yellow-500/10 border-yellow-500/30';
    case 'Failed':
    case 'Degraded':
      return 'bg-red-500/10 border-red-500/30';
    case 'Deleting':
      return 'bg-orange-500/10 border-orange-500/30';
    default:
      return 'bg-neutral-500/10 border-neutral-500/30';
  }
}
