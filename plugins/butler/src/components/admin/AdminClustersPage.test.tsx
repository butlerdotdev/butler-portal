// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import '@testing-library/jest-dom';
import { Route, Routes } from 'react-router-dom';
import { screen } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { butlerApiRef } from '../../api/ButlerApi';
import { MockButlerApi } from '../../api/MockButlerApi';
import { fixtureClusters } from '../../api/fixtures/clusters';
import {
  platformAdminIdentity,
  platformViewerIdentity,
} from '../../api/fixtures/identities';
import { rootRouteRef } from '../../routes';
import { TeamProvider } from '../../contexts/TeamProvider';
import { AdminClustersPage } from './AdminClustersPage';

function renderPage(api: MockButlerApi) {
  return renderInTestApp(
    <TestApiProvider apis={[[butlerApiRef, api]]}>
      <TeamProvider>
        <Routes>
          <Route
            path="/butler/admin/clusters"
            element={<AdminClustersPage />}
          />
        </Routes>
      </TeamProvider>
    </TestApiProvider>,
    {
      routeEntries: ['/butler/admin/clusters'],
      mountedRoutes: { '/butler': rootRouteRef },
    },
  );
}

describe('AdminClustersPage estate scope', () => {
  it('shows a platform admin the whole estate and the create action', async () => {
    await renderPage(new MockButlerApi({ identity: platformAdminIdentity }));

    expect(
      await screen.findByRole('heading', { name: 'All Clusters' }),
    ).toBeInTheDocument();
    // The count includes the management cluster, so match the shape.
    expect(
      await screen.findByText(
        new RegExp(`Showing ${fixtureClusters.length} of \\d+ clusters`),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create Cluster' }),
    ).toBeInTheDocument();
  });

  it('shows a platform viewer the same estate without the create action', async () => {
    await renderPage(new MockButlerApi({ identity: platformViewerIdentity }));

    expect(
      await screen.findByText(
        new RegExp(`Showing ${fixtureClusters.length} of \\d+ clusters`),
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Create Cluster' }),
    ).not.toBeInTheDocument();
  });
});
