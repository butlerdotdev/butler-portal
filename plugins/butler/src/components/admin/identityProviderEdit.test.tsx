// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * Editing an identity provider: the dialog starts from the current
 * non-secret values, sends only what changed (plus the TLS flag the
 * server always writes), never shows or prefills the client secret, and
 * is offered only to the platform admin the server accepts it from.
 */
import '@testing-library/jest-dom';
import { Route, Routes } from 'react-router-dom';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
import { platformViewerIdentity } from '../../api/fixtures/identities';
import { rootRouteRef } from '../../routes';
import { TeamProvider } from '../../contexts/TeamProvider';
import { IdentityProvidersPage } from './IdentityProvidersPage';

const alertApi: AlertApi = {
  post: jest.fn(),
  alert$: () =>
    ({ subscribe: () => ({ unsubscribe: () => {}, closed: false }) } as any),
};

const idp = fixtureIdentityProviders[0];
const DISPLAY = idp.spec.displayName || idp.metadata.name;

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

async function openEdit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole('button', { name: `Edit ${DISPLAY}` }),
  );
  return screen.findByRole('dialog');
}

describe('editing an identity provider', () => {
  beforeEach(() => localStorage.clear());

  it('starts from the current values with the secret blank', async () => {
    const user = userEvent.setup();
    await renderPage(new MockButlerApi());
    const dialog = await openEdit(user);

    expect(within(dialog).getByLabelText('Issuer URL')).toHaveValue(
      idp.spec.oidc!.issuerURL,
    );
    expect(within(dialog).getByLabelText('Client ID')).toHaveValue(
      idp.spec.oidc!.clientID,
    );
    expect(within(dialog).getByLabelText('Scopes')).toHaveValue(
      idp.spec.oidc!.scopes!.join(', '),
    );
    const secret = within(dialog).getByLabelText('New client secret');
    expect(secret).toHaveValue('');
    expect(secret).toHaveAttribute('type', 'password');
    expect(dialog).toHaveTextContent(
      `configured in secret ${idp.spec.oidc!.clientSecretRef.name}`,
    );
    expect(dialog).toHaveTextContent('fixed once a provider exists');
  });

  it('does not call the server when nothing changed', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi();
    const update = jest.spyOn(api, 'updateIdentityProvider');
    await renderPage(api);
    const dialog = await openEdit(user);
    await user.click(
      within(dialog).getByRole('button', { name: 'Save changes' }),
    );
    expect(
      await within(dialog).findByText(/Nothing has changed/),
    ).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it('sends only the changed field plus the TLS flag, and refreshes', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi();
    const update = jest.spyOn(api, 'updateIdentityProvider');
    await renderPage(api);
    const dialog = await openEdit(user);

    const display = within(dialog).getByLabelText('Display name');
    await user.clear(display);
    await user.type(display, 'Corporate SSO (staging)');
    await user.click(
      within(dialog).getByRole('button', { name: 'Save changes' }),
    );

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0]).toEqual([
      idp.metadata.name,
      { displayName: 'Corporate SSO (staging)', insecureSkipVerify: false },
    ]);
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByRole('button', {
        name: 'View Corporate SSO (staging)',
      }),
    ).toBeInTheDocument();
  });

  it('sends the secret only when typed', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi();
    const update = jest.spyOn(api, 'updateIdentityProvider');
    await renderPage(api);
    const dialog = await openEdit(user);
    await user.type(
      within(dialog).getByLabelText('New client secret'),
      'replacement',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Save changes' }),
    );
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][1]).toEqual({
      clientSecret: 'replacement',
      insecureSkipVerify: false,
    });
  });

  it('refuses an emptied required field and a non-https issuer before the server', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi();
    const update = jest.spyOn(api, 'updateIdentityProvider');
    await renderPage(api);
    const dialog = await openEdit(user);
    const issuer = within(dialog).getByLabelText('Issuer URL');
    await user.clear(issuer);
    await user.click(
      within(dialog).getByRole('button', { name: 'Save changes' }),
    );
    expect(
      await within(dialog).findByText(/cannot be emptied/),
    ).toBeInTheDocument();
    await user.type(issuer, 'http://insecure.example');
    await user.click(
      within(dialog).getByRole('button', { name: 'Save changes' }),
    );
    expect(
      await within(dialog).findByText(/Must start with https/),
    ).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it('warns that an emptied optional field is kept by the server', async () => {
    const user = userEvent.setup();
    await renderPage(new MockButlerApi());
    const dialog = await openEdit(user);
    await user.clear(within(dialog).getByLabelText('Groups claim'));
    expect(
      await within(dialog).findByText(/cannot clear groups claim/),
    ).toBeInTheDocument();
  });

  it('shows the server refusal inside the dialog', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi();
    jest
      .spyOn(api, 'updateIdentityProvider')
      .mockRejectedValue(
        new Error('failed to update credentials secret: denied'),
      );
    await renderPage(api);
    const dialog = await openEdit(user);
    await user.type(within(dialog).getByLabelText('New client secret'), 'x');
    await user.click(
      within(dialog).getByRole('button', { name: 'Save changes' }),
    );
    expect(
      await within(dialog).findByText(/failed to update credentials secret/),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows the credential as configured, the claims and TLS in the detail, and names what validation proves', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi();
    await renderPage(api);
    await user.click(
      await screen.findByRole('button', { name: `View ${DISPLAY}` }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(
      `Configured in secret ${idp.spec.oidc!.clientSecretRef.name}`,
    );
    expect(dialog).toHaveTextContent('Enforced');
    expect(dialog).toHaveTextContent('Discovery succeeded');
    expect(
      within(dialog).getByRole('button', { name: 'Edit' }),
    ).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole('button', { name: 'Test Connection' }),
    );
    await waitFor(() =>
      expect(alertApi.post).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringMatching(/^Issuer discovered: .*not exercised/),
          severity: 'success',
        }),
      ),
    );
  });

  it('offers no edit, test or delete to a platform viewer', async () => {
    const user = userEvent.setup();
    await renderPage(new MockButlerApi({ identity: platformViewerIdentity }));
    await screen.findByRole('heading', { name: 'Identity Providers' });
    expect(
      screen.queryByRole('button', { name: `Edit ${DISPLAY}` }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: `Delete ${DISPLAY}` }),
    ).toBeNull();
    await user.click(screen.getByRole('button', { name: `View ${DISPLAY}` }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(
      within(dialog).queryByRole('button', { name: 'Test Connection' }),
    ).toBeNull();
    expect(dialog).toHaveTextContent('Configured in secret');
  });
});
