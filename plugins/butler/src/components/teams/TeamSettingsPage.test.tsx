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
  FIXTURE_NAMESPACE,
  fixtureTeams,
} from '../../api/fixtures/clusters';
import { rootRouteRef } from '../../routes';
import { TeamProvider } from '../../contexts/TeamProvider';
import { TeamSettingsPage } from './TeamSettingsPage';

function renderPage(api: MockButlerApi) {
  return renderInTestApp(
    <TestApiProvider apis={[[butlerApiRef, api]]}>
      <TeamProvider>
        <Routes>
          <Route
            path="/butler/t/:team/settings"
            element={<TeamSettingsPage />}
          />
        </Routes>
      </TeamProvider>
    </TestApiProvider>,
    {
      routeEntries: [`/butler/t/${FIXTURE_TEAM}/settings`],
      mountedRoutes: { '/butler': rootRouteRef },
    },
  );
}

describe('TeamSettingsPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders quotas, the settings form and access configuration', async () => {
    await renderPage(new MockButlerApi());

    expect(
      await screen.findByRole('heading', { name: 'Settings' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Max Clusters')).toBeInTheDocument();
    expect(screen.getByLabelText('Team Name')).toBeDisabled();
    expect(screen.getByLabelText('Display Name')).toHaveValue(
      'Platform Engineering',
    );
    expect(screen.getByText(FIXTURE_NAMESPACE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeVisible();
    expect(screen.getByText('eng-readonly')).toBeInTheDocument();
  });

  it('saves display name and description in one request', async () => {
    const api = new MockButlerApi();
    const spy = jest.spyOn(api, 'updateTeam');
    await renderPage(api);
    await screen.findByRole('heading', { name: 'Settings' });

    fireEvent.change(screen.getByLabelText('Display Name'), {
      target: { value: 'Platform Eng' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() =>
      expect(screen.getByText('Team settings have been updated')).toBeVisible(),
    );
    expect(spy).toHaveBeenCalledWith(FIXTURE_TEAM, {
      displayName: 'Platform Eng',
      description: 'Owns the shared Kubernetes platform and lab clusters.',
    });
  });

  it('renders read-only for a viewer', async () => {
    await renderPage(
      new MockButlerApi({
        identity: {
          isPlatformAdmin: false,
          teams: fixtureTeams.map(t => ({ ...t, role: 'viewer' })),
        },
      }),
    );
    await screen.findByRole('heading', { name: 'Settings' });
    expect(screen.getByLabelText('Display Name')).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Save Changes' }),
    ).not.toBeInTheDocument();
  });
});
