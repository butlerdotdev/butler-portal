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
import {
  FIXTURE_PROVIDER,
  FIXTURE_TEAM,
  fixtureOtherTeamProvider,
  fixtureProviders,
} from '../../api/fixtures/clusters';
import {
  platformAdminIdentity,
  platformViewerIdentity,
  teamAdminIdentity,
  teamOperatorIdentity,
  teamViewerIdentity,
} from '../../api/fixtures/identities';
import type { Provider } from '../../api/types/providers';
import { rootRouteRef } from '../../routes';
import { TeamProvider } from '../../contexts/TeamProvider';
import { TeamProvidersPage } from './TeamProvidersPage';
import { CreateClusterPage } from '../clusters/CreateClusterPage';

/** A provider scoped to the fixture team itself, so removal has a target. */
const ownTeamProvider: Provider = {
  metadata: { name: 'pe-proxmox', namespace: 'butler-system', uid: 'own-1' },
  spec: {
    provider: 'proxmox',
    scope: { type: 'team', teamRef: { name: FIXTURE_TEAM } },
  },
  status: { ready: false },
};

function renderAt(api: MockButlerApi, path: string, element: JSX.Element) {
  return renderInTestApp(
    <TestApiProvider apis={[[butlerApiRef, api]]}>
      <TeamProvider>
        <Routes>
          <Route path={path} element={element} />
        </Routes>
      </TeamProvider>
    </TestApiProvider>,
    {
      routeEntries: [path.replace(':team', FIXTURE_TEAM)],
      mountedRoutes: { '/butler': rootRouteRef },
    },
  );
}

const renderPage = (api: MockButlerApi) =>
  renderAt(api, '/butler/t/:team/providers', <TeamProvidersPage />);
const renderCreate = (api: MockButlerApi) =>
  renderAt(api, '/butler/t/:team/clusters/new', <CreateClusterPage />);

describe('the team providers page shows what the team can use', () => {
  it('lists platform providers and this team’s own, never another team’s', async () => {
    await renderPage(
      new MockButlerApi({
        identity: teamViewerIdentity,
        providers: [
          ...fixtureProviders,
          ownTeamProvider,
          fixtureOtherTeamProvider,
        ],
      }),
    );

    expect(await screen.findByText(FIXTURE_PROVIDER)).toBeInTheDocument();
    expect(screen.getByText('pe-proxmox')).toBeInTheDocument();
    // Scoped to team `data`; present globally, invisible here.
    expect(
      screen.queryByText(fixtureOtherTeamProvider.metadata.name),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Platform wide')).toBeInTheDocument();
    expect(screen.getByText('Team scoped')).toBeInTheDocument();
  });

  it('explains an empty team rather than showing nothing', async () => {
    await renderPage(
      new MockButlerApi({ identity: teamViewerIdentity, providers: [] }),
    );

    expect(
      await screen.findByText('No providers available to this team'),
    ).toBeVisible();
  });

  it('reports a failed read with a retry', async () => {
    const api = new MockButlerApi({ identity: teamViewerIdentity });
    jest
      .spyOn(api, 'listTeamProviders')
      .mockRejectedValue(new Error('server unavailable'));

    await renderPage(api);

    expect(await screen.findByText('Failed to load providers')).toBeVisible();
  });

  it('opens a detail without any credential material', async () => {
    const user = userEvent.setup();
    await renderPage(new MockButlerApi({ identity: teamViewerIdentity }));
    await screen.findByText(FIXTURE_PROVIDER);

    await user.click(
      screen.getByRole('button', { name: `Provider ${FIXTURE_PROVIDER}` }),
    );
    const dialog = await screen.findByRole('dialog');

    // The secret is named, never shown; there is nothing else to show.
    expect(
      within(dialog).getByText(/secret harvester-lab-kubeconfig/),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByText(/kubeconfig:|apiVersion/),
    ).not.toBeInTheDocument();
  });
});

describe('removal follows the server’s rule', () => {
  it.each([
    ['a team admin', teamAdminIdentity],
    ['a team operator', teamOperatorIdentity],
    ['a platform admin', platformAdminIdentity],
  ])(
    'offers %s removal of a team-scoped provider only',
    async (_l, identity) => {
      await renderPage(
        new MockButlerApi({
          identity,
          providers: [...fixtureProviders, ownTeamProvider],
        }),
      );
      await screen.findByText('pe-proxmox');

      // One Remove, for the team-scoped provider; none for the platform one.
      expect(screen.getAllByRole('button', { name: /^remove$/i })).toHaveLength(
        1,
      );
    },
  );

  it.each([
    ['a team viewer', teamViewerIdentity],
    ['a platform viewer', platformViewerIdentity],
  ])('offers %s no removal at all', async (_l, identity) => {
    await renderPage(
      new MockButlerApi({
        identity,
        providers: [...fixtureProviders, ownTeamProvider],
      }),
    );
    await screen.findByText('pe-proxmox');

    expect(
      screen.queryByRole('button', { name: /^remove$/i }),
    ).not.toBeInTheDocument();
  });

  it('removes the provider and re-reads the list', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi({
      identity: teamAdminIdentity,
      providers: [...fixtureProviders, ownTeamProvider],
    });
    const remove = jest.spyOn(api, 'deleteTeamProvider');
    await renderPage(api);
    await screen.findByText('pe-proxmox');

    await user.click(screen.getByRole('button', { name: /^remove$/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: /remove provider/i }),
    );

    await waitFor(() =>
      expect(remove).toHaveBeenCalledWith(
        FIXTURE_TEAM,
        'butler-system',
        'pe-proxmox',
      ),
    );
    await waitFor(() =>
      expect(screen.queryByText('pe-proxmox')).not.toBeInTheDocument(),
    );
    expect(screen.getByText(FIXTURE_PROVIDER)).toBeInTheDocument();
  });

  it('shows the server’s refusal instead of dropping the row', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi({
      identity: teamAdminIdentity,
      providers: [...fixtureProviders, ownTeamProvider],
    });
    jest.spyOn(api, 'deleteTeamProvider').mockRejectedValue(
      new ButlerApiError({
        status: 403,
        message: 'can only delete team-scoped providers belonging to this team',
      }),
    );
    await renderPage(api);
    await screen.findByText('pe-proxmox');

    await user.click(screen.getByRole('button', { name: /^remove$/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: /remove provider/i }),
    );

    expect(
      await within(dialog).findByText(/can only delete team-scoped/i),
    ).toBeVisible();
    // The card is still there behind the dialog, which hides it from the
    // accessibility tree while open.
    expect(
      screen.getByRole('button', { name: 'Provider pe-proxmox', hidden: true }),
    ).toBeInTheDocument();
  });
});

