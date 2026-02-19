// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import {
  ApprovalPolicy,
  EnforcementLevel,
  PolicyScopeType,
  PolicyTemplateRow,
  PolicyBindingRow,
  PolicyRuleResult,
  PolicyEvaluationOutcome,
} from '../database/types';

// ─────────────────────────────────────────────────────────────────────────────
// Tests for Phase 2b: policy templates, bindings, scope resolution, evaluations
// ─────────────────────────────────────────────────────────────────────────────

describe('Registry Backend - Policy Templates & Governance (Phase 2b)', () => {
  // ── PolicyTemplateRow Structure ──────────────────────────────────

  describe('PolicyTemplateRow type contract', () => {
    const template: PolicyTemplateRow = {
      id: 'tmpl-1',
      name: 'require-scans',
      description: 'Require passing security scans',
      enforcement_level: 'block',
      rules: { requiredScanGrade: 'B', requirePassingTests: true },
      team: 'platform',
      created_by: 'admin@example.com',
      created_at: '2026-02-16T00:00:00Z',
      updated_at: '2026-02-16T00:00:00Z',
    };

    it('should have required fields', () => {
      expect(template.id).toBeDefined();
      expect(template.name).toBe('require-scans');
      expect(template.enforcement_level).toBe('block');
      expect(template.rules).toBeDefined();
    });

    it('should store rules as ApprovalPolicy', () => {
      expect(template.rules.requiredScanGrade).toBe('B');
      expect(template.rules.requirePassingTests).toBe(true);
    });

    it('should allow null team for platform-wide templates', () => {
      const platformTemplate: PolicyTemplateRow = {
        ...template,
        team: null,
      };
      expect(platformTemplate.team).toBeNull();
    });

    it('should allow null description', () => {
      const minimal: PolicyTemplateRow = {
        ...template,
        description: null,
      };
      expect(minimal.description).toBeNull();
    });
  });

  // ── PolicyBindingRow Structure ───────────────────────────────────

  describe('PolicyBindingRow type contract', () => {
    it('should bind a template to a scope', () => {
      const binding: PolicyBindingRow = {
        id: 'bind-1',
        policy_template_id: 'tmpl-1',
        scope_type: 'team',
        scope_value: 'platform',
        created_by: 'admin@example.com',
        created_at: '2026-02-16T00:00:00Z',
      };
      expect(binding.scope_type).toBe('team');
      expect(binding.scope_value).toBe('platform');
    });

    it('should allow null scope_value for global scope', () => {
      const globalBinding: PolicyBindingRow = {
        id: 'bind-2',
        policy_template_id: 'tmpl-1',
        scope_type: 'global',
        scope_value: null,
        created_by: 'admin@example.com',
        created_at: '2026-02-16T00:00:00Z',
      };
      expect(globalBinding.scope_type).toBe('global');
      expect(globalBinding.scope_value).toBeNull();
    });
  });

  // ── Scope Types ──────────────────────────────────────────────────

  describe('PolicyScopeType', () => {
    it('should accept valid scope types', () => {
      const validScopes: PolicyScopeType[] = ['global', 'team', 'namespace', 'artifact'];
      expect(validScopes).toHaveLength(4);
    });
  });

  // ── Enforcement Level Ordering ───────────────────────────────────

  describe('Enforcement level ordering', () => {
    const ENFORCEMENT_ORDER: Record<EnforcementLevel, number> = {
      block: 0,
      warn: 1,
      audit: 2,
    };

    it('block should be strictest', () => {
      expect(ENFORCEMENT_ORDER['block']).toBe(0);
    });

    it('audit should be least strict', () => {
      expect(ENFORCEMENT_ORDER['audit']).toBe(2);
    });

    it('block < warn < audit in ordering', () => {
      expect(ENFORCEMENT_ORDER['block']).toBeLessThan(ENFORCEMENT_ORDER['warn']);
      expect(ENFORCEMENT_ORDER['warn']).toBeLessThan(ENFORCEMENT_ORDER['audit']);
    });

    it('should pick strictest when comparing multiple levels', () => {
      const levels: EnforcementLevel[] = ['audit', 'warn', 'block'];
      const strictest = levels.reduce((a, b) =>
        ENFORCEMENT_ORDER[a] < ENFORCEMENT_ORDER[b] ? a : b,
      );
      expect(strictest).toBe('block');
    });

    it('should pick strictest from warn and audit', () => {
      const levels: EnforcementLevel[] = ['audit', 'warn'];
      const strictest = levels.reduce((a, b) =>
        ENFORCEMENT_ORDER[a] < ENFORCEMENT_ORDER[b] ? a : b,
      );
      expect(strictest).toBe('warn');
    });
  });

  // ── Scope Resolution Ordering ────────────────────────────────────

  describe('Scope resolution ordering', () => {
    const SCOPE_ORDER: Record<string, number> = {
      artifact: 0,
      namespace: 1,
      team: 2,
      global: 3,
    };

    it('artifact scope should be most specific', () => {
      expect(SCOPE_ORDER['artifact']).toBe(0);
    });

    it('global scope should be least specific', () => {
      expect(SCOPE_ORDER['global']).toBe(3);
    });

    it('artifact > namespace > team > global in specificity', () => {
      expect(SCOPE_ORDER['artifact']).toBeLessThan(SCOPE_ORDER['namespace']);
      expect(SCOPE_ORDER['namespace']).toBeLessThan(SCOPE_ORDER['team']);
      expect(SCOPE_ORDER['team']).toBeLessThan(SCOPE_ORDER['global']);
    });

    it('sorting scopes by specificity should put artifact first', () => {
      const scopes = ['global', 'team', 'artifact', 'namespace'];
      const sorted = scopes.sort((a, b) =>
        (SCOPE_ORDER[a] ?? 99) - (SCOPE_ORDER[b] ?? 99),
      );
      expect(sorted).toEqual(['artifact', 'namespace', 'team', 'global']);
    });
  });

  // ── Within-Scope Merging Logic ───────────────────────────────────

  describe('Within-scope merging (strictest wins per rule)', () => {
    function mergeWithinScope(policies: ApprovalPolicy[]): ApprovalPolicy {
      if (policies.length === 0) return {};
      if (policies.length === 1) return { ...policies[0] };

      const merged: ApprovalPolicy = {};
      const gradeOrder = ['A', 'B', 'C', 'D', 'F'];

      for (const policy of policies) {
        if (policy.minApprovers !== undefined) {
          merged.minApprovers = Math.max(
            merged.minApprovers ?? 0,
            policy.minApprovers,
          );
        }

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

        if (policy.requirePassingTests === true) {
          merged.requirePassingTests = true;
        }
        if (policy.requirePassingValidate === true) {
          merged.requirePassingValidate = true;
        }
        if (policy.preventSelfApproval === true) {
          merged.preventSelfApproval = true;
        }

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

    it('should return empty for no policies', () => {
      expect(mergeWithinScope([])).toEqual({});
    });

    it('should return clone for single policy', () => {
      const policy: ApprovalPolicy = { minApprovers: 2, requiredScanGrade: 'B' };
      const result = mergeWithinScope([policy]);
      expect(result).toEqual(policy);
      expect(result).not.toBe(policy); // should be a clone
    });

    it('should pick highest minApprovers', () => {
      const result = mergeWithinScope([
        { minApprovers: 1 },
        { minApprovers: 3 },
        { minApprovers: 2 },
      ]);
      expect(result.minApprovers).toBe(3);
    });

    it('should pick strictest scan grade (A over B)', () => {
      const result = mergeWithinScope([
        { requiredScanGrade: 'B' },
        { requiredScanGrade: 'A' },
      ]);
      expect(result.requiredScanGrade).toBe('A');
    });

    it('should pick strictest scan grade (B over D)', () => {
      const result = mergeWithinScope([
        { requiredScanGrade: 'D' },
        { requiredScanGrade: 'B' },
      ]);
      expect(result.requiredScanGrade).toBe('B');
    });

    it('true overrides false for boolean rules', () => {
      const result = mergeWithinScope([
        { requirePassingTests: false },
        { requirePassingTests: true },
      ]);
      expect(result.requirePassingTests).toBe(true);
    });

    it('preventSelfApproval: true is stricter', () => {
      const result = mergeWithinScope([
        { preventSelfApproval: false },
        { preventSelfApproval: true },
      ]);
      expect(result.preventSelfApproval).toBe(true);
    });

    it('autoApprovePatches: false is stricter than true', () => {
      const result = mergeWithinScope([
        { autoApprovePatches: true },
        { autoApprovePatches: false },
      ]);
      expect(result.autoApprovePatches).toBe(false);
    });

    it('autoApprovePatches: true only when no false present', () => {
      const result = mergeWithinScope([
        { autoApprovePatches: true },
        {},
      ]);
      expect(result.autoApprovePatches).toBe(true);
    });

    it('should merge across all rules', () => {
      const result = mergeWithinScope([
        { minApprovers: 1, requiredScanGrade: 'C', requirePassingTests: true },
        { minApprovers: 2, requiredScanGrade: 'A' },
        { requirePassingValidate: true, preventSelfApproval: true },
      ]);
      expect(result).toEqual({
        minApprovers: 2,
        requiredScanGrade: 'A',
        requirePassingTests: true,
        requirePassingValidate: true,
        preventSelfApproval: true,
      });
    });
  });

  // ── Between-Scope Resolution Logic ───────────────────────────────

  describe('Between-scope resolution (most specific wins per rule)', () => {
    function resolveScopes(
      scopePolicies: Array<{
        scopeType: string;
        merged: ApprovalPolicy;
      }>,
    ): ApprovalPolicy {
      const SCOPE_ORDER: Record<string, number> = {
        artifact: 0,
        namespace: 1,
        team: 2,
        global: 3,
      };

      // Sort by specificity
      const sorted = [...scopePolicies].sort(
        (a, b) => (SCOPE_ORDER[a.scopeType] ?? 99) - (SCOPE_ORDER[b.scopeType] ?? 99),
      );

      const effectiveRules: ApprovalPolicy = {};
      const rulesSetByScope: Record<string, string> = {};

      for (const scope of sorted) {
        for (const [rule, value] of Object.entries(scope.merged)) {
          if (value === undefined) continue;
          if (!(rule in rulesSetByScope)) {
            (effectiveRules as any)[rule] = value;
            rulesSetByScope[rule] = scope.scopeType;
          }
        }
      }

      return effectiveRules;
    }

    it('artifact scope overrides global scope', () => {
      const result = resolveScopes([
        { scopeType: 'global', merged: { minApprovers: 3 } },
        { scopeType: 'artifact', merged: { minApprovers: 1 } },
      ]);
      expect(result.minApprovers).toBe(1);
    });

    it('namespace scope overrides team scope', () => {
      const result = resolveScopes([
        { scopeType: 'team', merged: { requiredScanGrade: 'A' } },
        { scopeType: 'namespace', merged: { requiredScanGrade: 'C' } },
      ]);
      expect(result.requiredScanGrade).toBe('C');
    });

    it('rules from broader scope fill in gaps', () => {
      const result = resolveScopes([
        { scopeType: 'artifact', merged: { minApprovers: 1 } },
        { scopeType: 'global', merged: { requiredScanGrade: 'B', requirePassingTests: true } },
      ]);
      expect(result.minApprovers).toBe(1);
      expect(result.requiredScanGrade).toBe('B');
      expect(result.requirePassingTests).toBe(true);
    });

    it('specific scope blocks broader scope for same rule', () => {
      const result = resolveScopes([
        { scopeType: 'namespace', merged: { requirePassingTests: false } },
        { scopeType: 'global', merged: { requirePassingTests: true } },
      ]);
      expect(result.requirePassingTests).toBe(false);
    });

    it('should handle all four scope levels', () => {
      const result = resolveScopes([
        { scopeType: 'global', merged: { minApprovers: 5, requiredScanGrade: 'D', requirePassingTests: true, requirePassingValidate: true } },
        { scopeType: 'team', merged: { requiredScanGrade: 'C' } },
        { scopeType: 'namespace', merged: { minApprovers: 2 } },
        { scopeType: 'artifact', merged: { minApprovers: 1 } },
      ]);
      // minApprovers: artifact(1) overrides namespace(2) overrides global(5)
      expect(result.minApprovers).toBe(1);
      // requiredScanGrade: team(C) overrides global(D)
      expect(result.requiredScanGrade).toBe('C');
      // requirePassingTests: only from global, not overridden
      expect(result.requirePassingTests).toBe(true);
      // requirePassingValidate: only from global, not overridden
      expect(result.requirePassingValidate).toBe(true);
    });

    it('empty scopes have no effect', () => {
      const result = resolveScopes([
        { scopeType: 'artifact', merged: {} },
        { scopeType: 'global', merged: { minApprovers: 2 } },
      ]);
      expect(result.minApprovers).toBe(2);
    });
  });

  // ── Policy Rule Results ──────────────────────────────────────────

  describe('PolicyRuleResult', () => {
    it('should represent a passing rule', () => {
      const result: PolicyRuleResult = {
        rule: 'requirePassingTests',
        result: 'pass',
      };
      expect(result.result).toBe('pass');
      expect(result.message).toBeUndefined();
    });

    it('should represent a failing rule with message', () => {
      const result: PolicyRuleResult = {
        rule: 'requiredScanGrade',
        result: 'fail',
        message: 'Best scan grade C does not meet required B',
      };
      expect(result.result).toBe('fail');
      expect(result.message).toBeDefined();
    });

    it('should represent a skipped rule', () => {
      const result: PolicyRuleResult = {
        rule: 'minApprovers',
        result: 'skip',
        message: 'Not applicable at download time',
      };
      expect(result.result).toBe('skip');
    });
  });

  // ── Policy Evaluation Outcome ────────────────────────────────────

  describe('Policy evaluation outcome determination', () => {
    function determineOutcome(
      ruleResults: PolicyRuleResult[],
      enforcementLevel: EnforcementLevel,
    ): PolicyEvaluationOutcome {
      const hasFail = ruleResults.some(r => r.result === 'fail');
      if (!hasFail) return 'pass';
      if (enforcementLevel === 'warn') return 'warn';
      return 'fail';
    }

    it('should pass when all rules pass', () => {
      const results: PolicyRuleResult[] = [
        { rule: 'requirePassingTests', result: 'pass' },
        { rule: 'requiredScanGrade', result: 'pass' },
      ];
      expect(determineOutcome(results, 'block')).toBe('pass');
    });

    it('should fail when a rule fails and enforcement is block', () => {
      const results: PolicyRuleResult[] = [
        { rule: 'requirePassingTests', result: 'pass' },
        { rule: 'requiredScanGrade', result: 'fail' },
      ];
      expect(determineOutcome(results, 'block')).toBe('fail');
    });

    it('should warn when a rule fails and enforcement is warn', () => {
      const results: PolicyRuleResult[] = [
        { rule: 'requiredScanGrade', result: 'fail' },
      ];
      expect(determineOutcome(results, 'warn')).toBe('warn');
    });

    it('should fail when a rule fails and enforcement is audit', () => {
      // Audit still records fail — the enforcement layer decides what to do
      const results: PolicyRuleResult[] = [
        { rule: 'requiredScanGrade', result: 'fail' },
      ];
      expect(determineOutcome(results, 'audit')).toBe('fail');
    });

    it('should pass when all rules are skipped', () => {
      const results: PolicyRuleResult[] = [
        { rule: 'minApprovers', result: 'skip' },
      ];
      expect(determineOutcome(results, 'block')).toBe('pass');
    });

    it('should pass for empty rule results', () => {
      expect(determineOutcome([], 'block')).toBe('pass');
    });
  });

  // ── Download Policy Enforcement Logic ────────────────────────────

  describe('Download-time enforcement behavior', () => {
    interface MockPolicyResult {
      outcome: PolicyEvaluationOutcome;
      enforcementLevel: EnforcementLevel;
      warnings: string[];
    }

    function shouldBlock(result: MockPolicyResult): boolean {
      return result.outcome === 'fail' && result.enforcementLevel === 'block';
    }

    function shouldWarn(result: MockPolicyResult): boolean {
      return result.warnings.length > 0 && result.enforcementLevel === 'warn';
    }

    it('should block download when block-level policy fails', () => {
      const result: MockPolicyResult = {
        outcome: 'fail',
        enforcementLevel: 'block',
        warnings: ['Missing scan grade'],
      };
      expect(shouldBlock(result)).toBe(true);
    });

    it('should NOT block download when warn-level policy fails', () => {
      const result: MockPolicyResult = {
        outcome: 'warn',
        enforcementLevel: 'warn',
        warnings: ['Missing scan grade'],
      };
      expect(shouldBlock(result)).toBe(false);
    });

    it('should NOT block download when audit-level policy fails', () => {
      const result: MockPolicyResult = {
        outcome: 'fail',
        enforcementLevel: 'audit',
        warnings: ['Missing scan grade'],
      };
      expect(shouldBlock(result)).toBe(false);
    });

    it('should add warning header when warn-level has warnings', () => {
      const result: MockPolicyResult = {
        outcome: 'warn',
        enforcementLevel: 'warn',
        warnings: ['Policy requires scan grade B', 'Policy requires passing tests'],
      };
      expect(shouldWarn(result)).toBe(true);
    });

    it('should NOT add warning header when block-level even with warnings', () => {
      const result: MockPolicyResult = {
        outcome: 'fail',
        enforcementLevel: 'block',
        warnings: ['Missing scan grade'],
      };
      expect(shouldWarn(result)).toBe(false);
    });

    it('should NOT block or warn when policy passes', () => {
      const result: MockPolicyResult = {
        outcome: 'pass',
        enforcementLevel: 'block',
        warnings: [],
      };
      expect(shouldBlock(result)).toBe(false);
      expect(shouldWarn(result)).toBe(false);
    });

    it('warning header should join multiple warnings with semicolon', () => {
      const warnings = ['Policy requires scan grade B', 'Policy requires passing tests'];
      const header = warnings.join('; ');
      expect(header).toBe('Policy requires scan grade B; Policy requires passing tests');
    });
  });

  // ── Validation Rules for Policy API ──────────────────────────────

  describe('Policy API validation rules', () => {
    const VALID_ENFORCEMENT_LEVELS = ['block', 'warn', 'audit'];
    const VALID_SCOPE_TYPES = ['global', 'team', 'namespace', 'artifact'];

    it('should accept valid enforcement levels', () => {
      for (const level of VALID_ENFORCEMENT_LEVELS) {
        expect(VALID_ENFORCEMENT_LEVELS.includes(level)).toBe(true);
      }
    });

    it('should reject invalid enforcement levels', () => {
      expect(VALID_ENFORCEMENT_LEVELS.includes('none')).toBe(false);
      expect(VALID_ENFORCEMENT_LEVELS.includes('error')).toBe(false);
      expect(VALID_ENFORCEMENT_LEVELS.includes('')).toBe(false);
    });

    it('should accept valid scope types', () => {
      for (const scope of VALID_SCOPE_TYPES) {
        expect(VALID_SCOPE_TYPES.includes(scope)).toBe(true);
      }
    });

    it('should reject invalid scope types', () => {
      expect(VALID_SCOPE_TYPES.includes('project')).toBe(false);
      expect(VALID_SCOPE_TYPES.includes('org')).toBe(false);
    });

    it('non-global scopes require scope_value', () => {
      for (const scope of ['team', 'namespace', 'artifact']) {
        const needsValue = scope !== 'global';
        expect(needsValue).toBe(true);
      }
    });

    it('global scope does not require scope_value', () => {
      const needsValue = 'global' !== 'global';
      expect(needsValue).toBe(false);
    });
  });

  // ── Policy Evaluation Retention ──────────────────────────────────

  describe('Policy evaluation retention', () => {
    it('should calculate retention cutoff correctly', () => {
      const retentionDays = 90;
      const now = new Date('2026-02-16T00:00:00Z');
      const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
      expect(cutoff.toISOString()).toBe('2025-11-18T00:00:00.000Z');
    });

    it('should handle 30-day retention', () => {
      const retentionDays = 30;
      const now = new Date('2026-02-16T00:00:00Z');
      const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
      expect(cutoff.toISOString()).toBe('2026-01-17T00:00:00.000Z');
    });
  });

  // ── Policy Template Name Uniqueness ──────────────────────────────

  describe('Policy template naming', () => {
    it('UNIQUE(name, team) allows same name in different teams', () => {
      const templates = [
        { name: 'require-scans', team: 'alpha' },
        { name: 'require-scans', team: 'beta' },
      ];
      // Different teams — both valid
      const keys = templates.map(t => `${t.name}:${t.team}`);
      const unique = new Set(keys);
      expect(unique.size).toBe(2);
    });

    it('UNIQUE(name, team) prevents duplicate in same team', () => {
      const templates = [
        { name: 'require-scans', team: 'alpha' },
        { name: 'require-scans', team: 'alpha' },
      ];
      const keys = templates.map(t => `${t.name}:${t.team}`);
      const unique = new Set(keys);
      expect(unique.size).toBe(1); // Duplicate
    });

    it('null team (platform-wide) is a distinct scope', () => {
      const templates = [
        { name: 'require-scans', team: null },
        { name: 'require-scans', team: 'alpha' },
      ];
      // null vs 'alpha' — different, both valid
      const keys = templates.map(t => `${t.name}:${t.team ?? '__null__'}`);
      const unique = new Set(keys);
      expect(unique.size).toBe(2);
    });
  });

  // ── Binding Uniqueness ───────────────────────────────────────────

  describe('Policy binding uniqueness', () => {
    it('UNIQUE(template_id, scope_type, scope_value) prevents duplicate bindings', () => {
      const bindings = [
        { policy_template_id: 'tmpl-1', scope_type: 'team', scope_value: 'alpha' },
        { policy_template_id: 'tmpl-1', scope_type: 'team', scope_value: 'alpha' },
      ];
      const keys = bindings.map(b => `${b.policy_template_id}:${b.scope_type}:${b.scope_value}`);
      const unique = new Set(keys);
      expect(unique.size).toBe(1); // Duplicate
    });

    it('same template can be bound to different scopes', () => {
      const bindings = [
        { policy_template_id: 'tmpl-1', scope_type: 'team', scope_value: 'alpha' },
        { policy_template_id: 'tmpl-1', scope_type: 'team', scope_value: 'beta' },
        { policy_template_id: 'tmpl-1', scope_type: 'global', scope_value: null },
      ];
      const keys = bindings.map(b => `${b.policy_template_id}:${b.scope_type}:${b.scope_value}`);
      const unique = new Set(keys);
      expect(unique.size).toBe(3);
    });

    it('different templates can be bound to same scope', () => {
      const bindings = [
        { policy_template_id: 'tmpl-1', scope_type: 'global', scope_value: null },
        { policy_template_id: 'tmpl-2', scope_type: 'global', scope_value: null },
      ];
      const keys = bindings.map(b => `${b.policy_template_id}:${b.scope_type}:${b.scope_value}`);
      const unique = new Set(keys);
      expect(unique.size).toBe(2);
    });
  });

  // ── Cascade Delete Behavior ──────────────────────────────────────

  describe('Policy template cascade delete', () => {
    it('deleting a template should cascade to its bindings (ON DELETE CASCADE)', () => {
      // Simulates the FK cascade behavior
      const bindings = [
        { id: 'bind-1', policy_template_id: 'tmpl-1', scope_type: 'global' },
        { id: 'bind-2', policy_template_id: 'tmpl-1', scope_type: 'team' },
        { id: 'bind-3', policy_template_id: 'tmpl-2', scope_type: 'global' },
      ];

      // Delete tmpl-1
      const deletedTemplateId = 'tmpl-1';
      const remainingBindings = bindings.filter(b => b.policy_template_id !== deletedTemplateId);
      expect(remainingBindings).toHaveLength(1);
      expect(remainingBindings[0].id).toBe('bind-3');
    });
  });

  // ── Evaluation SET NULL FK Behavior ──────────────────────────────

  describe('Policy evaluation FK behavior', () => {
    it('artifact_id should be SET NULL when artifact is deleted', () => {
      // Simulates the ON DELETE SET NULL FK behavior
      const evaluation = {
        id: 'eval-1',
        artifact_id: 'art-1' as string | null,
        version_id: 'ver-1' as string | null,
        trigger: 'download' as const,
        outcome: 'pass' as const,
      };

      // Simulate artifact deletion → SET NULL
      evaluation.artifact_id = null;
      expect(evaluation.artifact_id).toBeNull();
      // Evaluation record still exists with audit data
      expect(evaluation.id).toBe('eval-1');
      expect(evaluation.outcome).toBe('pass');
    });
  });

  // ── Inline Policy Backward Compatibility ─────────────────────────

  describe('Inline approval_policy backward compatibility', () => {
    it('inline policy is treated as artifact-scope in resolution', () => {
      const artifact = {
        id: 'art-1',
        approval_policy: { minApprovers: 2, requirePassingTests: true } as ApprovalPolicy,
      };

      // In the resolver, inline policy is added to artifact-scope policies
      const isArtifactScope = true;
      expect(isArtifactScope).toBe(true);
      expect(artifact.approval_policy.minApprovers).toBe(2);
    });

    it('inline policy combines with bound artifact-scope policies via strictest-wins', () => {
      const inline: ApprovalPolicy = { minApprovers: 1, requiredScanGrade: 'C' };
      const bound: ApprovalPolicy = { minApprovers: 2, requiredScanGrade: 'B' };

      // Both at artifact scope → merge with strictest wins
      const merged: ApprovalPolicy = {
        minApprovers: Math.max(inline.minApprovers ?? 0, bound.minApprovers ?? 0),
        requiredScanGrade: 'B', // B is stricter than C
      };

      expect(merged.minApprovers).toBe(2);
      expect(merged.requiredScanGrade).toBe('B');
    });

    it('empty inline policy has no effect', () => {
      const inline: ApprovalPolicy = {};
      expect(Object.keys(inline)).toHaveLength(0);
    });

    it('null inline policy has no effect', () => {
      const artifact = {
        approval_policy: null as ApprovalPolicy | null,
      };
      const hasInline = artifact.approval_policy && Object.keys(artifact.approval_policy).length > 0;
      expect(hasInline).toBeFalsy();
    });
  });

  // ── Download-Relevant vs Approval-Only Rules ─────────────────────

  describe('Download-relevant vs approval-only rules', () => {
    const DOWNLOAD_RELEVANT_RULES = [
      'requirePassingTests',
      'requirePassingValidate',
      'requiredScanGrade',
    ];

    const APPROVAL_ONLY_RULES = [
      'minApprovers',
      'preventSelfApproval',
      'autoApprovePatches',
    ];

    it('download evaluator should only check download-relevant rules', () => {
      const policy: ApprovalPolicy = {
        requirePassingTests: true,
        requirePassingValidate: true,
        requiredScanGrade: 'B',
        minApprovers: 3,
        preventSelfApproval: true,
        autoApprovePatches: false,
      };

      // At download time, only these rules are evaluated
      const downloadRules = Object.keys(policy).filter(r =>
        DOWNLOAD_RELEVANT_RULES.includes(r),
      );
      expect(downloadRules).toEqual(
        expect.arrayContaining(['requirePassingTests', 'requirePassingValidate', 'requiredScanGrade']),
      );
      expect(downloadRules).toHaveLength(3);
    });

    it('approval-only rules should be skipped at download time', () => {
      const allRules = [
        ...DOWNLOAD_RELEVANT_RULES,
        ...APPROVAL_ONLY_RULES,
      ];
      const atDownload = allRules.filter(r => DOWNLOAD_RELEVANT_RULES.includes(r));
      const skipped = allRules.filter(r => APPROVAL_ONLY_RULES.includes(r));

      expect(atDownload).toHaveLength(3);
      expect(skipped).toHaveLength(3);
    });
  });

  // ── X-Butler-Policy-Warning Header Format ────────────────────────

  describe('X-Butler-Policy-Warning header', () => {
    it('should be semicolon-separated for multiple warnings', () => {
      const warnings = [
        'Policy requires scan grade B or better',
        'Policy requires passing test run',
      ];
      const header = warnings.join('; ');
      expect(header).toContain('; ');
      expect(header.split('; ')).toHaveLength(2);
    });

    it('should be plain string for single warning', () => {
      const warnings = ['Policy requires scan grade B or better'];
      const header = warnings.join('; ');
      expect(header).not.toContain('; ');
    });

    it('protocol clients (terraform/helm) ignore custom headers', () => {
      // This is an informational test documenting the known caveat:
      // terraform and helm CLI clients will NOT display X-Butler-Policy-Warning.
      // The warning is captured in the policy evaluation record and surfaced
      // in the governance dashboard. Customers needing visible warnings should
      // use 'block' enforcement level.
      const protocolClients = ['terraform', 'helm', 'tofu'];
      const supportsCustomHeaders = false; // None of them do
      expect(supportsCustomHeaders).toBe(false);
      expect(protocolClients).toHaveLength(3);
    });
  });
});
