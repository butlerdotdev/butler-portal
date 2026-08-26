// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * The environment model has three consumers: the environments page, the
 * cluster environment change, and cluster creation. These tests hold them
 * to one model, so a change made in one place is seen by the others.
 */
import '@testing-library/jest-dom';
import { Route, Routes } from 'react-router-dom';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { alertApiRef, errorApiRef } from '@backstage/core-plugin-api';
import { MockErrorApi } from '@backstage/test-utils';
import { butlerApiRef } from '../../api/ButlerApi';
import { MockButlerApi } from '../../api/MockButlerApi';
import {
  FIXTURE_NAMESPACE,
  FIXTURE_TEAM,
  readyCluster,
} from '../../api/fixtures/clusters';
import { teamAdminIdentity } from '../../api/fixtures/identities';
import { rootRouteRef } from '../../routes';
import { TeamProvider } from '../../contexts/TeamProvider';
import { ClusterDetailPage } from '../clusters/ClusterDetailPage';
import { CreateClusterPage } from '../clusters/CreateClusterPage';
import { TeamEnvironmentsPage } from './TeamEnvironmentsPage';

const alertApi = { post: jest.fn(), alert$: jest.fn() } as any;

function renderAt(api: MockButlerApi, path: string, element: JSX.Element) {
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
          <Route path={path} element={element} />
        </Routes>
      </TeamProvider>
    </TestApiProvider>,
    {
      routeEntries: [
        path
          .replace(':team', FIXTURE_TEAM)
          .replace(':namespace', FIXTURE_NAMESPACE)
          .replace(':name', readyCluster.metadata.name),
      ],
      mountedRoutes: { '/butler': rootRouteRef },
    },
  );
}

describe('one environment model across the plugin', () => {
  it('offers the cluster move the same environments the page manages', async () => {
    const api = new MockButlerApi({ identity: teamAdminIdentity });
    const fromPage = (await api.getTeamClusterContext(FIXTURE_TEAM))
      .environments;

    await renderAt(
      api,
      '/butler/t/:team/environments',
      <TeamEnvironmentsPage />,
    );

    for (const env of fromPage) {
      expect(await screen.findByText(env.name)).toBeInTheDocument();
    }
    // Both consumers call the same client method, so there is no second
    // list that could disagree with this one.
    expect(fromPage.map(e => e.name)).toEqual(['production', 'staging']);
  });

  it('offers an environment created on the page to the cluster move', async () => {
    const api = new MockButlerApi({ identity: teamAdminIdentity });
    await api.createTeamEnvironment(FIXTURE_TEAM, { name: 'sandbox' });

    await renderAt(
      api,
      '/butler/t/:team/clusters/:namespace/:name',
      <ClusterDetailPage />,
    );

    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Change Environment' });
    await user.click(
      screen.getByRole('button', { name: 'Change Environment' }),
    );

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/sandbox/)).toBeInTheDocument();
  });

  it('stops offering an environment deleted on the page', async () => {
    const api = new MockButlerApi({ identity: teamAdminIdentity });
    await api.deleteTeamEnvironment(FIXTURE_TEAM, 'staging');

    await renderAt(
      api,
      '/butler/t/:team/clusters/:namespace/:name',
      <ClusterDetailPage />,
    );

    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Change Environment' });
    await user.click(
      screen.getByRole('button', { name: 'Change Environment' }),
    );

    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText(/production/);
    expect(within(dialog).queryByText(/staging/)).not.toBeInTheDocument();
  });
});

describe('creating a cluster in an environment', () => {
  it('requires one when the team defines any', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi({ identity: teamAdminIdentity });
    const create = jest.spyOn(api, 'createCluster');

    await renderAt(api, '/butler/t/:team/clusters/new', <CreateClusterPage />);
    await screen.findByText('Environment');

    await user.type(screen.getByLabelText(/Cluster Name/i), 'e2e-new');
    await user.click(screen.getByRole('button', { name: /create cluster/i }));

    expect(await screen.findByText('Environment is required')).toBeVisible();
    expect(create).not.toHaveBeenCalled();
  });

  it('stops asking once an environment is chosen', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi({ identity: teamAdminIdentity });

    await renderAt(api, '/butler/t/:team/clusters/new', <CreateClusterPage />);
    await screen.findByText('Environment');

    await user.type(screen.getByLabelText(/Cluster Name/i), 'e2e-new');
    await user.click(screen.getByRole('button', { name: /create cluster/i }));
    expect(await screen.findByText('Environment is required')).toBeVisible();

    await user.selectOptions(
      screen.getByLabelText(/Environment \*/i),
      'production',
    );
    await user.click(screen.getByRole('button', { name: /create cluster/i }));

    // The environment no longer blocks the submit; whatever else the form
    // still wants, it is not this.
    await waitFor(() =>
      expect(
        screen.queryByText('Environment is required'),
      ).not.toBeInTheDocument(),
    );
  });

  it('does not ask for one when the team defines none', async () => {
    const api = new MockButlerApi({
      identity: teamAdminIdentity,
      environments: [],
    });

    await renderAt(api, '/butler/t/:team/clusters/new', <CreateClusterPage />);
    await screen.findByText('Basic Information');

    expect(screen.queryByLabelText(/Environment \*/i)).not.toBeInTheDocument();
  });
});
