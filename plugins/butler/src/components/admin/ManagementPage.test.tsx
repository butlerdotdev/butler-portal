// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import '@testing-library/jest-dom';
import { Route, Routes } from 'react-router-dom';
import { fireEvent, screen } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { butlerApiRef } from '../../api/ButlerApi';
import { MockButlerApi } from '../../api/MockButlerApi';
import {
  fixtureManagement,
  fixtureManagementNodes,
} from '../../api/fixtures/clusters';
import { rootRouteRef } from '../../routes';
import { TeamProvider } from '../../contexts/TeamProvider';
import { ManagementPage } from './ManagementPage';

function renderPage(api: MockButlerApi) {
  return renderInTestApp(
    <TestApiProvider apis={[[butlerApiRef, api]]}>
      <TeamProvider>
        <Routes>
          <Route path="/butler/admin/management" element={<ManagementPage />} />
        </Routes>
      </TeamProvider>
    </TestApiProvider>,
    {
      routeEntries: ['/butler/admin/management'],
      mountedRoutes: { '/butler': rootRouteRef },
    },
  );
}

describe('ManagementPage', () => {
  beforeEach(() => localStorage.clear());

  it('renders the console header, stat row and overview sections', async () => {
    await renderPage(new MockButlerApi());

    expect(
      await screen.findByRole('heading', { name: 'Management Cluster' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Management')).toBeInTheDocument();
    expect(
      screen.getByText(`Kubernetes ${fixtureManagement.kubernetesVersion}`),
    ).toBeInTheDocument();

    // Stat row: Nodes ready/total, tenant clusters, namespaces, version.
    expect(
      screen.getByText(
        `${fixtureManagement.nodes.ready}/${fixtureManagement.nodes.total}`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Tenant Clusters')).toBeInTheDocument();
    expect(screen.getByText('Version')).toBeInTheDocument();

    // Overview sections.
    expect(
      screen.getByRole('heading', { name: 'System Namespaces' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Tenant Namespaces' }),
    ).toBeInTheDocument();
    fixtureManagement.systemNamespaces.forEach(ns => {
      expect(screen.getByText(ns.namespace)).toBeInTheDocument();
    });
    expect(screen.getByText('Cluster')).toBeInTheDocument();
    expect(screen.getByText('Tenant Namespace')).toBeInTheDocument();
  });

  it('lazy-loads the nodes tab', async () => {
    await renderPage(new MockButlerApi());
    await screen.findByRole('heading', { name: 'Management Cluster' });

    fireEvent.click(screen.getByRole('tab', { name: 'Nodes' }));

    expect(
      await screen.findByText(fixtureManagementNodes[0].name),
    ).toBeInTheDocument();
    expect(
      screen.getByText(fixtureManagementNodes[0].internalIP),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Ready').length).toBeGreaterThan(0);
  });

  it('shows the error state with retry when the fetch fails', async () => {
    await renderPage(
      new MockButlerApi({ failures: { getManagement: new Error('boom') } }),
    );

    expect(
      await screen.findByText('Failed to load management cluster'),
    ).toBeInTheDocument();
    expect(screen.getByText('boom')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('denies access when the user is not a platform admin', async () => {
    await renderPage(
      new MockButlerApi({ failures: { getIdentity: new Error('nope') } }),
    );

    expect(await screen.findByText('Access Denied')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Management Cluster' }),
    ).not.toBeInTheDocument();
  });
});
