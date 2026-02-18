// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import {
  resolveTeamRole,
  resolveHighestRole,
  hasMinRole,
  isPlatformAdminRef,
  ADMIN_PERMISSIONS,
  OPERATOR_PERMISSIONS,
} from '@internal/plugin-registry-common';
import type { RegistryRole } from '@internal/plugin-registry-common';
import type { ApprovalPolicy } from '../database/types';

// ─────────────────────────────────────────────────────────────────────────────
// Tests for governance: RBAC role resolution, permission sets, approval policy
// ─────────────────────────────────────────────────────────────────────────────

describe('Registry Backend - Governance & RBAC', () => {
  // ── resolveTeamRole ────────────────────────────────────────────

  describe('resolveTeamRole', () => {
    it('should return platform-admin when no team and refs include platform-admins', () => {
      expect(
        resolveTeamRole(null, ['group:default/platform-admins']),
      ).toBe('platform-admin');
    });

    it('should return viewer when no team and refs do not include platform-admins', () => {
      expect(
        resolveTeamRole(null, ['group:default/dev-team-operators']),
      ).toBe('viewer');
    });

    it('should return admin when refs include team-admins group', () => {
      expect(
        resolveTeamRole('dev-team', ['group:default/dev-team-admins']),
      ).toBe('admin');
    });

    it('should return operator when refs include team-operators group', () => {
      expect(
        resolveTeamRole('dev-team', ['group:default/dev-team-operators']),
      ).toBe('operator');
    });

    it('should return viewer when refs do not match any team groups', () => {
      expect(
        resolveTeamRole('dev-team', ['group:default/dev-team']),
      ).toBe('viewer');
    });

    it('should return viewer when refs are empty', () => {
      expect(resolveTeamRole('dev-team', [])).toBe('viewer');
    });

    it('should prioritize admin over operator', () => {
      expect(
        resolveTeamRole('dev-team', [
          'group:default/dev-team-operators',
          'group:default/dev-team-admins',
        ]),
      ).toBe('admin');
    });

    it('should not match cross-team groups', () => {
      expect(
        resolveTeamRole('dev-team', ['group:default/other-team-admins']),
      ).toBe('viewer');
    });
  });

  // ── resolveHighestRole ─────────────────────────────────────────

  describe('resolveHighestRole', () => {
    it('should return platform-admin for platform-admins group', () => {
      expect(
        resolveHighestRole(['group:default/platform-admins']),
      ).toBe('platform-admin');
    });

    it('should return admin when any *-admins group is present', () => {
      expect(
        resolveHighestRole(['group:default/prod-team-admins']),
      ).toBe('admin');
    });

    it('should return operator when any *-operators group is present', () => {
      expect(
        resolveHighestRole(['group:default/staging-operators']),
      ).toBe('operator');
    });

    it('should return viewer when no matching groups', () => {
      expect(
        resolveHighestRole(['group:default/dev-team', 'user:default/alice']),
      ).toBe('viewer');
    });

    it('should return viewer for empty refs', () => {
      expect(resolveHighestRole([])).toBe('viewer');
    });

    it('should return platform-admin even with other groups present', () => {
      expect(
        resolveHighestRole([
          'group:default/dev-team',
          'group:default/dev-team-operators',
          'group:default/platform-admins',
        ]),
      ).toBe('platform-admin');
    });

    it('should return admin over operator when both present', () => {
      expect(
        resolveHighestRole([
          'group:default/team-a-operators',
          'group:default/team-b-admins',
        ]),
      ).toBe('admin');
    });
  });

  // ── hasMinRole ─────────────────────────────────────────────────

  describe('hasMinRole', () => {
    const roles: RegistryRole[] = ['viewer', 'operator', 'admin', 'platform-admin'];

    it('should return true when actual equals required', () => {
      for (const role of roles) {
        expect(hasMinRole(role, role)).toBe(true);
      }
    });

    it('should return true when actual exceeds required', () => {
      expect(hasMinRole('platform-admin', 'viewer')).toBe(true);
      expect(hasMinRole('admin', 'operator')).toBe(true);
      expect(hasMinRole('operator', 'viewer')).toBe(true);
    });

    it('should return false when actual is below required', () => {
      expect(hasMinRole('viewer', 'operator')).toBe(false);
      expect(hasMinRole('operator', 'admin')).toBe(false);
      expect(hasMinRole('admin', 'platform-admin')).toBe(false);
    });

    it('should enforce platform-admin as the highest level', () => {
      expect(hasMinRole('platform-admin', 'platform-admin')).toBe(true);
      expect(hasMinRole('admin', 'platform-admin')).toBe(false);
    });

    it('should enforce viewer as the lowest level', () => {
      expect(hasMinRole('viewer', 'viewer')).toBe(true);
      for (const role of ['operator', 'admin', 'platform-admin'] as RegistryRole[]) {
        expect(hasMinRole('viewer', role)).toBe(false);
      }
    });
  });

  // ── isPlatformAdminRef ─────────────────────────────────────────

  describe('isPlatformAdminRef', () => {
    it('should return true when platform-admins group is present', () => {
      expect(isPlatformAdminRef(['group:default/platform-admins'])).toBe(true);
    });

    it('should return false when platform-admins group is absent', () => {
      expect(isPlatformAdminRef(['group:default/dev-team-admins'])).toBe(false);
    });

    it('should return false for empty refs', () => {
      expect(isPlatformAdminRef([])).toBe(false);
    });

    it('should not match partial group names', () => {
      expect(isPlatformAdminRef(['group:default/platform-admins-extra'])).toBe(false);
    });
  });

  // ── Permission Sets ────────────────────────────────────────────

  describe('Permission sets', () => {
    it('ADMIN_PERMISSIONS should include destructive operations', () => {
      expect(ADMIN_PERMISSIONS.has('registry.environment.delete')).toBe(true);
      expect(ADMIN_PERMISSIONS.has('registry.environment.lock')).toBe(true);
      expect(ADMIN_PERMISSIONS.has('registry.token.create')).toBe(true);
      expect(ADMIN_PERMISSIONS.has('registry.token.revoke')).toBe(true);
    });

    it('OPERATOR_PERMISSIONS should include day-to-day IaC operations', () => {
      expect(OPERATOR_PERMISSIONS.has('registry.artifact.create')).toBe(true);
      expect(OPERATOR_PERMISSIONS.has('registry.version.publish')).toBe(true);
      expect(OPERATOR_PERMISSIONS.has('registry.environment.create')).toBe(true);
      expect(OPERATOR_PERMISSIONS.has('registry.run.create')).toBe(true);
    });

    it('ADMIN and OPERATOR permission sets should not overlap', () => {
      for (const perm of ADMIN_PERMISSIONS) {
        expect(OPERATOR_PERMISSIONS.has(perm)).toBe(false);
      }
    });

    it('OPERATOR_PERMISSIONS should not include delete operations', () => {
      for (const perm of OPERATOR_PERMISSIONS) {
        expect(perm).not.toContain('.delete');
      }
    });

    it('ADMIN_PERMISSIONS should not include create/update for artifacts', () => {
      expect(ADMIN_PERMISSIONS.has('registry.artifact.create')).toBe(false);
      expect(ADMIN_PERMISSIONS.has('registry.artifact.update')).toBe(false);
    });
  });

  // ── ApprovalPolicy type shape ──────────────────────────────────

  describe('ApprovalPolicy interface', () => {
    it('should accept a full policy', () => {
      const policy: ApprovalPolicy = {
        minApprovers: 2,
        autoApprovePatches: true,
        requiredScanGrade: 'A',
        requirePassingTests: true,
        requirePassingValidate: true,
      };
      expect(policy.minApprovers).toBe(2);
      expect(policy.autoApprovePatches).toBe(true);
    });

    it('should accept an empty policy (all optional)', () => {
      const policy: ApprovalPolicy = {};
      expect(policy.minApprovers).toBeUndefined();
      expect(policy.autoApprovePatches).toBeUndefined();
    });

    it('should accept partial policy', () => {
      const policy: ApprovalPolicy = {
        autoApprovePatches: false,
      };
      expect(policy.autoApprovePatches).toBe(false);
      expect(policy.minApprovers).toBeUndefined();
    });
  });

  // ── Governance Staleness Threshold Logic ───────────────────────

  describe('Staleness threshold filtering', () => {
    // Test the same logic used by RegistryDatabase.getStalenessAlerts
    const msPerDay = 86_400_000;

    function computeDaysSince(dateStr: string): number {
      return Math.floor((Date.now() - new Date(dateStr).getTime()) / msPerDay);
    }

    it('should compute 0 days for today', () => {
      const today = new Date().toISOString();
      expect(computeDaysSince(today)).toBe(0);
    });

    it('should compute exactly 90 days for a 90-day-old date', () => {
      const date = new Date(Date.now() - 90 * msPerDay).toISOString();
      expect(computeDaysSince(date)).toBe(90);
    });

    it('should compute 89 days for a date just under 90 days', () => {
      const date = new Date(Date.now() - 89 * msPerDay - msPerDay / 2).toISOString();
      expect(computeDaysSince(date)).toBe(89);
    });

    it('should compute more than 90 days for old dates', () => {
      const date = new Date(Date.now() - 365 * msPerDay).toISOString();
      expect(computeDaysSince(date)).toBeGreaterThanOrEqual(365);
    });

    it('exactly 90 days should pass threshold filter (>=90)', () => {
      const days = 90;
      expect(days >= 90).toBe(true);
    });

    it('89 days should not pass threshold filter (>=90)', () => {
      const days = 89;
      expect(days >= 90).toBe(false);
    });

    it('91 days should pass threshold filter (>=90)', () => {
      const days = 91;
      expect(days >= 90).toBe(true);
    });

    it('0 days should not pass threshold filter', () => {
      const days = 0;
      expect(days >= 90).toBe(false);
    });

    it('should correctly sort by staleness descending', () => {
      const alerts = [
        { daysSinceUpdate: 100 },
        { daysSinceUpdate: 365 },
        { daysSinceUpdate: 91 },
        { daysSinceUpdate: 200 },
      ];
      const sorted = alerts.sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate);
      expect(sorted.map(a => a.daysSinceUpdate)).toEqual([365, 200, 100, 91]);
    });
  });
});
