// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

export interface TeamInfo {
  name: string;
  displayName: string;
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
