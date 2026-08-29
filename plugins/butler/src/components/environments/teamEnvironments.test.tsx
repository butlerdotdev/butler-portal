// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import '@testing-library/jest-dom';
import { Route, Routes } from 'react-router-dom';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { butlerApiRef } from '../../api/ButlerApi';
import { ButlerApiError } from '../../api/ButlerApiError';
import { MockButlerApi } from '../../api/MockButlerApi';
import { FIXTURE_TEAM } from '../../api/fixtures/clusters';
import { fixtureEnvironments } from '../../api/fixtures/environments';
import {
  platformAdminIdentity,
  platformViewerIdentity,
  teamAdminIdentity,
  teamOperatorIdentity,
  teamViewerIdentity,
} from '../../api/fixtures/identities';
import { rootRouteRef } from '../../routes';
import { TeamProvider } from '../../contexts/TeamProvider';
import { TeamEnvironmentsPage } from './TeamEnvironmentsPage';
import { buildEnvironmentRequest } from './EnvironmentFormDialog';

function render(api: MockButlerApi) {
  return renderInTestApp(
    <TestApiProvider apis={[[butlerApiRef, api]]}>
      <TeamProvider>
        <Routes>
          <Route
            path="/butler/t/:team/environments"
            element={<TeamEnvironmentsPage />}
          />
        </Routes>
      </TeamProvider>
    </TestApiProvider>,
    {
      routeEntries: [`/butler/t/${FIXTURE_TEAM}/environments`],
      mountedRoutes: { '/butler': rootRouteRef },
    },
  );
}

describe('buildEnvironmentRequest', () => {
  const base = {
    name: 'staging',
    description: '',
    maxClusters: '',
    maxClustersPerMember: '',
    kubernetesVersion: '',
    workerCount: '',
    workerCPU: '',
    workerMemoryGi: '',
    workerDiskGi: '',
  };

  it('leaves a blank limit out rather than sending zero', () => {
    const built = buildEnvironmentRequest(base);
    expect('request' in built).toBe(true);
    if (!('request' in built)) return;
    expect(built.request.limits).toBeUndefined();
    expect(built.request.clusterDefaults).toBeUndefined();
    expect(built.request).toEqual({ name: 'staging' });
  });

  it('nests limits the way the server stores them', () => {
    const built = buildEnvironmentRequest({ ...base, maxClusters: '4' });
    if (!('request' in built)) throw new Error('expected a request');
    expect(built.request.limits).toEqual({ maxClusters: 4 });
  });

  it('refuses a name a cluster label could not hold', () => {
    const built = buildEnvironmentRequest({ ...base, name: '-nope-' });
    expect('error' in built && built.field).toBe('name');
  });

  it('refuses a limit that is not a whole number', () => {
    const built = buildEnvironmentRequest({ ...base, maxClusters: '2.5' });
    expect('error' in built && built.field).toBe('maxClusters');
  });

  it('keeps cluster defaults separate from limits', () => {
    const built = buildEnvironmentRequest({
      ...base,
      workerCount: '3',
      kubernetesVersion: 'v1.31.0',
    });
    if (!('request' in built)) throw new Error('expected a request');
    expect(built.request.clusterDefaults).toEqual({
      kubernetesVersion: 'v1.31.0',
      workerCount: 3,
    });
    expect(built.request.limits).toBeUndefined();
  });
});

