// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import '@testing-library/jest-dom';
import { Route, Routes } from 'react-router-dom';
import { fireEvent, screen } from '@testing-library/react';
import {
  renderInTestApp,
  TestApiProvider,
  MockErrorApi,
} from '@backstage/test-utils';
import { alertApiRef, errorApiRef } from '@backstage/core-plugin-api';
import type { AlertApi } from '@backstage/core-plugin-api';
import { butlerApiRef } from '../../api/ButlerApi';
import { MockButlerApi } from '../../api/MockButlerApi';
import { fixtureIdentityProviders } from '../../api/fixtures/clusters';
import { rootRouteRef } from '../../routes';
import { TeamProvider } from '../../contexts/TeamProvider';
import { IdentityProvidersPage } from './IdentityProvidersPage';

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
            path="/butler/admin/identity-providers"
            element={<IdentityProvidersPage />}
          />
        </Routes>
      </TeamProvider>
    </TestApiProvider>,
    {
      routeEntries: ['/butler/admin/identity-providers'],
      mountedRoutes: { '/butler': rootRouteRef },
    },
  );
}

const idp = fixtureIdentityProviders[0];
const displayName = idp.spec.displayName || idp.metadata.name;

describe('IdentityProvidersPage', () => {
  beforeEach(() => localStorage.clear());

  it('renders the header and one card per provider', async () => {
    await renderPage(new MockButlerApi());
    expect(
      await screen.findByRole('heading', { name: 'Identity Providers' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add Provider' })).toHaveAttribute(
      'href',
      '/butler/admin/identity-providers/create',
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(
      fixtureIdentityProviders.length,
    );
    const card = screen.getByRole('listitem');
    expect(card).toHaveTextContent(displayName);
    expect(card).toHaveTextContent('OIDC');
    expect(card).toHaveTextContent(idp.spec.oidc!.issuerURL);
    expect(card).toHaveTextContent('Ready');
    expect(
      screen.getByRole('button', { name: `View ${displayName}` }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: `Delete ${displayName}` }),
    ).toBeInTheDocument();
  });

  it('opens the detail dialog with configuration', async () => {
    await renderPage(new MockButlerApi());
    fireEvent.click(
      await screen.findByRole('button', { name: `View ${displayName}` }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Configuration');
    expect(dialog).toHaveTextContent(idp.spec.oidc!.clientID);
    expect(dialog).toHaveTextContent('Scopes');
    expect(
      screen.getByRole('button', { name: 'Test Connection' }),
    ).toBeInTheDocument();
  });

  it('opens the delete dialog', async () => {
    await renderPage(new MockButlerApi());
    fireEvent.click(
      await screen.findByRole('button', { name: `Delete ${displayName}` }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Delete Identity Provider');
    expect(dialog).toHaveTextContent('This will remove the SSO configuration.');
  });

  it('hides mutating actions for non-admins', async () => {
    await renderPage(
      new MockButlerApi({ identity: { isPlatformAdmin: false } }),
    );
    await screen.findByRole('heading', { name: 'Identity Providers' });
    expect(screen.queryByRole('link', { name: 'Add Provider' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Delete/ })).toBeNull();
  });

  it('renders the error block with retry', async () => {
    await renderPage(
      new MockButlerApi({
        failures: { listIdentityProviders: new Error('boom') },
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
