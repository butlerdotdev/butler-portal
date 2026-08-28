// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * Policy on the create form: the lists are read in the environment the
 * cluster will be created in, and what a policy did to a list is said in
 * words rather than left as a mysteriously short list.
 */
import '@testing-library/jest-dom';
import { Route, Routes } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { butlerApiRef } from '../../api/ButlerApi';
import { MockButlerApi } from '../../api/MockButlerApi';
import { FIXTURE_TEAM, FIXTURE_PROVIDER } from '../../api/fixtures/clusters';
import {
  platformAdminIdentity,
  teamAdminIdentity,
} from '../../api/fixtures/identities';
import type { Provider } from '../../api/types/providers';
import { rootRouteRef } from '../../routes';
import { TeamProvider } from '../../contexts/TeamProvider';
import { CreateClusterPage } from './CreateClusterPage';

const nutanixProvider: Provider = {
  metadata: { name: 'ntx-lab', namespace: 'butler-system', uid: 'ntx-1' },
  spec: { provider: 'nutanix', network: { mode: 'ipam' } },
  status: { ready: true },
};

function render(api: MockButlerApi) {
  return renderInTestApp(
    <TestApiProvider apis={[[butlerApiRef, api]]}>
      <TeamProvider>
        <Routes>
          <Route
            path="/butler/t/:team/clusters/new"
            element={<CreateClusterPage />}
          />
          <Route
            path="/butler/admin/policies/:name"
            element={<p>Policy page</p>}
          />
        </Routes>
      </TeamProvider>
    </TestApiProvider>,
    {
      routeEntries: [`/butler/t/${FIXTURE_TEAM}/clusters/new`],
      mountedRoutes: { '/butler': rootRouteRef },
    },
  );
}

describe('option lists are read in the environment the cluster will use', () => {
  it('sends no environment scope while none is chosen', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi({
      identity: teamAdminIdentity,
      environments: [{ name: 'production' }],
    });
    const images = jest.spyOn(api, 'listProviderImages');
    await render(api);
    await screen.findByRole('heading', { name: /create cluster/i });

    await user.selectOptions(
      screen.getByLabelText(/^Provider/i),
      FIXTURE_PROVIDER,
    );

    await waitFor(() => expect(images).toHaveBeenCalled());
    expect(images.mock.calls[0][2]).toBeUndefined();
  });

  it('re-reads every list with the environment once it is chosen', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi({
      identity: teamAdminIdentity,
      environments: [{ name: 'production' }],
    });
    const images = jest.spyOn(api, 'listProviderImages');
    const networks = jest.spyOn(api, 'listProviderNetworks');
    await render(api);
    await screen.findByRole('heading', { name: /create cluster/i });

    await user.selectOptions(
      screen.getByLabelText(/^Provider/i),
      FIXTURE_PROVIDER,
    );
    await waitFor(() => expect(images).toHaveBeenCalled());
    await user.selectOptions(
      screen.getByLabelText(/Environment \*/i),
      'production',
    );

    await waitFor(() =>
      expect(images).toHaveBeenLastCalledWith(
        'butler-system',
        FIXTURE_PROVIDER,
        { environment: 'production' },
      ),
    );
    expect(networks).toHaveBeenLastCalledWith(
      'butler-system',
      FIXTURE_PROVIDER,
      { environment: 'production' },
    );
  });
});

describe('what a policy did to a list is said in words', () => {
  const withPolicies = (api: MockButlerApi) => {
    jest.spyOn(api, 'listProviderImages').mockResolvedValue({
      images: [{ id: 'talos-1.10.5', name: 'Talos 1.10.5', os: 'talos' }],
      policy: { name: 'vetted-images', mode: 'pin', values: ['talos-1.10.5'] },
    });
    jest.spyOn(api, 'listProviderNetworks').mockResolvedValue({
      networks: [
        { id: 'lab-vlan-40', name: 'lab-vlan-40' },
        { id: 'lab-vlan-50', name: 'lab-vlan-50' },
      ],
      policy: {
        name: 'prefer-40',
        mode: 'recommended',
        values: ['lab-vlan-40'],
        recommendedReason: 'VLAN 40 has the load balancer pool.',
      },
    });
    return api;
  };

  it('explains a pinned image list and a recommended network list', async () => {
    const user = userEvent.setup();
    const api = withPolicies(
      new MockButlerApi({ identity: teamAdminIdentity, environments: [] }),
    );
    await render(api);
    await screen.findByRole('heading', { name: /create cluster/i });
    await user.selectOptions(
      screen.getByLabelText(/^Provider/i),
      FIXTURE_PROVIDER,
    );

    expect(
      await screen.findByText('Policy: vetted-images'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/exactly one image is allowed/i),
    ).toBeInTheDocument();
    expect(screen.getByText('Policy: prefer-40')).toBeInTheDocument();
    expect(
      screen.getByText(/VLAN 40 has the load balancer pool/),
    ).toBeInTheDocument();
  });

  it('offers the policy itself only to a role that may read it', async () => {
    const user = userEvent.setup();
    const teamApi = withPolicies(
      new MockButlerApi({ identity: teamAdminIdentity, environments: [] }),
    );
    await render(teamApi);
    await screen.findByRole('heading', { name: /create cluster/i });
    await user.selectOptions(
      screen.getByLabelText(/^Provider/i),
      FIXTURE_PROVIDER,
    );
    await screen.findByText('Policy: vetted-images');

    // A team role cannot read /admin/policies, so no link is offered.
    expect(
      screen.queryByRole('link', { name: 'View policy' }),
    ).not.toBeInTheDocument();
  });

  it('links a platform role to the policy', async () => {
    const user = userEvent.setup();
    const api = withPolicies(
      new MockButlerApi({ identity: platformAdminIdentity, environments: [] }),
    );
    await render(api);
    await screen.findByRole('heading', { name: /create cluster/i });
    await user.selectOptions(
      screen.getByLabelText(/^Provider/i),
      FIXTURE_PROVIDER,
    );
    await screen.findByText('Policy: vetted-images');

    const links = screen.getAllByRole('link', { name: 'View policy' });
    expect(links[0]).toHaveAttribute(
      'href',
      '/butler/admin/policies/vetted-images',
    );
  });
});

describe('Nutanix placement is chosen from the provider, not typed', () => {
  it('offers clusters and storage containers from the provider with their policy', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi({
      identity: teamAdminIdentity,
      environments: [],
      providers: [nutanixProvider],
    });
    jest.spyOn(api, 'listProviderClusters').mockResolvedValue({
      clusters: [{ id: 'c-1', name: 'prism-a' }],
      policy: { name: 'prod-prism', mode: 'allowList', values: ['c-1'] },
    });
    await render(api);
    await screen.findByRole('heading', { name: /create cluster/i });

    await user.selectOptions(screen.getByLabelText(/^Provider/i), 'ntx-lab');

    const cluster = await screen.findByLabelText(/^Cluster \*/i);
    await waitFor(() =>
      expect((cluster as HTMLSelectElement).options.length).toBe(2),
    );
    expect(screen.getByRole('option', { name: 'prism-a' })).toBeInTheDocument();
    expect(screen.getByText('Policy: prod-prism')).toBeInTheDocument();
    const storage = screen.getByLabelText(
      /Storage Container/i,
    ) as HTMLSelectElement;
    expect(Array.from(storage.options).map(o => o.textContent)).toEqual([
      'Provider default',
      'default-container',
      'fast-nvme',
    ]);
  });
});
