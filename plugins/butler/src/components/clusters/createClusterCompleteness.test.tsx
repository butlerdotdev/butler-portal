// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import '@testing-library/jest-dom';
import { Route, Routes } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { butlerApiRef } from '../../api/ButlerApi';
import { ButlerApiError } from '../../api/ButlerApiError';
import { MockButlerApi } from '../../api/MockButlerApi';
import { FIXTURE_TEAM, FIXTURE_PROVIDER } from '../../api/fixtures/clusters';
import {
  platformAdminIdentity,
  platformViewerIdentity,
  teamAdminIdentity,
  teamOperatorIdentity,
  teamViewerIdentity,
} from '../../api/fixtures/identities';
import { rootRouteRef } from '../../routes';
import { TeamProvider } from '../../contexts/TeamProvider';
import { CreateClusterPage } from './CreateClusterPage';

function render(api: MockButlerApi) {
  return renderInTestApp(
    <TestApiProvider apis={[[butlerApiRef, api]]}>
      <TeamProvider>
        <Routes>
          <Route
            path="/butler/t/:team/clusters/new"
            element={<CreateClusterPage />}
          />
          <Route path="/butler/t/:team/clusters" element={<p>Clusters</p>} />
          <Route
            path="/butler/t/:team/clusters/:namespace/:name"
            element={<p>Cluster detail</p>}
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

/** Fills the fields the mock provider makes mandatory. */
async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Cluster Name/i), 'e2e-new');
  await user.selectOptions(
    screen.getByLabelText(/Provider/i),
    FIXTURE_PROVIDER,
  );
  // Harvester needs a network and an image, which load once it is chosen.
  const network = await screen.findByLabelText(/^Network/i);
  await waitFor(() =>
    expect((network as HTMLSelectElement).options.length).toBeGreaterThan(1),
  );
  await user.selectOptions(
    network,
    (network as HTMLSelectElement).options[1].value,
  );
  const image = await screen.findByLabelText(/OS Image/i);
  await user.selectOptions(
    image,
    (image as HTMLSelectElement).options[1].value,
  );
}

