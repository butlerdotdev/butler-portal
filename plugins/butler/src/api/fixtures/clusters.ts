// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * In-memory fixtures that mirror the shapes butler-server returns.
 *
 * Cluster status shapes follow the TenantCluster CRD in butler-api
 * (api/v1alpha1/tenantcluster_types.go). Each cluster below exercises a
 * distinct lifecycle state so the UI can be driven without a server.
 */

import type { PlatformConfig } from '../types/config';
import type {
  Cluster,
  Node,
  ClusterEvent,
  ManagementCluster,
  ManagementNode,
  ManagementPod,
} from '../types/clusters';
import type { TeamInfo } from '../types/teams';
import type {
  AddonDefinition,
  CategoryInfo,
  InstalledAddon,
} from '../types/addons';
import type {
  ClusterCertificates,
  CertificateInfo,
  CertificateCategory,
  RotationEvent,
} from '../types/certificates';
import type { GitOpsStatus, GitProviderConfig } from '../types/gitops';
import type { Provider } from '../types/providers';
import type { IdentityProvider } from '../types/identity-providers';
import { CATEGORY_INFO } from '../types/addons';

export const FIXTURE_TEAM = 'platform';
export const FIXTURE_NAMESPACE = 'team-platform';
export const FIXTURE_PROVIDER = 'harvester-lab';

// A fixed reference time keeps ages stable across renders and tests.
export const FIXTURE_NOW = '2026-08-22T12:00:00Z';

type Condition = NonNullable<
  NonNullable<Cluster['status']>['conditions']
>[number];

function cond(
  type: string,
  status: 'True' | 'False' | 'Unknown',
  reason: string,
  message: string,
  lastTransitionTime = '2026-08-20T09:15:00Z',
): Condition {
  return { type, status, reason, message, lastTransitionTime };
}

interface ClusterSeed {
  name: string;
  uid: string;
  resourceVersion: string;
  creationTimestamp: string;
  kubernetesVersion?: string;
  workers: number;
  cpu?: number;
  memory?: string;
  diskSize?: string;
  workspacesEnabled?: boolean;
  status: NonNullable<Cluster['status']>;
}

function makeCluster(seed: ClusterSeed): Cluster {
  return {
    metadata: {
      name: seed.name,
      namespace: FIXTURE_NAMESPACE,
      uid: seed.uid,
      resourceVersion: seed.resourceVersion,
      creationTimestamp: seed.creationTimestamp,
      labels: { 'butler.dev/team': FIXTURE_TEAM },
    },
    spec: {
      kubernetesVersion: seed.kubernetesVersion ?? 'v1.33.2',
      teamRef: { name: FIXTURE_TEAM },
      providerConfigRef: { name: FIXTURE_PROVIDER, namespace: 'butler-system' },
      controlPlane: { replicas: 3 },
      workers: {
        replicas: seed.workers,
        machineTemplate: {
          cpu: seed.cpu ?? 4,
          memory: seed.memory ?? '8Gi',
          diskSize: seed.diskSize ?? '50Gi',
        },
      },
      networking: {
        loadBalancerPool: { start: '10.40.20.10', end: '10.40.20.29' },
      },
      workspaces: { enabled: seed.workspacesEnabled ?? false },
    },
    status: seed.status,
  };
}

/** Cluster that has been accepted but not yet reconciled. */
export const pendingCluster: Cluster = makeCluster({
  name: 'pending-alpha',
  uid: '0a1b2c3d-0001-4000-8000-000000000001',
  resourceVersion: '100',
  creationTimestamp: '2026-08-22T11:58:00Z',
  workers: 2,
  status: {
    phase: 'Pending',
    workerNodesReady: 0,
    workerNodesDesired: 2,
    conditions: [
      cond(
        'Ready',
        'False',
        'Pending',
        'Waiting for the TenantCluster controller to pick up the resource',
        '2026-08-22T11:58:00Z',
      ),
    ],
  },
});

/** Infrastructure is coming up; workers are still converging. */
export const provisioningCluster: Cluster = makeCluster({
  name: 'provisioning-bravo',
  uid: '0a1b2c3d-0002-4000-8000-000000000002',
  resourceVersion: '214',
  creationTimestamp: '2026-08-22T11:40:00Z',
  workers: 3,
  status: {
    phase: 'Provisioning',
    tenantNamespace: 'tc-provisioning-bravo',
    controlPlaneEndpoint: 'https://10.40.20.11:6443',
    workerNodesReady: 1,
    workerNodesDesired: 3,
    observedState: {
      workers: { desired: 3, ready: 1, nodes: ['provisioning-bravo-worker-0'] },
    },
    conditions: [
      cond(
        'ControlPlaneReady',
        'True',
        'ControlPlaneReady',
        'Control plane is reachable',
        '2026-08-22T11:47:00Z',
      ),
      cond(
        'InfrastructureReady',
        'False',
        'InfrastructureProvisioning',
        'Waiting for 2 of 3 worker machines to boot',
        '2026-08-22T11:47:00Z',
      ),
      cond(
        'WorkersReady',
        'False',
        'WorkersProvisioning',
        '1 of 3 worker nodes ready',
        '2026-08-22T11:52:00Z',
      ),
      cond(
        'Ready',
        'False',
        'Provisioning',
        'Cluster infrastructure is being provisioned',
        '2026-08-22T11:40:00Z',
      ),
    ],
  },
});

