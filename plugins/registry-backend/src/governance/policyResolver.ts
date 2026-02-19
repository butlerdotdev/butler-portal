// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { RegistryDatabase } from '../database/RegistryDatabase';
import type {
  ApprovalPolicy,
  EnforcementLevel,
} from '../database/types';

/**
 * Resolved effective policy for an artifact, combining inline policy
 * with bound policy templates according to scope resolution rules.
 */
export interface EffectivePolicy {
  /** The merged policy rules */
  rules: ApprovalPolicy;
  /** Effective enforcement level (strictest across all sources) */
  enforcementLevel: EnforcementLevel;
  /** Which sources contributed to this effective policy */
  sources: PolicySource[];
}

export interface PolicySource {
  type: 'inline' | 'template';
  templateId?: string;
  templateName?: string;
  scopeType: string;
  scopeValue?: string;
}

/**
 * Enforcement level ordering from strictest to least strict.
 */
const ENFORCEMENT_ORDER: Record<EnforcementLevel, number> = {
  block: 0,
  warn: 1,
  audit: 2,
};

/**
 * Scope specificity ordering from most specific to least specific.
 */
const SCOPE_ORDER: Record<string, number> = {
  artifact: 0,
  namespace: 1,
  team: 2,
  global: 3,
};

/**
 * Resolve the effective policy for an artifact.
 *
 * Resolution algorithm:
 *
 * **Between scopes** — most specific scope takes precedence:
 *   1. Artifact-scope (inline approval_policy + bound artifact-scope policies)
 *   2. Namespace-scope bindings
 *   3. Team-scope bindings
 *   4. Global-scope bindings
 *
 * If a more specific scope defines a rule, that rule value is used —
 * the broader scope's value for that rule is ignored.
 *
 * **Within the same scope** — multiple policies combine, strictest wins per rule:
 *   - Two global policies: one requires scan grade B, another requires A → effective is A
 *   - Two team policies: one requires 1 approver, another 2 → effective is 2
 *
 * **Inline approval_policy** on artifacts is treated as artifact-scope.
 * Combines with any bound artifact-scope policies via strictest-wins.
 */
