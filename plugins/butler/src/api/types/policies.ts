// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * A ClusterCreationPolicy as butler-server returns it (ADR-018).
 *
 * A policy shapes the option lists a cluster is created from: images,
 * networks, and for Nutanix the clusters and storage containers. It is
 * resolved by the server inside those list reads, most specific scope
 * first, one rule per option type, and never on the client. The portal
 * reads policies to show them and reads the resolved outcome on each
 * list; it does not evaluate them.
 */
export type PolicyOptionType =
  | 'image'
  | 'network'
  | 'cluster'
  | 'storageContainer';

export type PolicyOptionMode = 'pin' | 'allowList' | 'default' | 'recommended';

export interface PolicyOptionRule {
  mode: PolicyOptionMode | string;
  values?: string[];
  default?: string;
  recommendedReason?: string;
}

export interface PolicyScope {
  platformWide?: Record<string, never>;
  team?: { teamRef: { name: string } };
  teamAndEnvironment?: { teamRef: { name: string }; environmentName: string };
}

export interface ClusterCreationPolicy {
  metadata: {
    name: string;
    uid?: string;
    creationTimestamp?: string;
    resourceVersion?: string;
  };
  spec: {
    scope: PolicyScope;
    targetProviders?: string[];
    options?: Partial<Record<PolicyOptionType | string, PolicyOptionRule>>;
  };
  status?: {
    conditions?: Array<{
      type: string;
      status: string;
      reason?: string;
      message?: string;
    }>;
    staleReferences?: string[];
  };
}

export interface PolicyListResponse {
  policies: ClusterCreationPolicy[];
  count: number;
}

export type PolicyTier = 'platformWide' | 'team' | 'teamAndEnvironment';

/** Which of the three scope tiers a policy sits in, or null if malformed. */
export function policyTier(policy: ClusterCreationPolicy): PolicyTier | null {
  const scope = policy.spec.scope ?? {};
  if (scope.teamAndEnvironment) return 'teamAndEnvironment';
  if (scope.team) return 'team';
  if (scope.platformWide) return 'platformWide';
  return null;
}

/** The scope in the console's own notation, e.g. `team/pe/production`. */
export function policyScopeLabel(policy: ClusterCreationPolicy): string {
  const scope = policy.spec.scope ?? {};
  if (scope.teamAndEnvironment) {
    return `team/${scope.teamAndEnvironment.teamRef.name}/${scope.teamAndEnvironment.environmentName}`;
  }
  if (scope.team) return `team/${scope.team.teamRef.name}`;
  if (scope.platformWide) return 'platform-wide';
  return '(invalid)';
}

/** What a rule does to the list, in words a person choosing from it needs. */
export function describeRuleMode(mode: string, noun: string): string {
  switch (mode) {
    case 'pin':
      return `Exactly one ${noun} is allowed; the list holds only that one.`;
    case 'allowList':
      return `Only the ${noun} options on the allow list are offered.`;
    case 'recommended':
      return `Recommended ${noun} options are listed first; any may be chosen.`;
    case 'default':
      return `The full ${noun} list is offered with a suggested default.`;
    default:
      return `Mode ${mode}.`;
  }
}

export const OPTION_TYPE_LABELS: Record<string, string> = {
  image: 'Image',
  network: 'Network',
  cluster: 'Nutanix cluster',
  storageContainer: 'Storage container',
};
