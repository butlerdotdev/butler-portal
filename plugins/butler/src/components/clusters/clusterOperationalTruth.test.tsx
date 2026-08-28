// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * The detail page tells the operator what the controller reports, not
 * what the phase implies. The shapes here come from the live estate:
 * e2e-talos on 2026-08-28 was phase Ready with one of two workers
 * missing for fifteen days, and the console reads that as "Workers
 * Ready". This page must not.
 */
import '@testing-library/jest-dom';
import { Route, Routes } from 'react-router-dom';
import { screen, waitFor, within } from '@testing-library/react';
import {
  renderInTestApp,
  TestApiProvider,
  MockPermissionApi,
  MockErrorApi,
} from '@backstage/test-utils';
import { alertApiRef, errorApiRef } from '@backstage/core-plugin-api';
import type { AlertApi } from '@backstage/core-plugin-api';
import { permissionApiRef } from '@backstage/plugin-permission-react';
import { butlerApiRef } from '../../api/ButlerApi';
import { MockButlerApi } from '../../api/MockButlerApi';
import {
  FIXTURE_NAMESPACE,
  FIXTURE_TEAM,
  readyCluster,
} from '../../api/fixtures/clusters';
import {
  otherTeamAdminIdentity,
  platformAdminIdentity,
  teamViewerIdentity,
} from '../../api/fixtures/identities';
import type { Cluster } from '../../api/types/clusters';
import { rootRouteRef } from '../../routes';
import { TeamProvider } from '../../contexts/TeamProvider';
import { ClusterDetailPage } from './ClusterDetailPage';

const alertApi: AlertApi = {
  post: jest.fn(),
  alert$: () =>
    ({ subscribe: () => ({ unsubscribe: () => {}, closed: false }) } as any),
};

const fifteenDaysAgo = new Date(
  Date.now() - 15 * 24 * 3600 * 1000,
).toISOString();

/** readyCluster with the live e2e-talos worker state layered on. */
const stuckWorkers: Cluster = {
  ...readyCluster,
  metadata: {
    ...readyCluster.metadata,
    name: 'stuck-workers',
    labels: { 'butler.butlerlabs.dev/environment': 'e2e-dev' },
    annotations: { 'butler.butlerlabs.dev/creator-email': 'ops@example.com' },
  },
  spec: {
    ...readyCluster.spec,
    workers: { ...readyCluster.spec.workers, replicas: 2 },
  },
  status: {
    ...readyCluster.status,
    phase: 'Ready',
    workerNodesDesired: 2,
    workerNodesReady: 1,
    lbAllocationRef: { name: 'lb' },
    conditions: [
      {
        type: 'NetworkReady',
        status: 'True',
        reason: 'Ready',
        message: 'LB IPs allocated: 10.40.2.56/30',
      },
      {
        type: 'ControlPlaneReady',
        status: 'True',
        reason: 'ControlPlaneReady',
        message: 'Control plane is ready',
      },
      {
        type: 'WorkersReady',
        status: 'False',
        reason: 'WorkersProvisioning',
        message: 'Workers provisioning: 1/2 ready',
        lastTransitionTime: fifteenDaysAgo,
      },
      {
        type: 'Ready',
        status: 'True',
        reason: 'ReconcileSucceeded',
        message: 'All operations healthy',
      },
    ],
  } as Cluster['status'],
};

function renderDetail(
  api: MockButlerApi,
  clusterName: string,
  team = FIXTURE_TEAM,
) {
  return renderInTestApp(
    <TestApiProvider
      apis={[
        [butlerApiRef, api],
        [permissionApiRef, new MockPermissionApi()],
        [alertApiRef, alertApi],
        [errorApiRef, new MockErrorApi()],
      ]}
    >
      <TeamProvider>
        <Routes>
          <Route
            path="/butler/t/:team/clusters/:namespace/:name"
            element={<ClusterDetailPage />}
          />
        </Routes>
      </TeamProvider>
    </TestApiProvider>,
    {
      routeEntries: [
        `/butler/t/${team}/clusters/${FIXTURE_NAMESPACE}/${clusterName}`,
      ],
      mountedRoutes: { '/butler': rootRouteRef },
    },
  );
}

const withClusters = (
  identity = platformAdminIdentity,
  extra: Cluster[] = [stuckWorkers],
) => new MockButlerApi({ identity, clusters: [readyCluster, ...extra] });

