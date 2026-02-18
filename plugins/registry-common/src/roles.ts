// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * Registry role hierarchy (highest to lowest):
 *
 * - platform-admin: Cross-team super-admin. Can manage all teams + governance.
 * - admin: Full access within a team. Delete, force-unlock, manage credentials.
 * - operator: Day-to-day IaC workflow. Create, update, plan, apply.
 * - viewer: Read-only. Browse artifacts, view environments and runs.
 */
export type RegistryRole = 'platform-admin' | 'admin' | 'operator' | 'viewer';

const ROLE_LEVELS: Record<RegistryRole, number> = {
  'platform-admin': 3,
  admin: 2,
  operator: 1,
  viewer: 0,
};

/** Group naming convention: platform-admins, {team}-admins, {team}-operators */
const PLATFORM_ADMIN_GROUP = 'group:default/platform-admins';

/**
 * Resolve the user's role on a specific team from their ownership entity refs.
 *
 * Convention:
 *   - `platform-admins` group → platform-admin
 *   - `{team}-admins` group → admin
 *   - `{team}-operators` group → operator
 *   - Bare `{team}` membership → viewer
 */
export function resolveTeamRole(
  team: string | null,
  ownershipRefs: string[],
): RegistryRole {
  if (!team) {
    // Admin mode: no team selected
    if (ownershipRefs.includes(PLATFORM_ADMIN_GROUP)) return 'platform-admin';
    return 'viewer';
  }
  // Team mode: resolve team-specific role only
  if (ownershipRefs.includes(`group:default/${team}-admins`)) return 'admin';
  if (ownershipRefs.includes(`group:default/${team}-operators`)) return 'operator';
  return 'viewer';
}

/**
 * Resolve the user's highest role across all their teams.
 * Used by the permission policy as a coarse-grained gate.
 */
export function resolveHighestRole(ownershipRefs: string[]): RegistryRole {
  if (ownershipRefs.includes(PLATFORM_ADMIN_GROUP)) return 'platform-admin';
  if (ownershipRefs.some(r => /^group:default\/.*-admins$/.test(r))) return 'admin';
  if (ownershipRefs.some(r => /^group:default\/.*-operators$/.test(r))) return 'operator';
  return 'viewer';
}

/** Check if a role meets the minimum required level. */
export function hasMinRole(actual: RegistryRole, required: RegistryRole): boolean {
  return ROLE_LEVELS[actual] >= ROLE_LEVELS[required];
}

/** Check if ownership refs contain the platform-admins group. */
export function isPlatformAdminRef(ownershipRefs: string[]): boolean {
  return ownershipRefs.includes(PLATFORM_ADMIN_GROUP);
}

/** Permissions that require admin role (destructive + sensitive). */
export const ADMIN_PERMISSIONS = new Set([
  'registry.environment.delete',
  'registry.environment.lock',
  'registry.cloud-integration.delete',
  'registry.variable-set.delete',
  'registry.token.create',
  'registry.token.revoke',
]);

/** Permissions that require operator role (day-to-day IaC workflow). */
export const OPERATOR_PERMISSIONS = new Set([
  'registry.artifact.create',
  'registry.artifact.update',
  'registry.version.publish',
  'registry.version.approve',
  'registry.version.yank',
  'registry.environment.create',
  'registry.environment.update',
  'registry.run.create',
  'registry.run.cancel',
  'registry.run.confirm',
  'registry.cloud-integration.create',
  'registry.cloud-integration.update',
  'registry.variable-set.create',
  'registry.variable-set.update',
]);
