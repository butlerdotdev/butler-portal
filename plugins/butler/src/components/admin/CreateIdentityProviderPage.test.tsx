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
import { CreateIdentityProviderPage } from './CreateIdentityProviderPage';

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
            path="/butler/admin/identity-providers/create"
            element={<CreateIdentityProviderPage />}
          />
        </Routes>
      </TeamProvider>
    </TestApiProvider>,
    {
      routeEntries: ['/butler/admin/identity-providers/create'],
      mountedRoutes: { '/butler': rootRouteRef },
    },
  );
}

describe('CreateIdentityProviderPage', () => {
  beforeEach(() => localStorage.clear());

  it('renders the preset chooser as step one', async () => {
    await renderPage(new MockButlerApi());
    expect(
      await screen.findByRole('heading', { name: 'Add Identity Provider' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Select the type of identity provider you want to configure',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Google Workspace/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Microsoft Entra ID/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Okta/ })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Custom OIDC/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('pre-fills from the preset and renders the configure form', async () => {
    await renderPage(new MockButlerApi());
    fireEvent.click(
      await screen.findByRole('button', { name: /Google Workspace/ }),
    );
    expect(
      screen.getByRole('heading', { name: 'Configure Google Workspace' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Display Name')).toHaveValue(
      'Google Workspace',
    );
    expect(screen.getByLabelText('Issuer URL *')).toHaveValue(
      'https://accounts.google.com',
    );
    expect(
      screen.getByLabelText('Hosted Domain (Optional)'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Test Discovery' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Advanced Options/ }));
    expect(screen.getByLabelText('Scopes')).toHaveValue(
      'openid, email, profile',
    );
    expect(
      screen.getByRole('button', { name: 'Create Provider' }),
    ).toBeInTheDocument();
  });

  it('validates required fields and sanitizes the name', async () => {
    await renderPage(new MockButlerApi());
    fireEvent.click(await screen.findByRole('button', { name: /Custom OIDC/ }));
    fireEvent.change(screen.getByLabelText('Name *'), {
      target: { value: 'My IdP!' },
    });
    expect(screen.getByLabelText('Name *')).toHaveValue('myidp');
    fireEvent.click(screen.getByRole('button', { name: 'Create Provider' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Issuer URL is required',
    );
  });

  it('reports discovery results inline', async () => {
    await renderPage(new MockButlerApi());
    fireEvent.click(
      await screen.findByRole('button', { name: /Google Workspace/ }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Test Discovery' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Discovery successful',
      ),
    );
  });

  it('shows the read-only card for non-admins', async () => {
    await renderPage(
      new MockButlerApi({ identity: { isPlatformAdmin: false } }),
    );
    expect(await screen.findByText('Read-Only Access')).toBeInTheDocument();
  });
});
