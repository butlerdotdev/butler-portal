// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { ButlerTokens } from '../../theme';
import { rgb, rgba } from '../../theme';

/**
 * Port of console `src/lib/envColor.ts`: a deterministic five-slot accent
 * per environment name (Tol bright family, `index.css` `--bc-env-N-*`).
 * Same hash as the console so an env reads the same color everywhere.
 */
export interface EnvAccent {
  dot: string;
  border: string;
  pillBg: string;
  pillText: string;
  headerTint: string;
}

// `r g b` triplets: [dark 500, dark 300, light 500, light 300].
const SLOTS: Array<[string, string, string, string]> = [
  ['68 119 170', '134 167 200', '68 119 170', '42 82 120'],
  ['102 204 238', '156 222 244', '0 102 153', '0 73 110'],
  ['34 136 51', '111 178 122', '31 122 46', '22 88 34'],
  ['204 187 68', '222 211 133', '128 102 0', '92 74 0'],
  ['238 102 119', '244 156 167', '204 51 68', '150 37 48'],
];

function slotIndex(name: string): number {
  let sum = 0;
  for (let i = 0; i < name.length; i += 1) {
    sum = (sum + name.charCodeAt(i)) % 997;
  }
  return sum % SLOTS.length;
}

export function neutralAccent(t: ButlerTokens): EnvAccent {
  const p = t.palette;
  return {
    dot: rgb(p.neutral[500]),
    border: rgb(p.neutral[700]),
    pillBg: rgba(p.neutral[700], 0.3),
    pillText: rgb(p.neutral[300]),
    headerTint: rgba(p.neutral[800], 0.3),
  };
}

export function envAccent(
  t: ButlerTokens,
  name: string | null | undefined,
): EnvAccent {
  if (!name) return neutralAccent(t);
  const [dark500, dark300, light500, light300] = SLOTS[slotIndex(name)];
  const c500 = t.mode === 'dark' ? dark500 : light500;
  const c300 = t.mode === 'dark' ? dark300 : light300;
  return {
    dot: rgb(c500),
    border: rgb(c500),
    pillBg: rgba(c500, 0.2),
    pillText: rgb(c300),
    headerTint: rgba(c500, 0.05),
  };
}