/** Infrastructure is up; platform addons are being installed. */
export const installingCluster: Cluster = makeCluster({
  name: 'installing-charlie',
  uid: '0a1b2c3d-0003-4000-8000-000000000003',
  resourceVersion: '377',
  creationTimestamp: '2026-08-22T10:55:00Z',
  workers: 2,
  status: {
    phase: 'Installing',
    tenantNamespace: 'tc-installing-charlie',
    controlPlaneEndpoint: 'https://10.40.20.12:6443',
    workerNodesReady: 2,
    workerNodesDesired: 2,
    observedState: {
      workers: {
        desired: 2,
        ready: 2,
        nodes: ['installing-charlie-worker-0', 'installing-charlie-worker-1'],
      },
      addons: [
        {
          name: 'cilium',
          status: 'Healthy',
          version: '1.17.4',
          managedBy: 'butler',
        },
        {
          name: 'metallb',
          status: 'Installing',
          version: '0.14.9',
          managedBy: 'butler',
        },
        {
          name: 'cert-manager',
          status: 'Pending',
          version: '1.17.2',
          managedBy: 'butler',
        },
      ],
    },
    conditions: [
      cond(
        'ControlPlaneReady',
        'True',
        'ControlPlaneReady',
        'Control plane is reachable',
      ),
      cond(
        'InfrastructureReady',
        'True',
        'InfrastructureReady',
        'All machines are running',
      ),
      cond('WorkersReady', 'True', 'WorkersReady', '2 of 2 worker nodes ready'),
      cond(
        'AddonsReady',
        'False',
        'AddonsInstalling',
        'Installing metallb (1 of 2 remaining)',
        '2026-08-22T11:10:00Z',
      ),
      cond(
        'Ready',
        'False',
        'Installing',
        'Platform addons are being installed',
      ),
    ],
  },
});

/** Healthy, fully converged cluster. */
export const readyCluster: Cluster = makeCluster({
  name: 'ready-delta',
  uid: '0a1b2c3d-0004-4000-8000-000000000004',
  resourceVersion: '1842',
  creationTimestamp: '2026-07-30T08:12:00Z',
  workers: 3,
  cpu: 8,
  memory: '16Gi',
  diskSize: '100Gi',
  workspacesEnabled: true,
  status: {
    phase: 'Ready',
    tenantNamespace: 'tc-ready-delta',
    controlPlaneEndpoint: 'https://10.40.20.13:6443',
    observedGeneration: 4,
    lastTransitionTime: '2026-07-30T08:41:00Z',
    workerNodesReady: 3,
    workerNodesDesired: 3,
    observedState: {
      kubernetesVersion: 'v1.33.2',
      workers: {
        desired: 3,
        ready: 3,
        nodes: [
          'ready-delta-worker-0',
          'ready-delta-worker-1',
          'ready-delta-worker-2',
        ],
      },
      addons: [
        {
          name: 'cilium',
          status: 'Healthy',
          version: '1.17.4',
          managedBy: 'butler',
        },
        {
          name: 'metallb',
          status: 'Healthy',
          version: '0.14.9',
          managedBy: 'butler',
        },
        {
          name: 'cert-manager',
          status: 'Healthy',
          version: '1.17.2',
          managedBy: 'butler',
        },
        {
          name: 'longhorn',
          status: 'Healthy',
          version: '1.8.1',
          managedBy: 'butler',
        },
      ],
    },
    conditions: [
      cond(
        'ControlPlaneReady',
        'True',
        'ControlPlaneReady',
        'Control plane is reachable',
        '2026-07-30T08:20:00Z',
      ),
      cond(
        'InfrastructureReady',
        'True',
        'InfrastructureReady',
        'All machines are running',
        '2026-07-30T08:32:00Z',
      ),
      cond(
        'WorkersReady',
        'True',
        'WorkersReady',
        '3 of 3 worker nodes ready',
        '2026-07-30T08:35:00Z',
      ),
      cond(
        'AddonsReady',
        'True',
        'AddonsReady',
        'All platform addons are healthy',
        '2026-07-30T08:41:00Z',
      ),
      cond(
        'Ready',
        'True',
        'ClusterReady',
        'Cluster is ready for use',
        '2026-07-30T08:41:00Z',
      ),
    ],
  },
});

