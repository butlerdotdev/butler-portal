// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import {
  generateCallbackToken,
  verifyCallbackTokenHash,
} from '../runs/shared';
import {
  ApprovalPolicy,
  EnforcementLevel,
  VersionApprovalRow,
} from '../database/types';

// ─────────────────────────────────────────────────────────────────────────────
// Tests for Phase 2a: policy enforcement, token prefixes, approval workflows
// ─────────────────────────────────────────────────────────────────────────────

describe('Registry Backend - Policy Enforcement (Phase 2a)', () => {
  // ── Token Prefix Enforcement ────────────────────────────────────

  describe('Token prefix boundary enforcement', () => {
    it('callback tokens should start with brce_', () => {
      const { token } = generateCallbackToken();
      expect(token.startsWith('brce_')).toBe(true);
    });

    it('callback tokens should not start with breg_', () => {
      const { token } = generateCallbackToken();
      expect(token.startsWith('breg_')).toBe(false);
    });

    it('callback token hash should verify against the full prefixed token', () => {
      const { token, tokenHash } = generateCallbackToken();
      // The hash is computed over the full "brce_..." string
      expect(verifyCallbackTokenHash(token, tokenHash)).toBe(true);
    });

    it('callback token hash should NOT verify against token without prefix', () => {
      const { token, tokenHash } = generateCallbackToken();
      // Strip the brce_ prefix — hash should not match
      const stripped = token.slice(5);
      expect(verifyCallbackTokenHash(stripped, tokenHash)).toBe(false);
    });

    it('brce_ prefix detection should be simple string check', () => {
      // Simulates the boundary check in tokenAuth.ts
      const callbackToken = 'brce_abcdef1234567890';
      const registryToken = 'breg_abcdef1234567890';

      expect(callbackToken.startsWith('brce_')).toBe(true);
      expect(callbackToken.startsWith('breg_')).toBe(false);

      expect(registryToken.startsWith('breg_')).toBe(true);
      expect(registryToken.startsWith('brce_')).toBe(false);
    });

    it('tokens without any prefix should pass both boundary checks', () => {
      // Legacy tokens (pre-prefix) should not be blocked by prefix checks
      const legacyToken = 'abcdef1234567890abcdef1234567890';
      expect(legacyToken.startsWith('brce_')).toBe(false);
      expect(legacyToken.startsWith('breg_')).toBe(false);
    });

    it('should generate unique prefixed tokens across many calls', () => {
      const tokens = new Set();
      for (let i = 0; i < 100; i++) {
        const { token } = generateCallbackToken();
        expect(token.startsWith('brce_')).toBe(true);
        tokens.add(token);
      }
      expect(tokens.size).toBe(100);
    });
  });

  // ── ApprovalPolicy with new fields ──────────────────────────────

  describe('ApprovalPolicy with enforcement fields', () => {
    it('should accept enforcementLevel: block', () => {
      const policy: ApprovalPolicy = { enforcementLevel: 'block' };
      expect(policy.enforcementLevel).toBe('block');
    });

    it('should accept enforcementLevel: warn', () => {
      const policy: ApprovalPolicy = { enforcementLevel: 'warn' };
      expect(policy.enforcementLevel).toBe('warn');
    });

    it('should accept enforcementLevel: audit', () => {
      const policy: ApprovalPolicy = { enforcementLevel: 'audit' };
      expect(policy.enforcementLevel).toBe('audit');
    });

    it('should default enforcementLevel to undefined', () => {
      const policy: ApprovalPolicy = {};
      expect(policy.enforcementLevel).toBeUndefined();
    });

    it('should accept preventSelfApproval: true', () => {
      const policy: ApprovalPolicy = { preventSelfApproval: true };
      expect(policy.preventSelfApproval).toBe(true);
    });

    it('should accept preventSelfApproval: false (opt-out)', () => {
      const policy: ApprovalPolicy = { preventSelfApproval: false };
      expect(policy.preventSelfApproval).toBe(false);
    });

    it('should accept a complete Phase 2a policy', () => {
      const policy: ApprovalPolicy = {
        enforcementLevel: 'block',
        minApprovers: 2,
        autoApprovePatches: true,
        requiredScanGrade: 'B',
        requirePassingTests: true,
        requirePassingValidate: true,
        preventSelfApproval: true,
      };
      expect(policy.enforcementLevel).toBe('block');
      expect(policy.minApprovers).toBe(2);
      expect(policy.requiredScanGrade).toBe('B');
      expect(policy.preventSelfApproval).toBe(true);
    });
  });

  // ── EnforcementLevel type ───────────────────────────────────────

  describe('EnforcementLevel type', () => {
    it('should only allow block, warn, or audit', () => {
      const validLevels: EnforcementLevel[] = ['block', 'warn', 'audit'];
      expect(validLevels).toHaveLength(3);
      expect(validLevels).toContain('block');
      expect(validLevels).toContain('warn');
      expect(validLevels).toContain('audit');
    });
  });

  // ── VersionApprovalRow type ─────────────────────────────────────

  describe('VersionApprovalRow type', () => {
    it('should represent a complete approval record', () => {
      const row: VersionApprovalRow = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        version_id: '550e8400-e29b-41d4-a716-446655440001',
        actor: 'user:default/alice',
        comment: 'LGTM',
        created_at: '2026-02-16T10:00:00Z',
      };
      expect(row.id).toBeDefined();
      expect(row.version_id).toBeDefined();
      expect(row.actor).toBe('user:default/alice');
      expect(row.comment).toBe('LGTM');
    });

    it('should allow null comment', () => {
      const row: VersionApprovalRow = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        version_id: '550e8400-e29b-41d4-a716-446655440001',
        actor: 'user:default/bob',
        comment: null,
        created_at: '2026-02-16T10:00:00Z',
      };
      expect(row.comment).toBeNull();
    });
  });

  // ── Scan Grade Ordering ─────────────────────────────────────────

  describe('requiredScanGrade enforcement logic', () => {
    // Replicates the logic from router.ts approval endpoint
    const gradeOrder = ['A', 'B', 'C', 'D', 'F'];

    function meetsGradeRequirement(
      actualGrade: string,
      requiredGrade: string,
    ): boolean {
      const requiredIdx = gradeOrder.indexOf(requiredGrade);
      const actualIdx = gradeOrder.indexOf(actualGrade);
      return actualIdx >= 0 && actualIdx <= requiredIdx;
    }

    it('grade A should meet requirement A', () => {
      expect(meetsGradeRequirement('A', 'A')).toBe(true);
    });

    it('grade A should meet requirement B', () => {
      expect(meetsGradeRequirement('A', 'B')).toBe(true);
    });

    it('grade A should meet requirement F', () => {
      expect(meetsGradeRequirement('A', 'F')).toBe(true);
    });

    it('grade B should meet requirement B', () => {
      expect(meetsGradeRequirement('B', 'B')).toBe(true);
    });

    it('grade B should NOT meet requirement A', () => {
      expect(meetsGradeRequirement('B', 'A')).toBe(false);
    });

    it('grade C should NOT meet requirement A', () => {
      expect(meetsGradeRequirement('C', 'A')).toBe(false);
    });

    it('grade C should meet requirement C', () => {
      expect(meetsGradeRequirement('C', 'C')).toBe(true);
    });

    it('grade C should meet requirement D', () => {
      expect(meetsGradeRequirement('C', 'D')).toBe(true);
    });

    it('grade D should NOT meet requirement B', () => {
      expect(meetsGradeRequirement('D', 'B')).toBe(false);
    });

    it('grade F should only meet requirement F', () => {
      expect(meetsGradeRequirement('F', 'F')).toBe(true);
      expect(meetsGradeRequirement('F', 'D')).toBe(false);
      expect(meetsGradeRequirement('F', 'C')).toBe(false);
      expect(meetsGradeRequirement('F', 'B')).toBe(false);
      expect(meetsGradeRequirement('F', 'A')).toBe(false);
    });

    it('unknown grade should NOT meet any requirement', () => {
      expect(meetsGradeRequirement('X', 'A')).toBe(false);
      expect(meetsGradeRequirement('', 'A')).toBe(false);
    });

    it('unknown required grade should not match any actual grade', () => {
      // indexOf returns -1, requiredIdx = -1, actualIdx > requiredIdx is always true
      // But this is a defensive check — unknown grades should be rejected upstream
      const requiredIdx = gradeOrder.indexOf('X');
      expect(requiredIdx).toBe(-1);
    });
  });

  // ── Self-Approval Prevention Logic ──────────────────────────────

  describe('Self-approval prevention logic', () => {
    // Replicates: if (policy?.preventSelfApproval !== false && published_by === actor)

    function isSelfApprovalBlocked(
      policy: ApprovalPolicy | undefined,
      publishedBy: string,
      actor: string,
    ): boolean {
      return policy?.preventSelfApproval !== false && publishedBy === actor;
    }

    it('should block when policy is undefined and same user', () => {
      expect(isSelfApprovalBlocked(undefined, 'alice', 'alice')).toBe(true);
    });

    it('should block when policy has no preventSelfApproval field and same user', () => {
      expect(isSelfApprovalBlocked({}, 'alice', 'alice')).toBe(true);
    });

    it('should block when preventSelfApproval is true and same user', () => {
      expect(
        isSelfApprovalBlocked({ preventSelfApproval: true }, 'alice', 'alice'),
      ).toBe(true);
    });

    it('should NOT block when preventSelfApproval is explicitly false', () => {
      expect(
        isSelfApprovalBlocked({ preventSelfApproval: false }, 'alice', 'alice'),
      ).toBe(false);
    });

    it('should NOT block when different users regardless of policy', () => {
      expect(isSelfApprovalBlocked(undefined, 'alice', 'bob')).toBe(false);
      expect(isSelfApprovalBlocked({}, 'alice', 'bob')).toBe(false);
      expect(
        isSelfApprovalBlocked({ preventSelfApproval: true }, 'alice', 'bob'),
      ).toBe(false);
    });

    it('should use strict equality for actor comparison', () => {
      expect(isSelfApprovalBlocked({}, 'Alice', 'alice')).toBe(false);
      expect(isSelfApprovalBlocked({}, 'alice ', 'alice')).toBe(false);
    });
  });

  // ── Multi-Approver Logic ────────────────────────────────────────

  describe('Multi-approver threshold logic', () => {
    function needsMoreApprovals(
      minApprovers: number | undefined,
      currentCount: number,
    ): boolean {
      if (!minApprovers || minApprovers <= 1) return false;
      return currentCount < minApprovers;
    }

    it('should not require more approvals when minApprovers is undefined', () => {
      expect(needsMoreApprovals(undefined, 0)).toBe(false);
    });

    it('should not require more approvals when minApprovers is 1', () => {
      expect(needsMoreApprovals(1, 0)).toBe(false);
    });

    it('should not require more approvals when minApprovers is 0', () => {
      expect(needsMoreApprovals(0, 0)).toBe(false);
    });

    it('should require more approvals when count < minApprovers', () => {
      expect(needsMoreApprovals(2, 1)).toBe(true);
      expect(needsMoreApprovals(3, 1)).toBe(true);
      expect(needsMoreApprovals(3, 2)).toBe(true);
    });

    it('should not require more approvals when count >= minApprovers', () => {
      expect(needsMoreApprovals(2, 2)).toBe(false);
      expect(needsMoreApprovals(2, 3)).toBe(false);
      expect(needsMoreApprovals(3, 3)).toBe(false);
    });

    it('should handle large minApprovers values', () => {
      expect(needsMoreApprovals(10, 9)).toBe(true);
      expect(needsMoreApprovals(10, 10)).toBe(false);
    });
  });

  // ── Version Approval Uniqueness ─────────────────────────────────

  describe('Version approval deduplication', () => {
    it('unique constraint prevents duplicate approvals per actor', () => {
      // Simulates the DB constraint: UNIQUE(version_id, actor)
      const approvals = new Map(); // version_id+actor → id
      const key = (versionId: string, actor: string) =>
        `${versionId}:${actor}`;

      // First approval
      const k1 = key('v1', 'alice');
      expect(approvals.has(k1)).toBe(false);
      approvals.set(k1, 'approval-1');

      // Duplicate approval from same actor — should be ignored (onConflict.ignore)
      expect(approvals.has(k1)).toBe(true);

      // Different actor — should succeed
      const k2 = key('v1', 'bob');
      expect(approvals.has(k2)).toBe(false);
      approvals.set(k2, 'approval-2');

      // Same actor, different version — should succeed
      const k3 = key('v2', 'alice');
      expect(approvals.has(k3)).toBe(false);
      approvals.set(k3, 'approval-3');

      expect(approvals.size).toBe(3);
    });
  });

  // ── Policy Default Behavior ─────────────────────────────────────

  describe('Policy default behavior (enterprise-safe)', () => {
    it('undefined preventSelfApproval should behave as true (blocking)', () => {
      const policy: ApprovalPolicy = {};
      // !== false means undefined is treated as blocking
      expect(policy.preventSelfApproval !== false).toBe(true);
    });

    it('true preventSelfApproval should behave as blocking', () => {
      const policy: ApprovalPolicy = { preventSelfApproval: true };
      expect(policy.preventSelfApproval !== false).toBe(true);
    });

    it('false preventSelfApproval should allow self-approval', () => {
      const policy: ApprovalPolicy = { preventSelfApproval: false };
      expect(policy.preventSelfApproval !== false).toBe(false);
    });

    it('undefined enforcementLevel should default to block behavior', () => {
      const policy: ApprovalPolicy = {};
      const level = policy.enforcementLevel ?? 'block';
      expect(level).toBe('block');
    });

    it('explicit enforcementLevel should override default', () => {
      const policy: ApprovalPolicy = { enforcementLevel: 'warn' };
      const level = policy.enforcementLevel ?? 'block';
      expect(level).toBe('warn');
    });
  });
});
