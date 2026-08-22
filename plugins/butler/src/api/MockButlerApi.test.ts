// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { MockButlerApi } from './MockButlerApi';
import {
  FIXTURE_NAMESPACE,
  FIXTURE_TEAM,
  fixtureClusters,
  readyCluster,
  failedCluster,
  provisioningCluster,
  staleNodesCluster,
  degradedCluster,
} from './fixtures/clusters';
import type { Cluster } from './types/clusters';

const ns = FIXTURE_NAMESPACE;

describe('fixture clusters', () => {
  it.each(fixtureClusters.map(c => [c.metadata.name, c] as const))(
    '%s satisfies the Cluster type required fields',
    (_name, cluster: Cluster) => {
      expect(typeof cluster.metadata.name).toBe('string');
      expect(cluster.metadata.name.length).toBeGreaterThan(0);
      expect(cluster.metadata.namespace).toBe(ns);
      expect(typeof cluster.metadata.resourceVersion).toBe('string');
      expect(typeof cluster.spec.kubernetesVersion).toBe('string');
      expect(cluster.spec.teamRef?.name).toBe(FIXTURE_TEAM);
      expect(cluster.spec.providerConfigRef?.name).toBeTruthy();
      expect(typeof cluster.spec.workers?.replicas).toBe('number');
      expect(cluster.spec.workers?.machineTemplate?.cpu).toBeGreaterThan(0);
      expect(cluster.spec.controlPlane?.replicas).toBeGreaterThan(0);
      expect(cluster.status?.phase).toBeTruthy();
      expect(typeof cluster.status?.workerNodesReady).toBe('number');
      expect(typeof cluster.status?.workerNodesDesired).toBe('number');
      for (const condition of cluster.status?.conditions ?? []) {
        expect(condition.type).toBeTruthy();
        expect(['True', 'False', 'Unknown']).toContain(condition.status);
        expect(condition.reason).toBeTruthy();
        expect(condition.lastTransitionTime).toBeTruthy();
      }
    },
  );

  it('covers every lifecycle phase', () => {
    const phases = new Set(fixtureClusters.map(c => c.status?.phase));
    expect(phases).toEqual(
      new Set(['Pending', 'Provisioning', 'Installing', 'Ready', 'Failed', 'Deleting']),
    );
  });

  it('models the interesting status shapes', () => {
    expect(provisioningCluster.status?.workerNodesReady).toBeLessThan(
      provisioningCluster.status!.workerNodesDesired!,
    );
    expect(
      provisioningCluster.status?.conditions?.find(c => c.type === 'WorkersReady')?.reason,
    ).toBe('WorkersProvisioning');
    expect(staleNodesCluster.status?.workerNodesReady).toBeGreaterThan(
      staleNodesCluster.status!.workerNodesDesired!,
    );
    expect(
      degradedCluster.status?.conditions?.find(c => c.type === 'Ready')?.reason,
    ).toBe('ReconcileDegraded');
    expect(
      failedCluster.status?.conditions?.find(c => c.type === 'Ready')?.message,
    ).toContain('Failed to provision');
  });
});