/** Ready but the last reconcile reported a non-fatal problem. */
export const degradedCluster: Cluster = makeCluster({
  name: 'degraded-echo',
  uid: '0a1b2c3d-0005-4000-8000-000000000005',
  resourceVersion: '2210',
  creationTimestamp: '2026-07-18T14:00:00Z',
  workers: 2,
  status: {
    phase: 'Ready',
    tenantNamespace: 'tc-degraded-echo',
    controlPlaneEndpoint: 'https://10.40.20.14:6443',
    workerNodesReady: 2,
    workerNodesDesired: 2,
    observedState: {
      workers: {
        desired: 2,
        ready: 2,
        nodes: ['degraded-echo-worker-0', 'degraded-echo-worker-1'],
      },
      addons: [
        {
          name: 'cilium',
          status: 'Healthy',
          version: '1.17.4',
          managedBy: 'butler',
        },
        {
          name: 'metallb',
          status: 'Degraded',
          version: '0.14.9',
          managedBy: 'butler',
        },
      ],
    },
    conditions: [
      cond(
        'ControlPlaneReady',
        'True',
        'ControlPlaneReady',
        'Control plane is reachable',
      ),
      cond(
        'InfrastructureReady',
        'True',
        'InfrastructureReady',
        'All machines are running',
      ),
      cond('WorkersReady', 'True', 'WorkersReady', '2 of 2 worker nodes ready'),
      cond(
        'AddonsReady',
        'False',
        'AddonDegraded',
        'metallb speaker DaemonSet has 1 unavailable pod',
        '2026-08-22T09:03:00Z',
      ),
      cond(
        'Ready',
        'True',
        'ReconcileDegraded',
        'Cluster is serving traffic but the last reconcile reported: metallb speaker DaemonSet has 1 unavailable pod',
        '2026-08-22T09:03:00Z',
      ),
    ],
  },
});

/** Ready after a scale-down; old nodes are still draining, so ready > desired. */
export const staleNodesCluster: Cluster = makeCluster({
  name: 'scaling-foxtrot',
  uid: '0a1b2c3d-0006-4000-8000-000000000006',
  resourceVersion: '3101',
  creationTimestamp: '2026-07-02T16:30:00Z',
  workers: 2,
  status: {
    phase: 'Ready',
    tenantNamespace: 'tc-scaling-foxtrot',
    controlPlaneEndpoint: 'https://10.40.20.15:6443',
    workerNodesReady: 4,
    workerNodesDesired: 2,
    observedState: {
      workers: {
        desired: 2,
        ready: 4,
        nodes: [
          'scaling-foxtrot-worker-0',
          'scaling-foxtrot-worker-1',
          'scaling-foxtrot-worker-2',
          'scaling-foxtrot-worker-3',
        ],
      },
    },
    conditions: [
      cond(
        'ControlPlaneReady',
        'True',
        'ControlPlaneReady',
        'Control plane is reachable',
      ),
      cond(
        'InfrastructureReady',
        'True',
        'InfrastructureReady',
        'All machines are running',
      ),
      cond(
        'WorkersReady',
        'True',
        'WorkersScalingDown',
        '4 of 2 worker nodes ready; 2 machines are draining',
        '2026-08-22T11:30:00Z',
      ),
      cond('Ready', 'True', 'ClusterReady', 'Cluster is ready for use'),
    ],
  },
});

/** Provisioning failed; the Ready condition carries the failure message. */
export const failedCluster: Cluster = makeCluster({
  name: 'failed-golf',
  uid: '0a1b2c3d-0007-4000-8000-000000000007',
  resourceVersion: '512',
  creationTimestamp: '2026-08-21T19:05:00Z',
  kubernetesVersion: 'v1.34.0',
  workers: 3,
  status: {
    phase: 'Failed',
    tenantNamespace: 'tc-failed-golf',
    workerNodesReady: 0,
    workerNodesDesired: 3,
    conditions: [
      cond(
        'InfrastructureReady',
        'False',
        'ImageSyncFailed',
        'ImageSync talos-1.11.0-harvester-lab failed: image not found in registry',
        '2026-08-21T19:12:00Z',
      ),
      cond(
        'ControlPlaneReady',
        'False',
        'WaitingForInfrastructure',
        'Infrastructure is not ready',
        '2026-08-21T19:05:00Z',
      ),
      cond(
        'WorkersReady',
        'False',
        'WaitingForInfrastructure',
        '0 of 3 worker nodes ready',
        '2026-08-21T19:05:00Z',
      ),
      cond(
        'Ready',
        'False',
        'ProvisioningFailed',
        'Failed to provision infrastructure: OS image talos-1.11.0 is not available on provider harvester-lab',
        '2026-08-21T19:12:00Z',
      ),
    ],
  },
});

