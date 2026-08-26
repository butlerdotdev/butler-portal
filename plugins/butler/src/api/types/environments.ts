// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * A team environment as butler-server stores and returns it.
 *
 * An environment is not a standalone resource. It is an entry in
 * `Team.spec.environments[]` (ADR-009), keyed by name, read back through
 * `GET /teams/{team}` and written through three endpoints under
 * `/teams/{team}/environments`. Nothing else in the API refers to an
 * environment by id, so the name is the identity and the server rejects
 * renames outright.
 */
export interface EnvironmentLimits {
  /** Absent means unlimited rather than zero. */
  maxClusters?: number;
  maxClustersPerMember?: number;
}

export type EnvironmentAccessRole = 'admin' | 'operator' | 'viewer';

export interface EnvironmentAccessUser {
  name: string;
  role: EnvironmentAccessRole;
}

export interface EnvironmentAccessGroup {
  name: string;
  role: EnvironmentAccessRole;
  identityProvider?: string;
}

/**
 * Additive-only role elevation inside one environment. The admission
 * webhook refuses any subject that is not already on the team, and these
 * entries can raise a member's role for this environment but never lower
 * the role the team grants them.
 */
export interface EnvironmentAccess {
  users?: EnvironmentAccessUser[];
  groups?: EnvironmentAccessGroup[];
}

/** Defaults applied to a cluster created in this environment. */
export interface EnvironmentClusterDefaults {
  kubernetesVersion?: string;
  workerCount?: number;
  workerCPU?: number;
  workerMemoryGi?: number;
  workerDiskGi?: number;
}

export interface TeamEnvironment {
  name: string;
  description?: string;
  limits?: EnvironmentLimits;
  access?: EnvironmentAccess;
  clusterDefaults?: EnvironmentClusterDefaults;
}

/** Body for both create and update; the server ignores a name on update. */
export interface EnvironmentRequest {
  name: string;
  description?: string;
  limits?: EnvironmentLimits;
  access?: EnvironmentAccess;
  clusterDefaults?: EnvironmentClusterDefaults;
}

/**
 * Mirrors the CRD validation applied to `EnvironmentSpec.Name`, which is
 * a Kubernetes label value: the name is stamped onto clusters as a label,
 * so anything a label cannot hold an environment cannot be called.
 */
export const ENVIRONMENT_NAME_PATTERN =
  /^[A-Za-z0-9]([-A-Za-z0-9_.]*[A-Za-z0-9])?$/;
export const ENVIRONMENT_NAME_MAX_LENGTH = 63;

/** Reason the given name cannot be used, or null when it is usable. */
export function validateEnvironmentName(value: string): string | null {
  const name = value.trim();
  if (!name) return 'Name is required';
  if (name.length > ENVIRONMENT_NAME_MAX_LENGTH) {
    return `Name must be ${ENVIRONMENT_NAME_MAX_LENGTH} characters or fewer`;
  }
  if (!ENVIRONMENT_NAME_PATTERN.test(name)) {
    return 'Use letters, numbers, dots, dashes and underscores, starting and ending with a letter or number';
  }
  return null;
}

/** A team's environments and the defaults it gives new clusters. */
export interface TeamClusterContext {
  environments: TeamEnvironment[];
  clusterDefaults?: EnvironmentClusterDefaults;
}
