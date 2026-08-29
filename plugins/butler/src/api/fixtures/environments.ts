// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { TeamEnvironment } from '../types/environments';

/** A capped environment that clusters actually sit in. */
export const fixtureProductionEnvironment: TeamEnvironment = {
  name: 'production',
  description: 'Customer facing clusters',
  limits: { maxClusters: 4, maxClustersPerMember: 1 },
  clusterDefaults: { kubernetesVersion: 'v1.31.0', workerCount: 3 },
  access: { users: [{ name: 'lead@butlerlabs.dev', role: 'admin' }] },
};

/** An uncapped environment, to prove absent limits read as unlimited. */
export const fixtureStagingEnvironment: TeamEnvironment = {
  name: 'staging',
  description: 'Pre-release verification',
};

export const fixtureEnvironments: TeamEnvironment[] = [
  fixtureProductionEnvironment,
  fixtureStagingEnvironment,
];
