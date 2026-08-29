// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * Creating a platform provider: the request that leaves the page carries
 * exactly what was filled in, including the network, scope and limits
 * sections, and the page refuses what admission would refuse.
 */
import '@testing-library/jest-dom';
import { Route, Routes } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
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
          <Route path="/butler/admin/providers" element={<p>list</p>} />
        </Routes>
      </TeamProvider>
    </TestApiProvider>,
    {
      routeEntries: ['/butler/admin/providers/create'],
      mountedRoutes: { '/butler': rootRouteRef },
    },
  );
}

describe('creating a provider', () => {
  beforeEach(() => localStorage.clear());

  it('sends the network, scope and limits sections when filled', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi();
    const create = jest.spyOn(api, 'createProvider');
    await renderPage(api);
    await screen.findByRole('heading', { name: 'Add Provider' });

    await user.type(screen.getByLabelText('Provider Name *'), 'e2e-lab');
    await user.type(screen.getByLabelText('Kubeconfig *'), 'apiVersion: v1');

    await user.click(screen.getByRole('button', { name: /^Network/ }));
    await user.click(screen.getByRole('radio', { name: 'IPAM' }));
    await user.type(
      screen.getByLabelText('Network Pools *'),
      'vlan40-underlay:1',
    );
    await user.type(screen.getByLabelText('Subnet'), '10.99.0.0/24');
    await user.type(
      screen.getByLabelText('DNS Servers'),
      '10.99.0.1, 10.99.0.2',
    );

    await user.click(screen.getByRole('button', { name: /^Scope/ }));
    await user.click(screen.getByRole('radio', { name: 'Team' }));
    await user.type(screen.getByLabelText('Team *'), 'platform-engineering');

    await user.click(screen.getByRole('button', { name: /^Limits/ }));
    await user.type(screen.getByLabelText('Max Clusters / Team'), '3');

    await user.click(screen.getByRole('button', { name: 'Create Provider' }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0][0]).toEqual({
      name: 'e2e-lab',
      namespace: 'butler-system',
      provider: 'harvester',
      harvesterKubeconfig: 'apiVersion: v1',
      networkMode: 'ipam',
      networkSubnet: '10.99.0.0/24',
      networkDnsServers: ['10.99.0.1', '10.99.0.2'],
      poolRefs: [{ name: 'vlan40-underlay', priority: 1 }],
      scopeType: 'team',
      scopeTeamRef: 'platform-engineering',
      maxClustersPerTeam: 3,
    });
  });

  it('refuses ipam without a pool before the server would', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi();
    const create = jest.spyOn(api, 'createProvider');
    await renderPage(api);
    await screen.findByRole('heading', { name: 'Add Provider' });

    await user.type(screen.getByLabelText('Provider Name *'), 'e2e-lab');
    await user.type(screen.getByLabelText('Kubeconfig *'), 'k');
    await user.click(screen.getByRole('button', { name: /^Network/ }));
    await user.click(screen.getByRole('radio', { name: 'IPAM' }));
    await user.click(screen.getByRole('button', { name: 'Create Provider' }));

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.map(a => a.textContent).join(' ')).toMatch(
      /at least one network pool/i,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('creates a cloud provider with its own credential fields', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi();
    const create = jest.spyOn(api, 'createProvider');
    await renderPage(api);
    await screen.findByRole('heading', { name: 'Add Provider' });

    await user.click(screen.getByRole('radio', { name: 'aws' }));
    expect(
      screen.getByRole('heading', { name: 'AWS Credentials' }),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText('Provider Name *'), 'e2e-aws');
    await user.type(screen.getByLabelText('Region *'), 'eu-west-1');
    await user.type(screen.getByLabelText('Access Key ID *'), 'AKIAEXAMPLE');
    await user.type(
      screen.getByLabelText('Secret Access Key *'),
      'not-a-real-secret',
    );
    await user.type(screen.getByLabelText('Subnet IDs'), 'subnet-a, subnet-b');

    expect(
      screen.getByRole('button', { name: 'Test Connection' }),
    ).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Create Provider' }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0][0]).toMatchObject({
      name: 'e2e-aws',
      provider: 'aws',
      awsRegion: 'eu-west-1',
      awsAccessKeyId: 'AKIAEXAMPLE',
      awsSecretAccessKey: 'not-a-real-secret',
      awsSubnetIds: ['subnet-a', 'subnet-b'],
    });
    expect(create.mock.calls[0][0]).not.toHaveProperty('harvesterKubeconfig');
  });

  it('names the failing stage of a connection test', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi();
    jest.spyOn(api, 'testProviderConnection').mockResolvedValue({
      valid: false,
      category: 'auth',
      message: 'unauthorized',
    });
    await renderPage(api);
    await screen.findByRole('heading', { name: 'Add Provider' });
    await user.type(screen.getByLabelText('Provider Name *'), 'lab');
    await user.type(screen.getByLabelText('Kubeconfig *'), 'k');
    await user.click(screen.getByRole('button', { name: 'Test Connection' }));

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.map(a => a.textContent).join(' ')).toMatch(
      /Credentials refused\. unauthorized/,
    );
  });
});