describe('cluster creation offers only providers the team can use', () => {
  it('excludes a provider scoped to another team', async () => {
    await renderCreate(
      new MockButlerApi({
        identity: teamAdminIdentity,
        environments: [],
        providers: [...fixtureProviders, fixtureOtherTeamProvider],
      }),
    );
    await screen.findByRole('heading', { name: /create cluster/i });

    const options = Array.from(
      (screen.getByLabelText(/Provider/i) as HTMLSelectElement).options,
    ).map(o => o.value);
    expect(options).toContain(FIXTURE_PROVIDER);
    expect(options).not.toContain(fixtureOtherTeamProvider.metadata.name);
  });

  it('includes a provider scoped to this team', async () => {
    await renderCreate(
      new MockButlerApi({
        identity: teamAdminIdentity,
        environments: [],
        providers: [...fixtureProviders, ownTeamProvider],
      }),
    );
    await screen.findByRole('heading', { name: /create cluster/i });

    const options = Array.from(
      (screen.getByLabelText(/Provider/i) as HTMLSelectElement).options,
    ).map(o => o.value);
    expect(options).toContain('pe-proxmox');
  });

  it('reads the team list, not the global one', async () => {
    const api = new MockButlerApi({
      identity: teamAdminIdentity,
      environments: [],
    });
    const global = jest.spyOn(api, 'listProviders');
    const scoped = jest.spyOn(api, 'listTeamProviders');

    await renderCreate(api);
    await screen.findByRole('heading', { name: /create cluster/i });

    await waitFor(() => expect(scoped).toHaveBeenCalledWith(FIXTURE_TEAM));
    expect(global).not.toHaveBeenCalled();
  });

  it('says so when the team has no provider to create against', async () => {
    await renderCreate(
      new MockButlerApi({
        identity: teamAdminIdentity,
        environments: [],
        providers: [],
      }),
    );
    await screen.findByRole('heading', { name: /create cluster/i });

    expect(
      screen.getByText(/No providers are available to this team/i),
    ).toBeVisible();
    expect(screen.queryByLabelText(/^Provider \*/i)).not.toBeInTheDocument();
  });

  it('does not auto-select a provider', async () => {
    await renderCreate(
      new MockButlerApi({ identity: teamAdminIdentity, environments: [] }),
    );
    await screen.findByRole('heading', { name: /create cluster/i });

    // The console leaves the choice to the user; so does this form.
    expect(
      (screen.getByLabelText(/Provider/i) as HTMLSelectElement).value,
    ).toBe('');
  });
});
