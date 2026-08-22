// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import '@testing-library/jest-dom';
import { Route, Routes } from 'react-router-dom';
import { screen } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { butlerApiRef } from '../../api/ButlerApi';
import { MockButlerApi } from '../../api/MockButlerApi';
import { fixtureTeams } from '../../api/fixtures/clusters';
import { rootRouteRef } from '../../routes';
import { TeamProvider } from '../../contexts/TeamProvider';
import { OverviewPage } from './OverviewPage';

function renderOverview(api: MockButlerApi) {
  return renderInTestApp(
    <TestApiProvider apis={[[butlerApiRef, api]]}>
      <TeamProvider>
        <Routes>
          <Route path="/butler" element={<OverviewPage />} />
          <Route path="/butler/admin" element={<h1>Platform Overview</h1>} />
        </Routes>
      </TeamProvider>
    </TestApiProvider>,
    {
      routeEntries: ['/butler'],
      mountedRoutes: { '/butler': rootRouteRef },
    },
  );
}

describe('OverviewPage', () => {
  it('renders one team card per membership with role and cluster count', async () => {
    await renderOverview(new MockButlerApi());

    expect(
      await screen.findByRole('heading', { name: 'Overview' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(fixtureTeams.length);

    const admin = fixtureTeams.find(t => t.role === 'admin')!;
    const card = screen.getByRole('link', {
      name: new RegExp(`^${admin.displayName}`),
    });
    expect(card).toHaveTextContent('Admin');
    expect(card).toHaveTextContent(`@${admin.name}`);
    expect(card).toHaveTextContent(`${admin.clusterCount} clusters`);
    expect(card).toHaveAttribute('href', `/butler/t/${admin.name}`);

    const viewer = fixtureTeams.find(t => t.role !== 'admin')!;
    expect(
      screen.getByRole('link', { name: new RegExp(`^${viewer.displayName}`) }),
    ).not.toHaveTextContent('Admin');
  });

  it('sends a platform admin without memberships to the platform overview', async () => {
    const api = new MockButlerApi();
    api.getIdentity = async () => ({
      authenticated: true,
      email: 'ops@example.com',
      displayName: 'Ops',
      isPlatformAdmin: true,
      teams: [],
    });
    await renderOverview(api);
    expect(
      await screen.findByRole('heading', { name: 'Platform Overview' }),
    ).toBeInTheDocument();
  });
});
