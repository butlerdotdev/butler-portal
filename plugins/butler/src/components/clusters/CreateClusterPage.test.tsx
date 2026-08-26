// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import '@testing-library/jest-dom';
import { Route, Routes } from 'react-router-dom';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { butlerApiRef } from '../../api/ButlerApi';
import { MockButlerApi } from '../../api/MockButlerApi';
import { FIXTURE_TEAM, FIXTURE_PROVIDER } from '../../api/fixtures/clusters';
import { rootRouteRef } from '../../routes';
import { TeamProvider } from '../../contexts/TeamProvider';
import { CreateClusterPage } from './CreateClusterPage';

function renderPage(api: MockButlerApi) {
  return renderInTestApp(
    <TestApiProvider apis={[[butlerApiRef, api]]}>
      <TeamProvider>
        <Routes>
          <Route
            path="/butler/t/:team/clusters/create"
            element={<CreateClusterPage />}
          />
          <Route
            path="/butler/t/:team/clusters"
            element={<p>Clusters list</p>}
          />
          <Route
            path="/butler/t/:team/clusters/:namespace/:name"
            element={<p>Cluster detail</p>}
          />
        </Routes>
      </TeamProvider>
    </TestApiProvider>,
    {
      routeEntries: [`/butler/t/${FIXTURE_TEAM}/clusters/create`],
      mountedRoutes: { '/butler': rootRouteRef },
    },
  );
}

describe('CreateClusterPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the console form sections in a single card', async () => {
    await renderPage(new MockButlerApi());

    expect(
      await screen.findByRole('heading', { name: 'Create Cluster' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/for Platform Engineering/)).toBeInTheDocument();
    for (const section of [
      'Basic Information',
      'Worker Nodes',
      'Networking',
      'Features',
    ]) {
      expect(screen.getByRole('heading', { name: section })).toBeVisible();
    }
    expect(screen.getByLabelText(/Namespace/)).toBeDisabled();
    expect(screen.getByLabelText(/Namespace/)).toHaveValue(
      `team-${FIXTURE_TEAM}`,
    );
    expect(
      screen.getByRole('switch', { name: 'Enable Cloud Workspaces' }),
    ).toBeChecked();
    expect(
      screen.getByRole('button', { name: 'Create Cluster' }),
    ).toBeVisible();
  });

  it('shows provider fields after choosing a provider and validates on submit', async () => {
    const api = new MockButlerApi();
    const spy = jest.spyOn(api, 'createCluster');
    await renderPage(api);
    await screen.findByRole('heading', { name: 'Create Cluster' });

    fireEvent.click(screen.getByRole('button', { name: 'Create Cluster' }));
    expect(screen.getByText('Cluster name is required')).toBeVisible();
    expect(screen.getByText('Provider is required')).toBeVisible();
    expect(
      screen.getByText('Load balancer start IP is required'),
    ).toBeVisible();
    expect(spy).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Provider/), {
      target: { value: FIXTURE_PROVIDER },
    });
    expect(
      await screen.findByRole('heading', {
        name: 'Infrastructure (harvester)',
      }),
    ).toBeVisible();
    await screen.findByLabelText(/OS Image/);
  });

  it('submits the form and navigates to the cluster list', async () => {
    // No environments on this team, so the form asks for none and this
    // test stays about submitting and navigating.
    const api = new MockButlerApi({ environments: [] });
    const spy = jest.spyOn(api, 'createCluster');
    await renderPage(api);
    await screen.findByRole('heading', { name: 'Create Cluster' });

    fireEvent.change(screen.getByLabelText(/Cluster Name/), {
      target: { value: 'demo' },
    });
    fireEvent.change(screen.getByLabelText(/Provider/), {
      target: { value: FIXTURE_PROVIDER },
    });
    const network = await screen.findByLabelText(/^Network/);
    fireEvent.change(network, { target: { value: 'lab-vlan-40' } });
    fireEvent.change(screen.getByLabelText(/OS Image/), {
      target: { value: 'talos-1.10.5' },
    });
    fireEvent.change(screen.getByLabelText(/Load Balancer Start IP/), {
      target: { value: '10.40.1.100' },
    });
    fireEvent.change(screen.getByLabelText(/Load Balancer End IP/), {
      target: { value: '10.40.1.150' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Cluster' }));

    // Creation is accepted and provisioning starts afterwards, so the
    // form hands over to the new cluster's own page.
    await waitFor(() =>
      expect(screen.getByText('Cluster detail')).toBeVisible(),
    );
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'demo',
        providerConfigRef: FIXTURE_PROVIDER,
        harvesterNetworkName: 'lab-vlan-40',
        harvesterImageName: 'talos-1.10.5',
        teamRef: FIXTURE_TEAM,
      }),
      // No environment chosen, so no environment scope is sent.
      undefined,
    );
  });

  it('renders the API error inline when creation fails', async () => {
    const api = new MockButlerApi({
      environments: [],
      failures: { createCluster: new Error('quota exceeded') },
    });
    await renderPage(api);
    await screen.findByRole('heading', { name: 'Create Cluster' });

    fireEvent.change(screen.getByLabelText(/Cluster Name/), {
      target: { value: 'demo' },
    });
    fireEvent.change(screen.getByLabelText(/Provider/), {
      target: { value: FIXTURE_PROVIDER },
    });
    fireEvent.change(await screen.findByLabelText(/^Network/), {
      target: { value: 'lab-vlan-40' },
    });
    fireEvent.change(screen.getByLabelText(/OS Image/), {
      target: { value: 'talos-1.10.5' },
    });
    fireEvent.change(screen.getByLabelText(/Load Balancer Start IP/), {
      target: { value: '10.40.1.100' },
    });
    fireEvent.change(screen.getByLabelText(/Load Balancer End IP/), {
      target: { value: '10.40.1.150' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Cluster' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'quota exceeded',
    );
  });
});