describe('team environments page', () => {
  it('lists the environments with their limits and cluster counts', async () => {
    await render(new MockButlerApi({ identity: teamAdminIdentity }));

    expect(await screen.findByText('production')).toBeInTheDocument();
    expect(screen.getByText('staging')).toBeInTheDocument();
    // production caps at 4, staging sets no cap at all.
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getAllByText('unlimited').length).toBeGreaterThan(0);
  });

  it('says so when the team defines none', async () => {
    await render(
      new MockButlerApi({ identity: teamAdminIdentity, environments: [] }),
    );

    expect(await screen.findByText('No environments defined')).toBeVisible();
  });

  it('reports a failed read instead of showing an empty team', async () => {
    const api = new MockButlerApi({ identity: teamAdminIdentity });
    jest
      .spyOn(api, 'getTeamClusterContext')
      .mockRejectedValue(new Error('server unavailable'));

    await render(api);

    expect(
      await screen.findByText('Failed to load environments'),
    ).toBeInTheDocument();
  });

  it('counts clusters by their environment label, not by name', async () => {
    const api = new MockButlerApi({ identity: teamAdminIdentity });
    jest.spyOn(api, 'listClusters').mockResolvedValue({
      clusters: [
        {
          metadata: {
            labels: { 'butler.butlerlabs.dev/environment': 'production' },
          },
        },
        {
          metadata: {
            labels: { 'butler.butlerlabs.dev/environment': 'production' },
          },
        },
        { metadata: { labels: {} } },
      ],
    } as any);

    await render(api);

    expect(await screen.findByText('2 of 4')).toBeInTheDocument();
    // The unlabelled cluster belongs to no environment.
    expect(screen.getByText('Not in any environment')).toBeInTheDocument();
  });

  it('warns when clusters point at an environment nobody defines', async () => {
    const api = new MockButlerApi({ identity: teamAdminIdentity });
    jest.spyOn(api, 'listClusters').mockResolvedValue({
      clusters: [
        {
          metadata: {
            labels: { 'butler.butlerlabs.dev/environment': 'retired' },
          },
        },
      ],
    } as any);

    await render(api);

    expect(
      await screen.findByText('Clusters point at a missing environment'),
    ).toBeInTheDocument();
  });
});

describe('team environments, by role', () => {
  it.each([
    ['a team admin', teamAdminIdentity],
    ['a platform admin', platformAdminIdentity],
  ])('offers management to %s', async (_label, identity) => {
    await render(new MockButlerApi({ identity }));

    expect(await screen.findByText('production')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /create environment/i }),
    ).toBeInTheDocument();
  });

  it.each([
    ['a team operator', teamOperatorIdentity],
    ['a team viewer', teamViewerIdentity],
    // A platform viewer reads the whole estate and changes none of it.
    ['a platform viewer', platformViewerIdentity],
  ])('shows %s the environments without management', async (_l, identity) => {
    await render(new MockButlerApi({ identity }));

    // The read is served to every team role, so the page is not hidden.
    expect(await screen.findByText('production')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /create environment/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^delete$/i }),
    ).not.toBeInTheDocument();
  });
});

describe('creating an environment', () => {
  it('creates it and shows it in the list', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi({ identity: teamAdminIdentity });
    const create = jest.spyOn(api, 'createTeamEnvironment');
    await render(api);
    await screen.findByText('production');

    await user.click(
      screen.getByRole('button', { name: /create environment/i }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Name/), 'sandbox');
    await user.type(within(dialog).getByLabelText(/Max clusters$/), '2');
    await user.click(
      within(dialog).getByRole('button', { name: /create environment/i }),
    );

    await waitFor(() => {
      expect(create).toHaveBeenCalledWith(FIXTURE_TEAM, {
        name: 'sandbox',
        limits: { maxClusters: 2 },
      });
    });
    expect(await screen.findByText('sandbox')).toBeInTheDocument();
  });

  it('refuses a name the team already uses without calling the server', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi({ identity: teamAdminIdentity });
    const create = jest.spyOn(api, 'createTeamEnvironment');
    await render(api);
    await screen.findByText('production');

    await user.click(
      screen.getByRole('button', { name: /create environment/i }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Name/), 'production');
    await user.click(
      within(dialog).getByRole('button', { name: /create environment/i }),
    );

    expect(
      await within(dialog).findByText(/already has an environment called/i),
    ).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it('surfaces a webhook denial on the form', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi({ identity: teamAdminIdentity });
    jest
      .spyOn(api, 'createTeamEnvironment')
      .mockRejectedValue(
        new Error(
          'admission webhook "vteam.kb.io" denied the request: spec.environments[].limits may only be modified by team admins',
        ),
      );
    await render(api);
    await screen.findByText('production');

    await user.click(
      screen.getByRole('button', { name: /create environment/i }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Name/), 'sandbox');
    await user.click(
      within(dialog).getByRole('button', { name: /create environment/i }),
    );

    expect(
      await within(dialog).findByText(/may only be modified by team admins/i),
    ).toBeInTheDocument();
  });
});

