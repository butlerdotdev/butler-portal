// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

/** Console cluster list age: `186d ago`, `3h ago`, `12m ago`. */
export function formatAge(
  timestamp: string | undefined,
  now = new Date(),
): string {
  if (!timestamp) return 'Unknown';
  const created = new Date(timestamp);
  if (Number.isNaN(created.getTime())) return 'Unknown';
  const diffMins = Math.max(
    0,
    Math.floor((now.getTime() - created.getTime()) / 60000),
  );
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  return `${diffMins}m ago`;
}
