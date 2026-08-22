// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/test-utils';
import { rootRouteRef } from '../routes';
import {
  normalizeMountPath,
  useButlerRoutes,
  useIsAdminRoute,
} from './useButlerRoutes';

const Probe = () => {
  const routes = useButlerRoutes();
  const isAdmin = useIsAdminRoute();
  return (
    <div>
      <span data-testid="root">{routes.root()}</span>
      <span data-testid="team">{routes.team({ team: 'alpha' })}</span>
      <span data-testid="clusterDetail">
        {routes.clusterDetail({ team: 'alpha', namespace: 'ns', name: 'c1' })}
      </span>
      <span data-testid="admin">{routes.admin()}</span>
      <span data-testid="adminTeamDetail">
        {routes.adminTeamDetail({ teamName: 'ops' })}
      </span>
      <span data-testid="isAdmin">{String(isAdmin)}</span>
    </div>
  );
};

const render = (routeEntries: string[], mount = '/custom-mount') =>
  renderInTestApp(<Probe />, {
    mountedRoutes: { [mount]: rootRouteRef },
    routeEntries,
  });

describe('useButlerRoutes', () => {
  it('resolves routes relative to the mount point', async () => {
    await render(['/custom-mount/t/alpha']);
    expect(screen.getByTestId('root').textContent).toBe('/custom-mount');
    expect(screen.getByTestId('team').textContent).toBe(
      '/custom-mount/t/alpha',
    );
    expect(screen.getByTestId('clusterDetail').textContent).toBe(
      '/custom-mount/t/alpha/clusters/ns/c1',
    );
    expect(screen.getByTestId('admin').textContent).toBe('/custom-mount/admin');
    expect(screen.getByTestId('adminTeamDetail').textContent).toBe(
      '/custom-mount/admin/teams/ops',
    );
    expect(screen.getByTestId('isAdmin').textContent).toBe('false');
  });

  it('detects admin routes beneath the mount point', async () => {
    await render(['/custom-mount/admin/users']);
    expect(screen.getByTestId('isAdmin').textContent).toBe('true');
  });

  // Hosts register the page as "/butler/*" (the butler-portal app does);
  // the route system resolves the wildcard literally, so builders strip it.
  it('strips a wildcard mount segment from every resolved path', async () => {
    await render(['/butler/t/alpha'], '/butler/*');
    expect(screen.getByTestId('root').textContent).toBe('/butler');
    expect(screen.getByTestId('clusterDetail').textContent).toBe(
      '/butler/t/alpha/clusters/ns/c1',
    );
    expect(screen.getByTestId('admin').textContent).toBe('/butler/admin');
  });

  it('detects admin routes under a wildcard mount', async () => {
    await render(['/butler/admin/users'], '/butler/*');
    expect(screen.getByTestId('isAdmin').textContent).toBe('true');
  });
});

describe('normalizeMountPath', () => {
  it.each([
    ['/butler/*', '/butler'],
    ['/butler/*/t/alpha', '/butler/t/alpha'],
    ['/butler', '/butler'],
    ['/*', '/'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeMountPath(input)).toBe(expected);
  });
});
