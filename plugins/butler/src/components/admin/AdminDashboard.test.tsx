// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import '@testing-library/jest-dom';
import { Route, Routes } from 'react-router-dom';
import { screen, within } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { butlerApiRef } from '../../api/ButlerApi';
import { MockButlerApi } from '../../api/MockButlerApi';
import {
  fixtureClusters,
  fixtureTeams,
  fixtureUsers,
} from '../../api/fixtures/clusters';
import { rootRouteRef } from '../../routes';
import { AdminDashboard } from './AdminDashboard';

function renderAdmin(api: MockButlerApi) {
  return renderInTestApp(
    <TestApiProvider apis={[[butlerApiRef, api]]}>
      <Routes>
        <Route path="/butler/admin" element={<AdminDashboard />} />
      </Routes>
    </TestApiProvider>,
    {
      routeEntries: ['/butler/admin'],
      mountedRoutes: { '/butler': rootRouteRef },
    },
  );
}

describe('AdminDashboard', () => {
  it('summarises the whole estate and lists every team', async () => {
    const api = new MockButlerApi();
    await renderAdmin(api);

    expect(
      await screen.findByRole('heading', { name: 'Platform Overview' }),
    ).toBeInTheDocument();

    const teamsValue = screen.getByText('Total Teams').nextElementSibling;
    expect(teamsValue).toHaveTextContent(String(fixtureTeams.length));
    const usersValue = screen.getByText('Total Users').nextElementSibling;
    expect(usersValue).toHaveTextContent(String(fixtureUsers.length));

    // The management cluster is counted alongside tenant clusters.
    const management = await api.getManagement();
    const clustersValue = screen.getByText('Total Clusters').nextElementSibling;
    expect(clustersValue).toHaveTextContent(
      String(fixtureClusters.length + (management ? 1 : 0)),
    );
    expect(screen.getByText('Cluster Health')).toBeInTheDocument();

    const list = screen.getByRole('list', { name: 'Teams' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(
      Math.min(5, fixtureTeams.length),
    );
    const first = fixtureTeams[0];
    expect(
      within(list).getByRole('link', {
        name: new RegExp(`^${first.displayName}`),
      }),
    ).toHaveAttribute('href', `/butler/admin/teams/${first.name}`);

    expect(screen.getByRole('link', { name: /Create Team/ })).toHaveAttribute(
      'href',
      '/butler/admin/teams',
    );
    expect(screen.getByRole('link', { name: /Invite User/ })).toHaveAttribute(
      'href',
      '/butler/admin/users',
    );
    expect(
      screen.getByRole('link', { name: /Manage Providers/ }),
    ).toHaveAttribute('href', '/butler/admin/providers');
  });

  it('shows the empty teams line when no teams exist', async () => {
    const api = new MockButlerApi();
    api.listAllTeams = async () => ({ teams: [] });
    await renderAdmin(api);
    expect(await screen.findByText('No teams created yet')).toBeInTheDocument();
  });
});
