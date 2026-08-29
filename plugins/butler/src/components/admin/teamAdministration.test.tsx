// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * Team administration on the server's real contract: the flat team
 * response, limits kept apart from usage, membership verdicts as the
 * server states them, mutations offered to exactly who the server
 * accepts, and errors shown rather than swallowed.
 */
import '@testing-library/jest-dom';
import { Route, Routes } from 'react-router-dom';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  renderInTestApp,
  TestApiProvider,
  MockErrorApi,
} from '@backstage/test-utils';
import { alertApiRef, errorApiRef } from '@backstage/core-plugin-api';
import type { AlertApi } from '@backstage/core-plugin-api';
import { butlerApiRef } from '../../api/ButlerApi';
import { MockButlerApi } from '../../api/MockButlerApi';
import {
  FIXTURE_TEAM,
  fixtureTeamMembers,
  fixtureTeamResponse,
} from '../../api/fixtures/clusters';
import {
  otherTeamAdminIdentity,
  platformAdminIdentity,
  platformViewerIdentity,
  teamAdminIdentity,
} from '../../api/fixtures/identities';
import { rootRouteRef } from '../../routes';
import { TeamProvider } from '../../contexts/TeamProvider';
import { AdminTeamDetailPage } from './AdminTeamDetailPage';
import { TeamSettingsPage } from '../teams/TeamSettingsPage';
import { TeamMembersPage } from '../teams/TeamMembersPage';

const alertApi: AlertApi = {
  post: jest.fn(),
  alert$: () =>
    ({ subscribe: () => ({ unsubscribe: () => {}, closed: false }) } as any),
};

function renderAt(
  api: MockButlerApi,
  path: string,
  element: JSX.Element,
  routePath: string,
) {
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
          <Route path={routePath} element={element} />
        </Routes>
      </TeamProvider>
    </TestApiProvider>,
    { routeEntries: [path], mountedRoutes: { '/butler': rootRouteRef } },
  );
}

const renderAdmin = (api: MockButlerApi) =>
  renderAt(
    api,
    `/butler/admin/teams/${FIXTURE_TEAM}`,
    <AdminTeamDetailPage />,
    '/butler/admin/teams/:teamName',
  );
const renderSettings = (api: MockButlerApi) =>
  renderAt(
    api,
    `/butler/t/${FIXTURE_TEAM}/settings`,
    <TeamSettingsPage />,
    '/butler/t/:team/settings',
  );
const renderMembers = (api: MockButlerApi) =>
  renderAt(
    api,
    `/butler/t/${FIXTURE_TEAM}/members`,
    <TeamMembersPage />,
    '/butler/t/:team/members',
  );

describe('admin team detail: quota, usage and limits', () => {
  beforeEach(() => {
    localStorage.clear();
    (alertApi.post as jest.Mock).mockClear();
  });

  it('shows limits and usage from the flat response, apart', async () => {
    await renderAdmin(new MockButlerApi({ identity: platformAdminIdentity }));
    await screen.findByRole('heading', { name: 'Resource Usage' });
    expect(screen.getByTestId('quota-summary')).toHaveTextContent(
      'Within limits on 1 of 5 resources.',
    );
    expect(
      screen.getByRole('progressbar', { name: 'Clusters usage' }),
    ).toHaveAttribute('aria-valuenow', '60');
    // Nodes have usage but no limit: no bar, no invented zero.
    expect(
      screen.queryByRole('progressbar', { name: 'Nodes usage' }),
    ).toBeNull();
    expect(screen.getAllByText(/Unlimited/).length).toBeGreaterThan(0);
  });

  it('says when usage was never reported instead of showing zero', async () => {
    const api = new MockButlerApi({ identity: platformAdminIdentity });
    jest
      .spyOn(api, 'getTeam')
      .mockResolvedValue({ ...fixtureTeamResponse, resourceUsage: undefined });
    await renderAdmin(api);
    await screen.findByRole('heading', { name: 'Resource Usage' });
    expect(screen.getByTestId('quota-summary')).toHaveTextContent(
      'has a limit but no reported usage yet',
    );
    expect(screen.getAllByText('Not reported').length).toBeGreaterThan(0);
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('edits limits as a whole map and refreshes', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi({ identity: platformAdminIdentity });
    const update = jest.spyOn(api, 'updateTeam');
    await renderAdmin(api);
    await user.click(
      await screen.findByRole('button', { name: 'Edit Limits' }),
    );
    const dialog = await screen.findByRole('dialog');
    const nodes = within(dialog).getByLabelText('Max nodes across clusters');
    await user.type(nodes, '40');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0]).toEqual([
      FIXTURE_TEAM,
      {
        resourceLimits: {
          defaultNodeCount: 3,
          maxClusters: 10,
          maxTotalNodes: 40,
        },
      },
    ]);
    await waitFor(() =>
      expect(
        screen.getByRole('progressbar', { name: 'Nodes usage' }),
      ).toBeInTheDocument(),
    );
  });

  it('shows the server refusal for a limits change inside the dialog', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi({ identity: platformAdminIdentity });
    jest
      .spyOn(api, 'updateTeam')
      .mockRejectedValue(
        new Error('Platform admin required to change resourceLimits'),
      );
    await renderAdmin(api);
    await user.click(
      await screen.findByRole('button', { name: 'Edit Limits' }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Max clusters'), '0');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(
      await within(dialog).findByText(/Platform admin required/),
    ).toBeInTheDocument();
  });

  it('refuses a malformed quantity before the server', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi({ identity: platformAdminIdentity });
    const update = jest.spyOn(api, 'updateTeam');
    await renderAdmin(api);
    await user.click(
      await screen.findByRole('button', { name: 'Edit Limits' }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Max memory'), 'lots');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(
      await within(dialog).findByText(/Kubernetes quantity/),
    ).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });
});