describe('MockButlerApi', () => {
  it('lists and reads fixture clusters without mutating the fixtures', async () => {
    const api = new MockButlerApi();
    const { clusters } = await api.listClusters();
    expect(clusters.map(c => c.metadata.name)).toEqual(
      fixtureClusters.map(c => c.metadata.name),
    );

    const cluster = await api.getCluster(ns, readyCluster.metadata.name);
    cluster.status!.phase = 'Mutated';
    const again = await api.getCluster(ns, readyCluster.metadata.name);
    expect(again.status?.phase).toBe('Ready');
    expect(readyCluster.status?.phase).toBe('Ready');
  });

  it('filters listClusters by team and namespace', async () => {
    const api = new MockButlerApi();
    expect((await api.listClusters({ team: 'data' })).clusters).toHaveLength(0);
    expect((await api.listClusters({ namespace: 'other' })).clusters).toHaveLength(0);
    api.setTeamContext('data');
    expect((await api.listClusters()).clusters).toHaveLength(0);
    api.setTeamContext(FIXTURE_TEAM);
    expect((await api.listClusters()).clusters).toHaveLength(fixtureClusters.length);
  });

  it('rejects unknown clusters with a 404-style error', async () => {
    const api = new MockButlerApi();
    await expect(api.getCluster(ns, 'nope')).rejects.toMatchObject({
      message: expect.stringContaining('not found'),
      status: 404,
    });
  });

  it('converges workers one per getCluster call after scaleCluster', async () => {
    const api = new MockButlerApi();
    const name = readyCluster.metadata.name;

    const scaled = await api.scaleCluster(ns, name, 6);
    expect(scaled.spec.workers?.replicas).toBe(6);
    expect(scaled.status?.workerNodesDesired).toBe(6);
    expect(scaled.status?.workerNodesReady).toBe(3);
    expect(scaled.status?.phase).toBe('Updating');
    expect(
      scaled.status?.conditions?.find(c => c.type === 'WorkersReady'),
    ).toMatchObject({ status: 'False', reason: 'WorkersProvisioning' });

    const observed: number[] = [];
    let last: Cluster | undefined;
    for (let i = 0; i < 3; i += 1) {
      last = await api.getCluster(ns, name);
      observed.push(last.status!.workerNodesReady!);
    }
    expect(observed).toEqual([4, 5, 6]);
    expect(last?.status?.phase).toBe('Ready');
    expect(
      last?.status?.conditions?.find(c => c.type === 'WorkersReady'),
    ).toMatchObject({ status: 'True', reason: 'WorkersReady' });
    expect(last?.status?.observedState?.workers).toEqual({ desired: 6, ready: 6 });

    // Stable once converged.
    const after = await api.getCluster(ns, name);
    expect(after.status?.workerNodesReady).toBe(6);
    expect(after.metadata.resourceVersion).toBe(last?.metadata.resourceVersion);
  });

  it('scales down one worker per read as well', async () => {
    const api = new MockButlerApi();
    const name = readyCluster.metadata.name;
    await api.scaleCluster(ns, name, 1);
    expect((await api.getCluster(ns, name)).status?.workerNodesReady).toBe(2);
    expect((await api.getCluster(ns, name)).status?.workerNodesReady).toBe(1);
    expect((await api.getCluster(ns, name)).status?.phase).toBe('Ready');
  });

  it('moves a cluster through Deleting and then removes it', async () => {
    const api = new MockButlerApi();
    const name = readyCluster.metadata.name;
    await api.deleteCluster(ns, name);

    const deleting = await api.getCluster(ns, name);
    expect(deleting.status?.phase).toBe('Deleting');
    expect(deleting.status?.conditions?.find(c => c.type === 'Ready')).toMatchObject({
      status: 'False',
      reason: 'Deleting',
    });

    await expect(api.getCluster(ns, name)).rejects.toThrow('not found');
    const { clusters } = await api.listClusters();
    expect(clusters.map(c => c.metadata.name)).not.toContain(name);
  });

  it('creates a Pending cluster and rejects duplicates', async () => {
    const api = new MockButlerApi();
    const created = await api.createCluster({
      name: 'new-india',
      providerConfigRef: 'harvester-lab',
      workerReplicas: 2,
      loadBalancerStart: '10.0.0.1',
      loadBalancerEnd: '10.0.0.9',
      teamRef: FIXTURE_TEAM,
    });
    expect(created.metadata.namespace).toBe(ns);
    expect(created.status?.phase).toBe('Pending');
    expect(created.status?.workerNodesDesired).toBe(2);
    expect((await api.listClusters()).clusters).toHaveLength(fixtureClusters.length + 1);
    await expect(
      api.createCluster({
        name: 'new-india',
        providerConfigRef: 'harvester-lab',
        loadBalancerStart: '10.0.0.1',
        loadBalancerEnd: '10.0.0.9',
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('toggles workspaces', async () => {
    const api = new MockButlerApi();
    const name = readyCluster.metadata.name;
    expect((await api.toggleClusterWorkspaces(ns, name, false)).spec.workspaces?.enabled).toBe(false);
    expect((await api.getCluster(ns, name)).spec.workspaces?.enabled).toBe(false);
  });

  it('installs, converges and uninstalls addons', async () => {
    const api = new MockButlerApi();
    const name = readyCluster.metadata.name;
    await api.installAddon(ns, name, { addon: 'ingress-nginx' });
    const installing = await api.getAddonDetails(ns, name, 'ingress-nginx');
    expect(installing.status).toBe('Installing');

    const { addons } = await api.listClusterAddons(ns, name);
    expect(addons.find(a => a.name === 'ingress-nginx')?.status).toBe('Installed');

    await api.uninstallAddon(ns, name, 'ingress-nginx');
    expect((await api.getAddonDetails(ns, name, 'ingress-nginx')).status).toBe('Deleting');
    const after = await api.listClusterAddons(ns, name);
    expect(after.addons.map(a => a.name)).not.toContain('ingress-nginx');
  });

  it('reports certificate rotation in progress then completed', async () => {
    const api = new MockButlerApi();
    const name = readyCluster.metadata.name;

    const before = await api.getClusterCertificates(ns, name);
    expect(before.rotationInProgress).toBe(false);
    expect(Object.keys(before.categories).sort()).toEqual(
      ['apiserver', 'ca', 'datastore', 'front-proxy', 'konnectivity', 'kubeconfig', 'service-account'],
    );

    const started = await api.rotateCertificates(ns, name, 'kubeconfigs');
    expect(started.status).toBe('in_progress');
    expect(started.affectedSecrets.length).toBeGreaterThan(0);
    expect((await api.getClusterCertificates(ns, name)).rotationInProgress).toBe(true);

    const polled = await api.getRotationStatus(ns, name);
    expect(polled.status).toBe('completed');
    expect(polled.completedAt).toBeTruthy();
    expect((await api.getClusterCertificates(ns, name)).rotationInProgress).toBe(false);

    await expect(api.rotateCertificates(ns, name, 'ca')).rejects.toThrow('acknowledge');
  });

  it('adds and removes team members', async () => {
    const api = new MockButlerApi();
    const before = (await api.getTeamMembers(FIXTURE_TEAM)).members.length;
    await api.addTeamMember(FIXTURE_TEAM, { email: 'new@example.com', role: 'viewer' });
    expect((await api.getTeamMembers(FIXTURE_TEAM)).members).toHaveLength(before + 1);
    await api.updateMemberRole(FIXTURE_TEAM, 'new@example.com', 'operator');
    expect(
      (await api.getTeamMembers(FIXTURE_TEAM)).members.find((m: any) => m.email === 'new@example.com').role,
    ).toBe('operator');
    await api.removeTeamMember(FIXTURE_TEAM, 'new@example.com');
    expect((await api.getTeamMembers(FIXTURE_TEAM)).members).toHaveLength(before);
    await expect(api.removeTeamMember(FIXTURE_TEAM, 'new@example.com')).rejects.toThrow('not found');
  });

  it('injects failures per method', async () => {
    const api = new MockButlerApi({
      failures: { getCluster: new Error('boom') },
    });
    await expect(api.getCluster(ns, readyCluster.metadata.name)).rejects.toThrow('boom');
    // Other methods are unaffected.
    await expect(api.listClusters()).resolves.toBeDefined();
  });

  it('honours latencyMs', async () => {
    jest.useFakeTimers();
    try {
      const api = new MockButlerApi({ latencyMs: 500 });
      let settled = false;
      const pending = api.getIdentity().then(() => {
        settled = true;
      });
      await Promise.resolve();
      expect(settled).toBe(false);
      jest.advanceTimersByTime(500);
      await pending;
      expect(settled).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('throws a visible error for unimplemented methods', async () => {
    const api = new MockButlerApi();
    await expect(api.deleteTeam('x')).rejects.toThrow(
      'not implemented in MockButlerApi: deleteTeam',
    );
  });

  it('returns previews for flux and argocd', async () => {
    const api = new MockButlerApi();
    const flux = await api.previewManifests({
      addonName: 'longhorn',
      repository: 'butler-lab/clusters',
      targetPath: 'clusters/ready-delta',
    });
    expect(Object.keys(flux)).toEqual([
      'clusters/ready-delta/longhorn/helmrepository.yaml',
      'clusters/ready-delta/longhorn/helmrelease.yaml',
    ]);
    expect(flux['clusters/ready-delta/longhorn/helmrelease.yaml']).toContain('kind: HelmRelease');
    const argo = await api.previewManifests({
      addonName: 'longhorn',
      repository: 'butler-lab/clusters',
      targetPath: 'clusters/ready-delta',
      tool: 'argocd',
    });
    expect(Object.values(argo)[0]).toContain('kind: Application');
  });
});
