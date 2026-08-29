// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import '@testing-library/jest-dom';
import { Route, Routes } from 'react-router-dom';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import {
  renderInTestApp,
  TestApiProvider,
  MockErrorApi,
} from '@backstage/test-utils';
import { alertApiRef, errorApiRef } from '@backstage/core-plugin-api';
import type { AlertApi } from '@backstage/core-plugin-api';
import { butlerApiRef } from '../../api/ButlerApi';
import { MockButlerApi } from '../../api/MockButlerApi';
import { ButlerApiError } from '../../api/ButlerApiError';
import { allocationBelongsToCluster } from '../../utils/environment';
import {
  FIXTURE_NAMESPACE,
  FIXTURE_TEAM,
  readyCluster,
} from '../../api/fixtures/clusters';
import {
  fixtureAllocation,
  fixtureSameNameOtherNamespaceAllocation,
} from '../../api/fixtures/networks';
import {
  platformAdminIdentity,
  platformViewerIdentity,
  teamAdminIdentity,
  teamOperatorIdentity,
  teamViewerIdentity,
} from '../../api/fixtures/identities';
import { rootRouteRef } from '../../routes';
import { TeamProvider } from '../../contexts/TeamProvider';
import { ClusterDetailPage } from './ClusterDetailPage';

const alertApi: AlertApi = {
  post: () => {},
  alert$: () =>
    ({ subscribe: () => ({ unsubscribe: () => {}, closed: false }) } as any),
};

function renderDetail(api: MockButlerApi) {
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
          <Route
            path="/butler/t/:team/clusters/:namespace/:name"
            element={<ClusterDetailPage />}
          />
        </Routes>
      </TeamProvider>
    </TestApiProvider>,
    {
      routeEntries: [
        `/butler/t/${FIXTURE_TEAM}/clusters/${FIXTURE_NAMESPACE}/${readyCluster.metadata.name}`,
      ],
      mountedRoutes: { '/butler': rootRouteRef },
    },
  );
}

const heading = () =>
  screen.findByRole('heading', { name: readyCluster.metadata.name });

/**
 * Ownership is a namespace and a name together. A name on its own is not
 * enough, which is the whole reason this is a function rather than a
 * comparison written out at each call site.
 */
describe('allocation ownership', () => {
  const cluster = {
    name: readyCluster.metadata.name,
    namespace: readyCluster.metadata.namespace,
  };

  it('claims an allocation whose reference matches both parts', () => {
    expect(
      allocationBelongsToCluster(
        fixtureAllocation.spec.tenantClusterRef,
        cluster,
      ),
    ).toBe(true);
  });

  it('refuses the same cluster name in another namespace', () => {
    expect(
      allocationBelongsToCluster(
        fixtureSameNameOtherNamespaceAllocation.spec.tenantClusterRef,
        cluster,
      ),
    ).toBe(false);
  });

  it('refuses an allocation with no reference at all', () => {
    expect(allocationBelongsToCluster(undefined, cluster)).toBe(false);
    expect(allocationBelongsToCluster({ name: '' }, cluster)).toBe(false);
  });

  it('reads a reference without a namespace as the cluster own', () => {
    expect(allocationBelongsToCluster({ name: cluster.name }, cluster)).toBe(
      true,
    );
  });
});