describe('who is offered the create form', () => {
  it.each([
    ['a team admin', teamAdminIdentity],
    ['a team operator', teamOperatorIdentity],
    ['a platform admin', platformAdminIdentity],
  ])('offers it to %s, matching the server', async (_l, identity) => {
    await render(new MockButlerApi({ identity, environments: [] }));

    expect(
      await screen.findByRole('heading', { name: /create cluster/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Cluster Name/i)).toBeInTheDocument();
  });

  it.each([
    ['a team viewer', teamViewerIdentity],
    ['a platform viewer', platformViewerIdentity],
  ])('refuses %s, which is what the server answers', async (_l, identity) => {
    await render(new MockButlerApi({ identity, environments: [] }));

    // The server refuses a viewer of either kind, so no form is offered.
    await waitFor(() =>
      expect(screen.queryByLabelText(/Cluster Name/i)).not.toBeInTheDocument(),
    );
    expect(screen.getByText(/can read clusters but not create/i)).toBeVisible();
  });
});

describe('defaults come from the team and its environments', () => {
  it('prefills from the team and says where the value came from', async () => {
    await render(
      new MockButlerApi({
        identity: teamAdminIdentity,
        environments: [],
        teamClusterDefaults: { kubernetesVersion: 'v1.31.0', workerCount: 5 },
      }),
    );

    await screen.findByRole('heading', { name: /create cluster/i });
    await waitFor(() =>
      expect(
        (screen.getByLabelText(/Control Plane Version/i) as HTMLSelectElement)
          .value,
      ).toBe('v1.31.0'),
    );
    expect(screen.getByText(/Default from this team/i)).toBeInTheDocument();
    expect((screen.getByLabelText(/Replicas/i) as HTMLInputElement).value).toBe(
      '5',
    );
  });

  it('lets the chosen environment narrow the team default', async () => {
    const user = userEvent.setup();
    await render(
      new MockButlerApi({
        identity: teamAdminIdentity,
        environments: [
          { name: 'production', clusterDefaults: { workerCount: 9 } },
        ],
        teamClusterDefaults: { workerCount: 5 },
      }),
    );

    await screen.findByRole('heading', { name: /create cluster/i });
    await waitFor(() =>
      expect(
        (screen.getByLabelText(/Replicas/i) as HTMLInputElement).value,
      ).toBe('5'),
    );

    await user.selectOptions(
      screen.getByLabelText(/Environment \*/i),
      'production',
    );

    await waitFor(() =>
      expect(
        (screen.getByLabelText(/Replicas/i) as HTMLInputElement).value,
      ).toBe('9'),
    );
  });

  it('does not overwrite a value the user has already set', async () => {
    const user = userEvent.setup();
    await render(
      new MockButlerApi({
        identity: teamAdminIdentity,
        environments: [
          { name: 'production', clusterDefaults: { workerCount: 9 } },
        ],
        teamClusterDefaults: { workerCount: 5 },
      }),
    );

    await screen.findByRole('heading', { name: /create cluster/i });
    const replicas = screen.getByLabelText(/Replicas/i);
    await waitFor(() => expect((replicas as HTMLInputElement).value).toBe('5'));

    await user.clear(replicas);
    await user.type(replicas, '2');
    await user.selectOptions(
      screen.getByLabelText(/Environment \*/i),
      'production',
    );

    // The environment default must not clobber a deliberate choice.
    await waitFor(() => expect((replicas as HTMLInputElement).value).toBe('2'));
  });

  it('offers only versions the CRD stores, all prefixed', async () => {
    await render(
      new MockButlerApi({ identity: teamAdminIdentity, environments: [] }),
    );

    await screen.findByRole('heading', { name: /create cluster/i });
    const options = Array.from(
      (screen.getByLabelText(/Control Plane Version/i) as HTMLSelectElement)
        .options,
    ).map(o => o.value);

    expect(options.length).toBeGreaterThan(0);
    expect(options.every(v => v.startsWith('v'))).toBe(true);
    expect(options).toContain('v1.32.2');
  });
});

describe('addresses are asked for only where the caller supplies them', () => {
  it('does not ask for a range when the platform allocates', async () => {
    await render(
      new MockButlerApi({ identity: teamAdminIdentity, environments: [] }),
    );
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: /create cluster/i });
    await user.selectOptions(
      screen.getByLabelText(/Provider/i),
      FIXTURE_PROVIDER,
    );

    await waitFor(() =>
      expect(screen.getByText(/platform allocates/i)).toBeVisible(),
    );
    expect(
      screen.queryByLabelText(/Load Balancer Start IP/i),
    ).not.toBeInTheDocument();
  });

  it('asks for one when the caller opts to choose it', async () => {
    const user = userEvent.setup();
    await render(
      new MockButlerApi({ identity: teamAdminIdentity, environments: [] }),
    );
    await screen.findByRole('heading', { name: /create cluster/i });
    await user.selectOptions(
      screen.getByLabelText(/Provider/i),
      FIXTURE_PROVIDER,
    );
    await screen.findByText(/platform allocates/i);

    await user.click(screen.getByLabelText(/Choose the addresses myself/i));

    expect(
      await screen.findByLabelText(/Load Balancer Start IP/i),
    ).toBeInTheDocument();
  });
});

describe('server validation lands on the control it names', () => {
  it('puts a named field error on that field', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi({
      identity: teamAdminIdentity,
      environments: [],
    });
    jest.spyOn(api, 'createCluster').mockRejectedValue(
      new ButlerApiError({
        status: 400,
        message: 'invalid request',
        fieldErrors: [
          { field: 'workerReplicas', reason: 'exceeds the team quota' },
        ],
      }),
    );
    await render(api);
    await screen.findByRole('heading', { name: /create cluster/i });
    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: /create cluster/i }));

    expect(await screen.findByText('exceeds the team quota')).toBeVisible();
  });

  it('shows a webhook denial in readable form', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi({
      identity: teamAdminIdentity,
      environments: [],
    });
    jest
      .spyOn(api, 'createCluster')
      .mockRejectedValue(
        new Error(
          'admission webhook "vtenantcluster.kb.io" denied the request: spec.providerConfigRef.name: Not found: "nope"',
        ),
      );
    await render(api);
    await screen.findByRole('heading', { name: /create cluster/i });
    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: /create cluster/i }));

    // The admission prefix is stripped; the reason survives.
    expect(await screen.findByText(/Not found: "nope"/)).toBeVisible();
    expect(
      screen.queryByText(/vtenantcluster\.kb\.io/),
    ).not.toBeInTheDocument();
  });
});
