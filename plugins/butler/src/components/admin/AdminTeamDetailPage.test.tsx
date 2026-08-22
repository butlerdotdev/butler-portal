// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import '@testing-library/jest-dom';
import { Route, Routes } from 'react-router-dom';
import { screen } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { butlerApiRef } from '../../api/ButlerApi';
import { MockButlerApi } from '../../api/MockButlerApi';
import {
  FIXTURE_TEAM,
  fixtureGroupSyncs,
  fixtureTeamDetail,
  fixtureTeamMembers,
} from '../../api/fixtures/clusters';
import { rootRouteRef } from '../../routes';
import { TeamProvider } from '../../contexts/TeamProvider';
import { AdminTeamDetailPage, normalizeTeam } from './AdminTeamDetailPage';

function renderPage(api: MockButlerApi, team = FIXTURE_TEAM) {
  return renderInTestApp(
    <TestApiProvider apis={[[butlerApiRef, api]]}>
      <TeamProvider>
        <Routes>
          <Route
            path="/butler/admin/teams/:teamName"
            element={<AdminTeamDetailPage />}
          />
        </Routes>
      </TeamProvider>
    </TestApiProvider>,
    {
      routeEntries: [`/butler/admin/teams/${team}`],
      mountedRoutes: { '/butler': rootRouteRef },
    },
  );
}

describe('normalizeTeam', () => {
  it('reads the flat console team response', () => {
    const team = normalizeTeam(
      {
        name: 'platform',
        displayName: 'Platform Engineering',
        phase: 'Ready',
        namespace: 'platform-engineering',
        resourceLimits: { maxClusters: 100 },
        resourceUsage: { clusters: 15, totalNodes: 30 },
        clusterDefaults: { kubernetesVersion: 'v1.31.0' },
      },
      'fallback',
    );

    expect(team.namespace).toBe('platform-engineering');
    expect(team.resourceLimits?.maxClusters).toBe(100);
    expect(team.resourceUsage?.totalNodes).toBe(30);
    expect(team.clusterDefaults?.kubernetesVersion).toBe('v1.31.0');
  });

  it('falls back to the Team CRD shape', () => {
    const team = normalizeTeam(fixtureTeamDetail, 'fallback');

    expect(team.name).toBe(fixtureTeamDetail.metadata.name);
    expect(team.displayName).toBe(fixtureTeamDetail.spec.displayName);
    expect(team.namespace).toBe(fixtureTeamDetail.status.namespace);
    expect(team.resourceLimits?.maxClusters).toBe(
      fixtureTeamDetail.spec.resourceQuotas.maxClusters,
    );
  });
});

describe('AdminTeamDetailPage', () => {
  beforeEach(() => localStorage.clear());

  it('renders the console sections for a team', async () => {
    await renderPage(new MockButlerApi());

    expect(
      await screen.findByRole('heading', {
        name: fixtureTeamDetail.spec.displayName,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(`@${FIXTURE_TEAM}`)).toBeInTheDocument();

    // Summary cards.
    expect(
      screen.getByRole('heading', { name: 'Team Details' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Cluster Status' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Quick Actions' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Resource Usage' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Cluster Defaults' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(fixtureTeamDetail.status.namespace),
    ).toBeInTheDocument();

    // Members and group sync tables replace the old tab strip.
    expect(
      screen.getByRole('heading', { name: 'Members' }),
    ).toBeInTheDocument();
    fixtureTeamMembers.forEach(member => {
      expect(screen.getByText(member.email)).toBeInTheDocument();
    });
    expect(
      screen.getByRole('heading', { name: 'Group Sync' }),
    ).toBeInTheDocument();
    expect(screen.getByText(fixtureGroupSyncs[0].name)).toBeInTheDocument();
    expect(screen.getByText('Observed Members')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Clusters' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('counts the team clusters from the cluster list', async () => {
    // /teams/{name}/clusters answers with an empty list on a live server,
    // so the page lists clusters the way the console does.
    await renderPage(new MockButlerApi());
    await screen.findByRole('heading', {
      name: fixtureTeamDetail.spec.displayName,
    });

    const status = screen
      .getByRole('heading', { name: 'Cluster Status' })
      .closest('div')!.parentElement!;
    expect(status).toHaveTextContent(/Total/);
    expect(status).not.toHaveTextContent(/^0\s*Total/);
  });

  it('blocks team deletion while the team still owns clusters', async () => {
    await renderPage(new MockButlerApi());
    await screen.findByRole('heading', {
      name: fixtureTeamDetail.spec.displayName,
    });

    expect(screen.getByRole('button', { name: 'Delete Team' })).toBeDisabled();
  });

  it('shows the error state when the team cannot be loaded', async () => {
    await renderPage(new MockButlerApi(), 'no-such-team');

    expect(
      await screen.findByText('Failed to load team details'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('reads as a platform viewer without offering mutations', async () => {
    // The server grants admin reads to the viewer role, so the page must
    // render rather than deny, with the mutating controls withheld.
    await renderPage(
      new MockButlerApi({
        identity: { isPlatformAdmin: false, platformRole: 'viewer' },
      }),
    );

    expect(screen.queryByText('Access Denied')).not.toBeInTheDocument();
  });
});
