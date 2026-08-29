// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import '@testing-library/jest-dom';
import { Route, Routes } from 'react-router-dom';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { butlerApiRef } from '../../api/ButlerApi';
import { MockButlerApi } from '../../api/MockButlerApi';
import {
  FIXTURE_TEAM,
  fixtureTeamMembers,
  fixtureTeams,
} from '../../api/fixtures/clusters';
import { rootRouteRef } from '../../routes';
import { TeamProvider } from '../../contexts/TeamProvider';
import { TeamMembersPage } from './TeamMembersPage';

function renderPage(api: MockButlerApi) {
  return renderInTestApp(
    <TestApiProvider apis={[[butlerApiRef, api]]}>
      <TeamProvider>
        <Routes>
          <Route path="/butler/t/:team/members" element={<TeamMembersPage />} />
        </Routes>
      </TeamProvider>
    </TestApiProvider>,
    {
      routeEntries: [`/butler/t/${FIXTURE_TEAM}/members`],
      mountedRoutes: { '/butler': rootRouteRef },
    },
  );
}

describe('TeamMembersPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders one row per member with role and source for a team admin', async () => {
    await renderPage(new MockButlerApi());

    expect(
      await screen.findByRole('heading', { name: 'Members' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Member' })).toBeVisible();

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(fixtureTeamMembers.length);
    expect(rows[0]).toHaveTextContent('Ada Lovelace');
    expect(rows[0]).toHaveTextContent('(you)');
    expect(rows[0]).toHaveTextContent('admin');
    expect(rows[0]).toHaveTextContent('direct member');
    expect(rows[2]).toHaveTextContent('via eng-readonly');
    expect(screen.getByText('Direct member')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remove Member grace@example.com' }),
    ).toBeInTheDocument();
  });

  it('hides member mutation for a viewer', async () => {
    const api = new MockButlerApi({
      identity: {
        isPlatformAdmin: false,
        teams: fixtureTeams.map(t => ({ ...t, role: 'viewer' })),
      },
    });
    await renderPage(api);
    await screen.findByRole('heading', { name: 'Members' });

    expect(
      screen.queryByRole('button', { name: 'Add Member' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Remove Member/ }),
    ).not.toBeInTheDocument();
  });

  it('removes a member through the confirmation dialog', async () => {
    const api = new MockButlerApi();
    await renderPage(api);
    await screen.findByRole('heading', { name: 'Members' });

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Member grace@example.com' }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Are you sure you want to remove');
    expect(dialog).toHaveTextContent('grace@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Remove Member' }));

    await waitFor(() =>
      expect(screen.getAllByRole('listitem')).toHaveLength(
        fixtureTeamMembers.length - 1,
      ),
    );
  });

  it('shows the error state when members fail to load', async () => {
    await renderPage(
      new MockButlerApi({ failures: { getTeamMembers: new Error('boom') } }),
    );
    expect(await screen.findByText('Failed to load members')).toBeVisible();
    expect(screen.getByText('boom')).toBeVisible();
  });
});
