// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import {
  ENVIRONMENT_LABEL,
  clusterCountsByEnvironment,
  orphanedEnvironments,
} from './environment';

describe('clusterCountsByEnvironment', () => {
  it('counts by the environment label and keeps unlabelled clusters apart', () => {
    const { counts, unassigned } = clusterCountsByEnvironment([
      { metadata: { labels: { [ENVIRONMENT_LABEL]: 'prod' } } },
      { metadata: { labels: { [ENVIRONMENT_LABEL]: 'prod' } } },
      { metadata: { labels: { [ENVIRONMENT_LABEL]: 'dev' } } },
      { metadata: { labels: { other: 'value' } } },
      { metadata: {} },
      {},
    ]);

    expect(counts).toEqual({ prod: 2, dev: 1 });
    expect(unassigned).toBe(3);
  });

  it('does not invent a bucket for an empty label value', () => {
    const { counts, unassigned } = clusterCountsByEnvironment([
      { metadata: { labels: { [ENVIRONMENT_LABEL]: '' } } },
    ]);

    expect(counts).toEqual({});
    expect(unassigned).toBe(1);
  });
});

describe('orphanedEnvironments', () => {
  it('names labels no environment defines', () => {
    expect(
      orphanedEnvironments({ prod: 2, retired: 1 }, [{ name: 'prod' }]),
    ).toEqual(['retired']);
  });

  it('is empty when every label has a definition', () => {
    expect(
      orphanedEnvironments({ prod: 2 }, [{ name: 'prod' }, { name: 'dev' }]),
    ).toEqual([]);
  });
});
