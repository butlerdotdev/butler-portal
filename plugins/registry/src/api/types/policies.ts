// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

export type EnforcementLevel = 'block' | 'warn' | 'audit';
export type PolicyScopeType = 'global' | 'team' | 'namespace' | 'artifact';

export interface PolicyTemplate {
  id: string;
  name: string;
  description: string | null;
  enforcement_level: EnforcementLevel;
  rules: {
    minApprovers?: number;
    requiredScanGrade?: string;
    requirePassingTests?: boolean;
    requirePassingValidate?: boolean;
    preventSelfApproval?: boolean;
    autoApprovePatches?: boolean;
  };
  team: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PolicyBinding {
  id: string;
  policy_template_id: string;
  scope_type: PolicyScopeType;
  scope_value: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CreatePolicyTemplateRequest {
  name: string;
  description?: string;
  enforcement_level?: EnforcementLevel;
  rules: PolicyTemplate['rules'];
  team?: string;
}

export interface CreatePolicyBindingRequest {
  scope_type: PolicyScopeType;
  scope_value?: string;
}

export interface PolicyRuleResult {
  rule: string;
  result: 'pass' | 'fail' | 'skip';
  message?: string;
}

export interface PolicySource {
  type: 'inline' | 'template';
  templateId?: string;
  templateName?: string;
  scopeType: string;
  scopeValue?: string;
}

export interface EffectivePolicy {
  rules: PolicyTemplate['rules'];
  enforcementLevel: EnforcementLevel;
  sources: PolicySource[];
}

export interface PolicyEvaluation {
  id: string;
  artifact_id: string | null;
  version_id: string | null;
  trigger: 'approval' | 'download' | 'publish';
  enforcement_level: EnforcementLevel;
  rules_evaluated: PolicyRuleResult[];
  outcome: 'pass' | 'fail' | 'warn';
  overridden_by: string | null;
  actor: string | null;
  evaluated_at: string;
}