export async function resolveEffectivePolicy(
  db: RegistryDatabase,
  artifact: {
    id: string;
    namespace: string;
    team: string | null;
    approval_policy: ApprovalPolicy | null;
  },
): Promise<EffectivePolicy> {
  const sources: PolicySource[] = [];

  // Collect policies at each scope level
  const scopePolicies: Array<{
    scopeType: string;
    scopeValue?: string;
    policies: Array<{ rules: ApprovalPolicy; enforcementLevel: EnforcementLevel; source: PolicySource }>;
  }> = [];

  // 1. Artifact scope: inline + bound
  const artifactPolicies: Array<{ rules: ApprovalPolicy; enforcementLevel: EnforcementLevel; source: PolicySource }> = [];

  if (artifact.approval_policy && Object.keys(artifact.approval_policy).length > 0) {
    artifactPolicies.push({
      rules: artifact.approval_policy,
      enforcementLevel: artifact.approval_policy.enforcementLevel ?? 'block',
      source: { type: 'inline', scopeType: 'artifact', scopeValue: artifact.id },
    });
  }

  const boundArtifact = await db.getPoliciesForScope('artifact', artifact.id);
  for (const t of boundArtifact) {
    artifactPolicies.push({
      rules: t.rules,
      enforcementLevel: t.enforcement_level,
      source: { type: 'template', templateId: t.id, templateName: t.name, scopeType: 'artifact', scopeValue: artifact.id },
    });
  }

  if (artifactPolicies.length > 0) {
    scopePolicies.push({ scopeType: 'artifact', scopeValue: artifact.id, policies: artifactPolicies });
  }

  // 2. Namespace scope
  const boundNamespace = await db.getPoliciesForScope('namespace', artifact.namespace);
  if (boundNamespace.length > 0) {
    scopePolicies.push({
      scopeType: 'namespace',
      scopeValue: artifact.namespace,
      policies: boundNamespace.map(t => ({
        rules: t.rules,
        enforcementLevel: t.enforcement_level,
        source: { type: 'template' as const, templateId: t.id, templateName: t.name, scopeType: 'namespace', scopeValue: artifact.namespace },
      })),
    });
  }

  // 3. Team scope
  if (artifact.team) {
    const boundTeam = await db.getPoliciesForScope('team', artifact.team);
    if (boundTeam.length > 0) {
      scopePolicies.push({
        scopeType: 'team',
        scopeValue: artifact.team,
        policies: boundTeam.map(t => ({
          rules: t.rules,
          enforcementLevel: t.enforcement_level,
          source: { type: 'template' as const, templateId: t.id, templateName: t.name, scopeType: 'team', scopeValue: artifact.team! },
        })),
      });
    }
  }

  // 4. Global scope
  const boundGlobal = await db.getPoliciesForScope('global');
  if (boundGlobal.length > 0) {
    scopePolicies.push({
      scopeType: 'global',
      policies: boundGlobal.map(t => ({
        rules: t.rules,
        enforcementLevel: t.enforcement_level,
        source: { type: 'template' as const, templateId: t.id, templateName: t.name, scopeType: 'global' },
      })),
    });
  }

  // Sort scopes by specificity (most specific first)
  scopePolicies.sort(
    (a, b) => (SCOPE_ORDER[a.scopeType] ?? 99) - (SCOPE_ORDER[b.scopeType] ?? 99),
  );

  // Merge: for each rule, most-specific scope wins.
  // Within same scope, strictest value wins.
  const effectiveRules: ApprovalPolicy = {};
  let effectiveEnforcement: EnforcementLevel = 'audit'; // least strict default

  // Track which rules have been set by which scope
  const rulesSetByScope: Record<string, string> = {}; // rule -> scopeType

  for (const scope of scopePolicies) {
    // Within this scope, merge all policies (strictest per rule)
    const scopeMerged = mergeWithinScope(scope.policies.map(p => p.rules));

    // For each rule in the merged scope policy, only apply if no
    // more-specific scope has already set this rule
    for (const [rule, value] of Object.entries(scopeMerged)) {
      if (value === undefined) continue;
      if (!(rule in rulesSetByScope)) {
        (effectiveRules as any)[rule] = value;
        rulesSetByScope[rule] = scope.scopeType;
      }
    }

    // Enforcement level: strictest across all scopes
    for (const p of scope.policies) {
      if (ENFORCEMENT_ORDER[p.enforcementLevel] < ENFORCEMENT_ORDER[effectiveEnforcement]) {
        effectiveEnforcement = p.enforcementLevel;
      }
    }

    // Collect sources
    for (const p of scope.policies) {
      sources.push(p.source);
    }
  }

  // If no policies found at all, return empty
  if (scopePolicies.length === 0) {
    return {
      rules: {},
      enforcementLevel: 'block', // default when no policies exist
      sources: [],
    };
  }

  return {
    rules: effectiveRules,
    enforcementLevel: effectiveEnforcement,
    sources,
  };
}

/**
 * Merge multiple policies within the same scope — strictest value wins per rule.
 */
function mergeWithinScope(policies: ApprovalPolicy[]): ApprovalPolicy {
  if (policies.length === 0) return {};
  if (policies.length === 1) return { ...policies[0] };

  const merged: ApprovalPolicy = {};
  const gradeOrder = ['A', 'B', 'C', 'D', 'F'];

  for (const policy of policies) {
    // minApprovers: highest wins
    if (policy.minApprovers !== undefined) {
      merged.minApprovers = Math.max(
        merged.minApprovers ?? 0,
        policy.minApprovers,
      );
    }

    // requiredScanGrade: strictest (lowest index = highest grade) wins
    if (policy.requiredScanGrade !== undefined) {
      if (merged.requiredScanGrade === undefined) {
        merged.requiredScanGrade = policy.requiredScanGrade;
      } else {
        const currentIdx = gradeOrder.indexOf(merged.requiredScanGrade);
        const newIdx = gradeOrder.indexOf(policy.requiredScanGrade);
        if (newIdx >= 0 && (currentIdx < 0 || newIdx < currentIdx)) {
          merged.requiredScanGrade = policy.requiredScanGrade;
        }
      }
    }

    // Boolean flags: true is stricter than false
    if (policy.requirePassingTests === true) {
      merged.requirePassingTests = true;
    }
    if (policy.requirePassingValidate === true) {
      merged.requirePassingValidate = true;
    }
    if (policy.preventSelfApproval === true) {
      merged.preventSelfApproval = true;
    }

    // autoApprovePatches: false is stricter (disabling auto-approve)
    if (policy.autoApprovePatches === false) {
      merged.autoApprovePatches = false;
    } else if (
      policy.autoApprovePatches === true &&
      merged.autoApprovePatches === undefined
    ) {
      merged.autoApprovePatches = true;
    }
  }

  return merged;
}