/** Deletion requested; finalizers are still running. */
export const deletingCluster: Cluster = makeCluster({
  name: 'deleting-hotel',
  uid: '0a1b2c3d-0008-4000-8000-000000000008',
  resourceVersion: '4020',
  creationTimestamp: '2026-06-11T10:00:00Z',
  workers: 1,
  status: {
    phase: 'Deleting',
    tenantNamespace: 'tc-deleting-hotel',
    controlPlaneEndpoint: 'https://10.40.20.16:6443',
    workerNodesReady: 1,
    workerNodesDesired: 1,
    conditions: [
      cond(
        'Ready',
        'False',
        'Deleting',
        'Waiting for CAPI machines to be deleted (2 remaining)',
        '2026-08-22T11:55:00Z',
      ),
    ],
  },
});

export const fixtureClusters: Cluster[] = [
  pendingCluster,
  provisioningCluster,
  installingCluster,
  readyCluster,
  degradedCluster,
  staleNodesCluster,
  failedCluster,
  deletingCluster,
];

// ---------------------------------------------------------------------------
// Teams and identity
// ---------------------------------------------------------------------------

export const fixtureTeams: TeamInfo[] = [
  {
    name: FIXTURE_TEAM,
    displayName: 'Platform Engineering',
    namespace: FIXTURE_NAMESPACE,
    role: 'admin',
    clusterCount: fixtureClusters.length,
  },
  {
    name: 'data',
    displayName: 'Data Platform',
    namespace: 'team-data',
    role: 'viewer',
    clusterCount: 0,
  },
];

export interface FixtureTeamMember {
  email: string;
  name: string;
  role: string;
  source: 'direct' | 'group';
  groupName?: string;
}

export const fixtureTeamMembers: FixtureTeamMember[] = [
  {
    email: 'ada@example.com',
    name: 'Ada Lovelace',
    role: 'admin',
    source: 'direct',
  },
  {
    email: 'grace@example.com',
    name: 'Grace Hopper',
    role: 'operator',
    source: 'direct',
  },
  {
    email: 'linus@example.com',
    name: 'Linus Torvalds',
    role: 'viewer',
    source: 'group',
    groupName: 'eng-readonly',
  },
];

/** Team CRD-style detail used by TeamSettingsPage and AdminTeamDetailPage. */
export const fixtureTeamDetail = {
  metadata: {
    name: FIXTURE_TEAM,
    namespace: FIXTURE_NAMESPACE,
    uid: '5e6f7a8b-0001-4000-8000-0000000000aa',
    creationTimestamp: '2026-05-01T09:00:00Z',
    labels: { 'butler.dev/managed': 'true' },
  },
  spec: {
    displayName: 'Platform Engineering',
    description: 'Owns the shared Kubernetes platform and lab clusters.',
    resourceQuotas: {
      maxClusters: 10,
      maxWorkersPerCluster: 8,
      maxTotalWorkers: 40,
      maxNodesPerCluster: 8,
      maxTotalNodes: 40,
    },
    access: {
      users: fixtureTeamMembers
        .filter(m => m.source === 'direct')
        .map(m => ({ email: m.email, role: m.role })),
      groups: [{ name: 'eng-readonly', role: 'viewer' }],
    },
  },
  status: {
    phase: 'Active',
    namespace: FIXTURE_NAMESPACE,
    clusterCount: fixtureClusters.length,
  },
};

export const fixtureGroupSyncs = [
  { name: 'eng-readonly', role: 'viewer', identityProvider: 'corp-oidc' },
];

export const fixtureIdentity = {
  authenticated: true,
  email: 'ada@example.com',
  displayName: 'Ada Lovelace',
  isPlatformAdmin: true,
  teams: fixtureTeams,
};

export const fixtureCurrentUser = {
  username: 'ada',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  displayName: 'Ada Lovelace',
  isAdmin: true,
  isPlatformAdmin: true,
  role: 'admin',
  provider: 'oidc',
  teams: fixtureTeams.map(t => ({
    name: t.name,
    displayName: t.displayName,
    role: t.role,
  })),
};

export const fixtureUsers = [
  {
    username: 'ada',
    email: 'ada@example.com',
    displayName: 'Ada Lovelace',
    phase: 'Active',
    authType: 'sso',
    isAdmin: true,
    teams: [{ name: FIXTURE_TEAM, role: 'admin' }],
    createdAt: '2026-05-01T09:00:00Z',
  },
  {
    username: 'grace',
    email: 'grace@example.com',
    displayName: 'Grace Hopper',
    phase: 'Active',
    authType: 'sso',
    isAdmin: false,
    teams: [{ name: FIXTURE_TEAM, role: 'operator' }],
    createdAt: '2026-05-03T09:00:00Z',
  },
  {
    username: 'invitee',
    email: 'invitee@example.com',
    displayName: 'Pending Invitee',
    phase: 'Pending',
    authType: 'internal',
    isAdmin: false,
    teams: [],
    createdAt: '2026-08-20T09:00:00Z',
  },
];

