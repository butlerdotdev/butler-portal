/*
 * Copyright 2026 The Butler Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Pipeline role hierarchy (highest to lowest):
 *
 * - platform-admin: Cross-team super-admin.
 * - admin: Full access within a team. Delete pipelines, manage fleet tokens.
 * - operator: Day-to-day pipeline workflow. Create, edit, deploy.
 * - viewer: Read-only. Browse pipelines, view metrics, run VRL playground.
 */
export type PipelineRole = 'platform-admin' | 'admin' | 'operator' | 'viewer';

const ROLE_LEVELS: Record<PipelineRole, number> = {
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
): PipelineRole {
  if (!team) {
    if (ownershipRefs.includes(PLATFORM_ADMIN_GROUP)) return 'platform-admin';
    return 'viewer';
  }
  if (ownershipRefs.includes(`group:default/${team}-admins`)) return 'admin';
  if (ownershipRefs.includes(`group:default/${team}-operators`))
    return 'operator';
  return 'viewer';
}

/**
 * Resolve the user's highest role across all their teams.
 * Used by the permission policy as a coarse-grained gate.
 */
export function resolveHighestRole(ownershipRefs: string[]): PipelineRole {
  if (ownershipRefs.includes(PLATFORM_ADMIN_GROUP)) return 'platform-admin';
  if (ownershipRefs.some(r => /^group:default\/.*-admins$/.test(r)))
    return 'admin';
  if (ownershipRefs.some(r => /^group:default\/.*-operators$/.test(r)))
    return 'operator';
  return 'viewer';
}

/** Check if a role meets the minimum required level. */
export function hasMinRole(
  actual: PipelineRole,
  required: PipelineRole,
): boolean {
  return ROLE_LEVELS[actual] >= ROLE_LEVELS[required];
}

/** Check if ownership refs contain the platform-admins group. */
export function isPlatformAdminRef(ownershipRefs: string[]): boolean {
  return ownershipRefs.includes(PLATFORM_ADMIN_GROUP);
}

/** Permissions that require admin role (destructive + sensitive). */
export const ADMIN_PERMISSIONS = new Set([
  'pipeline.delete',
  'pipeline.fleet.manage',
]);

/** Permissions that require operator role (day-to-day pipeline workflow). */
export const OPERATOR_PERMISSIONS = new Set([
  'pipeline.create',
  'pipeline.update',
  'pipeline.version.create',
  'pipeline.deploy',
]);
