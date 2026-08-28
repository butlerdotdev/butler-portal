// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * In-memory implementation of ButlerApi backed by the fixtures in
 * ./fixtures/clusters. Used by the dev harness (dev/index.tsx) and by
 * component tests so the plugin can run without butler-server.
 *
 * Mutations update the in-memory state so the UI sees realistic
 * lifecycle transitions:
 *   - createCluster adds a Pending cluster
 *   - deleteCluster moves the cluster to Deleting, then removes it on the
 *     next getCluster/listClusters call
 *   - scaleCluster sets the desired replica count and advances
 *     workerNodesReady by one on each subsequent getCluster call
 *   - rotateCertificates reports in_progress, then completed on the next
 *     getRotationStatus poll
 *
 * Methods the UI never calls throw "not implemented in MockButlerApi" so
 * gaps are visible rather than silent.
 */

import type { PlatformConfig } from './types/config';
import type {
  MachineRequest,
  MachineRequestListResponse,
  LoadBalancerRequest,
  LoadBalancerRequestListResponse,
} from './types/machines';
import type { TenantControlPlaneSummary } from './types/steward';
import type { ButlerApi } from './ButlerApi';
import { ButlerApiError } from './ButlerApiError';
import { ENVIRONMENT_LABEL, compareVersions } from '../utils/environment';
import type { ButlerFieldError } from './ButlerApiError';
import type { ButlerIdentity } from './fixtures/identities';
import type {
  NetworkPool,
  NetworkPoolListResponse,
  IPAllocation,
  IPAllocationListResponse,
} from './types/networks';
import { fixturePools, fixtureAllocations } from './fixtures/networks';
import { fixtureEnvironments } from './fixtures/environments';
import { fixturePolicies } from './fixtures/policies';
import type { ObservabilityConfig } from './types/observability';

/** A registered pipeline with every endpoint set, as on the estate. */
export const fixtureObservabilityConfig: ObservabilityConfig = {
  configured: true,
  pipeline: {
    clusterName: 'pipelines',
    clusterNamespace: 'platform-engineering',
    logEndpoint: 'http://10.40.2.29:8080',
    metricEndpoint: 'http://10.40.2.29:9000',
    traceEndpoint: 'http://10.40.2.41:4318',
  },
  collection: {
    autoEnroll: { vectorAgent: true, prometheus: false, otelCollector: false },
    logs: { podLogs: true, journald: false, kubernetesEvents: true },
    metrics: { enabled: true, retention: '2h' },
  },
};
import type {
  ClusterCreationPolicy,
  PolicyListResponse,
} from './types/policies';
import type {
  CAInfoResponse,
  UpdateProviderRequest,
  OptionListScope,
  ProviderClusterListResponse,
  StorageContainerListResponse,
} from './types/providers';
import type {
  EnvironmentClusterDefaults,
  EnvironmentRequest,
  TeamClusterContext,
  TeamEnvironment,
} from './types/environments';
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
  UpdateClusterRequest,
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
import {
  FIXTURE_NAMESPACE,
  FIXTURE_NOW,
  fixtureClusters,
  fixtureTeams,
  fixtureTeamMembers,
  fixtureTeamDetail,
  fixtureGroupSyncs,
  fixtureIdentity,
  fixtureCurrentUser,
  fixtureUsers,
  fixtureNodes,
  fixtureEvents,
  fixtureAddonCatalog,
  fixtureAddonCategories,
  fixtureInstalledAddons,
  makeFixtureCertificates,
  fixtureCompletedRotation,
  fixtureGitProviderConfig,
  fixtureGitOpsStatus,
  fixtureDisabledGitOps,
  fixtureRepositories,
  fixtureBranches,
  fixtureManagement,
  fixtureManagementNodes,
  fixtureManagementPods,
  fixtureProviders,
  fixtureOtherTeamProvider,
  fixtureIdentityProviders,
  fixturePlatformConfig,
} from './fixtures/clusters';
import type { FixtureTeamMember } from './fixtures/clusters';

export type ButlerApiMethod = {
  [K in keyof ButlerApi]: ButlerApi[K] extends (...args: any[]) => any
    ? K
    : never;
}[keyof ButlerApi];

export interface MockButlerApiOptions {
  /** Providers the mock starts with, across every scope. */
  providers?: Provider[];
  /** Cluster creation policies the mock starts with. */
  policies?: ClusterCreationPolicy[];
  /** Platform observability config; `null` answers 404 as an unregistered pipeline does. */
  observabilityConfig?: ObservabilityConfig | null;
  /** Team environments the mock starts with. */
  environments?: TeamEnvironment[];
  /** Defaults the team applies to new clusters. */
  teamClusterDefaults?: EnvironmentClusterDefaults;
  /** Methods that should reject with the given error instead of running. */
  failures?: Partial<Record<ButlerApiMethod, Error>>;
  /** Artificial delay applied to every call, in milliseconds. */
  latencyMs?: number;
  /** Override the initial cluster set. Defaults to the fixture clusters. */
  clusters?: Cluster[];
  /** Override the resolved caller identity. Defaults to the fixture identity. */
  identity?: Partial<ButlerIdentity>;
  /** Override the network pools. Defaults to the fixture pool. */
  pools?: NetworkPool[];
  /** Override the IP allocations. Defaults to the fixture allocations. */
  allocations?: IPAllocation[];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function notFound(kind: string, id: string): Error {
  const err = new Error(`${kind} ${id} not found`);
  (err as Error & { status?: number }).status = 404;
  return err;
}

export class MockButlerApi implements ButlerApi {
  private clusters: Cluster[];
  private identity: ButlerIdentity;
  private pools: NetworkPool[];
  private allocations: IPAllocation[];
  private environments: TeamEnvironment[];
  private providers: Provider[];
  private policies: ClusterCreationPolicy[];
  private observabilityConfig: ObservabilityConfig | null;
  private teamClusterDefaults: EnvironmentClusterDefaults | undefined;
  private readonly failures: Partial<Record<ButlerApiMethod, Error>>;
  private readonly latencyMs: number;
  private teamContext: string | null = null;
  private members: FixtureTeamMember[] = clone(fixtureTeamMembers);
  private installedAddons: Record<string, InstalledAddon[]> = clone(
    fixtureInstalledAddons,
  );
  private rotations: Record<string, RotationEvent> = {};
  private gitops: Record<string, GitOpsStatus> = clone(fixtureGitOpsStatus);
  private gitProvider: GitProviderConfig = clone(fixtureGitProviderConfig);
  private managementAddons: ManagementAddon[] = [];
  private users: any[] = clone(fixtureUsers);
  /** Clusters with deletion requested, mapped to the number of reads since. */
  private readonly pendingDelete = new Map<string, number>();
  private readonly scaling = new Set<string>();
  private resourceVersion = 10_000;

  constructor(options: MockButlerApiOptions = {}) {
    this.clusters = clone(options.clusters ?? fixtureClusters);
    this.identity = { ...clone(fixtureIdentity), ...options.identity };
    this.pools = clone(options.pools ?? fixturePools);
    this.allocations = clone(options.allocations ?? fixtureAllocations);
    this.environments = clone(options.environments ?? fixtureEnvironments);
    // The global list carries a provider scoped to another team, so the
    // team-scoped read has something real to exclude.
    this.providers = clone(
      options.providers ?? [...fixtureProviders, fixtureOtherTeamProvider],
    );
    this.policies = clone(options.policies ?? fixturePolicies);
    this.observabilityConfig =
      options.observabilityConfig === undefined
        ? clone(fixtureObservabilityConfig)
        : options.observabilityConfig;
    this.teamClusterDefaults = options.teamClusterDefaults
      ? clone(options.teamClusterDefaults)
      : undefined;
    this.failures = options.failures ?? {};
    this.latencyMs = options.latencyMs ?? 0;
  }

  // ---- internals ----

