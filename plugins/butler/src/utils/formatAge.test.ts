// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { formatAge } from './formatAge';

describe('formatAge', () => {
  const now = new Date('2026-08-22T12:00:00Z');

  it('formats days, hours and minutes like the console', () => {
    expect(formatAge('2026-02-17T12:00:00Z', now)).toBe('186d ago');
    expect(formatAge('2026-08-22T09:30:00Z', now)).toBe('2h ago');
    expect(formatAge('2026-08-22T11:48:00Z', now)).toBe('12m ago');
  });

  it('handles missing, invalid and future timestamps', () => {
    expect(formatAge(undefined, now)).toBe('Unknown');
    expect(formatAge('not-a-date', now)).toBe('Unknown');
    expect(formatAge('2026-08-22T12:05:00Z', now)).toBe('0m ago');
  });
});
