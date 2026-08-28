// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { ButlerApi } from '../ButlerApi';
import type { TeamInfo } from '../types/teams';
import { FIXTURE_NAMESPACE, FIXTURE_TEAM, fixtureClusters } from './clusters';

/**
 * The identity shape is whatever `getIdentity` promises, so a fixture that
 * drifts from the served contract stops compiling instead of passing a
 * test and failing in the product.
 */
export type ButlerIdentity = Awaited<ReturnType<ButlerApi['getIdentity']>>;

/** The five perspectives Butler is reviewed through. */
export type RoleKey =
  | 'platformAdmin'
  | 'platformViewer'
  | 'teamAdmin'
  | 'teamOperator'
  | 'teamViewer';

const team = (role: string): TeamInfo => ({
  name: FIXTURE_TEAM,
  displayName: 'Platform Engineering',
  namespace: FIXTURE_NAMESPACE,
  role,
  clusterCount: fixtureClusters.length,
});

function identity(
  overrides: Partial<ButlerIdentity> & { email: string; displayName: string },
): ButlerIdentity {
  return {
    authenticated: true,
    isPlatformAdmin: false,
    platformRole: '',
    teams: [],
    ...overrides,
  };
}

/** Admin of a team that owns none of the fixture clusters. */
export const otherTeamAdminIdentity = identity({
  email: 'other-admin@example.com',
  displayName: 'Other Team Admin',
  teams: [
    {
      name: 'other-team',
      displayName: 'Other Team',
      namespace: 'other-team',
      role: 'admin',
      clusterCount: 0,
    },
  ],
});

/** Owns the estate: reads everything, mutates everything. */
export const platformAdminIdentity = identity({
  email: 'platform-admin@example.com',
  displayName: 'Platform Admin',
  isPlatformAdmin: true,
  platformRole: 'admin',
});

/** Reads the estate, mutates nothing. */
export const platformViewerIdentity = identity({
  email: 'platform-viewer@example.com',
  displayName: 'Platform Viewer',
  platformRole: 'viewer',
});

/** Owns one team. */
export const teamAdminIdentity = identity({
  email: 'team-admin@example.com',
  displayName: 'Team Admin',
  teams: [team('admin')],
});

/** Operates one team's clusters, does not administer the team. */
export const teamOperatorIdentity = identity({
  email: 'team-operator@example.com',
  displayName: 'Team Operator',
  teams: [team('operator')],
});

/** Reads one team. */
export const teamViewerIdentity = identity({
  email: 'team-viewer@example.com',
  displayName: 'Team Viewer',
  teams: [team('viewer')],
});

export const roleIdentities: Record<RoleKey, ButlerIdentity> = {
  platformAdmin: platformAdminIdentity,
  platformViewer: platformViewerIdentity,
  teamAdmin: teamAdminIdentity,
  teamOperator: teamOperatorIdentity,
  teamViewer: teamViewerIdentity,
};

/** Table-driven cases: `describe.each(roleCases)`. */
export const roleCases = (
  Object.entries(roleIdentities) as Array<[RoleKey, ButlerIdentity]>
).map(([key, value]) => ({ role: key, identity: value }));