// ---------------------------------------------------------------------------
// Nodes and events (keyed by cluster name)
// ---------------------------------------------------------------------------

function node(
  name: string,
  role: 'control-plane' | 'worker',
  ip: string,
  ready = true,
): Node {
  return {
    name,
    status: ready ? 'Ready' : 'NotReady',
    roles: [role],
    version: 'v1.33.2',
    internalIP: ip,
    os: 'Talos (v1.10.5)',
    containerRuntime: 'containerd://2.0.5',
    cpu: role === 'control-plane' ? '2' : '8',
    memory: role === 'control-plane' ? '4Gi' : '16Gi',
    age: '23d',
  };
}

export const fixtureNodes: Record<string, Node[]> = {
  'ready-delta': [
    node('ready-delta-cp-0', 'control-plane', '10.40.21.10'),
    node('ready-delta-cp-1', 'control-plane', '10.40.21.11'),
    node('ready-delta-cp-2', 'control-plane', '10.40.21.12'),
    node('ready-delta-worker-0', 'worker', '10.40.21.20'),
    node('ready-delta-worker-1', 'worker', '10.40.21.21'),
    node('ready-delta-worker-2', 'worker', '10.40.21.22'),
  ],
  'degraded-echo': [
    node('degraded-echo-cp-0', 'control-plane', '10.40.22.10'),
    node('degraded-echo-worker-0', 'worker', '10.40.22.20'),
    node('degraded-echo-worker-1', 'worker', '10.40.22.21'),
  ],
  'scaling-foxtrot': [
    node('scaling-foxtrot-cp-0', 'control-plane', '10.40.23.10'),
    node('scaling-foxtrot-worker-0', 'worker', '10.40.23.20'),
    node('scaling-foxtrot-worker-1', 'worker', '10.40.23.21'),
    node('scaling-foxtrot-worker-2', 'worker', '10.40.23.22'),
    node('scaling-foxtrot-worker-3', 'worker', '10.40.23.23'),
  ],
  'provisioning-bravo': [
    node('provisioning-bravo-cp-0', 'control-plane', '10.40.24.10'),
    node('provisioning-bravo-worker-0', 'worker', '10.40.24.20'),
    node('provisioning-bravo-worker-1', 'worker', '10.40.24.21', false),
  ],
  'installing-charlie': [
    node('installing-charlie-cp-0', 'control-plane', '10.40.25.10'),
    node('installing-charlie-worker-0', 'worker', '10.40.25.20'),
    node('installing-charlie-worker-1', 'worker', '10.40.25.21'),
  ],
};

function event(
  type: 'Normal' | 'Warning',
  reason: string,
  message: string,
  count = 1,
  lastTimestamp = '2026-08-22T11:50:00Z',
): ClusterEvent {
  return {
    type,
    reason,
    message,
    source: 'tenantcluster-controller',
    firstTimestamp: '2026-08-22T11:40:00Z',
    lastTimestamp,
    count,
  };
}

export const fixtureEvents: Record<string, ClusterEvent[]> = {
  'ready-delta': [
    event('Normal', 'Reconciled', 'Successfully reconciled TenantCluster', 42),
    event('Normal', 'AddonInstalled', 'Installed addon longhorn 1.8.1'),
  ],
  'provisioning-bravo': [
    event(
      'Normal',
      'InfrastructureCreated',
      'Created CAPI Cluster tc-provisioning-bravo/provisioning-bravo',
    ),
    event(
      'Normal',
      'MachineBooting',
      'Machine provisioning-bravo-worker-1 is booting',
      3,
    ),
  ],
  'degraded-echo': [
    event(
      'Warning',
      'AddonDegraded',
      'metallb speaker DaemonSet has 1 unavailable pod',
      7,
    ),
  ],
  'failed-golf': [
    event(
      'Warning',
      'ImageSyncFailed',
      'image talos-1.11.0 not found in registry',
      5,
      '2026-08-21T19:12:00Z',
    ),
    event(
      'Warning',
      'ProvisioningFailed',
      'Giving up after 5 attempts',
      1,
      '2026-08-21T19:12:00Z',
    ),
  ],
  'deleting-hotel': [
    event(
      'Normal',
      'Deleting',
      'Waiting for CAPI machines to be deleted (2 remaining)',
      4,
      '2026-08-22T11:55:00Z',
    ),
  ],
};

// ---------------------------------------------------------------------------
// Addons
// ---------------------------------------------------------------------------