describe('the overview tells the truth about workers and the control plane', () => {
  beforeEach(() => localStorage.clear());

  it('flags workers that have not converged although the phase is Ready', async () => {
    await renderDetail(withClusters(), 'stuck-workers');
    expect(
      await screen.findByText('Workers have not converged'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/1\/2 workers ready for 15 days/),
    ).toBeInTheDocument();
    // The status card does not upgrade a False condition to Ready.
    expect(screen.getAllByText('1/2 ready').length).toBeGreaterThan(0);
    expect(screen.queryByText('Workers Ready')).not.toBeInTheDocument();
  });

  it('reports the control plane from its own condition', async () => {
    await renderDetail(withClusters(), 'stuck-workers');
    await screen.findByText('Workers have not converged');
    expect(
      screen.getAllByText('Control plane is ready').length,
    ).toBeGreaterThan(0);
  });

  it('shows the environment and creator from the object', async () => {
    await renderDetail(withClusters(), 'stuck-workers');
    await screen.findByText('Workers have not converged');
    expect(screen.getAllByText('e2e-dev').length).toBeGreaterThan(0);
    expect(screen.getByText('ops@example.com')).toBeInTheDocument();
  });

  it('explains absent machine and load balancer requests instead of hiding them', async () => {
    const api = withClusters();
    // The live estate: no MachineRequests or LoadBalancerRequests on a tenant cluster.
    jest
      .spyOn(api, 'getClusterMachineRequests')
      .mockResolvedValue({ machineRequests: [] });
    jest
      .spyOn(api, 'getClusterLoadBalancerRequests')
      .mockResolvedValue({ loadBalancerRequests: [] });
    await renderDetail(api, 'stuck-workers');
    await screen.findByText('Workers have not converged');
    expect(
      await screen.findByText(
        /Cluster API machines managed through the provider/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/platform pool/)).toBeInTheDocument();
    expect(screen.getAllByText(/10\.40\.2\.56\/30/).length).toBeGreaterThan(1);
  });

  it('shows a requested scale until the controller targets it', async () => {
    const scaling: Cluster = {
      ...stuckWorkers,
      metadata: { ...stuckWorkers.metadata, name: 'scaling' },
      spec: {
        ...stuckWorkers.spec,
        workers: { ...stuckWorkers.spec.workers, replicas: 3 },
      },
      status: {
        ...stuckWorkers.status,
        workerNodesReady: 2,
        workerNodesDesired: 2,
        conditions: stuckWorkers.status!.conditions!.map(c =>
          c.type === 'WorkersReady'
            ? {
                ...c,
                status: 'True',
                reason: 'WorkersReady',
                message: 'All workers ready',
              }
            : c,
        ),
      } as Cluster['status'],
    };
    await renderDetail(
      withClusters(platformAdminIdentity, [scaling]),
      'scaling',
    );
    expect((await screen.findAllByText('Scaling to 3')).length).toBeGreaterThan(
      0,
    );
    expect(
      screen.getByText(/controller still targeting 2/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Workers have not converged'),
    ).not.toBeInTheDocument();
  });

  it('stays quiet about a healthy cluster', async () => {
    await renderDetail(withClusters(), readyCluster.metadata.name);
    await screen.findByRole('heading', { name: readyCluster.metadata.name });
    expect(
      screen.queryByText(
        /have not converged|Degraded|Stale Nodes|Cluster Failed/,
      ),
    ).not.toBeInTheDocument();
  });
});

describe('team boundary', () => {
  beforeEach(() => localStorage.clear());

  it('refuses another team’s admin the cluster and every action', async () => {
    const api = withClusters(otherTeamAdminIdentity);
    const scale = jest.spyOn(api, 'scaleCluster');
    await renderDetail(api, 'stuck-workers', 'other-team');
    await waitFor(() =>
      expect(screen.getByText('Cluster not found')).toBeInTheDocument(),
    );
    expect(screen.getByText(/forbidden/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Scale Workers' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    await expect(
      api.getClusterNodes(FIXTURE_NAMESPACE, 'stuck-workers'),
    ).rejects.toThrow(/forbidden/);
    await expect(
      api.exportClusterYAML(FIXTURE_NAMESPACE, 'stuck-workers'),
    ).rejects.toThrow(/forbidden/);
    await expect(
      api.scaleCluster(FIXTURE_NAMESPACE, 'stuck-workers', {
        replicas: 3,
      } as any),
    ).rejects.toThrow(/forbidden/);
    expect(scale).toHaveBeenCalled();
  });

  it('lets a team viewer read the same truths without any action', async () => {
    await renderDetail(withClusters(teamViewerIdentity), 'stuck-workers');
    expect(
      await screen.findByText('Workers have not converged'),
    ).toBeInTheDocument();
    for (const action of [
      'Edit',
      'Scale Workers',
      'Change Environment',
      'Delete',
    ]) {
      expect(screen.queryByRole('button', { name: action })).toBeNull();
    }
    const status = screen.getByText('Status').closest('div');
    if (status)
      expect(
        within(status as HTMLElement).queryByText('Workers Ready'),
      ).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Export YAML' })).toBeEnabled(),
    );
  });
});
