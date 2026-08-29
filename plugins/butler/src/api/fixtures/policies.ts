// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { ClusterCreationPolicy } from '../types/policies';

/** Platform-wide: every team, harvester only, images pinned to one. */
export const fixturePlatformPolicy: ClusterCreationPolicy = {
  metadata: {
    name: 'vetted-images',
    uid: 'pol-0001',
    creationTimestamp: '2026-07-01T09:00:00Z',
  },
  spec: {
    scope: { platformWide: {} },
    targetProviders: ['harvester'],
    options: {
      image: { mode: 'pin', values: ['talos-1.10.5'] },
    },
  },
  status: { conditions: [{ type: 'Ready', status: 'True', reason: 'Valid' }] },
};

/** Team and environment: production on the fixture team, networks limited. */
export const fixtureTeamEnvironmentPolicy: ClusterCreationPolicy = {
  metadata: {
    name: 'production-networks',
    uid: 'pol-0002',
    creationTimestamp: '2026-07-15T09:00:00Z',
  },
  spec: {
    scope: {
      teamAndEnvironment: {
        teamRef: { name: 'platform-engineering' },
        environmentName: 'production',
      },
    },
    options: {
      network: {
        mode: 'allowList',
        values: ['lab-vlan-40'],
        default: 'lab-vlan-40',
      },
    },
  },
};

/** A policy whose team no longer exists, which the controller flags. */
export const fixtureStalePolicy: ClusterCreationPolicy = {
  metadata: { name: 'old-team-defaults', uid: 'pol-0003' },
  spec: {
    scope: { team: { teamRef: { name: 'retired-team' } } },
    options: { image: { mode: 'default', default: 'talos-1.9.0' } },
  },
  status: {
    conditions: [
      {
        type: 'Ready',
        status: 'False',
        reason: 'StaleReference',
        message: 'team "retired-team" does not exist',
      },
    ],
    staleReferences: ['scope.team.teamRef'],
  },
};

export const fixturePolicies: ClusterCreationPolicy[] = [
  fixturePlatformPolicy,
  fixtureTeamEnvironmentPolicy,
  fixtureStalePolicy,
];