function addonDef(
  name: string,
  displayName: string,
  category: AddonDefinition['category'],
  chartRepository: string,
  chartName: string,
  defaultVersion: string,
  platform: boolean,
  description: string,
  extra: Partial<AddonDefinition> = {},
): AddonDefinition {
  return {
    name,
    displayName,
    description,
    category,
    chartRepository,
    chartName,
    defaultVersion,
    availableVersions: [defaultVersion],
    defaultNamespace: name,
    platform,
    source: 'builtin',
    ...extra,
  };
}

export const fixtureAddonCatalog: AddonDefinition[] = [
  addonDef(
    'cilium',
    'Cilium',
    'cni',
    'https://helm.cilium.io',
    'cilium',
    '1.17.4',
    true,
    'eBPF-based CNI',
  ),
  addonDef(
    'metallb',
    'MetalLB',
    'loadbalancer',
    'https://metallb.github.io/metallb',
    'metallb',
    '0.14.9',
    true,
    'Bare-metal load balancer',
  ),
  addonDef(
    'cert-manager',
    'cert-manager',
    'certmanager',
    'https://charts.jetstack.io',
    'cert-manager',
    '1.17.2',
    true,
    'X.509 certificate automation',
  ),
  addonDef(
    'longhorn',
    'Longhorn',
    'storage',
    'https://charts.longhorn.io',
    'longhorn',
    '1.8.1',
    false,
    'Distributed block storage',
  ),
  addonDef(
    'ingress-nginx',
    'Ingress NGINX',
    'ingress',
    'https://kubernetes.github.io/ingress-nginx',
    'ingress-nginx',
    '4.12.1',
    false,
    'NGINX ingress controller',
    {
      dependsOn: ['metallb'],
    },
  ),
  addonDef(
    'kube-prometheus-stack',
    'Prometheus Stack',
    'observability',
    'https://prometheus-community.github.io/helm-charts',
    'kube-prometheus-stack',
    '72.3.0',
    false,
    'Prometheus, Alertmanager and Grafana',
    {
      availableVersions: ['72.3.0', '71.2.0'],
      defaultNamespace: 'monitoring',
    },
  ),
  addonDef(
    'velero',
    'Velero',
    'backup',
    'https://vmware-tanzu.github.io/helm-charts',
    'velero',
    '9.1.1',
    false,
    'Cluster backup and restore',
  ),
  addonDef(
    'flux',
    'Flux CD',
    'gitops',
    'oci://ghcr.io/fluxcd-community/charts',
    'flux2',
    '2.15.0',
    false,
    'GitOps toolkit',
    {
      defaultNamespace: 'flux-system',
    },
  ),
];

export const fixtureAddonCategories: CategoryInfo[] =
  Object.values(CATEGORY_INFO);

function installed(
  name: string,
  status: InstalledAddon['status'],
  version: string,
  managedBy: InstalledAddon['managedBy'] = 'butler',
  message?: string,
): InstalledAddon {
  return {
    name,
    displayName:
      fixtureAddonCatalog.find(a => a.name === name)?.displayName ?? name,
    status,
    phase: status,
    version,
    installedVersion:
      status === 'Installed' || status === 'Degraded' ? version : undefined,
    managedBy,
    namespace: name,
    message,
    helmRelease: {
      name,
      namespace: name,
      revision: 1,
      status: status === 'Installed' ? 'deployed' : status.toLowerCase(),
    },
  };
}

export const fixtureInstalledAddons: Record<string, InstalledAddon[]> = {
  'ready-delta': [
    installed('cilium', 'Installed', '1.17.4', 'platform'),
    installed('metallb', 'Installed', '0.14.9', 'platform'),
    installed('cert-manager', 'Installed', '1.17.2', 'platform'),
    installed('longhorn', 'Installed', '1.8.1'),
  ],
  'degraded-echo': [
    installed('cilium', 'Installed', '1.17.4', 'platform'),
    installed(
      'metallb',
      'Degraded',
      '0.14.9',
      'platform',
      'speaker DaemonSet has 1 unavailable pod',
    ),
  ],
  'installing-charlie': [
    installed('cilium', 'Installed', '1.17.4', 'platform'),
    installed('metallb', 'Installing', '0.14.9', 'platform'),
    installed('cert-manager', 'Pending', '1.17.2', 'platform'),
  ],
};

// ---------------------------------------------------------------------------
// Certificates
// ---------------------------------------------------------------------------

function cert(
  category: CertificateCategory,
  secretName: string,
  subject: string,
  daysUntilExpiry: number,
  isCA = false,
): CertificateInfo {
  const now = new Date(FIXTURE_NOW).getTime();
  const day = 24 * 60 * 60 * 1000;
  const ageInDays = 365 - daysUntilExpiry;
  let healthStatus: CertificateInfo['healthStatus'] = 'Healthy';
  if (daysUntilExpiry < 0) healthStatus = 'Expired';
  else if (daysUntilExpiry <= 7) healthStatus = 'Critical';
  else if (daysUntilExpiry <= 30) healthStatus = 'Warning';
  return {
    secretName,
    secretKey: 'tls.crt',
    category,
    subject,
    issuer: isCA ? subject : 'CN=kubernetes',
    notBefore: new Date(now - ageInDays * day).toISOString(),
    notAfter: new Date(now + daysUntilExpiry * day).toISOString(),
    serialNumber: `0x${secretName.length.toString(16).padStart(4, '0')}`,
    isCA,
    dnsNames: isCA ? undefined : ['kubernetes', 'kubernetes.default.svc'],
    ipAddresses: category === 'apiserver' ? ['10.40.20.13'] : undefined,
    daysUntilExpiry,
    healthStatus,
    ageInDays,
  };
}