  private async run<T>(name: ButlerApiMethod, fn: () => T): Promise<T> {
    if (this.latencyMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.latencyMs));
    }
    const failure = this.failures[name];
    if (failure) {
      throw failure;
    }
    return fn();
  }

  private notImplemented(name: ButlerApiMethod): never {
    throw new Error(`not implemented in MockButlerApi: ${name}`);
  }

  private key(namespace: string, name: string): string {
    return `${namespace}/${name}`;
  }

  private findCluster(namespace: string, name: string): Cluster {
    const cluster = this.clusters.find(
      c => c.metadata.namespace === namespace && c.metadata.name === name,
    );
    if (!cluster) {
      throw notFound('cluster', this.key(namespace, name));
    }
    return cluster;
  }

  private bump(cluster: Cluster): void {
    this.resourceVersion += 1;
    cluster.metadata.resourceVersion = String(this.resourceVersion);
  }

  private setCondition(
    cluster: Cluster,
    type: string,
    status: 'True' | 'False' | 'Unknown',
    reason: string,
    message: string,
  ): void {
    cluster.status = cluster.status ?? {};
    const conditions = cluster.status.conditions ?? [];
    const next = {
      type,
      status,
      reason,
      message,
      lastTransitionTime: FIXTURE_NOW,
    };
    const idx = conditions.findIndex(c => c.type === type);
    if (idx >= 0) {
      conditions[idx] = next;
    } else {
      conditions.push(next);
    }
    cluster.status.conditions = conditions;
  }

  /**
   * Applies one reconcile step to a cluster. Called on every read so the
   * UI's polling observes progress: Deleting clusters disappear, scaled
   * clusters gain one ready worker per read until they converge.
   */
  private advance(cluster: Cluster): Cluster | undefined {
    const status = cluster.status;
    if (!status) return cluster;

    const id = this.key(cluster.metadata.namespace, cluster.metadata.name);
    const reads = this.pendingDelete.get(id);
    if (reads !== undefined) {
      // First read after deleteCluster still shows Deleting; the next one
      // removes the cluster, mirroring finalizers completing.
      if (reads >= 1) {
        this.pendingDelete.delete(id);
        this.clusters = this.clusters.filter(c => c !== cluster);
        return undefined;
      }
      this.pendingDelete.set(id, reads + 1);
      return cluster;
    }

    if (this.scaling.has(id)) {
      const desired =
        status.workerNodesDesired ?? cluster.spec.workers?.replicas ?? 0;
      const ready = status.workerNodesReady ?? 0;
      if (ready < desired) {
        status.workerNodesReady = ready + 1;
      } else if (ready > desired) {
        status.workerNodesReady = ready - 1;
      }
      const nowReady = status.workerNodesReady ?? 0;
      status.observedState = status.observedState ?? {};
      status.observedState.workers = { desired, ready: nowReady };
      if (nowReady === desired) {
        this.scaling.delete(id);
        status.phase = 'Ready';
        this.setCondition(
          cluster,
          'WorkersReady',
          'True',
          'WorkersReady',
          `${nowReady} of ${desired} worker nodes ready`,
        );
        this.setCondition(
          cluster,
          'Ready',
          'True',
          'ClusterReady',
          'Cluster is ready for use',
        );
      } else {
        this.setCondition(
          cluster,
          'WorkersReady',
          'False',
          nowReady < desired ? 'WorkersProvisioning' : 'WorkersScalingDown',
          `${nowReady} of ${desired} worker nodes ready`,
        );
      }
      this.bump(cluster);
    }
    return cluster;
  }

  // ---- Team context ----

  setTeamContext(team: string | null): void {
    this.teamContext = team;
  }

  getTeamContext(): string | null {
    return this.teamContext;
  }

  // ---- Auth ----

  getCurrentUser(): Promise<any> {
    return this.run('getCurrentUser', () => clone(fixtureCurrentUser));
  }

  getTeams(): Promise<{ teams: TeamInfo[] }> {
    return this.run('getTeams', () => ({ teams: clone(fixtureTeams) }));
  }

  listAllTeams(): Promise<{ teams: TeamInfo[] }> {
    return this.run('listAllTeams', () => ({ teams: clone(fixtureTeams) }));
  }

  getIdentity(): Promise<{
    authenticated: boolean;
    email: string | null;
    displayName: string;
    isPlatformAdmin: boolean;
    teams: TeamInfo[];
  }> {
    return this.run('getIdentity', () => clone(this.identity));
  }

  // ---- Clusters ----

  listClusters(options?: ClusterListOptions): Promise<ClusterListResponse> {
    return this.run('listClusters', () => {
      const team = options?.team ?? this.teamContext;
      const clusters = [...this.clusters]
        .map(c => this.advance(c))
        .filter((c): c is Cluster => !!c)
        .filter(
          c =>
            !options?.namespace || c.metadata.namespace === options.namespace,
        )
        .filter(c => !team || c.spec.teamRef?.name === team);
      return { clusters: clone(clusters) };
    });
  }

  getCluster(namespace: string, name: string): Promise<Cluster> {
    return this.run('getCluster', () => {
      const cluster = this.advance(this.findCluster(namespace, name));
      if (!cluster) {
        throw notFound('cluster', this.key(namespace, name));
      }
      return clone(cluster);
    });
  }

  createCluster(
    data: CreateClusterRequest,
    options?: { environment?: string },
  ): Promise<Cluster> {
    return this.run('createCluster', () => {
      const namespace = data.namespace ?? FIXTURE_NAMESPACE;
      if (
        this.clusters.some(
          c =>
            c.metadata.namespace === namespace && c.metadata.name === data.name,
        )
      ) {
        const err = new Error(
          `cluster ${this.key(namespace, data.name)} already exists`,
        );
        (err as Error & { status?: number }).status = 409;
        throw err;
      }
      this.resourceVersion += 1;
      const replicas = data.workerReplicas ?? 1;
      const cluster: Cluster = {
        metadata: {
          name: data.name,
          namespace,
          uid: `mock-${this.resourceVersion}`,
          resourceVersion: String(this.resourceVersion),
          creationTimestamp: FIXTURE_NOW,
          // The server turns the environment header into this label.
          labels: options?.environment
            ? { [ENVIRONMENT_LABEL]: options.environment }
            : undefined,
        },
        spec: {
          kubernetesVersion: data.kubernetesVersion ?? '1.33.2',
          providerConfigRef: { name: data.providerConfigRef },
          teamRef: data.teamRef ? { name: data.teamRef } : undefined,
          controlPlane: { replicas: 1 },
          workers: {
            replicas,
            machineTemplate: {
              cpu: data.workerCPU,
              memory: data.workerMemory,
              diskSize: data.workerDiskSize,
            },
          },
          networking: {
            loadBalancerPool: {
              // Empty when the platform allocates the range itself.
              start: data.loadBalancerStart ?? '',
              end: data.loadBalancerEnd ?? '',
            },
          },
          workspaces: { enabled: data.workspacesEnabled ?? false },
        },
        status: {
          phase: 'Pending',
          workerNodesReady: 0,
          workerNodesDesired: replicas,
          conditions: [
            {
              type: 'Ready',
              status: 'False',
              reason: 'Pending',
              message:
                'Waiting for the TenantCluster controller to pick up the resource',
              lastTransitionTime: FIXTURE_NOW,
            },
          ],
        },
      };
      this.clusters.push(cluster);
      return clone(cluster);
    });
  }

  deleteCluster(namespace: string, name: string): Promise<void> {
    return this.run('deleteCluster', () => {
      const cluster = this.findCluster(namespace, name);
      cluster.status = cluster.status ?? {};
      cluster.status.phase = 'Deleting';
      this.setCondition(
        cluster,
        'Ready',
        'False',
        'Deleting',
        'Deletion requested',
      );
      this.pendingDelete.set(this.key(namespace, name), 0);
      this.bump(cluster);
    });
  }

  /**
   * Mirrors the server's PUT /clusters/{ns}/{name}: optimistic concurrency,
   * the stable-phase gate, and the field validation, so a test exercises the
   * rules the product will actually meet.
   */
  // ---- Networks and IP allocations ----

  listNetworkPools(): Promise<NetworkPoolListResponse> {
    return this.run('listNetworkPools', () => ({
      pools: clone(this.pools),
    }));
  }

  getNetworkPool(namespace: string, name: string): Promise<NetworkPool> {
    return this.run('getNetworkPool', () => {
      const pool = this.pools.find(
        p => p.metadata.namespace === namespace && p.metadata.name === name,
      );
      if (!pool) throw notFound('network pool', name);
      return clone(pool);
    });
  }

  listPoolAllocations(
    namespace: string,
    name: string,
  ): Promise<IPAllocationListResponse> {
    return this.run('listPoolAllocations', () => ({
      allocations: clone(
        this.allocations.filter(
          a =>
            a.spec.poolRef.name === name &&
            (a.spec.poolRef.namespace ?? namespace) === namespace,
        ),
      ),
    }));
  }

  listAllIPAllocations(): Promise<IPAllocationListResponse> {
    return this.run('listAllIPAllocations', () => ({
      allocations: clone(this.allocations),
    }));
  }

  releaseIPAllocation(namespace: string, name: string): Promise<void> {
    return this.run('releaseIPAllocation', () => {
      const index = this.allocations.findIndex(
        a => a.metadata.namespace === namespace && a.metadata.name === name,
      );
      if (index === -1) throw notFound('ip allocation', name);
      this.allocations.splice(index, 1);
      return undefined as unknown as void;
    });
  }

  updateCluster(
    namespace: string,
    name: string,
    request: UpdateClusterRequest,
  ): Promise<Cluster> {
    return this.run('updateCluster', () => {
      const cluster = this.findCluster(namespace, name);
      if (!request.resourceVersion) {
        throw new ButlerApiError({
          status: 400,
          message:
            'Butler API error (400): resourceVersion is required for optimistic concurrency',
        });
      }
      if (request.resourceVersion !== cluster.metadata.resourceVersion) {
        throw new ButlerApiError({
          status: 409,
          message:
            'Butler API error (409): the cluster changed since it was loaded',
        });
      }
      const phase = cluster.status?.phase ?? '';
      if (phase && phase !== 'Ready' && phase !== 'Pending') {
        throw new ButlerApiError({
          status: 409,
          message: `Butler API error (409): cluster is in ${phase} phase; wait for it to stabilize`,
        });
      }
      const errors: ButlerFieldError[] = [];
      if (request.kubernetesVersion !== undefined) {
        const current = cluster.spec.kubernetesVersion ?? '';
        if (compareVersions(request.kubernetesVersion, current) < 0) {
          errors.push({
            field: 'spec.kubernetesVersion',
            reason: 'downgrades are not supported',
            current,
          });
        }
      }
      const cpReplicas = request.controlPlane?.replicas;
      if (cpReplicas !== undefined) {
        if (cpReplicas !== 1 && cpReplicas !== 3) {
          errors.push({
            field: 'spec.controlPlane.replicas',
            reason: 'must be 1 or 3 (odd numbers required for etcd quorum)',
          });
        } else if (
          cpReplicas === 1 &&
          cluster.spec.controlPlane?.replicas === 3 &&
          !request.acknowledgeDowngrade
        ) {
          errors.push({
            field: 'spec.controlPlane.replicas',
            reason: 'reducing from 3 to 1 requires acknowledgeDowngrade: true',
            current: '3',
          });
        }
      }
      const workerReplicas = request.workers?.replicas;
      if (
        workerReplicas !== undefined &&
        (workerReplicas < 1 || workerReplicas > 100)
      ) {
        errors.push({
          field: 'spec.workers.replicas',
          reason: 'must be between 1 and 100',
        });
      }
      if (errors.length > 0) {
        throw new ButlerApiError({
          status: 400,
          message: 'Butler API error (400): validation failed',
          fieldErrors: errors,
        });
      }
      if (request.infrastructureOverride && !this.identity.isPlatformAdmin) {
        throw new ButlerApiError({
          status: 403,
          message:
            'Butler API error (403): infrastructure overrides require platform admin privileges',
        });
      }
      if (request.kubernetesVersion !== undefined) {
        cluster.spec.kubernetesVersion = request.kubernetesVersion;
      }
      if (cpReplicas !== undefined) {
        cluster.spec.controlPlane = {
          ...(cluster.spec.controlPlane ?? {}),
          replicas: cpReplicas,
        };
      }
      if (request.workers) {
        cluster.spec.workers = {
          ...(cluster.spec.workers ?? { replicas: workerReplicas ?? 1 }),
          ...(workerReplicas !== undefined ? { replicas: workerReplicas } : {}),
          ...(request.workers.machineTemplate
            ? {
                machineTemplate: {
                  ...(cluster.spec.workers?.machineTemplate ?? {}),
                  ...request.workers.machineTemplate,
                },
              }
            : {}),
        };
      }
      this.bump(cluster);
      return clone(cluster);
    });
  }

  /**
   * Mirrors PUT /clusters/{ns}/{name}/environment: the label moves and the
   * migration annotation the admission webhook requires is set.
   */
  changeClusterEnvironment(
    namespace: string,
    name: string,
    environment: string,
  ): Promise<Cluster> {
    return this.run('changeClusterEnvironment', () => {
      const cluster = this.findCluster(namespace, name);
      const labels = { ...(cluster.metadata.labels ?? {}) };
      const target = environment.trim();
      if (target) {
        labels[ENVIRONMENT_LABEL] = target;
      } else {
        delete labels[ENVIRONMENT_LABEL];
      }
      cluster.metadata.labels = labels;
      cluster.metadata.annotations = {
        ...(cluster.metadata.annotations ?? {}),
        'butler.butlerlabs.dev/migration-operation': 'true',
      };
      this.bump(cluster);
      return clone(cluster);
    });
  }

  scaleCluster(
    namespace: string,
    name: string,
    replicas: number,
  ): Promise<Cluster> {
    return this.run('scaleCluster', () => {
      const cluster = this.findCluster(namespace, name);
      cluster.spec.workers = {
        ...(cluster.spec.workers ?? { replicas }),
        replicas,
      };
      cluster.status = cluster.status ?? {};
      cluster.status.workerNodesDesired = replicas;
      cluster.status.workerNodesReady = cluster.status.workerNodesReady ?? 0;
      if (cluster.status.workerNodesReady !== replicas) {
        cluster.status.phase = 'Updating';
        this.scaling.add(this.key(namespace, name));
        this.setCondition(
          cluster,
          'WorkersReady',
          'False',
          cluster.status.workerNodesReady < replicas
            ? 'WorkersProvisioning'
            : 'WorkersScalingDown',
          `${cluster.status.workerNodesReady} of ${replicas} worker nodes ready`,
        );
      }
      this.bump(cluster);
      return clone(cluster);
    });
  }

  getClusterKubeconfig(
    namespace: string,
    name: string,
  ): Promise<{ kubeconfig: string }> {
    return this.run('getClusterKubeconfig', () => {
      const cluster = this.findCluster(namespace, name);
      const server =
        cluster.status?.controlPlaneEndpoint ?? 'https://127.0.0.1:6443';
      return {
        kubeconfig: [
          'apiVersion: v1',
          'kind: Config',
          'clusters:',
          `- name: ${name}`,
          '  cluster:',
          `    server: ${server}`,
          'contexts:',
          `- name: ${name}`,
          '  context:',
          `    cluster: ${name}`,
          '    user: admin',
          `current-context: ${name}`,
          'users:',
          '- name: admin',
          '  user:',
          '    token: mock-token',
          '',
        ].join('\n'),
      };
    });
  }

  getClusterNodes(namespace: string, name: string): Promise<{ nodes: Node[] }> {
    return this.run('getClusterNodes', () => {
      this.findCluster(namespace, name);
      return { nodes: clone(fixtureNodes[name] ?? []) };
    });
  }

  getClusterAddons(
    namespace: string,
    name: string,
  ): Promise<{ addons: Addon[] }> {
    return this.run('getClusterAddons', () => {
      const cluster = this.findCluster(namespace, name);
      return { addons: clone(cluster.status?.observedState?.addons ?? []) };
    });
  }

  getClusterEvents(
    namespace: string,
    name: string,
  ): Promise<{ events: ClusterEvent[] }> {
    return this.run('getClusterEvents', () => {
      this.findCluster(namespace, name);
      return { events: clone(fixtureEvents[name] ?? []) };
    });
  }

  toggleClusterWorkspaces(
    namespace: string,
    name: string,
    enabled: boolean,
  ): Promise<Cluster> {
    return this.run('toggleClusterWorkspaces', () => {
      const cluster = this.findCluster(namespace, name);
      cluster.spec.workspaces = { ...(cluster.spec.workspaces ?? {}), enabled };
      this.bump(cluster);
      return clone(cluster);
    });
  }

  // ---- Management ----

  getManagement(): Promise<ManagementCluster> {
    return this.run('getManagement', () => ({
      ...clone(fixtureManagement),
      tenantClusters: this.clusters.length,
    }));
  }

  getManagementNodes(): Promise<{ nodes: ManagementNode[] }> {
    return this.run('getManagementNodes', () => ({
      nodes: clone(fixtureManagementNodes),
    }));
  }

  getManagementPods(namespace: string): Promise<{ pods: ManagementPod[] }> {
    return this.run('getManagementPods', () => ({
      pods: clone(fixtureManagementPods[namespace] ?? []),
    }));
  }

  // ---- Providers ----

  listProviders(): Promise<ProviderListResponse> {
    return this.run('listProviders', () => ({
      providers: clone(this.providers),
    }));
  }

  /** Mirrors ListTeamProviders: platform scope plus this team's own. */
  listTeamProviders(team: string): Promise<ProviderListResponse> {
    return this.run('listTeamProviders', () => ({
      providers: clone(
        this.providers.filter(p => {
          const scope = p.spec.scope?.type ?? 'platform';
          return scope === 'platform' || p.spec.scope?.teamRef?.name === team;
        }),
      ),
    }));
  }

  deleteTeamProvider(
    team: string,
    namespace: string,
    name: string,
  ): Promise<void> {
    return this.run('deleteTeamProvider', () => {
      const index = this.providers.findIndex(
        p => p.metadata.namespace === namespace && p.metadata.name === name,
      );
      if (index === -1) throw notFound('provider', name);
      const scope = this.providers[index].spec.scope;
      // The server only removes a provider scoped to this very team.
      if (scope?.type !== 'team' || scope.teamRef?.name !== team) {
        throw new ButlerApiError({
          status: 403,
          message:
            'can only delete team-scoped providers belonging to this team',
        });
      }
      this.providers.splice(index, 1);
      return undefined;
    });
  }

  getProvider(namespace: string, name: string): Promise<Provider> {
    return this.run('getProvider', () => {
      const provider = this.providers.find(
        p => p.metadata.namespace === namespace && p.metadata.name === name,
      );
      if (!provider) throw notFound('provider', this.key(namespace, name));
      return clone(provider);
    });
  }

  createProvider(data: CreateProviderRequest): Promise<Provider> {
    return this.run('createProvider', () => {
      const namespace = data.namespace || 'butler-system';
      if (
        this.providers.some(
          p =>
            p.metadata.namespace === namespace && p.metadata.name === data.name,
        )
      ) {
        throw new ButlerApiError({
          status: 409,
          message: `provider ${data.name} already exists`,
        });
      }
      // Mirrors what the server stores: no credential ever lands on the
      // object, only a reference to the Secret it wrote.
      const spec: Provider['spec'] = {
        provider: data.provider,
        credentialsRef: { name: `${data.name}-credentials`, namespace },
      };
      if (data.provider === 'nutanix') {
        spec.nutanix = {
          endpoint: data.nutanixEndpoint,
          port: data.nutanixPort,
          insecure: data.nutanixInsecure,
        };
      }
      if (data.provider === 'proxmox') {
        spec.proxmox = {
          endpoint: data.proxmoxEndpoint,
          insecure: data.proxmoxInsecure,
        };
      }
      if (data.provider === 'aws') {
        spec.aws = { region: data.awsRegion, vpcID: data.awsVpcId };
      }
      if (data.networkMode || data.networkSubnet) {
        spec.network = {
          mode: data.networkMode,
          subnet: data.networkSubnet,
          gateway: data.networkGateway,
          dnsServers: data.networkDnsServers,
          poolRefs: data.poolRefs,
          ...(data.lbDefaultPoolSize !== undefined && {
            loadBalancer: { defaultPoolSize: data.lbDefaultPoolSize },
          }),
        };
      }
      if (data.scopeType === 'team' && data.scopeTeamRef) {
        spec.scope = { type: 'team', teamRef: { name: data.scopeTeamRef } };
      }
      if (
        data.maxClustersPerTeam !== undefined ||
        data.maxNodesPerTeam !== undefined
      ) {
        spec.limits = {
          maxClustersPerTeam: data.maxClustersPerTeam,
          maxNodesPerTeam: data.maxNodesPerTeam,
        };
      }
      const created: Provider = {
        metadata: {
          name: data.name,
          namespace,
          uid: `mock-provider-${this.providers.length + 1}`,
        },
        spec,
        status: { ready: false, validated: false },
      };
      this.providers.push(created);
      return clone(created);
    });
  }

  deleteProvider(_namespace: string, _name: string): Promise<void> {
    return this.run('deleteProvider', () =>
      this.notImplemented('deleteProvider'),
    );
  }

  updateProvider(
    namespace: string,
    name: string,
    data: UpdateProviderRequest,
  ): Promise<Provider> {
    return this.run('updateProvider', () => {
      const provider = this.providers.find(
        p => p.metadata.namespace === namespace && p.metadata.name === name,
      );
      if (!provider) throw notFound('provider', name);
      // The server changes only what is present; credentials go to the
      // Secret and never appear on the object.
      const spec = provider.spec as Record<string, any>;
      if (data.nutanixEndpoint) {
        spec.nutanix = {
          ...(spec.nutanix ?? {}),
          endpoint: data.nutanixEndpoint,
        };
      }
      if (data.proxmoxEndpoint) {
        spec.proxmox = {
          ...(spec.proxmox ?? {}),
          endpoint: data.proxmoxEndpoint,
        };
      }
      if (data.awsRegion)
        spec.aws = { ...(spec.aws ?? {}), region: data.awsRegion };
      const network = { ...(spec.network ?? {}) };
      let networkTouched = false;
      if (data.networkMode) {
        network.mode = data.networkMode;
        networkTouched = true;
      }
      if (data.networkSubnet) {
        network.subnet = data.networkSubnet;
        networkTouched = true;
      }
      if (data.networkGateway) {
        network.gateway = data.networkGateway;
        networkTouched = true;
      }
      if (data.networkDnsServers?.length) {
        network.dnsServers = data.networkDnsServers;
        networkTouched = true;
      }
      if (data.lbDefaultPoolSize !== undefined) {
        network.loadBalancer = {
          ...(network.loadBalancer ?? {}),
          defaultPoolSize: data.lbDefaultPoolSize,
        };
        networkTouched = true;
      }
      if (networkTouched) spec.network = network;
      if (
        data.maxClustersPerTeam !== undefined ||
        data.maxNodesPerTeam !== undefined
      ) {
        spec.limits = {
          ...(spec.limits ?? {}),
          ...(data.maxClustersPerTeam !== undefined && {
            maxClustersPerTeam: data.maxClustersPerTeam,
          }),
          ...(data.maxNodesPerTeam !== undefined && {
            maxNodesPerTeam: data.maxNodesPerTeam,
          }),
        };
      }
      return clone(provider);
    });
  }

  getProviderCAInfo(namespace: string, name: string): Promise<CAInfoResponse> {
    return this.run('getProviderCAInfo', () => {
      const provider = this.providers.find(
        p => p.metadata.namespace === namespace && p.metadata.name === name,
      );
      if (!provider) throw notFound('provider', name);
      return provider.spec.provider === 'nutanix'
        ? {
            configured: true,
            health: 'healthy',
            nearestExpiry: '2027-01-01T00:00:00Z',
            certificates: [
              {
                subject: 'CN=prism-central',
                issuer: 'CN=lab-root',
                notAfter: '2027-01-01T00:00:00Z',
                isCA: false,
              },
            ],
          }
        : { configured: false };
    });
  }

  validateProvider(
    _namespace: string,
    _name: string,
  ): Promise<ValidateResponse> {
    return this.run('validateProvider', () => ({
      valid: true,
      message: 'Provider credentials validated',
    }));
  }

  testProviderConnection(
    _data: CreateProviderRequest,
  ): Promise<ValidateResponse> {
    return this.run('testProviderConnection', () => ({
      valid: true,
      message: 'Connection succeeded',
    }));
  }

  listProviderClusters(
    _namespace: string,
    _name: string,
    _scope?: OptionListScope,
  ): Promise<ProviderClusterListResponse> {
    return this.run('listProviderClusters', () => ({
      clusters: [
        { name: 'prism-a', id: '0005a1b2-0000-4000-8000-000000000001' },
        { name: 'prism-b', id: '0005a1b2-0000-4000-8000-000000000002' },
      ],
    }));
  }

  listProviderStorageContainers(
    _namespace: string,
    _name: string,
    _scope?: OptionListScope,
  ): Promise<StorageContainerListResponse> {
    return this.run('listProviderStorageContainers', () => ({
      storageContainers: [
        { name: 'default-container', id: 'sc-0001' },
        { name: 'fast-nvme', id: 'sc-0002' },
      ],
    }));
  }

  getObservabilityConfig(): Promise<ObservabilityConfig> {
    return this.run('getObservabilityConfig', () => {
      if (!this.observabilityConfig) {
        throw new ButlerApiError({
          status: 404,
          message: 'observability pipeline not registered',
        });
      }
      return clone(this.observabilityConfig);
    });
  }

  listPolicies(): Promise<PolicyListResponse> {
    return this.run('listPolicies', () => ({
      policies: clone(this.policies),
      count: this.policies.length,
    }));
  }

  getPolicy(name: string): Promise<ClusterCreationPolicy> {
    return this.run('getPolicy', () => {
      const policy = this.policies.find(p => p.metadata.name === name);
      if (!policy) throw notFound('policy', name);
      return clone(policy);
    });
  }

  listProviderImages(
    _namespace: string,
    _name: string,
    _scope?: OptionListScope,
  ): Promise<ImageListResponse> {
    return this.run('listProviderImages', () => ({
      images: [
        { name: 'talos-1.10.5', id: 'image-talos-1-10-5', os: 'talos' },
        { name: 'ubuntu-24.04', id: 'image-ubuntu-24-04', os: 'ubuntu' },
      ],
    }));
  }

  listProviderNetworks(
    _namespace: string,
    _name: string,
    _scope?: OptionListScope,
  ): Promise<NetworkListResponse> {
    return this.run('listProviderNetworks', () => ({
      networks: [
        {
          name: 'lab-vlan-40',
          id: 'net-40',
          vlan: 40,
          description: 'Lab tenant network',
        },
      ],
    }));
  }

  // ---- Addons ----

  getAddonCatalog(): Promise<CatalogResponse> {
    return this.run('getAddonCatalog', () => ({
      addons: clone(fixtureAddonCatalog),
      categories: clone(fixtureAddonCategories),
    }));
  }

  getAddonDefinition(name: string): Promise<AddonDefinition> {
    return this.run('getAddonDefinition', () => {
      const def = fixtureAddonCatalog.find(a => a.name === name);
      if (!def) throw notFound('addon', name);
      return clone(def);
    });
  }

  listClusterAddons(
    namespace: string,
    clusterName: string,
  ): Promise<AddonsListResponse> {
    return this.run('listClusterAddons', () => {
      this.findCluster(namespace, clusterName);
      const addons = this.installedAddons[clusterName] ?? [];
      // Installing addons converge on the next read.
      for (const addon of addons) {
        if (
          addon.status === 'Installing' ||
          addon.status === 'Upgrading' ||
          addon.status === 'Pending'
        ) {
          addon.status = 'Installed';
          addon.phase = 'Installed';
          addon.installedVersion = addon.version;
          if (addon.helmRelease) addon.helmRelease.status = 'deployed';
        }
      }
      this.installedAddons[clusterName] = addons.filter(
        a => a.status !== 'Deleting',
      );
      return { addons: clone(this.installedAddons[clusterName]) };
    });
  }

  installAddon(
    namespace: string,
    clusterName: string,
    data: InstallAddonRequest,
  ): Promise<unknown> {
    return this.run('installAddon', () => {
      this.findCluster(namespace, clusterName);
      const name =
        data.addon ??
        data.helm?.releaseName ??
        data.helm?.chart ??
        'custom-addon';
      const def = fixtureAddonCatalog.find(a => a.name === name);
      const version =
        data.version ?? data.helm?.version ?? def?.defaultVersion ?? '0.0.0';
      const list = this.installedAddons[clusterName] ?? [];
      const existing = list.find(a => a.name === name);
      const entry: InstalledAddon = {
        name,
        displayName: def?.displayName ?? name,
        status: 'Installing',
        phase: 'Installing',
        version,
        managedBy: 'butler',
        namespace: data.helm?.namespace ?? def?.defaultNamespace ?? name,
        helmRelease: {
          name,
          namespace: def?.defaultNamespace ?? name,
          revision: 1,
          status: 'pending-install',
        },
      };
      if (existing) {
        Object.assign(existing, entry);
      } else {
        list.push(entry);
      }
      this.installedAddons[clusterName] = list;
      return { status: 'accepted', addon: clone(entry) };
    });
  }

  getAddonDetails(
    namespace: string,
    clusterName: string,
    addonName: string,
  ): Promise<InstalledAddon> {
    return this.run('getAddonDetails', () => {
      this.findCluster(namespace, clusterName);
      const addon = (this.installedAddons[clusterName] ?? []).find(
        a => a.name === addonName,
      );
      if (!addon) throw notFound('addon', addonName);
      return clone(addon);
    });
  }

  updateAddon(
    namespace: string,
    clusterName: string,
    addonName: string,
    data: UpdateAddonRequest,
  ): Promise<unknown> {
    return this.run('updateAddon', () => {
      this.findCluster(namespace, clusterName);
      const addon = (this.installedAddons[clusterName] ?? []).find(
        a => a.name === addonName,
      );
      if (!addon) throw notFound('addon', addonName);
      addon.status = 'Upgrading';
      addon.phase = 'Upgrading';
      if (data.version) addon.version = data.version;
      if (addon.helmRelease) addon.helmRelease.revision += 1;
      return { status: 'accepted' };
    });
  }

  uninstallAddon(
    namespace: string,
    clusterName: string,
    addonName: string,
  ): Promise<void> {
    return this.run('uninstallAddon', () => {
      this.findCluster(namespace, clusterName);
      const addon = (this.installedAddons[clusterName] ?? []).find(
        a => a.name === addonName,
      );
      if (!addon) throw notFound('addon', addonName);
      addon.status = 'Deleting';
      addon.phase = 'Deleting';
    });
  }

  getManagementAddons(): Promise<{ addons: ManagementAddon[] }> {
    return this.run('getManagementAddons', () => ({
      addons: clone(this.managementAddons),
    }));
  }

  installManagementAddon(
    data: InstallManagementAddonRequest,
  ): Promise<ManagementAddon> {
    return this.run('installManagementAddon', () => {
      const addon: ManagementAddon = {
        name: data.name,
        addon: data.addon,
        version: data.version,
        values: data.values,
        status: { phase: 'Installed', installedVersion: data.version },
      };
      this.managementAddons = this.managementAddons
        .filter(a => a.name !== data.name)
        .concat(addon);
      return clone(addon);
    });
  }

  uninstallManagementAddon(name: string): Promise<void> {
    return this.run('uninstallManagementAddon', () => {
      this.managementAddons = this.managementAddons.filter(
        a => a.name !== name,
      );
    });
  }

  // ---- GitOps ----

  getGitOpsConfig(): Promise<GitProviderConfig> {
    return this.run('getGitOpsConfig', () => clone(this.gitProvider));
  }

  saveGitOpsConfig(
    request: SaveGitProviderRequest,
  ): Promise<GitProviderConfig> {
    return this.run('saveGitOpsConfig', () => {
      this.gitProvider = {
        configured: true,
        type: request.type,
        url:
          request.url ??
          (request.type === 'github'
            ? 'https://github.com'
            : 'https://gitlab.com'),
        username: 'butler-bot',
        organization: request.organization,
      };
      return clone(this.gitProvider);
    });
  }

  clearGitOpsConfig(): Promise<void> {
    return this.run('clearGitOpsConfig', () => {
      this.gitProvider = { configured: false };
    });
  }

  listRepositories(): Promise<Repository[]> {
    return this.run('listRepositories', () => clone(fixtureRepositories));
  }

  listBranches(_owner: string, _repo: string): Promise<Branch[]> {
    return this.run('listBranches', () => clone(fixtureBranches));
  }

  previewManifests(
    request: PreviewManifestRequest,
  ): Promise<PreviewManifestResponse> {
    return this.run('previewManifests', () => {
      const def = fixtureAddonCatalog.find(a => a.name === request.addonName);
      const base = `${request.targetPath.replace(/\/$/, '')}/${
        request.addonName
      }`;
      if (request.tool === 'argocd') {
        return {
          [`${base}/application.yaml`]: [
            'apiVersion: argoproj.io/v1alpha1',
            'kind: Application',
            'metadata:',
            `  name: ${request.addonName}`,
            '  namespace: argocd',
            'spec:',
            '  source:',
            `    repoURL: ${
              def?.chartRepository ?? 'https://charts.example.com'
            }`,
            `    chart: ${def?.chartName ?? request.addonName}`,
            `    targetRevision: ${def?.defaultVersion ?? '0.0.0'}`,
            '',
          ].join('\n'),
        };
      }
      return {
        [`${base}/helmrepository.yaml`]: [
          'apiVersion: source.toolkit.fluxcd.io/v1',
          'kind: HelmRepository',
          'metadata:',
          `  name: ${request.addonName}`,
          '  namespace: flux-system',
          'spec:',
          `  url: ${def?.chartRepository ?? 'https://charts.example.com'}`,
          '  interval: 1h',
          '',
        ].join('\n'),
        [`${base}/helmrelease.yaml`]: [
          'apiVersion: helm.toolkit.fluxcd.io/v2',
          'kind: HelmRelease',
          'metadata:',
          `  name: ${request.addonName}`,
          `  namespace: ${def?.defaultNamespace ?? request.addonName}`,
          'spec:',
          '  chart:',
          '    spec:',
          `      chart: ${def?.chartName ?? request.addonName}`,
          `      version: ${def?.defaultVersion ?? '0.0.0'}`,
          '  interval: 10m',
          `  values: ${JSON.stringify(request.values ?? {})}`,
          '',
        ].join('\n'),
      };
    });
  }

  getClusterGitOpsStatus(
    namespace: string,
    name: string,
  ): Promise<GitOpsStatus> {
    return this.run('getClusterGitOpsStatus', () => {
      this.findCluster(namespace, name);
      return clone(this.gitops[name] ?? fixtureDisabledGitOps);
    });
  }

  discoverClusterReleases(
    namespace: string,
    name: string,
  ): Promise<DiscoveryResult> {
    return this.run('discoverClusterReleases', () => {
      this.findCluster(namespace, name);
      const addons = this.installedAddons[name] ?? [];
      const matched = addons
        .filter(a => a.status === 'Installed')
        .map(a => {
          const def = fixtureAddonCatalog.find(d => d.name === a.name);
          return {
            name: a.name,
            namespace: a.namespace ?? a.name,
            chart: def?.chartName ?? a.name,
            chartVersion: a.version ?? '0.0.0',
            status: 'deployed',
            revision: a.helmRelease?.revision ?? 1,
            repoUrl: def?.chartRepository,
            category: def?.platform ? 'infrastructure' : 'apps',
            addonDefinition: def?.name,
            platform: def?.platform,
          };
        });
      return {
        matched,
        unmatched: [
          {
            name: 'podinfo',
            namespace: 'default',
            chart: 'podinfo',
            chartVersion: '6.7.1',
            status: 'deployed',
            revision: 2,
            repoUrl: 'https://stefanprodan.github.io/podinfo',
            category: 'apps',
          },
        ],
        gitopsEngine: this.gitops[name]?.providerStatus ?? {
          installed: false,
          ready: false,
        },
      };
    });
  }

  exportClusterAddon(
    _namespace: string,
    _name: string,
    request: ExportAddonRequest,
  ): Promise<ExportAddonResponse> {
    return this.run('exportClusterAddon', () =>
      this.fakeExport(request.addonName, request.targetPath, request.createPR),
    );
  }

  exportClusterRelease(
    _namespace: string,
    _name: string,
    request: any,
  ): Promise<ExportAddonResponse> {
    return this.run('exportClusterRelease', () =>
      this.fakeExport(
        request?.name ?? request?.releaseName ?? 'release',
        request?.targetPath ?? request?.basePath ?? 'clusters',
        request?.createPR,
      ),
    );
  }

  migrateClusterReleases(
    _namespace: string,
    _name: string,
    request: MigrationRequest,
  ): Promise<MigrationResult> {
    return this.run('migrateClusterReleases', () =>
      this.fakeMigration(request),
    );
  }

  enableClusterGitOps(
    namespace: string,
    name: string,
    config: any,
  ): Promise<{ success: boolean; message: string }> {
    return this.run('enableClusterGitOps', () => {
      this.findCluster(namespace, name);
      const provider = config?.provider ?? config?.tool ?? 'flux';
      this.gitops[name] = {
        enabled: true,
        provider,
        repository: config?.repository,
        branch: config?.branch ?? 'main',
        path: config?.path,
        status: 'Ready',
        version: provider === 'flux' ? 'v2.15.0' : 'v3.0.0',
        providerStatus: {
          provider,
          installed: true,
          ready: true,
          repository: config?.repository,
          branch: config?.branch ?? 'main',
          path: config?.path,
        },
      };
      return { success: true, message: `GitOps enabled with ${provider}` };
    });
  }

  disableClusterGitOps(namespace: string, name: string): Promise<void> {
    return this.run('disableClusterGitOps', () => {
      this.findCluster(namespace, name);
      delete this.gitops[name];
    });
  }

  getManagementGitOpsStatus(): Promise<GitOpsStatus> {
    return this.run('getManagementGitOpsStatus', () =>
      clone(this.gitops.__management ?? fixtureDisabledGitOps),
    );
  }

  discoverManagementReleases(): Promise<DiscoveryResult> {
    return this.run('discoverManagementReleases', () => ({
      matched: [],
      unmatched: [
        {
          name: 'butler',
          namespace: 'butler-system',
          chart: 'butler',
          chartVersion: '0.9.0',
          status: 'deployed',
          revision: 3,
          category: 'infrastructure',
        },
      ],
      gitopsEngine: this.gitops.__management?.providerStatus ?? {
        installed: false,
        ready: false,
      },
    }));
  }

  exportManagementAddon(
    request: ExportAddonRequest,
  ): Promise<ExportAddonResponse> {
    return this.run('exportManagementAddon', () =>
      this.fakeExport(request.addonName, request.targetPath, request.createPR),
    );
  }

  exportManagementRelease(request: any): Promise<ExportAddonResponse> {
    return this.run('exportManagementRelease', () =>
      this.fakeExport(
        request?.name ?? 'release',
        request?.targetPath ?? 'management',
        request?.createPR,
      ),
    );
  }

  migrateManagementReleases(
    request: MigrationRequest,
  ): Promise<MigrationResult> {
    return this.run('migrateManagementReleases', () =>
      this.fakeMigration(request),
    );
  }

  enableManagementGitOps(
    config: any,
  ): Promise<{ success: boolean; message: string }> {
    return this.run('enableManagementGitOps', () => {
      const provider = config?.provider ?? config?.tool ?? 'flux';
      this.gitops.__management = {
        enabled: true,
        provider,
        repository: config?.repository,
        branch: config?.branch ?? 'main',
        path: config?.path,
        status: 'Ready',
        providerStatus: { provider, installed: true, ready: true },
      };
      return { success: true, message: `GitOps enabled with ${provider}` };
    });
  }

  disableManagementGitOps(): Promise<void> {
    return this.run('disableManagementGitOps', () => {
      delete this.gitops.__management;
    });
  }

  private fakeExport(
    name: string,
    targetPath: string,
    createPR?: boolean,
  ): ExportAddonResponse {
    const files = [
      `${targetPath}/${name}/helmrepository.yaml`,
      `${targetPath}/${name}/helmrelease.yaml`,
    ];
    return {
      success: true,
      message: createPR
        ? `Opened pull request for ${name}`
        : `Committed ${name} manifests`,
      files,
      commitSha: 'c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00',
      commitUrl: 'https://github.com/butler-lab/clusters/commit/c0ffee00',
      prUrl: createPR
        ? 'https://github.com/butler-lab/clusters/pull/42'
        : undefined,
      prNumber: createPR ? 42 : undefined,
    };
  }

  private fakeMigration(request: MigrationRequest): MigrationResult {
    return {
      success: true,
      message: `Migrated ${request.releases.length} release(s)`,
      filesCreated: request.releases.map(
        r => `${request.basePath}/${r.name}/helmrelease.yaml`,
      ),
      commitSha: 'c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00',
      prUrl: request.createPR
        ? 'https://github.com/butler-lab/clusters/pull/43'
        : undefined,
      prNumber: request.createPR ? 43 : undefined,
    };
  }

  // ---- Certificates ----

  getClusterCertificates(
    namespace: string,
    name: string,
  ): Promise<ClusterCertificates> {
    return this.run('getClusterCertificates', () => {
      this.findCluster(namespace, name);
      const certs = makeFixtureCertificates(name);
      const rotation = this.rotations[name];
      if (rotation) {
        certs.rotationInProgress = rotation.status === 'in_progress';
        certs.lastRotation = clone(rotation);
      }
      return certs;
    });
  }

  getCertificatesByCategory(
    namespace: string,
    name: string,
    category: CertificateCategory,
  ): Promise<{
    category: CertificateCategory;
    certificates: CertificateInfo[];
  }> {
    return this.run('getCertificatesByCategory', () => {
      this.findCluster(namespace, name);
      return {
        category,
        certificates: makeFixtureCertificates(name).categories[category],
      };
    });
  }

  rotateCertificates(
    namespace: string,
    name: string,
    type: string,
    acknowledge?: boolean,
  ): Promise<RotationEvent> {
    return this.run('rotateCertificates', () => {
      this.findCluster(namespace, name);
      if (type === 'ca' && !acknowledge) {
        throw new Error('CA rotation requires acknowledgement');
      }
      const certs = makeFixtureCertificates(name);
      const affected =
        type === 'kubeconfigs'
          ? certs.categories.kubeconfig.map(c => c.secretName)
          : type === 'ca'
          ? certs.categories.ca.map(c => c.secretName)
          : Object.values(certs.categories)
              .flat()
              .filter(c => !c.isCA)
              .map(c => c.secretName);
      const event: RotationEvent = {
        type: type as RotationEvent['type'],
        initiatedBy: fixtureIdentity.email ?? 'unknown',
        initiatedAt: FIXTURE_NOW,
        status: 'in_progress',
        affectedSecrets: affected,
        message: `Rotating ${affected.length} secret(s)`,
      };
      this.rotations[name] = event;
      return clone(event);
    });
  }

  getRotationStatus(namespace: string, name: string): Promise<RotationEvent> {
    return this.run('getRotationStatus', () => {
      this.findCluster(namespace, name);
      const rotation = this.rotations[name];
      if (!rotation) {
        return clone(fixtureCompletedRotation);
      }
      if (rotation.status === 'in_progress') {
        rotation.status = 'completed';
        rotation.completedAt = FIXTURE_NOW;
        rotation.message = 'Rotation completed';
      }
      return clone(rotation);
    });
  }

  // ---- Identity Providers ----

  listIdentityProviders(): Promise<IdentityProviderListResponse> {
    return this.run('listIdentityProviders', () => ({
      identityProviders: clone(fixtureIdentityProviders),
    }));
  }

  getIdentityProvider(name: string): Promise<IdentityProvider> {
    return this.run('getIdentityProvider', () => {
      const idp = fixtureIdentityProviders.find(p => p.metadata.name === name);
      if (!idp) throw notFound('identity provider', name);
      return clone(idp);
    });
  }

  createIdentityProvider(
    _data: CreateIdentityProviderRequest,
  ): Promise<IdentityProvider> {
    return this.run('createIdentityProvider', () =>
      this.notImplemented('createIdentityProvider'),
    );
  }

  deleteIdentityProvider(
    _name: string,
  ): Promise<{ status: string; message: string }> {
    return this.run('deleteIdentityProvider', () =>
      this.notImplemented('deleteIdentityProvider'),
    );
  }

  testIdPDiscovery(issuerURL: string): Promise<TestDiscoveryResponse> {
    return this.run('testIdPDiscovery', () => ({
      valid: true,
      message: `Discovered OIDC configuration at ${issuerURL}`,
      authorizationEndpoint: `${issuerURL}/authorize`,
      tokenEndpoint: `${issuerURL}/token`,
      userInfoEndpoint: `${issuerURL}/userinfo`,
      jwksURI: `${issuerURL}/.well-known/jwks.json`,
    }));
  }

  validateIdentityProvider(name: string): Promise<TestDiscoveryResponse> {
    return this.run('validateIdentityProvider', () => {
      const idp = fixtureIdentityProviders.find(p => p.metadata.name === name);
      if (!idp) throw notFound('identity provider', name);
      return {
        valid: true,
        message: `Discovery succeeded for ${idp.spec.oidc?.issuerURL}`,
      };
    });
  }

  // ---- Cluster detail read parity ----

  getClusterMachineRequests(
    namespace: string,
    name: string,
  ): Promise<MachineRequestListResponse> {
    return this.run('getClusterMachineRequests', () => ({
      machineRequests: (this.clusters.find(
        c => c.metadata.namespace === namespace && c.metadata.name === name,
      )
        ? [0, 1].map(i => ({
            metadata: { name: `${name}-worker-${i}`, namespace },
            spec: {
              clusterName: name,
              machineName: `${name}-worker-${i}`,
              role: 'worker' as const,
              cpu: 2,
              memoryMB: 4096,
              diskGB: 20,
              providerConfigRef: { name: 'harvester' },
            },
            status: {
              phase: i === 0 ? 'Running' : 'Creating',
              ipAddress: i === 0 ? '10.40.2.10' : '',
            },
          }))
        : []) as unknown as MachineRequest[],
    }));
  }

  getClusterLoadBalancerRequests(
    namespace: string,
    name: string,
  ): Promise<LoadBalancerRequestListResponse> {
    return this.run('getClusterLoadBalancerRequests', () => ({
      loadBalancerRequests: [
        {
          metadata: { name: `${name}-api`, namespace },
          spec: {
            clusterName: name,
            port: 6443,
            providerConfigRef: { name: 'harvester' },
          },
          status: { phase: 'Ready', endpoint: '10.40.2.56' },
        },
      ] as LoadBalancerRequest[],
    }));
  }

  getClusterTenantControlPlane(
    namespace: string,
    name: string,
  ): Promise<TenantControlPlaneSummary> {
    return this.run('getClusterTenantControlPlane', () => {
      const cluster = this.clusters.find(
        c => c.metadata.namespace === namespace && c.metadata.name === name,
      );
      if (!cluster || cluster.status?.phase === 'Pending') {
        throw new Error(
          'Butler API error (404): TenantControlPlane not found for cluster',
        );
      }
      return {
        name,
        namespace: cluster.status?.tenantNamespace ?? `${name}-tenant`,
        specVersion: cluster.spec.kubernetesVersion ?? 'v1.33.2',
        status: {
          phase: 'Ready',
          version: cluster.spec.kubernetesVersion ?? 'v1.33.2',
          controlPlaneEndpoint: '10.40.2.56:6443',
          replicas: 1,
          readyReplicas: 1,
        },
      } as TenantControlPlaneSummary;
    });
  }

  exportClusterYAML(namespace: string, name: string): Promise<string> {
    return this.run(
      'exportClusterYAML',
      () =>
        `apiVersion: butler.butlerlabs.dev/v1alpha1\nkind: TenantCluster\nmetadata:\n  name: ${name}\n  namespace: ${namespace}\n`,
    );
  }

  // ---- Settings ----

  getPlatformConfig(): Promise<PlatformConfig> {
    return this.run('getPlatformConfig', () => clone(fixturePlatformConfig));
  }

  // ---- Users ----

  listUsers(): Promise<any> {
    return this.run('listUsers', () => ({ users: clone(this.users) }));
  }

  createUser(data: {
    email: string;
    name?: string;
  }): Promise<{ user: any; inviteUrl?: string }> {
    return this.run('createUser', () => {
      const username = data.email.split('@')[0];
      const user = {
        username,
        email: data.email,
        displayName: data.name ?? username,
        phase: 'Pending',
        authType: 'internal',
        isAdmin: false,
        teams: [],
        createdAt: FIXTURE_NOW,
      };
      this.users.push(user);
      return {
        user: clone(user),
        inviteUrl: `https://butler.example.com/invite/${username}`,
      };
    });
  }

  deleteUser(username: string): Promise<void> {
    return this.run('deleteUser', () => {
      this.users = this.users.filter(u => u.username !== username);
    });
  }

  disableUser(username: string): Promise<void> {
    return this.run('disableUser', () => {
      const user = this.users.find(u => u.username === username);
      if (user) {
        user.phase = 'Disabled';
        user.disabled = true;
      }
    });
  }

  enableUser(username: string): Promise<void> {
    return this.run('enableUser', () => {
      const user = this.users.find(u => u.username === username);
      if (user) {
        user.phase = 'Active';
        user.disabled = false;
      }
    });
  }

  resendInvite(username: string): Promise<{ inviteUrl: string }> {
    return this.run('resendInvite', () => ({
      inviteUrl: `https://butler.example.com/invite/${username}`,
    }));
  }

  // ---- Teams ----

  getTeam(name: string): Promise<any> {
    return this.run('getTeam', () => {
      const info = fixtureTeams.find(t => t.name === name);
      if (!info) throw notFound('team', name);
      if (name === fixtureTeamDetail.metadata.name) {
        return clone(fixtureTeamDetail);
      }
      return {
        metadata: { name, namespace: `team-${name}` },
        spec: { displayName: info.displayName },
        status: { phase: 'Active', namespace: `team-${name}` },
      };
    });
  }

  getTeamClusterContext(_team: string): Promise<TeamClusterContext> {
    return this.run('getTeamClusterContext', () => ({
      environments: clone(this.environments).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
      clusterDefaults: this.teamClusterDefaults
        ? clone(this.teamClusterDefaults)
        : undefined,
    }));
  }

  createTeamEnvironment(
    _team: string,
    request: EnvironmentRequest,
  ): Promise<TeamEnvironment> {
    return this.run('createTeamEnvironment', () => {
      const clash = this.environments.some(
        e => e.name.toLowerCase() === request.name.toLowerCase(),
      );
      if (clash) {
        throw new ButlerApiError({
          status: 409,
          message: `Environment "${request.name}" already exists`,
        });
      }
      const created = clone(request) as TeamEnvironment;
      this.environments.push(created);
      return clone(created);
    });
  }

  updateTeamEnvironment(
    _team: string,
    name: string,
    request: EnvironmentRequest,
  ): Promise<TeamEnvironment> {
    return this.run('updateTeamEnvironment', () => {
      const index = this.environments.findIndex(
        e => e.name.toLowerCase() === name.toLowerCase(),
      );
      if (index === -1) throw notFound('environment', name);
      // The server keys the entry by name and refuses a rename, so the
      // stored name wins over anything the request carries.
      const updated = { ...clone(request), name } as TeamEnvironment;
      this.environments[index] = updated;
      return clone(updated);
    });
  }

  deleteTeamEnvironment(_team: string, name: string): Promise<void> {
    return this.run('deleteTeamEnvironment', () => {
      const index = this.environments.findIndex(
        e => e.name.toLowerCase() === name.toLowerCase(),
      );
      if (index === -1) throw notFound('environment', name);
      this.environments.splice(index, 1);
      return undefined;
    });
  }

  createTeam(_data: {
    name: string;
    displayName?: string;
    description?: string;
  }): Promise<any> {
    return this.run('createTeam', () => this.notImplemented('createTeam'));
  }

  updateTeam(
    name: string,
    data: { displayName?: string; description?: string },
  ): Promise<any> {
    return this.run('updateTeam', () => {
      if (name !== fixtureTeamDetail.metadata.name)
        throw notFound('team', name);
      if (data.displayName !== undefined)
        fixtureTeamDetail.spec.displayName = data.displayName;
      if (data.description !== undefined)
        fixtureTeamDetail.spec.description = data.description;
      return clone(fixtureTeamDetail);
    });
  }

  deleteTeam(_name: string): Promise<void> {
    return this.run('deleteTeam', () => this.notImplemented('deleteTeam'));
  }

  getTeamClusters(name: string): Promise<ClusterListResponse> {
    return this.run('getTeamClusters', () => ({
      clusters: clone(this.clusters.filter(c => c.spec.teamRef?.name === name)),
    }));
  }

  getTeamMembers(name: string): Promise<any> {
    return this.run('getTeamMembers', () => {
      if (!fixtureTeams.some(t => t.name === name))
        throw notFound('team', name);
      return {
        members: clone(
          name === fixtureTeamDetail.metadata.name ? this.members : [],
        ),
      };
    });
  }

  addTeamMember(
    teamName: string,
    data: { email: string; role: string },
  ): Promise<void> {
    return this.run('addTeamMember', () => {
      if (!fixtureTeams.some(t => t.name === teamName))
        throw notFound('team', teamName);
      if (this.members.some(m => m.email === data.email)) {
        throw new Error(`${data.email} is already a member of ${teamName}`);
      }
      this.members.push({
        email: data.email,
        name: data.email.split('@')[0],
        role: data.role,
        source: 'direct',
      });
    });
  }

  removeTeamMember(teamName: string, email: string): Promise<void> {
    return this.run('removeTeamMember', () => {
      if (!fixtureTeams.some(t => t.name === teamName))
        throw notFound('team', teamName);
      if (!this.members.some(m => m.email === email))
        throw notFound('member', email);
      this.members = this.members.filter(m => m.email !== email);
    });
  }

  updateMemberRole(
    teamName: string,
    email: string,
    role: string,
  ): Promise<void> {
    return this.run('updateMemberRole', () => {
      if (!fixtureTeams.some(t => t.name === teamName))
        throw notFound('team', teamName);
      const member = this.members.find(m => m.email === email);
      if (!member) throw notFound('member', email);
      member.role = role;
    });
  }

  getTeamGroupSyncs(_name: string): Promise<any> {
    return this.run('getTeamGroupSyncs', () => ({
      groups: clone(fixtureGroupSyncs),
    }));
  }

  addGroupSync(
    _teamName: string,
    _data: { group: string; role: string; identityProvider?: string },
  ): Promise<void> {
    return this.run('addGroupSync', () => this.notImplemented('addGroupSync'));
  }

  removeGroupSync(_teamName: string, _groupName: string): Promise<void> {
    return this.run('removeGroupSync', () =>
      this.notImplemented('removeGroupSync'),
    );
  }

  updateGroupSyncRole(
    _teamName: string,
    _groupName: string,
    _role: string,
  ): Promise<void> {
    return this.run('updateGroupSyncRole', () =>
      this.notImplemented('updateGroupSyncRole'),
    );
  }

  // ---- Workspaces ----

  listWorkspaces(
    namespace: string,
    clusterName: string,
  ): Promise<WorkspaceListResponse> {
    return this.run('listWorkspaces', () => {
      this.findCluster(namespace, clusterName);
      return { workspaces: [] };
    });
  }

  getWorkspace(
    _namespace: string,
    _clusterName: string,
    _workspaceName: string,
  ): Promise<Workspace> {
    return this.run('getWorkspace', () => this.notImplemented('getWorkspace'));
  }

  createWorkspace(
    _namespace: string,
    _clusterName: string,
    _data: CreateWorkspaceRequest,
  ): Promise<Workspace> {
    return this.run('createWorkspace', () =>
      this.notImplemented('createWorkspace'),
    );
  }

  deleteWorkspace(
    _namespace: string,
    _clusterName: string,
    _workspaceName: string,
  ): Promise<void> {
    return this.run('deleteWorkspace', () =>
      this.notImplemented('deleteWorkspace'),
    );
  }

  connectWorkspace(
    _namespace: string,
    _clusterName: string,
    _workspaceName: string,
  ): Promise<Workspace> {
    return this.run('connectWorkspace', () =>
      this.notImplemented('connectWorkspace'),
    );
  }

  disconnectWorkspace(
    _namespace: string,
    _clusterName: string,
    _workspaceName: string,
  ): Promise<Workspace> {
    return this.run('disconnectWorkspace', () =>
      this.notImplemented('disconnectWorkspace'),
    );
  }

  startWorkspace(
    _namespace: string,
    _clusterName: string,
    _workspaceName: string,
  ): Promise<Workspace> {
    return this.run('startWorkspace', () =>
      this.notImplemented('startWorkspace'),
    );
  }

  getWorkspaceMetrics(
    _namespace: string,
    _clusterName: string,
    _workspaceName: string,
  ): Promise<WorkspaceMetrics> {
    return this.run('getWorkspaceMetrics', () =>
      this.notImplemented('getWorkspaceMetrics'),
    );
  }

  syncWorkspaceSSHKeys(
    _namespace: string,
    _clusterName: string,
    _workspaceName: string,
  ): Promise<{ synced: boolean; keys: number; message: string }> {
    return this.run('syncWorkspaceSSHKeys', () =>
      this.notImplemented('syncWorkspaceSSHKeys'),
    );
  }

  // ---- Cluster Services ----

  listClusterServices(
    _namespace: string,
    _clusterName: string,
  ): Promise<ClusterServiceListResponse> {
    return this.run('listClusterServices', () =>
      this.notImplemented('listClusterServices'),
    );
  }

  generateMirrordConfig(
    _namespace: string,
    _clusterName: string,
    _serviceName: string,
    _serviceNamespace: string,
  ): Promise<MirrordConfig> {
    return this.run('generateMirrordConfig', () =>
      this.notImplemented('generateMirrordConfig'),
    );
  }

  // ---- Workspace Images and Templates ----

  listWorkspaceImages(): Promise<WorkspaceImageListResponse> {
    return this.run('listWorkspaceImages', () => ({ images: [] }));
  }

  listWorkspaceTemplates(): Promise<WorkspaceTemplateListResponse> {
    return this.run('listWorkspaceTemplates', () => ({ templates: [] }));
  }

  createWorkspaceTemplate(
    _data: CreateWorkspaceTemplateRequest,
  ): Promise<WorkspaceTemplate> {
    return this.run('createWorkspaceTemplate', () =>
      this.notImplemented('createWorkspaceTemplate'),
    );
  }

  updateWorkspaceTemplate(
    _namespace: string,
    _name: string,
    _data: Partial<CreateWorkspaceTemplateRequest>,
  ): Promise<WorkspaceTemplate> {
    return this.run('updateWorkspaceTemplate', () =>
      this.notImplemented('updateWorkspaceTemplate'),
    );
  }

  deleteWorkspaceTemplate(_namespace: string, _name: string): Promise<void> {
    return this.run('deleteWorkspaceTemplate', () =>
      this.notImplemented('deleteWorkspaceTemplate'),
    );
  }

  // ---- SSH Keys ----

  listSSHKeys(): Promise<SSHKeyListResponse> {
    return this.run('listSSHKeys', () => ({ sshKeys: [] }));
  }

  addSSHKey(_data: AddSSHKeyRequest): Promise<SSHKeyEntry> {
    return this.run('addSSHKey', () => this.notImplemented('addSSHKey'));
  }

  removeSSHKey(_fingerprint: string): Promise<void> {
    return this.run('removeSSHKey', () => this.notImplemented('removeSSHKey'));
  }
}
