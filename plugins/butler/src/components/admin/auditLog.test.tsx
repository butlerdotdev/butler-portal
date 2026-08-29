// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * The audit pages draw what the server returns: sentences for the
 * router shapes it records, outcomes that separate refused from failed,
 * server-side filters and pages, and a detail view that never renders a
 * credential. Who may read which log is the server's decision, mirrored.
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
import { butlerApiRef } from '../../api/ButlerApi';
import { MockButlerApi } from '../../api/MockButlerApi';
import { FIXTURE_TEAM, fixtureAuditEntries } from '../../api/fixtures/clusters';
import {
  otherTeamAdminIdentity,
  platformAdminIdentity,
  platformViewerIdentity,
  teamAdminIdentity,
  teamOperatorIdentity,
  teamViewerIdentity,
} from '../../api/fixtures/identities';
import { rootRouteRef } from '../../routes';
import { TeamProvider } from '../../contexts/TeamProvider';
import { AuditLogPage } from './AuditLogPage';
import { TeamAuditPage } from '../teams/TeamAuditPage';

const alertApi = {
  post: jest.fn(),
  alert$: () => ({
    subscribe: () => ({ unsubscribe: () => {}, closed: false }),
  }),
} as any;

function render(
  api: MockButlerApi,
  path: string,
  routePath: string,
  element: JSX.Element,
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
const renderPlatform = (api: MockButlerApi) =>
  render(api, '/butler/admin/audit', '/butler/admin/audit', <AuditLogPage />);
const renderTeam = (api: MockButlerApi, team = FIXTURE_TEAM) =>
  render(
    api,
    `/butler/t/${team}/audit`,
    '/butler/t/:team/audit',
    <TeamAuditPage />,
  );

describe('platform audit log', () => {
  beforeEach(() => localStorage.clear());

  it('renders each event as a sentence with actor, acting team and outcome', async () => {
    await renderPlatform(
      new MockButlerApi({ identity: platformAdminIdentity }),
    );
    const table = await screen.findByRole('table', {
      name: 'Platform audit log',
    });
    expect(within(table).getByText('Added member')).toBeInTheDocument();
    expect(
      within(table).getByText(`nobody@example.com to ${FIXTURE_TEAM}`),
    ).toBeInTheDocument();
    expect(
      within(table).getByText('Removed group mapping'),
    ).toBeInTheDocument();
    expect(within(table).getByText('Scaled workers')).toBeInTheDocument();
    expect(within(table).getByText('Signed in')).toBeInTheDocument();
    expect(within(table).getAllByText('Refused').length).toBe(1);
    expect(within(table).getAllByText('Failed').length).toBe(1);
    expect(within(table).getAllByText('Succeeded').length).toBeGreaterThan(2);
    expect(within(table).getAllByText('platform').length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        `Showing 1 to ${fixtureAuditEntries.length} of ${fixtureAuditEntries.length}`,
      ),
    ).toBeInTheDocument();
  });

  it('sends filters and pages to the server rather than filtering locally', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi({ identity: platformAdminIdentity });
    const list = jest.spyOn(api, 'listAuditLog');
    await renderPlatform(api);
    await screen.findByRole('table', { name: 'Platform audit log' });
    expect(list).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 25, offset: 0 }),
    );

    await user.type(screen.getByLabelText('Actor'), 'grace@example.com');
    await user.selectOptions(screen.getByLabelText('Outcome'), 'false');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({
          user: 'grace@example.com',
          success: 'false',
          offset: 0,
        }),
      ),
    );
    const table = await screen.findByRole('table', {
      name: 'Platform audit log',
    });
    expect(within(table).getByText('Scaled workers')).toBeInTheDocument();
    expect(within(table).queryByText('Added member')).toBeNull();
  });

  it('pages with the server offset', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi({ identity: platformAdminIdentity });
    const list = jest.spyOn(api, 'listAuditLog');
    // Enough entries to need a second page.
    (api as any).auditEntries = Array.from({ length: 30 }, (_, i) => ({
      ...fixtureAuditEntries[1],
      timestamp: `2026-08-27T10:${String(i).padStart(2, '0')}:00.000Z`,
    }));
    await renderPlatform(api);
    await screen.findByText('Showing 1 to 25 of 30');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ offset: 25, limit: 25 }),
      ),
    );
    expect(
      await screen.findByText('Showing 26 to 30 of 30'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('opens a detail that redacts credentials the server stored', async () => {
    const user = userEvent.setup();
    await renderPlatform(
      new MockButlerApi({ identity: platformAdminIdentity }),
    );
    const table = await screen.findByRole('table', {
      name: 'Platform audit log',
    });
    await user.click(within(table).getByText('Created provider'));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('POST /api/providers');
    const pre = within(dialog).getByTestId('audit-summary');
    expect(pre.textContent).toContain('"harvesterKubeconfig": "[REDACTED]"');
    expect(pre.textContent).not.toContain('apiVersion');
    expect(dialog).not.toHaveTextContent(/Bearer|Authorization/);
  });

  it('shows the empty state truthfully', async () => {
    const api = new MockButlerApi({ identity: platformAdminIdentity });
    (api as any).auditEntries = [];
    await renderPlatform(api);
    expect(
      await screen.findByText('No audit activity found.'),
    ).toBeInTheDocument();
    expect(screen.getByText('No entries')).toBeInTheDocument();
  });

  it('is served to a platform viewer, read-only', async () => {
    await renderPlatform(
      new MockButlerApi({ identity: platformViewerIdentity }),
    );
    expect(
      await screen.findByRole('table', { name: 'Platform audit log' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Delete|Remove|Edit/ }),
    ).toBeNull();
  });

  it('shows the server refusal to a team role and a server failure as an error', async () => {
    await renderPlatform(new MockButlerApi({ identity: teamAdminIdentity }));
    expect(
      await screen.findByText('Audit history is not available to this role'),
    ).toBeInTheDocument();
    const api = new MockButlerApi({ identity: platformAdminIdentity });
    jest
      .spyOn(api, 'listAuditLog')
      .mockRejectedValue(new Error('upstream timeout'));
    await renderPlatform(api);
    expect(
      await screen.findByText('Failed to load audit history'),
    ).toBeInTheDocument();
    expect(screen.getByText('upstream timeout')).toBeInTheDocument();
  });
});