export function makeFixtureCertificates(
  clusterName: string,
): ClusterCertificates {
  const categories: Record<CertificateCategory, CertificateInfo[]> = {
    apiserver: [
      cert(
        'apiserver',
        `${clusterName}-api-server-certificate`,
        'CN=kube-apiserver',
        301,
      ),
    ],
    kubeconfig: [
      cert(
        'kubeconfig',
        `${clusterName}-admin-kubeconfig`,
        'CN=kubernetes-admin,O=system:masters',
        301,
      ),
      cert(
        'kubeconfig',
        `${clusterName}-controller-manager-kubeconfig`,
        'CN=system:kube-controller-manager',
        301,
      ),
      cert(
        'kubeconfig',
        `${clusterName}-scheduler-kubeconfig`,
        'CN=system:kube-scheduler',
        301,
      ),
    ],
    ca: [cert('ca', `${clusterName}-ca`, 'CN=kubernetes', 3287, true)],
    'front-proxy': [
      cert(
        'front-proxy',
        `${clusterName}-front-proxy-ca-certificate`,
        'CN=front-proxy-ca',
        3287,
        true,
      ),
      cert(
        'front-proxy',
        `${clusterName}-front-proxy-client-certificate`,
        'CN=front-proxy-client',
        21,
      ),
    ],
    'service-account': [
      cert(
        'service-account',
        `${clusterName}-sa-certificate`,
        'CN=service-account',
        3287,
      ),
    ],
    datastore: [
      cert(
        'datastore',
        `${clusterName}-datastore-certificate`,
        'CN=etcd-client',
        301,
      ),
    ],
    konnectivity: [
      cert(
        'konnectivity',
        `${clusterName}-konnectivity-certificate`,
        'CN=konnectivity-server',
        5,
      ),
    ],
  };
  const all = Object.values(categories).flat();
  const earliest = all.reduce((a, b) =>
    a.daysUntilExpiry <= b.daysUntilExpiry ? a : b,
  );
  return {
    clusterName,
    namespace: FIXTURE_NAMESPACE,
    tcpNamespace: `tc-${clusterName}`,
    categories,
    overallHealth: earliest.healthStatus,
    earliestExpiry: earliest.notAfter,
    rotationInProgress: false,
    lastRotation: fixtureCompletedRotation,
    certificateCount: all.length,
  };
}

export const fixtureCompletedRotation: RotationEvent = {
  type: 'kubeconfigs',
  initiatedBy: 'ada@example.com',
  initiatedAt: '2026-08-01T10:00:00Z',
  completedAt: '2026-08-01T10:02:30Z',
  status: 'completed',
  affectedSecrets: ['ready-delta-admin-kubeconfig'],
  message: 'Rotation completed',
};

// ---------------------------------------------------------------------------
// GitOps
// ---------------------------------------------------------------------------

export const fixtureGitProviderConfig: GitProviderConfig = {
  configured: true,
  type: 'github',
  url: 'https://github.com',
  username: 'butler-bot',
  organization: 'butler-lab',
};

export const fixtureGitOpsStatus: Record<string, GitOpsStatus> = {
  'ready-delta': {
    enabled: true,
    provider: 'flux',
    repository: 'butler-lab/clusters',
    branch: 'main',
    path: 'clusters/ready-delta',
    status: 'Ready',
    version: 'v2.15.0',
    providerStatus: {
      provider: 'flux',
      installed: true,
      ready: true,
      version: 'v2.15.0',
      components: [
        'source-controller',
        'kustomize-controller',
        'helm-controller',
      ],
      repository: 'butler-lab/clusters',
      branch: 'main',
      path: 'clusters/ready-delta',
    },
  },
};

export const fixtureDisabledGitOps: GitOpsStatus = { enabled: false };

export const fixtureRepositories = [
  {
    name: 'clusters',
    fullName: 'butler-lab/clusters',
    defaultBranch: 'main',
    private: true,
    cloneUrl: 'https://github.com/butler-lab/clusters.git',
    sshUrl: 'git@github.com:butler-lab/clusters.git',
    htmlUrl: 'https://github.com/butler-lab/clusters',
    updatedAt: '2026-08-21T08:00:00Z',
  },
];

