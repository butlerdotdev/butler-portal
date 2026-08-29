// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * Editing a platform provider: only changed fields are sent, credentials
 * only when typed, the scope never, and the detail view keeps readiness
 * (credentials present) apart from reachability (a validate run).
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
import { fixtureProviders } from '../../api/fixtures/clusters';
import { rootRouteRef } from '../../routes';
import { TeamProvider } from '../../contexts/TeamProvider';
import { ProvidersPage } from './ProvidersPage';

const alertApi: AlertApi = {
  post: jest.fn(),
  alert$: () =>
    ({ subscribe: () => ({ unsubscribe: () => {}, closed: false }) } as any),
};

const NAME = fixtureProviders[0].metadata.name;

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

/**
 * The stock fixture is in IPAM mode without a pool, which the page refuses
 * to save as-is (admission would too). These tests start from a provider
 * that is saveable unchanged.
 */
function withPools(api: MockButlerApi) {
  const base = fixtureProviders[0];
  jest.spyOn(api, 'listProviders').mockResolvedValue({
    providers: [
      {
        ...base,
        spec: {
          ...base.spec,
          network: {
            mode: 'ipam',
            poolRefs: [{ name: 'vlan40-underlay', priority: 1 }],
          },
        },
      },
    ],
  });
  return api;
}

async function openEdit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole('button', { name: `Edit provider ${NAME}` }),
  );
  return screen.findByRole('dialog');
}

describe('editing a provider', () => {
  beforeEach(() => localStorage.clear());

  it('sends only the fields that changed', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi();
    const update = jest.spyOn(api, 'updateProvider');
    await renderPage(api);

    const dialog = await openEdit(user);
    expect(dialog).toHaveTextContent('fixed once a provider exists');
    await user.type(
      within(dialog).getByLabelText('DNS servers'),
      '10.40.0.1, 10.40.0.2',
    );
    await user.type(
      within(dialog).getByLabelText('Network pools'),
      'vlan40-underlay:1',
    );
    await user.type(
      within(dialog).getByLabelText('Max clusters per team'),
      '5',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Save changes' }),
    );

    await waitFor(() => expect(update).toHaveBeenCalled());
    const [ns, name, req] = update.mock.calls[0];
    expect(ns).toBe('butler-system');
    expect(name).toBe(NAME);
    expect(req).toEqual({
      networkDnsServers: ['10.40.0.1', '10.40.0.2'],
      poolRefs: [{ name: 'vlan40-underlay', priority: 1 }],
      maxClustersPerTeam: 5,
    });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('does not call the server when nothing changed', async () => {
    const user = userEvent.setup();
    const api = withPools(new MockButlerApi());
    const update = jest.spyOn(api, 'updateProvider');
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

  it('sends a credential only when one was typed', async () => {
    const user = userEvent.setup();
    const api = withPools(new MockButlerApi());
    const update = jest.spyOn(api, 'updateProvider');
    await renderPage(api);

    const dialog = await openEdit(user);
    const kubeconfig = within(dialog).getByLabelText(
      'Replace kubeconfig',
    ) as HTMLTextAreaElement;
    expect(kubeconfig.value).toBe('');
    await user.type(kubeconfig, 'apiVersion: v1');
    await user.click(
      within(dialog).getByRole('button', { name: 'Save changes' }),
    );

    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][2]).toEqual({
      harvesterKubeconfig: 'apiVersion: v1',
    });
  });

  it('surfaces the server refusal inside the dialog', async () => {
    const user = userEvent.setup();
    const api = withPools(new MockButlerApi());
    jest
      .spyOn(api, 'updateProvider')
      .mockRejectedValue(new Error('admission webhook denied the request'));
    await renderPage(api);

    const dialog = await openEdit(user);
    await user.type(within(dialog).getByLabelText('Max nodes per team'), '9');
    await user.click(
      within(dialog).getByRole('button', { name: 'Save changes' }),
    );

    expect(
      await within(dialog).findByText(/admission webhook denied/),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('keeps readiness apart from reachability in the detail view', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi();
    await renderPage(api);

    await user.click(
      await screen.findByRole('button', { name: `${NAME} details` }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Not tested this session');
    expect(dialog).toHaveTextContent('Credentials present');
    await waitFor(() =>
      expect(dialog).toHaveTextContent('No CA bundle configured'),
    );
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();

    jest.spyOn(api, 'validateProvider').mockResolvedValue({
      valid: false,
      category: 'network',
      message: 'dial tcp 127.0.0.1:1: connection refused',
    });
    await user.click(screen.getByRole('button', { name: 'Test Connection' }));
    await waitFor(() =>
      expect(dialog).toHaveTextContent('Endpoint unreachable. dial tcp'),
    );
  });

  it('offers no edit to a viewer', async () => {
    const api = new MockButlerApi({ identity: { isPlatformAdmin: false } });
    await renderPage(api);
    await screen.findByRole('heading', { name: 'Providers' });
    expect(
      screen.queryByRole('button', { name: /Edit provider/ }),
    ).not.toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: `${NAME} details` }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Delete' })).toBeNull();
  });
});
