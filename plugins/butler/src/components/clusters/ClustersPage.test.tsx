// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import '@testing-library/jest-dom';
import { Route, Routes } from 'react-router-dom';
import { fireEvent, screen } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { butlerApiRef } from '../../api/ButlerApi';
import { MockButlerApi } from '../../api/MockButlerApi';
import {
  FIXTURE_TEAM,
  fixtureClusters,
  readyCluster,
  failedCluster,
} from '../../api/fixtures/clusters';
import { rootRouteRef } from '../../routes';
import { ClustersPage } from './ClustersPage';

function renderList(api: MockButlerApi) {
  return renderInTestApp(
    <TestApiProvider apis={[[butlerApiRef, api]]}>
      <Routes>
        <Route path="/butler/t/:team/clusters" element={<ClustersPage />} />
      </Routes>
    </TestApiProvider>,
    {
      routeEntries: [`/butler/t/${FIXTURE_TEAM}/clusters`],
      mountedRoutes: { '/butler': rootRouteRef },
    },
  );
}

describe('ClustersPage', () => {
  it('renders one row per cluster with stats and phase', async () => {
    await renderList(new MockButlerApi());

    expect(
      await screen.findByRole('heading', { name: 'Clusters' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(
      fixtureClusters.length,
    );
    const row = screen.getByRole('link', {
      name: `Open cluster ${readyCluster.metadata.name}`,
    });
    expect(row).toHaveTextContent(readyCluster.spec.kubernetesVersion);
    expect(row).toHaveTextContent('Provider');
    expect(row).toHaveTextContent('Workers');
    expect(row).toHaveTextContent('Age');
    expect(row).toHaveTextContent('Ready');
  });

  it('filters by search text and phase chips', async () => {
    await renderList(new MockButlerApi());
    await screen.findByRole('heading', { name: 'Clusters' });

    fireEvent.change(screen.getByLabelText('Search clusters'), {
      target: { value: failedCluster.metadata.name },
    });
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(
      screen.getByText(`1 of ${fixtureClusters.length} clusters`),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search clusters'), {
      target: { value: '' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Failed', pressed: false }),
    );
    const rows = screen.getAllByRole('listitem');
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach(r => expect(r).toHaveTextContent('Failed'));

    fireEvent.change(screen.getByLabelText('Search clusters'), {
      target: { value: 'no-such-cluster' },
    });
    expect(
      screen.getByText('No clusters match the current filters.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(
      fixtureClusters.length,
    );
  });

  it('shows the error state with retry when the list fails', async () => {
    const api = new MockButlerApi({
      failures: { listClusters: new Error('boom') },
    });
    await renderList(api);
    expect(
      await screen.findByText('Failed to load clusters'),
    ).toBeInTheDocument();
    expect(screen.getByText('boom')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