describe('network allocations card', () => {
  it('shows only this cluster allocations, with pool and range', async () => {
    await renderDetail(new MockButlerApi({ identity: platformAdminIdentity }));
    await heading();

    const card = (
      await screen.findByRole('heading', { name: 'Network Allocations' })
    ).closest('div')!.parentElement!;
    expect(card).toHaveTextContent('10.40.2.56 to 10.40.2.59');
    expect(card).toHaveTextContent('10.40.2.20 to 10.40.2.21');
    expect(card).toHaveTextContent('loadbalancer');
    expect(card).toHaveTextContent('nodes');
    expect(card).toHaveTextContent('vlan40-underlay');
    // Belongs to another cluster, and a lookalike in another namespace.
    expect(card).not.toHaveTextContent('10.40.2.90');
    expect(card).not.toHaveTextContent('10.40.3.10');
  });

  it('stays out of the way when the caller may not read allocations', async () => {
    // butler-server serves allocations to a platform role only.
    await renderDetail(new MockButlerApi({ identity: teamAdminIdentity }));
    await heading();

    expect(
      screen.queryByRole('heading', { name: 'Network Allocations' }),
    ).not.toBeInTheDocument();
  });

  it('is absent when the cluster holds none', async () => {
    await renderDetail(
      new MockButlerApi({ identity: platformAdminIdentity, allocations: [] }),
    );
    await heading();

    expect(
      screen.queryByRole('heading', { name: 'Network Allocations' }),
    ).not.toBeInTheDocument();
  });

  it('does not report a refusal as an error on the page', async () => {
    const api = new MockButlerApi({ identity: platformViewerIdentity });
    jest.spyOn(api, 'listAllIPAllocations').mockRejectedValue(
      new ButlerApiError({
        status: 403,
        message: 'Butler API error (403): platform viewer or admin required',
      }),
    );
    await renderDetail(api);
    await heading();

    expect(
      screen.queryByRole('heading', { name: 'Network Allocations' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/platform viewer or admin/),
    ).not.toBeInTheDocument();
  });
});

describe('release is offered by role', () => {
  it.each([
    ['platform admin', platformAdminIdentity, true],
    ['platform viewer', platformViewerIdentity, false],
  ])('%s offered release: %s', async (_n, identity, offered) => {
    await renderDetail(new MockButlerApi({ identity }));
    await heading();
    await screen.findByRole('heading', { name: 'Network Allocations' });

    const release = screen.queryAllByRole('button', { name: 'Release' });
    if (offered) expect(release.length).toBeGreaterThan(0);
    else expect(release).toHaveLength(0);
  });

  it.each([
    ['team admin', teamAdminIdentity],
    ['team operator', teamOperatorIdentity],
    ['team viewer', teamViewerIdentity],
  ])('%s sees no allocations at all', async (_n, identity) => {
    await renderDetail(new MockButlerApi({ identity }));
    await heading();

    expect(screen.queryAllByRole('button', { name: 'Release' })).toHaveLength(
      0,
    );
  });
});

describe('releasing an allocation', () => {
  const openRelease = async (api: MockButlerApi) => {
    await renderDetail(api);
    await heading();
    await screen.findByRole('heading', { name: 'Network Allocations' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Release' })[0]);
    return screen.findByRole('heading', { name: 'Release allocation' });
  };

  it('names the addresses, pool and consequence before acting', async () => {
    await openRelease(new MockButlerApi({ identity: platformAdminIdentity }));

    expect(screen.getByText(/still using them/)).toBeInTheDocument();
    expect(screen.getByText('10.40.2.20 to 10.40.2.21')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Release addresses' }),
    ).toBeInTheDocument();
  });

  it('releases and re-reads the list from the server', async () => {
    const api = new MockButlerApi({ identity: platformAdminIdentity });
    const release = jest.spyOn(api, 'releaseIPAllocation');
    const list = jest.spyOn(api, 'listAllIPAllocations');
    await openRelease(api);
    const before = list.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Release addresses' }));

    await waitFor(() => expect(release).toHaveBeenCalled());
    // The list is read again rather than the row being dropped locally.
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(before));
  });

  it('keeps the dialog open and shows why a release was refused', async () => {
    const api = new MockButlerApi({ identity: platformAdminIdentity });
    jest.spyOn(api, 'releaseIPAllocation').mockRejectedValue(
      new ButlerApiError({
        status: 409,
        message: 'Butler API error (409): allocation is still in use',
      }),
    );
    await openRelease(api);

    fireEvent.click(screen.getByRole('button', { name: 'Release addresses' }));

    expect(await screen.findByText(/still in use/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Release addresses' }),
    ).toBeInTheDocument();
  });

  it('treats an already released allocation as done', async () => {
    const api = new MockButlerApi({ identity: platformAdminIdentity });
    jest
      .spyOn(api, 'releaseIPAllocation')
      .mockRejectedValue(
        new ButlerApiError({ status: 404, message: 'not found' }),
      );
    await openRelease(api);

    fireEvent.click(screen.getByRole('button', { name: 'Release addresses' }));

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: 'Release allocation' }),
      ).not.toBeInTheDocument();
    });
  });
});
