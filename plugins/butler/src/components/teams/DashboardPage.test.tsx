// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import '@testing-library/jest-dom';
import { Route, Routes } from 'react-router-dom';
import { screen } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { butlerApiRef } from '../../api/ButlerApi';
import { MockButlerApi } from '../../api/MockButlerApi';
import {
  FIXTURE_TEAM,
  fixtureClusters,
  readyCluster,
} from '../../api/fixtures/clusters';
import { rootRouteRef } from '../../routes';
import { DashboardPage } from './DashboardPage';

function renderDashboard(api: MockButlerApi) {
  return renderInTestApp(
    <TestApiProvider apis={[[butlerApiRef, api]]}>
      <Routes>
        <Route path="/butler/t/:team" element={<DashboardPage />} />
      </Routes>
    </TestApiProvider>,
    {
      routeEntries: [`/butler/t/${FIXTURE_TEAM}`],
      mountedRoutes: { '/butler': rootRouteRef },
    },
  );
}

describe('DashboardPage', () => {
  it('renders team stats, recent clusters and the create action', async () => {
    await renderDashboard(new MockButlerApi());

    expect(
      await screen.findByRole('heading', { name: 'Dashboard' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Total Clusters')).toBeInTheDocument();
    expect(screen.getByText('Ready', { selector: 'p' })).toBeInTheDocument();
    expect(
      screen.getByText('Provisioning', { selector: 'p' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Failed', { selector: 'p' })).toBeInTheDocument();

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(Math.min(5, fixtureClusters.length));
    const row = screen.getByRole('link', {
      name: new RegExp(`^${readyCluster.metadata.name}`),
    });
    expect(row).toHaveTextContent(readyCluster.spec.kubernetesVersion);
    expect(row).toHaveTextContent(/worker/);
    expect(row).toHaveTextContent('Ready');
    expect(row).toHaveAttribute(
      'href',
      `/butler/t/${FIXTURE_TEAM}/clusters/${readyCluster.metadata.namespace}/${readyCluster.metadata.name}`,
    );

    expect(screen.getByRole('link', { name: /View all/ })).toHaveAttribute(
      'href',
      `/butler/t/${FIXTURE_TEAM}/clusters`,
    );
    expect(
      screen.getByRole('link', { name: 'Create Cluster' }),
    ).toHaveAttribute('href', `/butler/t/${FIXTURE_TEAM}/clusters/new`);
  });

  it('shows the empty state when the team has no clusters', async () => {
    const api = new MockButlerApi();
    api.listClusters = async () => ({ clusters: [] });
    await renderDashboard(api);

    expect(await screen.findByText('No clusters yet')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Create Cluster' }),
    ).toBeInTheDocument();
  });
});
