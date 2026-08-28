// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import '@testing-library/jest-dom';
import { Route, Routes } from 'react-router-dom';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  renderInTestApp,
  TestApiProvider,
  MockErrorApi,
} from '@backstage/test-utils';
import { alertApiRef, errorApiRef } from '@backstage/core-plugin-api';
import { butlerApiRef } from '../../api/ButlerApi';
import { MockButlerApi } from '../../api/MockButlerApi';
import { FIXTURE_TEAM, fixtureTeamMembers } from '../../api/fixtures/clusters';
import { platformViewerIdentity } from '../../api/fixtures/identities';
import { rootRouteRef } from '../../routes';
import { TeamProvider } from '../../contexts/TeamProvider';
import { AccessOverviewPage, buildAccessRows } from './AccessOverviewPage';

const alertApi = {
  post: jest.fn(),
  alert$: () => ({
    subscribe: () => ({ unsubscribe: () => {}, closed: false }),
  }),
} as any;

function renderPage(api: MockButlerApi) {
  return renderInTestApp(
    <TestApiProvider
      apis={[
        [butlerApiRef, api],
        [alertApiRef, alertApi],
        [errorApiRef, new MockErrorApi()],
      ]}
    >
      <TeamProvider>
        <Routes>
          <Route path="/butler/admin/access" element={<AccessOverviewPage />} />
        </Routes>
      </TeamProvider>
    </TestApiProvider>,
    {
      routeEntries: ['/butler/admin/access'],
      mountedRoutes: { '/butler': rootRouteRef },
    },
  );
}

describe('buildAccessRows', () => {
  it('joins users, memberships and group mappings without inventing roles', () => {
    const rows = buildAccessRows(
      [
        {
          username: 'ada',
          email: 'ada@example.com',
          displayName: 'Ada',
          phase: 'Active',
          disabled: false,
          authType: 'sso',
          platformRole: 'admin',
        },
        {
          username: 'nobody',
          email: 'nobody@example.com',
          phase: 'Active',
          disabled: false,
          authType: 'internal',
        },
      ],
      [
        {
          team: 'platform',
          members: [
            {
              email: 'ada@example.com',
              role: 'admin',
              source: 'direct',
              canRemove: true,
            },
            {
              email: 'linus@example.com',
              role: 'viewer',
              source: 'group',
              groupName: 'eng-readonly',
              canRemove: false,
            },
          ],
          groups: [
            { name: 'eng-readonly', role: 'viewer', identityProvider: 'corp' },
          ],
          groupMemberCounts: { 'eng-readonly': 1 },
        },
      ],
    );
    const ada = rows.users.find(u => u.email === 'ada@example.com')!;
    expect(ada.platformRole).toBe('admin');
    expect(ada.teams).toEqual([
      {
        team: 'platform',
        role: 'admin',
        source: 'direct',
        groupName: undefined,
      },
    ]);
    const linus = rows.users.find(u => u.email === 'linus@example.com')!;
    expect(linus.known).toBe(false);
    expect(linus.teams[0]).toMatchObject({
      role: 'viewer',
      source: 'group',
      groupName: 'eng-readonly',
    });
    expect(
      rows.users.find(u => u.email === 'nobody@example.com')!.teams,
    ).toEqual([]);
    expect(rows.groups).toEqual([
      {
        name: 'eng-readonly',
        identityProvider: 'corp',
        teams: [{ team: 'platform', role: 'viewer' }],
        observed: 1,
      },
    ]);
  });
});

describe('AccessOverviewPage', () => {
  beforeEach(() => localStorage.clear());

  it('renders users and groups for a platform viewer, read-only', async () => {
    const user = userEvent.setup();
    await renderPage(new MockButlerApi({ identity: platformViewerIdentity }));
    expect(
      await screen.findByRole('heading', { name: 'Access' }),
    ).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'User access' });
    const direct = fixtureTeamMembers.find(m => m.source === 'direct')!;
    expect(within(table).getByText(direct.email)).toBeInTheDocument();
    const row = within(table).getByText(direct.email).closest('tr')!;
    expect(row.textContent).toMatch(
      new RegExp(`${FIXTURE_TEAM} ${direct.role} \\(direct\\)`),
    );
    expect(
      screen.queryByRole('button', { name: /Add|Remove|Edit/ }),
    ).toBeNull();

    await user.click(screen.getByRole('radio', { name: /^Groups/ }));
    const groups = await screen.findByRole('table', { name: 'Group access' });
    expect(within(groups).getByText('eng-readonly')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Search groups'), 'zzz');
    expect(
      within(screen.getByRole('table', { name: 'Group access' })).queryByText(
        'eng-readonly',
      ),
    ).toBeNull();
  });
});
