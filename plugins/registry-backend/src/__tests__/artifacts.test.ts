// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import {
  assertTeamAccess,
  requireMinRole,
  RegistryError,
  notFound,
  conflict,
  badRequest,
  unauthorized,
  forbidden,
} from '../util/errors';
import {
  validateName,
  validateArtifactType,
  parseSemver,
  compareSemver,
  isPatchBump,
} from '../util/validation';

// ─────────────────────────────────────────────────────────────────────────────
// Tests for artifact-related utilities: team access, role checks, error helpers
// ─────────────────────────────────────────────────────────────────────────────

describe('Registry Backend - Artifacts & Team Access', () => {
  // ── RegistryError ──────────────────────────────────────────────

  describe('RegistryError', () => {
    it('should have correct statusCode and code for notFound', () => {
      const err = notFound('ARTIFACT_NOT_FOUND', 'Not found');
      expect(err).toBeInstanceOf(RegistryError);
      expect(err.statusCode).toBe(404);
      expect(err.code).toBe('ARTIFACT_NOT_FOUND');
      expect(err.message).toBe('Not found');
    });

    it('should have correct statusCode and code for conflict', () => {
      const err = conflict('VERSION_ALREADY_EXISTS', 'Already exists');
      expect(err).toBeInstanceOf(RegistryError);
      expect(err.statusCode).toBe(409);
      expect(err.code).toBe('VERSION_ALREADY_EXISTS');
    });

    it('should have correct statusCode for badRequest', () => {
      const err = badRequest('Bad input', { field: 'name' });
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.details).toEqual({ field: 'name' });
    });

    it('should have correct statusCode for unauthorized', () => {
      const err = unauthorized('No credentials');
      expect(err.statusCode).toBe(401);
      expect(err.code).toBe('UNAUTHORIZED');
    });

    it('should have correct statusCode for forbidden', () => {
      const err = forbidden('Access denied');
      expect(err.statusCode).toBe(403);
      expect(err.code).toBe('FORBIDDEN');
    });

    it('should set name to RegistryError', () => {
      const err = badRequest('test');
      expect(err.name).toBe('RegistryError');
    });

    it('should extend Error', () => {
      const err = badRequest('test');
      expect(err).toBeInstanceOf(Error);
    });

    it('should omit details when not provided', () => {
      const err = badRequest('test');
      expect(err.details).toBeUndefined();
    });
  });

  // ── assertTeamAccess ───────────────────────────────────────────

  describe('assertTeamAccess', () => {
    it('should allow access when no active team (admin mode)', () => {
      expect(() => assertTeamAccess({ team: 'team-a' }, undefined)).not.toThrow();
    });

    it('should allow access when resource has no team (platform-wide)', () => {
      expect(() => assertTeamAccess({ team: null }, 'team-a')).not.toThrow();
    });

    it('should allow access when resource team is undefined (platform-wide)', () => {
      expect(() => assertTeamAccess({ team: undefined }, 'team-a')).not.toThrow();
    });

    it('should allow access when teams match', () => {
      expect(() => assertTeamAccess({ team: 'team-a' }, 'team-a')).not.toThrow();
    });

    it('should throw notFound when teams do not match', () => {
      expect(() => assertTeamAccess({ team: 'team-a' }, 'team-b')).toThrow(RegistryError);
      try {
        assertTeamAccess({ team: 'team-a' }, 'team-b');
      } catch (err) {
        expect((err as RegistryError).statusCode).toBe(404);
      }
    });

    it('should throw notFound for null resource', () => {
      expect(() => assertTeamAccess(null, undefined)).toThrow(RegistryError);
    });

    it('should throw notFound for undefined resource', () => {
      expect(() => assertTeamAccess(undefined, undefined)).toThrow(RegistryError);
    });

    it('should allow access when both active team and resource team are absent', () => {
      expect(() => assertTeamAccess({ team: null }, undefined)).not.toThrow();
    });

    it('should allow access when resource.team is empty string and activeTeam is set', () => {
      // Empty string is falsy, treated like no team
      expect(() => assertTeamAccess({ team: '' }, 'team-a')).not.toThrow();
    });
  });

  // ── requireMinRole ─────────────────────────────────────────────

  describe('requireMinRole', () => {
    it('should skip check when no active team (admin mode)', () => {
      expect(() => requireMinRole({}, 'admin')).not.toThrow();
    });

    it('should skip check when activeTeam is undefined', () => {
      expect(() =>
        requireMinRole({ activeTeam: undefined, activeRole: 'viewer' }, 'admin'),
      ).not.toThrow();
    });

    it('should allow when role meets minimum', () => {
      expect(() =>
        requireMinRole({ activeTeam: 'team-a', activeRole: 'admin' }, 'admin'),
      ).not.toThrow();
    });

    it('should allow when role exceeds minimum', () => {
      expect(() =>
        requireMinRole({ activeTeam: 'team-a', activeRole: 'admin' }, 'operator'),
      ).not.toThrow();
    });

    it('should allow platform-admin for any role', () => {
      expect(() =>
        requireMinRole({ activeTeam: 'team-a', activeRole: 'platform-admin' }, 'admin'),
      ).not.toThrow();
    });

    it('should throw when role is insufficient', () => {
      expect(() =>
        requireMinRole({ activeTeam: 'team-a', activeRole: 'viewer' }, 'operator'),
      ).toThrow(RegistryError);
    });

    it('should throw when role is undefined and team is set', () => {
      expect(() =>
        requireMinRole({ activeTeam: 'team-a' }, 'operator'),
      ).toThrow(RegistryError);
    });

    it('should throw 403 for insufficient role', () => {
      try {
        requireMinRole({ activeTeam: 'team-a', activeRole: 'viewer' }, 'admin');
      } catch (err) {
        expect((err as RegistryError).statusCode).toBe(403);
      }
    });

    it('should allow operator for operator requirement', () => {
      expect(() =>
        requireMinRole({ activeTeam: 'team-a', activeRole: 'operator' }, 'operator'),
      ).not.toThrow();
    });

    it('should reject operator for admin requirement', () => {
      expect(() =>
        requireMinRole({ activeTeam: 'team-a', activeRole: 'operator' }, 'admin'),
      ).toThrow();
    });
  });

  // ── Artifact Type + Name Validation (supplementary) ────────────

  describe('Artifact type & version sorting integration', () => {
    it('should sort versions correctly for artifact display', () => {
      const versions = ['2.0.0', '1.0.0', '1.1.0', '0.1.0', '1.0.1'].map(v =>
        parseSemver(v),
      );
      const sorted = versions.sort(compareSemver);
      expect(sorted.map(v => v.raw)).toEqual([
        '0.1.0',
        '1.0.0',
        '1.0.1',
        '1.1.0',
        '2.0.0',
      ]);
    });

    it('should sort prerelease versions before their release', () => {
      const versions = ['1.0.0', '1.0.0-rc.1', '1.0.0-beta.1'].map(v =>
        parseSemver(v),
      );
      const sorted = versions.sort(compareSemver);
      expect(sorted[0].prerelease).not.toBeNull();
      expect(sorted[sorted.length - 1].prerelease).toBeNull();
    });

    it('should identify patch bumps for auto-approval candidate', () => {
      const prev = parseSemver('1.2.3');
      const next = parseSemver('1.2.4');
      expect(isPatchBump(prev, next)).toBe(true);
    });

    it('should reject minor bump as not a patch bump', () => {
      const prev = parseSemver('1.2.3');
      const next = parseSemver('1.3.0');
      expect(isPatchBump(prev, next)).toBe(false);
    });

    it('should reject prerelease as not a patch bump', () => {
      const prev = parseSemver('1.2.3');
      const next = parseSemver('1.2.4-rc.1');
      expect(isPatchBump(prev, next)).toBe(false);
    });

    it('should validate all 5 artifact types', () => {
      const types = [
        'terraform-module',
        'terraform-provider',
        'helm-chart',
        'opa-bundle',
        'oci-artifact',
      ];
      for (const type of types) {
        expect(() => validateArtifactType(type)).not.toThrow();
      }
    });

    it('should reject unknown artifact type', () => {
      expect(() => validateArtifactType('docker-image')).toThrow();
    });

    it('should validate artifact namespace naming rules', () => {
      expect(() => validateName('my-team', 'namespace')).not.toThrow();
      expect(() => validateName('ab', 'namespace')).toThrow(); // too short
    });
  });
});
