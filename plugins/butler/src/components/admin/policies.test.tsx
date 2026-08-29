// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import '@testing-library/jest-dom';
import { Route, Routes } from 'react-router-dom';
import { screen } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { butlerApiRef } from '../../api/ButlerApi';
import { MockButlerApi } from '../../api/MockButlerApi';
import {
  platformAdminIdentity,
  platformViewerIdentity,
} from '../../api/fixtures/identities';
import {
  describeRuleMode,
  policyScopeLabel,
  policyTier,
} from '../../api/types/policies';
import {
  fixturePolicies,
  fixtureStalePolicy,
} from '../../api/fixtures/policies';
import { rootRouteRef } from '../../routes';
import { TeamProvider } from '../../contexts/TeamProvider';
import { PoliciesPage } from './PoliciesPage';
import { PolicyDetailPage } from './PolicyDetailPage';

function renderList(api: MockButlerApi) {
  return renderInTestApp(
    <TestApiProvider apis={[[butlerApiRef, api]]}>
      <TeamProvider>
        <Routes>
          <Route path="/butler/admin/policies" element={<PoliciesPage />} />
        </Routes>
      </TeamProvider>
    </TestApiProvider>,
    {
      routeEntries: ['/butler/admin/policies'],
      mountedRoutes: { '/butler': rootRouteRef },
    },
  );
}

function renderDetail(api: MockButlerApi, name: string) {
  return renderInTestApp(
    <TestApiProvider apis={[[butlerApiRef, api]]}>
      <TeamProvider>
        <Routes>
          <Route
            path="/butler/admin/policies/:name"
            element={<PolicyDetailPage />}
          />
        </Routes>
      </TeamProvider>
    </TestApiProvider>,
    {
      routeEntries: [`/butler/admin/policies/${name}`],
      mountedRoutes: { '/butler': rootRouteRef },
    },
  );
}

describe('policy model helpers', () => {
  it('reads the scope tier and labels it the way the console does', () => {
    expect(policyTier(fixturePolicies[0])).toBe('platformWide');
    expect(policyScopeLabel(fixturePolicies[0])).toBe('platform-wide');
    expect(policyTier(fixturePolicies[1])).toBe('teamAndEnvironment');
    expect(policyScopeLabel(fixturePolicies[1])).toBe(
      'team/platform-engineering/production',
    );
    expect(policyScopeLabel(fixtureStalePolicy)).toBe('team/retired-team');
  });

  it('calls a malformed scope invalid rather than guessing', () => {
    const broken = { metadata: { name: 'x' }, spec: { scope: {} } };
    expect(policyTier(broken)).toBeNull();
    expect(policyScopeLabel(broken)).toBe('(invalid)');
  });

  it('describes every mode in terms of what the list will do', () => {
    expect(describeRuleMode('pin', 'image')).toMatch(/exactly one image/i);
    expect(describeRuleMode('allowList', 'network')).toMatch(/allow list/i);
    expect(describeRuleMode('recommended', 'image')).toMatch(/listed first/i);
    expect(describeRuleMode('default', 'network')).toMatch(
      /suggested default/i,
    );
  });
});

describe('policies list', () => {
  it.each([
    ['a platform admin', platformAdminIdentity],
    ['a platform viewer', platformViewerIdentity],
  ])(
    'lists every policy with scope, providers and rules for %s',
    async (_l, identity) => {
      await renderList(new MockButlerApi({ identity }));

      expect(await screen.findByText('vetted-images')).toBeInTheDocument();
      expect(screen.getByText('production-networks')).toBeInTheDocument();
      expect(screen.getByText('platform-wide')).toBeInTheDocument();
      expect(
        screen.getByText('team/platform-engineering/production'),
      ).toBeInTheDocument();
      expect(screen.getByText('Image: pin')).toBeInTheDocument();
      expect(screen.getByText('Network: allowList')).toBeInTheDocument();
    },
  );

  it('flags a policy the controller could not apply', async () => {
    await renderList(new MockButlerApi({ identity: platformAdminIdentity }));

    expect(await screen.findByText('old-team-defaults')).toBeInTheDocument();
    expect(screen.getByText('StaleReference')).toBeInTheDocument();
  });

  it('explains an estate with no policies', async () => {
    await renderList(
      new MockButlerApi({ identity: platformAdminIdentity, policies: [] }),
    );

    expect(
      await screen.findByText('No cluster creation policies'),
    ).toBeVisible();
  });

  it('reports a failed read with a retry', async () => {
    const api = new MockButlerApi({ identity: platformAdminIdentity });
    jest.spyOn(api, 'listPolicies').mockRejectedValue(new Error('boom'));

    await renderList(api);

    expect(await screen.findByText('Failed to load policies')).toBeVisible();
  });
});

describe('policy detail', () => {
  it('shows scope, providers and each rule in plain words', async () => {
    await renderDetail(
      new MockButlerApi({ identity: platformViewerIdentity }),
      'vetted-images',
    );

    expect(
      await screen.findByRole('heading', { name: 'vetted-images' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Platform wide')).toBeInTheDocument();
    expect(screen.getByText('harvester')).toBeInTheDocument();
    expect(
      screen.getByText(/exactly one image is allowed/i),
    ).toBeInTheDocument();
    expect(screen.getByText('talos-1.10.5')).toBeInTheDocument();
  });

  it('marks the default within an allow list', async () => {
    await renderDetail(
      new MockButlerApi({ identity: platformAdminIdentity }),
      'production-networks',
    );

    await screen.findByRole('heading', { name: 'production-networks' });
    expect(screen.getByText('production')).toBeInTheDocument();
    expect(screen.getByText(/\(default\)/)).toBeInTheDocument();
  });

  it('says what went wrong for a stale policy', async () => {
    await renderDetail(
      new MockButlerApi({ identity: platformAdminIdentity }),
      'old-team-defaults',
    );

    expect(await screen.findByText('Not fully applied')).toBeInTheDocument();
    expect(
      screen.getByText(/team "retired-team" does not exist/),
    ).toBeInTheDocument();
  });

  it('reports a policy that does not exist', async () => {
    await renderDetail(
      new MockButlerApi({ identity: platformAdminIdentity }),
      'nope',
    );

    expect(await screen.findByText('Policy not found')).toBeVisible();
  });
});