describe('team activity', () => {
  beforeEach(() => localStorage.clear());

  it('shows a team admin only the events recorded in that team context', async () => {
    await renderTeam(new MockButlerApi({ identity: teamAdminIdentity }));
    const table = await screen.findByRole('table', {
      name: `${FIXTURE_TEAM} activity`,
    });
    expect(within(table).getByText('Scaled workers')).toBeInTheDocument();
    expect(within(table).getByText('Removed addon')).toBeInTheDocument();
    // Recorded without a team context: platform log only.
    expect(within(table).queryByText('Added member')).toBeNull();
    expect(
      screen.getByText(/recorded in the platform audit log instead/),
    ).toBeInTheDocument();
  });

  it('refuses another team’s admin, an operator and a viewer as the server does', async () => {
    await renderTeam(new MockButlerApi({ identity: otherTeamAdminIdentity }));
    expect(
      await screen.findByText('Audit history is not available to this role'),
    ).toBeInTheDocument();
    for (const identity of [teamOperatorIdentity, teamViewerIdentity]) {
      const api = new MockButlerApi({ identity });
      await expect(api.listTeamAuditLog(FIXTURE_TEAM)).rejects.toThrow(
        /team admin access required/,
      );
    }
    const api = new MockButlerApi({ identity: otherTeamAdminIdentity });
    await expect(api.listTeamAuditLog('other-team')).resolves.toMatchObject({
      total: 0,
    });
    await expect(api.listAuditLog()).rejects.toThrow(
      /platform viewer or admin required/,
    );
  });

  it('is served to platform roles for any team', async () => {
    await renderTeam(new MockButlerApi({ identity: platformViewerIdentity }));
    expect(
      await screen.findByRole('table', { name: `${FIXTURE_TEAM} activity` }),
    ).toBeInTheDocument();
  });
});
