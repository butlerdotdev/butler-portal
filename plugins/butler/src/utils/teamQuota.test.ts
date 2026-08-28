// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { parseQuantity, quotaRows, quotaSummary } from './teamQuota';

/** The live platform-engineering team on 2026-08-28. */
const limits = { defaultNodeCount: 3, maxClusters: 100 };
const usage = {
  clusterUtilization: 15,
  clusters: 15,
  totalCPU: '88',
  totalMemory: '176Gi',
  totalNodes: 30,
  totalStorage: '955Gi',
};

describe('parseQuantity', () => {
  it('reads cores, millicores and binary sizes', () => {
    expect(parseQuantity('88')).toBe(88);
    expect(parseQuantity('500m')).toBe(0.5);
    expect(parseQuantity('176Gi')).toBe(176 * 2 ** 30);
    expect(parseQuantity(12)).toBe(12);
    expect(parseQuantity(undefined)).toBeUndefined();
    expect(parseQuantity('lots')).toBeUndefined();
  });
});

describe('quotaRows', () => {
  it('keeps unlimited, unknown and measured apart', () => {
    const rows = quotaRows(limits, usage);
    const byKey = Object.fromEntries(rows.map(r => [r.key, r]));
    expect(byKey.clusters).toMatchObject({
      used: 15,
      limit: 100,
      state: 'ok',
      ratio: 0.15,
    });
    expect(byKey.nodes).toMatchObject({
      used: 30,
      limit: undefined,
      state: 'unlimited',
      limitText: 'Unlimited',
    });
    expect(byKey.memory.usedText).toBe('176 Gi');
    expect(byKey.cpu.usedText).toBe('88 cores');
  });

  it('never draws a bar for usage nobody reported', () => {
    const rows = quotaRows({ maxClusters: 10 }, undefined);
    const clusters = rows.find(r => r.key === 'clusters')!;
    expect(clusters.state).toBe('unknown');
    expect(clusters.ratio).toBeUndefined();
    expect(clusters.usedText).toBe('Not reported');
  });

  it('flags near and over limit', () => {
    expect(quotaRows({ maxClusters: 10 }, { clusters: 8 })[0].state).toBe(
      'warning',
    );
    expect(quotaRows({ maxClusters: 10 }, { clusters: 11 })[0].state).toBe(
      'exceeded',
    );
    expect(quotaRows({ maxClusters: 0 }, { clusters: 1 })[0].state).toBe(
      'unknown',
    );
  });
});

describe('quotaSummary', () => {
  it('reports the worst limited row', () => {
    expect(quotaSummary(quotaRows(limits, usage))).toMatchObject({
      state: 'ok',
      limited: 1,
    });
    expect(quotaSummary(quotaRows({}, usage)).state).toBe('unlimited');
    expect(
      quotaSummary(
        quotaRows(
          { maxClusters: 10, maxTotalNodes: 20 },
          { clusters: 11, totalNodes: 5 },
        ),
      ),
    ).toMatchObject({
      state: 'exceeded',
      detail: 'Clusters over limit: 11 of 10.',
    });
  });
});