export const fixtureBranches = [
  {
    name: 'main',
    sha: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
    protected: true,
  },
  {
    name: 'staging',
    sha: 'b2c3d4e5f60718293a4b5c6d7e8f901234567890',
    protected: false,
  },
];

// ---------------------------------------------------------------------------
// Management cluster
// ---------------------------------------------------------------------------

export const fixtureManagement: ManagementCluster = {
  name: 'butler-mgmt',
  kubernetesVersion: 'v1.33.2',
  phase: 'Ready',
  nodes: { total: 3, ready: 3 },
  systemNamespaces: [
    { namespace: 'butler-system', running: 6, total: 6 },
    { namespace: 'capi-system', running: 4, total: 4 },
    { namespace: 'kube-system', running: 14, total: 14 },
  ],
  tenantClusters: fixtureClusters.length,
  tenantNamespaces: fixtureClusters
    .filter(c => c.status?.tenantNamespace)
    .map(c => ({
      name: c.metadata.name,
      namespace: c.metadata.namespace,
      tenantNamespace: c.status!.tenantNamespace!,
      phase: c.status?.phase ?? 'Unknown',
    })),
};

export const fixtureManagementNodes: ManagementNode[] = [
  node('butler-mgmt-cp-0', 'control-plane', '10.40.10.10'),
  node('butler-mgmt-cp-1', 'control-plane', '10.40.10.11'),
  node('butler-mgmt-cp-2', 'control-plane', '10.40.10.12'),
];

export const fixtureManagementPods: Record<string, ManagementPod[]> = {
  'butler-system': [
    {
      name: 'butler-controller-manager-7c9d8f6b5-x2k9q',
      namespace: 'butler-system',
      status: 'Running',
      ready: '1/1',
      restarts: 0,
      age: '12d',
    },
    {
      name: 'butler-server-5f8b7c6d4-p4m2n',
      namespace: 'butler-system',
      status: 'Running',
      ready: '1/1',
      restarts: 1,
      age: '12d',
    },
  ],
};

// ---------------------------------------------------------------------------
// Providers and identity providers
// ---------------------------------------------------------------------------

export const fixtureProviders: Provider[] = [
  {
    metadata: {
      name: FIXTURE_PROVIDER,
      namespace: 'butler-system',
      uid: '7b8c9d0e-0001-4000-8000-0000000000bb',
      creationTimestamp: '2026-05-01T09:30:00Z',
    },
    spec: {
      provider: 'harvester',
      credentialsRef: {
        name: 'harvester-lab-kubeconfig',
        namespace: 'butler-system',
        key: 'kubeconfig',
      },
    },
    status: {
      validated: true,
      lastValidationTime: '2026-08-22T06:00:00Z',
      conditions: [
        {
          type: 'Ready',
          status: 'True',
          reason: 'Validated',
          message: 'Provider credentials validated',
        },
      ],
    },
  },
];

export const fixtureIdentityProviders: IdentityProvider[] = [
  {
    metadata: {
      name: 'corp-oidc',
      uid: '8c9d0e1f-0001-4000-8000-0000000000cc',
      creationTimestamp: '2026-05-02T09:00:00Z',
    },
    spec: {
      type: 'oidc',
      displayName: 'Corporate SSO',
      oidc: {
        issuerURL: 'https://login.example.com',
        clientID: 'butler-portal',
        clientSecretRef: {
          name: 'corp-oidc-client-secret',
          namespace: 'butler-system',
          key: 'clientSecret',
        },
        redirectURL: 'https://butler.example.com/auth/callback',
        scopes: ['openid', 'profile', 'email', 'groups'],
        groupsClaim: 'groups',
        emailClaim: 'email',
      },
    },
    status: {
      phase: 'Ready',
      message: 'Discovery succeeded',
      lastValidatedTime: '2026-08-22T06:00:00Z',
    },
  },
];

export const fixturePlatformConfig: PlatformConfig = {
  multiTenancy: { mode: 'Optional' },
  defaultNamespace: 'butler-tenants',
  defaultProviderRef: { name: 'harvester' },
  controlPlaneExposure: {
    mode: 'LoadBalancer',
    hostname: '*.k8s.example.test',
    ingressClassName: 'traefik',
    controllerType: 'traefik',
    gatewayRef: 'steward-system/steward-gateway',
  },
  defaultTeamLimits: {
    maxClusters: 10,
    maxWorkersPerCluster: 20,
    maxTotalCPU: '200',
    maxTotalMemory: '800Gi',
  },
  imageFactory: {
    url: 'https://factory.example.test',
    credentialsRef: '',
    defaultSchematicID: '',
    autoSync: true,
  },
  status: {
    teamCount: 1,
    clusterCount: 8,
    controlPlaneExposureMode: 'LoadBalancer',
    tcpProxyRequired: false,
  },
};
