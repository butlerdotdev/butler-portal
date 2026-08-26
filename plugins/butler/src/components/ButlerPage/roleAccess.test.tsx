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
import { roleIdentities } from '../../api/fixtures/identities';
import { FIXTURE_TEAM } from '../../api/fixtures/clusters';
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

function renderAs(role: keyof typeof roleIdentities, path: string) {
  const api = new MockButlerApi({ identity: roleIdentities[role] });
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

/**
 * These assert that the product presents each role the way butler-server
 * authorizes it. They are not the security boundary; the server is.
 */
describe('role scope is announced', () => {
  it.each([
    ['platformAdmin', 'Admin Mode', '/butler/admin'],
    ['platformViewer', 'Shadow Mode', '/butler/admin'],
    ['teamAdmin', 'Team Admin', `/butler/t/${FIXTURE_TEAM}`],
    ['teamOperator', 'Team Operator', `/butler/t/${FIXTURE_TEAM}`],
    ['teamViewer', 'Team Viewer', `/butler/t/${FIXTURE_TEAM}`],
  ] as const)('%s sees %s', async (role, banner, path) => {
    await renderAs(role, path);
    await waitFor(() => {
      expect(screen.getByText(banner)).toBeInTheDocument();
    });
  });
});

describe('platform surfaces are closed to team roles', () => {
  it.each(['teamAdmin', 'teamOperator', 'teamViewer'] as const)(
    '%s is returned to its team instead of an admin page',
    async role => {
      await renderAs(role, '/butler/admin/users');
      await waitFor(() => {
        expect(
          screen.getByText(
            'Team Admin|Team Operator|Team Viewer'
              .split('|')
              .find(t => screen.queryByText(t)) as string,
          ),
        ).toBeInTheDocument();
      });
      expect(screen.queryByText('User Management')).not.toBeInTheDocument();
      expect(screen.queryByText('Admin Mode')).not.toBeInTheDocument();
    },
  );

  it.each(['platformAdmin', 'platformViewer'] as const)(
    '%s reaches the estate',
    async role => {
      await renderAs(role, '/butler/admin');
      await waitFor(() => {
        expect(
          screen.getByRole('link', { name: 'All Clusters' }),
        ).toBeInTheDocument();
      });
    },
  );
});

describe('a platform role keeps its scope visible inside a team', () => {
  it.each([
    ['platformAdmin', 'Admin Mode'],
    ['platformViewer', 'Shadow Mode'],
  ] as const)(
    '%s sees %s on a team route',
    async (role, banner) => {
      await renderAs(role, `/butler/t/${FIXTURE_TEAM}/clusters`);
      await waitFor(() => {
        expect(screen.getByText(banner)).toBeInTheDocument();
      });
    },
    20000,
  );
});

describe('the navigation only offers destinations a role can use', () => {
  it('offers a platform admin the surfaces it can administer', async () => {
    await renderAs('platformAdmin', '/butler/admin');
    await waitFor(() => {
      expect(screen.getByText('Admin Mode')).toBeInTheDocument();
    });
    for (const label of ['All Clusters', 'Teams', 'Users', 'Settings']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('does not send a platform viewer to pages that only refuse it', async () => {
    await renderAs('platformViewer', '/butler/admin');
    await waitFor(() => {
      expect(screen.getByText('Shadow Mode')).toBeInTheDocument();
    });
    // Reads that butler-server serves a platform viewer are offered.
    for (const label of ['All Clusters', 'Network Pools']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
    for (const label of ['Teams', 'Users', 'Management Cluster', 'Settings']) {
      expect(
        screen.queryByRole('link', { name: label }),
      ).not.toBeInTheDocument();
    }
  });
});
