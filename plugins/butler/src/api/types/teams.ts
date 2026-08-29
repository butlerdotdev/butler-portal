// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

export interface TeamInfo {
  name: string;
  displayName: string;
  /** Namespace the team's resources live in, as served by the server. */
  namespace?: string;
  role: string;
  clusterCount: number;
}

export interface UserTeam {
  name: string;
  displayName?: string;
  namespace?: string;
  role: 'admin' | 'operator' | 'viewer' | 'member';
  // K8s-style nested structure (alternative shape from API)
  metadata?: {
    name: string;
    role?: string;
  };
  spec?: {
    displayName?: string;
  };
  status?: {
    namespace?: string;
  };
}

export interface User {
  // Identity
  id?: string;
  username?: string;
  email?: string;
  name?: string;
  displayName?: string;
  picture?: string;

  // Platform-level admin flags
  // Backend sets these based on User CRD or conventions
  role?: 'admin' | 'user' | string;
  isAdmin?: boolean;
  isPlatformAdmin?: boolean;

  // Team memberships
  teams?: UserTeam[];

  // SSO metadata
  provider?: 'oidc' | 'internal';
  sub?: string; // OIDC subject
}

export interface ObjectMeta {
  name: string;
  namespace: string;
  uid?: string;
  creationTimestamp?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

export interface Condition {
  type: string;
  status: string;
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
}

/**
 * The flat team as butler-server returns it from `GET /teams` and
 * `GET /teams/{name}` (`TeamResponse` in teams.go). It is a projection
 * of the Team CRD: limits and defaults from spec, usage from status, and
 * counts the server computes. The CRD shape itself never reaches the
 * client.
 */
export interface TeamResourceLimits {
  maxClusters?: number;
  maxNodesPerCluster?: number;
  maxTotalNodes?: number;
  /** Kubernetes quantities as strings, e.g. "96" or "256Gi". */
  maxCPUCores?: string | number;
  maxMemory?: string | number;
  maxStorage?: string | number;
  defaultNodeCount?: number;
  [key: string]: unknown;
}

export interface TeamResourceUsage {
  clusters?: number;
  totalNodes?: number;
  totalCPU?: string | number;
  totalMemory?: string | number;
  totalStorage?: string | number;
  /** Percent of maxClusters used, computed by the controller when a limit exists. */
  clusterUtilization?: number;
  cpuUtilization?: number;
  [key: string]: unknown;
}

export interface TeamClusterDefaults {
  kubernetesVersion?: string;
  workerCount?: number;
  workerCPU?: number;
  workerMemoryGi?: number;
  workerDiskGi?: number;
  defaultAddons?: string[];
}

export interface TeamEnvironmentEntry {
  name: string;
  description?: string;
  limits?: { maxClusters?: number; maxClustersPerMember?: number };
  [key: string]: unknown;
}

export interface TeamResponse {
  name: string;
  displayName?: string;
  description?: string;
  namespace?: string;
  phase: string;
  clusterCount: number;
  /** Direct members only (spec.access.users); group members are not counted. */
  memberCount: number;
  groupCount: number;
  labels?: Record<string, string>;
  createdAt?: string;
  resourceLimits?: TeamResourceLimits;
  resourceUsage?: TeamResourceUsage;
  clusterDefaults?: TeamClusterDefaults;
  environments?: TeamEnvironmentEntry[];
}

export type TeamRole = 'admin' | 'operator' | 'viewer';

/**
 * One row of `GET /teams/{name}/members`. `source` is the server's
 * verdict on why the person has access: `direct` (listed on the team),
 * `group` (an IdP group the team maps, seen on the user's last login),
 * or `elevated` (listed directly with a higher role than their group
 * grants). `canRemove` and `removeNote` are the server's, not ours.
 */
export interface TeamMemberResponse {
  email: string;
  name?: string;
  role: string;
  source: 'direct' | 'group' | 'elevated';
  groupName?: string;
  groupRole?: string;
  groupIdentifier?: string;
  directRole?: string;
  canRemove: boolean;
  removeNote?: string;
}

export interface GroupSyncResponse {
  name: string;
  role: string;
  identityProvider?: string;
}

export interface TeamMembersResponse {
  members: TeamMemberResponse[];
  groups: GroupSyncResponse[];
  /** Users seen with each mapped group on their last login, by group name. */
  groupMemberCounts: Record<string, number>;
}

export interface UpdateTeamRequest {
  displayName?: string;
  description?: string;
  /** Replaces spec.resourceLimits whole; platform admin only (admission webhook). */
  resourceLimits?: TeamResourceLimits;
  /** Replaces spec.clusterDefaults whole. */
  clusterDefaults?: TeamClusterDefaults;
}

/** One row of `GET /users`: a User CRD, so only people who have signed in or been invited. */
export interface UserListEntry {
  username: string;
  email: string;
  displayName?: string;
  avatar?: string;
  phase: string;
  disabled: boolean;
  authType: 'internal' | 'sso' | string;
  ssoProvider?: string;
  teams?: string[];
  isPlatformAdmin?: boolean;
  platformRole?: string;
}