describe('editing an environment', () => {
  it('fixes the name and sends only what the form holds', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi({ identity: teamAdminIdentity });
    const update = jest.spyOn(api, 'updateTeamEnvironment');
    await render(api);
    await screen.findByText('production');

    await user.click(screen.getAllByRole('button', { name: /^edit$/i })[0]);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/^Name/)).toBeDisabled();

    await user.clear(within(dialog).getByLabelText(/Max clusters$/));
    await user.type(within(dialog).getByLabelText(/Max clusters$/), '9');
    await user.click(
      within(dialog).getByRole('button', { name: /save changes/i }),
    );

    await waitFor(() => expect(update).toHaveBeenCalled());
    const [, name, request] = update.mock.calls[0];
    expect(name).toBe('production');
    expect(request.limits?.maxClusters).toBe(9);
    // Access is not editable here, so it must survive the save untouched.
    expect(request.access).toEqual(fixtureEnvironments[0].access);
  });
});

describe('deleting an environment', () => {
  it('names the clusters it will orphan and requires the name typed', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi({ identity: teamAdminIdentity });
    jest.spyOn(api, 'listClusters').mockResolvedValue({
      clusters: [
        {
          metadata: {
            labels: { 'butler.butlerlabs.dev/environment': 'production' },
          },
        },
      ],
    } as any);
    const remove = jest.spyOn(api, 'deleteTeamEnvironment');
    await render(api);
    await screen.findByText('production');

    await user.click(screen.getAllByRole('button', { name: /^delete$/i })[0]);
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(
        /point at an environment that no longer exists/i,
      ),
    ).toBeInTheDocument();

    const confirm = within(dialog).getByRole('button', {
      name: /delete environment/i,
    });
    expect(confirm).toBeDisabled();

    await user.type(within(dialog).getByLabelText(/to confirm/i), 'production');
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() =>
      expect(remove).toHaveBeenCalledWith(FIXTURE_TEAM, 'production'),
    );
  });

  it('removes it from the list once the server has deleted it', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi({ identity: teamAdminIdentity });
    await render(api);
    await screen.findByText('staging');

    await user.click(screen.getAllByRole('button', { name: /^delete$/i })[1]);
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/to confirm/i), 'staging');
    await user.click(
      within(dialog).getByRole('button', { name: /delete environment/i }),
    );

    await waitFor(() =>
      expect(screen.queryByText('staging')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('production')).toBeInTheDocument();
  });

  it('treats an environment that is already gone as deleted', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi({ identity: teamAdminIdentity });
    const refreshed = jest.spyOn(api, 'getTeamClusterContext');
    jest
      .spyOn(api, 'deleteTeamEnvironment')
      .mockRejectedValue(
        new ButlerApiError({ status: 404, message: 'environment not found' }),
      );
    await render(api);
    await screen.findByText('production');
    const before = refreshed.mock.calls.length;

    await user.click(screen.getAllByRole('button', { name: /^delete$/i })[0]);
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/to confirm/i), 'production');
    await user.click(
      within(dialog).getByRole('button', { name: /delete environment/i }),
    );

    await waitFor(() =>
      expect(refreshed.mock.calls.length).toBeGreaterThan(before),
    );
  });
});
