// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { TeamResourceLimits, TeamResourceUsage } from '../api/types/teams';

/**
 * Quota against usage for a team, from the two maps the server returns.
 * A limit that is absent means unlimited; usage that is absent means the
 * controller has not reported it, which is not zero. Both cases are
 * kept apart from a real number so a bar is never drawn for a value
 * nobody measured.
 */
export type QuotaState =
  | 'ok'
  | 'warning'
  | 'exceeded'
  | 'unlimited'
  | 'unknown';

export interface QuotaRow {
  key: string;
  label: string;
  /** Parsed usage in the row's unit, or undefined when not reported. */
  used?: number;
  /** Parsed limit in the row's unit, or undefined when unlimited. */
  limit?: number;
  unit: string;
  /** used/limit, only when both exist and the limit is positive. */
  ratio?: number;
  state: QuotaState;
  usedText: string;
  limitText: string;
}

const BINARY: Record<string, number> = {
  Ki: 2 ** 10,
  Mi: 2 ** 20,
  Gi: 2 ** 30,
  Ti: 2 ** 40,
  Pi: 2 ** 50,
};
const DECIMAL: Record<string, number> = {
  k: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  P: 1e15,
};

/** Kubernetes quantity to a number of bytes (memory/storage) or cores (cpu). */
export function parseQuantity(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : undefined;
  const m = /^\s*([0-9]*\.?[0-9]+)\s*([A-Za-z]*)\s*$/.exec(String(value));
  if (!m) return undefined;
  const n = Number(m[1]);
  const suffix = m[2];
  if (!suffix) return n;
  if (suffix === 'm') return n / 1000;
  if (BINARY[suffix]) return n * BINARY[suffix];
  if (DECIMAL[suffix]) return n * DECIMAL[suffix];
  return undefined;
}

const GI = 2 ** 30;

function formatGi(bytes: number | undefined): string {
  if (bytes === undefined) return '';
  const gi = bytes / GI;
  return `${Number.isInteger(gi) ? gi : gi.toFixed(1)} Gi`;
}

function state(
  used: number | undefined,
  limit: number | undefined,
): QuotaState {
  if (limit === undefined) return used === undefined ? 'unknown' : 'unlimited';
  if (used === undefined) return 'unknown';
  if (limit <= 0) return 'unknown';
  const ratio = used / limit;
  if (ratio > 1) return 'exceeded';
  if (ratio >= 0.8) return 'warning';
  return 'ok';
}

function row(
  key: string,
  label: string,
  usedRaw: unknown,
  limitRaw: unknown,
  unit: string,
  format: (n: number | undefined) => string,
): QuotaRow {
  const used = parseQuantity(usedRaw);
  const limit = parseQuantity(limitRaw);
  const s = state(used, limit);
  return {
    key,
    label,
    used,
    limit,
    unit,
    ratio:
      used !== undefined && limit !== undefined && limit > 0
        ? used / limit
        : undefined,
    state: s,
    usedText: used === undefined ? 'Not reported' : format(used),
    limitText: limit === undefined ? 'Unlimited' : format(limit),
  };
}

export function quotaRows(
  limits: TeamResourceLimits | undefined,
  usage: TeamResourceUsage | undefined,
): QuotaRow[] {
  const count = (n: number | undefined) => (n === undefined ? '' : String(n));
  return [
    row(
      'clusters',
      'Clusters',
      usage?.clusters,
      limits?.maxClusters,
      'clusters',
      count,
    ),
    row(
      'nodes',
      'Nodes',
      usage?.totalNodes,
      limits?.maxTotalNodes,
      'nodes',
      count,
    ),
    row('cpu', 'CPU', usage?.totalCPU, limits?.maxCPUCores, 'cores', n =>
      n === undefined ? '' : `${Number.isInteger(n) ? n : n.toFixed(1)} cores`,
    ),
    row(
      'memory',
      'Memory',
      usage?.totalMemory,
      limits?.maxMemory,
      'Gi',
      formatGi,
    ),
    row(
      'storage',
      'Storage',
      usage?.totalStorage,
      limits?.maxStorage,
      'Gi',
      formatGi,
    ),
  ];
}

/** The team's overall quota position: the worst row that has a limit. */
export function quotaSummary(rows: QuotaRow[]): {
  state: QuotaState;
  limited: number;
  detail: string;
} {
  const limited = rows.filter(r => r.limit !== undefined);
  if (limited.length === 0) {
    return {
      state: 'unlimited',
      limited: 0,
      detail: 'No limits are set on this team.',
    };
  }
  const order: QuotaState[] = [
    'exceeded',
    'warning',
    'unknown',
    'ok',
    'unlimited',
  ];
  const worst = [...limited].sort(
    (a, b) => order.indexOf(a.state) - order.indexOf(b.state),
  )[0];
  const detail =
    worst.state === 'exceeded'
      ? `${worst.label} over limit: ${worst.usedText} of ${worst.limitText}.`
      : worst.state === 'warning'
      ? `${worst.label} near limit: ${worst.usedText} of ${worst.limitText}.`
      : worst.state === 'unknown'
      ? `${worst.label} has a limit but no reported usage yet.`
      : `Within limits on ${limited.length} of ${rows.length} resources.`;
  return { state: worst.state, limited: limited.length, detail };
}
