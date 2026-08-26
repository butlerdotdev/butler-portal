// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

/** Label butler-server places a cluster's environment on. */
export const ENVIRONMENT_LABEL = 'butler.butlerlabs.dev/environment';

/** Annotation the admission webhook requires for an environment move. */
export const MIGRATION_ANNOTATION = 'butler.butlerlabs.dev/migration-operation';

/** The environment a cluster is currently placed in, or empty. */
export function clusterEnvironment(labels?: Record<string, string>): string {
  return labels?.[ENVIRONMENT_LABEL] ?? '';
}

/**
 * Semver-ish compare for the vX.Y.Z versions butler uses. Returns a
 * negative number when a is older than b.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .replace(/^v/, '')
      .split('.')
      .map(part => parseInt(part, 10) || 0);
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Whether an allocation belongs to a cluster.
 *
 * The owner link is `spec.tenantClusterRef`, a namespace and name that
 * together identify one TenantCluster. An allocation whose reference is
 * missing belongs to nothing addressable and is never claimed by a cluster.
 */
export function allocationBelongsToCluster(
  ref: { name: string; namespace?: string } | undefined,
  cluster: { name: string; namespace: string },
): boolean {
  if (!ref?.name) return false;
  if (ref.name !== cluster.name) return false;
  // A reference without a namespace is only trusted inside the cluster's own.
  return (ref.namespace ?? cluster.namespace) === cluster.namespace;
}
