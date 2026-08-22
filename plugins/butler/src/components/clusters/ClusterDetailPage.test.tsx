// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import '@testing-library/jest-dom';
import { Route, Routes } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
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
  failedCluster,
  degradedCluster,
} from '../../api/fixtures/clusters';
import { rootRouteRef } from '../../routes';
import { TeamProvider } from '../../contexts/TeamProvider';
import { ClusterDetailPage } from './ClusterDetailPage';

const alertApi: AlertApi = {
  post: () => {},
  alert$: () => ({ subscribe: () => ({ unsubscribe: () => {}, closed: false }) }) as any,
};

function renderDetail(api: MockButlerApi, clusterName: string) {
  const path = `/butler/t/${FIXTURE_TEAM}/clusters/${FIXTURE_NAMESPACE}/${clusterName}`;
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
      routeEntries: [path],
      mountedRoutes: { '/butler': rootRouteRef },
    },
  );
}

describe('ClusterDetailPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the Ready cluster with phase and conditions', async () => {
    await renderDetail(new MockButlerApi(), readyCluster.metadata.name);

    expect(
      await screen.findByRole('heading', { name: readyCluster.metadata.name }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Ready').length).toBeGreaterThan(0);
    expect(screen.getAllByText(readyCluster.spec.kubernetesVersion as string).length).toBeGreaterThan(0);
    expect(screen.getByText('WorkersReady')).toBeInTheDocument();
    expect(screen.getByText('3 of 3 worker nodes ready')).toBeInTheDocument();
    expect(screen.getByText('Cluster is ready for use')).toBeInTheDocument();
  });

  it('renders the Failed cluster with its failure message', async () => {
    await renderDetail(new MockButlerApi(), failedCluster.metadata.name);

    expect(
      await screen.findByRole('heading', { name: failedCluster.metadata.name }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Failed').length).toBeGreaterThan(0);
    const failure = failedCluster.status!.conditions!.find(c => c.type === 'Ready')!;
    expect(screen.getByText(failure.message!)).toBeInTheDocument();
    expect(screen.getByText(failure.reason!)).toBeInTheDocument();
  });

  it('renders a degraded Ready condition reason', async () => {
    await renderDetail(new MockButlerApi(), degradedCluster.metadata.name);

    await screen.findByRole('heading', { name: degradedCluster.metadata.name });
    expect(
      screen.getAllByText(/metallb speaker DaemonSet has 1 unavailable pod$/).length,
    ).toBe(2);
    expect(screen.getByText('AddonDegraded')).toBeInTheDocument();
  });

  it('shows the error state when getCluster fails', async () => {
    const api = new MockButlerApi({ failures: { getCluster: new Error('boom') } });
    await renderDetail(api, readyCluster.metadata.name);

    await waitFor(() => {
      expect(screen.getByText('Cluster not found')).toBeInTheDocument();
    });
    expect(screen.getByText('boom')).toBeInTheDocument();
  });
});