describe('admin team detail: membership', () => {
  beforeEach(() => {
    localStorage.clear();
    (alertApi.post as jest.Mock).mockClear();
  });

  it('surfaces a failed role change instead of swallowing it', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi({ identity: platformAdminIdentity });
    jest
      .spyOn(api, 'updateMemberRole')
      .mockRejectedValue(
        new Error('Invalid role. Must be admin, operator, or viewer'),
      );
    await renderAdmin(api);
    const direct = fixtureTeamMembers.find(
      m => m.source === 'direct' && m.role === 'operator',
    )!;
    const select = await screen.findByLabelText(`Role for ${direct.email}`);
    await user.selectOptions(select, 'viewer');
    await waitFor(() =>
      expect(alertApi.post).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringMatching(/Failed to change role: Invalid role/),
          severity: 'error',
        }),
      ),
    );
  });

  it('shows group members as manageable only through their group', async () => {
    await renderAdmin(new MockButlerApi({ identity: platformAdminIdentity }));
    const viaGroup = fixtureTeamMembers.find(m => m.source === 'group')!;
    await screen.findByText(viaGroup.email);
    expect(screen.queryByLabelText(`Role for ${viaGroup.email}`)).toBeNull();
    expect(screen.getAllByText('via group').length).toBeGreaterThan(0);
  });

  it('warns before removing the only direct admin', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi({ identity: platformAdminIdentity });
    jest
      .spyOn(api, 'getCurrentUser')
      .mockResolvedValue({ email: 'someone-else@example.com' });
    await renderAdmin(api);
    const admin = fixtureTeamMembers.find(m => m.role === 'admin')!;
    await screen.findByText(admin.email);
    const row = screen.getByText(admin.email).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /Remove/ }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('only direct admin');
    expect(dialog).toHaveTextContent('server does not prevent');
  });

  it('adds and removes a group sync through the server contract', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi({ identity: platformAdminIdentity });
    const add = jest.spyOn(api, 'addGroupSync');
    await renderAdmin(api);
    await user.click(await screen.findByRole('button', { name: /Add Group/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByLabelText(/Group Name/i),
      'platform-ops',
    );
    await user.click(
      within(dialog).getByRole('button', { name: /^Add Group/ }),
    );
    await waitFor(() =>
      expect(add).toHaveBeenCalledWith(
        FIXTURE_TEAM,
        expect.objectContaining({ group: 'platform-ops', role: 'viewer' }),
      ),
    );
    expect(await screen.findByText('platform-ops')).toBeInTheDocument();
  });

  it('is refused to a platform viewer', async () => {
    await renderAdmin(new MockButlerApi({ identity: platformViewerIdentity }));
    expect(
      await screen.findByText(/Platform administrator access is required/),
    ).toBeInTheDocument();
  });
});

describe('team settings and members for team roles', () => {
  beforeEach(() => localStorage.clear());

  it('shows limits against usage from the real fields', async () => {
    await renderSettings(new MockButlerApi({ identity: teamAdminIdentity }));
    await screen.findByRole('heading', { name: 'Settings' });
    expect(screen.getByText('Max Clusters')).toBeInTheDocument();
    expect(screen.getByText('6 / 10')).toBeInTheDocument();
    expect(screen.getByText(/Nodes/)).toBeInTheDocument();
    expect(screen.getByText('12 (no limit)')).toBeInTheDocument();
    expect(screen.getByText('eng-readonly')).toBeInTheDocument();
  });

  it('tells a team admin that membership is administered by platform admins', async () => {
    await renderMembers(new MockButlerApi({ identity: teamAdminIdentity }));
    await screen.findByRole('heading', { name: 'Members' });
    expect(
      screen.getByText(/administered by platform admins/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add Member/ })).toBeNull();
  });

  it('keeps the member list from another team admin but not the team record', async () => {
    const api = new MockButlerApi({ identity: otherTeamAdminIdentity });
    await expect(api.getTeamMembers(FIXTURE_TEAM)).rejects.toThrow(
      /Access denied to team/,
    );
    await expect(api.getTeam(FIXTURE_TEAM)).resolves.toMatchObject({
      name: FIXTURE_TEAM,
    });
    await expect(api.getTeamGroupSyncs(FIXTURE_TEAM)).resolves.toMatchObject({
      groups: expect.any(Array),
    });
    await expect(
      api.addTeamMember(FIXTURE_TEAM, {
        email: 'x@example.com',
        role: 'viewer',
      }),
    ).rejects.toThrow(/platform admin required/);
    await expect(
      api.updateTeam(FIXTURE_TEAM, { displayName: 'X' }),
    ).rejects.toThrow(/Team admin of/);
  });
});
