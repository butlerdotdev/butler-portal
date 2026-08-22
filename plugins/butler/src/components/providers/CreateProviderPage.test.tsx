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
import { rootRouteRef } from '../../routes';
import { TeamProvider } from '../../contexts/TeamProvider';
import { CreateProviderPage } from './CreateProviderPage';

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
          <Route
            path="/butler/admin/providers/create"
            element={<CreateProviderPage />}
          />
        </Routes>
      </TeamProvider>
    </TestApiProvider>,
    {
      routeEntries: ['/butler/admin/providers/create'],
      mountedRoutes: { '/butler': rootRouteRef },
    },
  );
}

describe('CreateProviderPage', () => {
  beforeEach(() => localStorage.clear());

  it('renders the type picker, common fields and form footer', async () => {
    await renderPage(new MockButlerApi());
    expect(
      await screen.findByRole('heading', { name: 'Add Provider' }),
    ).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios.map(r => r.textContent)).toEqual([
      'harvester',
      'nutanix',
      'proxmox',
    ]);
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Provider Name *')).toBeInTheDocument();
    expect(screen.getByLabelText('Namespace')).toHaveValue('butler-system');
    expect(screen.getByLabelText('Kubeconfig *')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Test Connection' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Create Provider' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('switches provider sections and toggles proxmox auth method', async () => {
    await renderPage(new MockButlerApi());
    await screen.findByRole('heading', { name: 'Add Provider' });

    fireEvent.click(screen.getByRole('radio', { name: 'nutanix' }));
    expect(
      screen.getByRole('heading', { name: 'Nutanix Connection' }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Prism Central Endpoint *'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Port')).toHaveValue(9440);

    fireEvent.click(screen.getByRole('radio', { name: 'proxmox' }));
    expect(screen.getByLabelText('Username *')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'API Token' }));
    expect(screen.getByLabelText('Token ID *')).toBeInTheDocument();
    expect(screen.getByLabelText('Token Secret *')).toBeInTheDocument();
  });

  it('shows the console validation error on submit', async () => {
    await renderPage(new MockButlerApi());
    await screen.findByRole('heading', { name: 'Add Provider' });
    fireEvent.click(screen.getByRole('button', { name: 'Create Provider' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Provider name is required',
    );
  });

  it('tests the connection and renders the result', async () => {
    await renderPage(new MockButlerApi());
    await screen.findByRole('heading', { name: 'Add Provider' });
    fireEvent.change(screen.getByLabelText('Provider Name *'), {
      target: { value: 'lab' },
    });
    fireEvent.change(screen.getByLabelText('Kubeconfig *'), {
      target: { value: 'apiVersion: v1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Test Connection' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Connection succeeded',
      ),
    );
  });

  it('shows the read-only card for non-admins', async () => {
    await renderPage(
      new MockButlerApi({ identity: { isPlatformAdmin: false } }),
    );
    expect(await screen.findByText('Read-Only Access')).toBeInTheDocument();
    expect(screen.queryByRole('radio')).toBeNull();
  });
});
