// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import '@testing-library/jest-dom';
import { screen, waitFor } from '@testing-library/react';
import {
  renderInTestApp,
  TestApiProvider,
  MockPermissionApi,
  MockErrorApi,
} from '@backstage/test-utils';
import {
  alertApiRef,
  discoveryApiRef,
  errorApiRef,
} from '@backstage/core-plugin-api';
import type { AlertApi } from '@backstage/core-plugin-api';
import { permissionApiRef } from '@backstage/plugin-permission-react';
import { butlerApiRef } from '../../api/ButlerApi';
import { MockButlerApi } from '../../api/MockButlerApi';
import { FIXTURE_TEAM, fixtureTeams } from '../../api/fixtures/clusters';
import { rootRouteRef } from '../../routes';
import { ButlerPage } from './ButlerPage';

jest.mock('@backstage/plugin-auth-react', () => ({
  CookieAuthRefreshProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

class FakeSocket {
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: unknown) => void) | null = null;
  close() {}
  send() {}
}
(globalThis as any).WebSocket = FakeSocket;

const alertApi: AlertApi = {
  post: () => {},
  alert$: () =>
    ({ subscribe: () => ({ unsubscribe: () => {}, closed: false }) } as any),
};

function renderAt(api: MockButlerApi, path: string) {
  return renderInTestApp(
    <TestApiProvider
      apis={[
        [butlerApiRef, api],
        [permissionApiRef, new MockPermissionApi()],
        [alertApiRef, alertApi],
        [errorApiRef, new MockErrorApi()],
        [
          discoveryApiRef,
          { getBaseUrl: async () => 'http://localhost:7007/api/butler' },
        ],
      ]}
    >
      <ButlerPage />
    </TestApiProvider>,
    { routeEntries: [path], mountedRoutes: { '/butler': rootRouteRef } },
  );
}

describe('ButlerPage admin route guard', () => {
  it('sends a team admin who opens an admin route to the team dashboard', async () => {
    const api = new MockButlerApi({
      identity: {
        isPlatformAdmin: false,
        teams: fixtureTeams.filter(t => t.name === FIXTURE_TEAM),
      },
    });
    await renderAt(api, '/butler/admin/users');
    await waitFor(() => {
      expect(screen.getByText('Team Admin')).toBeInTheDocument();
    });
    expect(screen.queryByText('User Management')).not.toBeInTheDocument();
    expect(screen.queryByText('Admin Mode')).not.toBeInTheDocument();
  });

  it('lets a platform admin open admin routes and shows the admin rail', async () => {
    const api = new MockButlerApi({ identity: { isPlatformAdmin: true } });
    await renderAt(api, '/butler/admin/users');
    await waitFor(() => {
      expect(screen.getByText('Admin Mode')).toBeInTheDocument();
    });
    expect(
      screen.getByRole('link', { name: 'All Clusters' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Identity Providers' }),
    ).toBeInTheDocument();
  });
});
