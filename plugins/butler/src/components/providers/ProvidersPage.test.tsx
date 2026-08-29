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
import { fixtureProviders } from '../../api/fixtures/clusters';
import { rootRouteRef } from '../../routes';
import { TeamProvider } from '../../contexts/TeamProvider';
import { ProvidersPage } from './ProvidersPage';

const alertApi: AlertApi = {
  post: jest.fn(),
  alert$: () =>
    ({ subscribe: () => ({ unsubscribe: () => {}, closed: false }) } as any),
};

function renderPage(api: MockButlerApi) {
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
          <Route path="/butler/admin/providers" element={<ProvidersPage />} />
        </Routes>
      </TeamProvider>
    </TestApiProvider>,
    {
      routeEntries: ['/butler/admin/providers'],
      mountedRoutes: { '/butler': rootRouteRef },
    },
  );
}

describe('ProvidersPage', () => {
  beforeEach(() => localStorage.clear());

  it('renders the console header and one card per provider', async () => {
    await renderPage(new MockButlerApi({ providers: fixtureProviders }));
    expect(
      await screen.findByRole('heading', { name: 'Providers' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Infrastructure provider configurations for cluster provisioning',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add Provider' })).toHaveAttribute(
      'href',
      '/butler/admin/providers/create',
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(
      fixtureProviders.length,
    );
    const card = screen.getByRole('button', {
      name: `${fixtureProviders[0].metadata.name} details`,
    });
    expect(card).toHaveTextContent('harvester');
    expect(card).toHaveTextContent('Endpoint');
    expect(card).toHaveTextContent('Secret: harvester-lab-kubeconfig');
    expect(card).toHaveTextContent('Age');
    expect(screen.getByRole('button', { name: 'Test' })).toBeInTheDocument();
  });

  it('opens the detail dialog with connection status and networks', async () => {
    await renderPage(new MockButlerApi());
    fireEvent.click(
      await screen.findByRole('button', {
        name: `${fixtureProviders[0].metadata.name} details`,
      }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Connection Status');
    expect(dialog).toHaveTextContent('Not tested');
    expect(dialog).toHaveTextContent('Provider Details');
    expect(dialog).toHaveTextContent('Harvester Configuration');
    expect(dialog).toHaveTextContent('Conditions');
    await waitFor(() => expect(dialog).toHaveTextContent('Provider Networks'));
    expect(
      screen.getByRole('button', { name: 'Test Connection' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('shows the delete confirmation with the provider name', async () => {
    await renderPage(new MockButlerApi());
    fireEvent.click(
      await screen.findByRole('button', {
        name: `Delete provider ${fixtureProviders[0].metadata.name}`,
      }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Delete Provider');
    expect(dialog).toHaveTextContent(
      'This will also delete the associated credentials secret.',
    );
    expect(
      screen.getByRole('button', { name: 'Delete Provider' }),
    ).toBeInTheDocument();
  });

  it('hides mutating actions for non-admins', async () => {
    await renderPage(
      new MockButlerApi({ identity: { isPlatformAdmin: false } }),
    );
    await screen.findByRole('heading', { name: 'Providers' });
    expect(screen.queryByRole('link', { name: 'Add Provider' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Test' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Delete provider/ }),
    ).toBeNull();
  });

  it('renders the error state with retry', async () => {
    await renderPage(
      new MockButlerApi({ failures: { listProviders: new Error('boom') } }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
