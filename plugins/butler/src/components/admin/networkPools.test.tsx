// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import '@testing-library/jest-dom';
import { Route, Routes } from 'react-router-dom';
import { screen } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { butlerApiRef } from '../../api/ButlerApi';
import { MockButlerApi } from '../../api/MockButlerApi';
import {
  FIXTURE_POOL_NAME,
  FIXTURE_POOL_NAMESPACE,
} from '../../api/fixtures/networks';
import {
  platformAdminIdentity,
  platformViewerIdentity,
} from '../../api/fixtures/identities';
import { rootRouteRef } from '../../routes';
import { TeamProvider } from '../../contexts/TeamProvider';
import { NetworkPoolsPage } from './NetworkPoolsPage';
import { NetworkPoolDetailPage } from './NetworkPoolDetailPage';

function renderPools(api: MockButlerApi) {
  return renderInTestApp(
    <TestApiProvider apis={[[butlerApiRef, api]]}>
      <TeamProvider>
        <Routes>
          <Route path="/butler/admin/networks" element={<NetworkPoolsPage />} />
        </Routes>
      </TeamProvider>
    </TestApiProvider>,
    {
      routeEntries: ['/butler/admin/networks'],
      mountedRoutes: { '/butler': rootRouteRef },
    },
  );
}

function renderPoolDetail(api: MockButlerApi) {
  return renderInTestApp(
    <TestApiProvider apis={[[butlerApiRef, api]]}>
      <TeamProvider>
        <Routes>
          <Route
            path="/butler/admin/networks/:namespace/:name"
            element={<NetworkPoolDetailPage />}
          />
        </Routes>
      </TeamProvider>
    </TestApiProvider>,
    {
      routeEntries: [
        `/butler/admin/networks/${FIXTURE_POOL_NAMESPACE}/${FIXTURE_POOL_NAME}`,
      ],
      mountedRoutes: { '/butler': rootRouteRef },
    },
  );
}

describe('network pools', () => {
  it('lists pools with their address space and usage', async () => {
    await renderPools(new MockButlerApi({ identity: platformAdminIdentity }));

    expect(
      await screen.findByRole('heading', { name: 'Network Pools' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('10.40.0.0/22')).toBeInTheDocument();
    expect(screen.getByText(FIXTURE_POOL_NAME)).toBeInTheDocument();
    // 68 of 511 addresses is 13 percent.
    expect(screen.getByText('13%')).toBeInTheDocument();
    expect(screen.getByText('443')).toBeInTheDocument();
  });

  it('reads for a platform viewer, which the server also allows', async () => {
    await renderPools(new MockButlerApi({ identity: platformViewerIdentity }));

    expect(await screen.findByText(FIXTURE_POOL_NAME)).toBeInTheDocument();
  });

  it('says so when there are no pools', async () => {
    await renderPools(
      new MockButlerApi({ identity: platformAdminIdentity, pools: [] }),
    );

    expect(await screen.findByText('No network pools')).toBeInTheDocument();
  });

  it('offers a retry when the pools cannot be read', async () => {
    const api = new MockButlerApi({
      identity: platformAdminIdentity,
      failures: { listNetworkPools: new Error('boom') },
    });
    await renderPools(api);

    expect(
      await screen.findByText('Failed to load network pools'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});

describe('network pool detail', () => {
  it('shows the pool and everything allocated from it', async () => {
    await renderPoolDetail(
      new MockButlerApi({ identity: platformAdminIdentity }),
    );

    expect(
      await screen.findByRole('heading', { name: FIXTURE_POOL_NAME }),
    ).toBeInTheDocument();
    expect(screen.getByText('10.40.0.0/22')).toBeInTheDocument();
    // Every allocation in the pool, not only one cluster's.
    const table = await screen.findByRole('table', {
      name: 'Allocations from this pool',
    });
    expect(table).toHaveTextContent('10.40.2.56 to 10.40.2.59');
    expect(table).toHaveTextContent('10.40.2.90 to 10.40.2.93');
  });

  it('reports a pool that cannot be found', async () => {
    const api = new MockButlerApi({
      identity: platformAdminIdentity,
      pools: [],
    });
    await renderPoolDetail(api);

    expect(
      await screen.findByText('Network pool not found'),
    ).toBeInTheDocument();
  });
});
