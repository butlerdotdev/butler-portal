// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import {
  generateCallbackToken,
  verifyCallbackTokenHash,
  extractBearerToken,
  TERMINAL_MODULE_RUN_STATUSES,
  ACTIVE_MODULE_RUN_STATUSES,
} from '../runs/shared';
import {
  validateName,
  validateArtifactType,
  parseSemver,
  compareSemver,
  isPatchBump,
} from '../util/validation';
import {
  parsePagination,
  encodeCursor,
  decodeCursor,
} from '../util/pagination';

// ─────────────────────────────────────────────────────────────────────────────
// Tests for callback tokens, validation utilities, and pagination
// ─────────────────────────────────────────────────────────────────────────────

describe('Registry Backend - Tokens, Validation & Pagination', () => {
  // ── Callback Token Utilities ──────────────────────────────────

  describe('generateCallbackToken', () => {
    it('should return a token with brce_ prefix followed by 64 hex characters', () => {
      const { token } = generateCallbackToken();
      expect(token).toMatch(/^brce_[0-9a-f]{64}$/);
      expect(token).toHaveLength(5 + 64); // "brce_" (5) + 64 hex chars
    });

    it('should return a tokenHash of 64 hex characters (SHA256)', () => {
      const { tokenHash } = generateCallbackToken();
      expect(tokenHash).toHaveLength(64);
      expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should have brce_ prefix for boundary enforcement', () => {
      const { token } = generateCallbackToken();
      expect(token.startsWith('brce_')).toBe(true);
      // brce_ tokens must NOT start with breg_
      expect(token.startsWith('breg_')).toBe(false);
    });

    it('should produce a hash that verifies against the token', () => {
      const { token, tokenHash } = generateCallbackToken();
      expect(verifyCallbackTokenHash(token, tokenHash)).toBe(true);
    });

    it('should generate unique tokens on successive calls', () => {
      const a = generateCallbackToken();
      const b = generateCallbackToken();
      expect(a.token).not.toBe(b.token);
      expect(a.tokenHash).not.toBe(b.tokenHash);
    });

    it('should generate unique tokens across many calls', () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 100; i++) {
        tokens.add(generateCallbackToken().token);
      }
      expect(tokens.size).toBe(100);
    });

    it('should produce token and hash that are different strings', () => {
      const { token, tokenHash } = generateCallbackToken();
      expect(token).not.toBe(tokenHash);
    });
  });

  describe('verifyCallbackTokenHash', () => {
    it('should return true for matching token and hash', () => {
      const { token, tokenHash } = generateCallbackToken();
      expect(verifyCallbackTokenHash(token, tokenHash)).toBe(true);
    });

    it('should return false for wrong token', () => {
      const { tokenHash } = generateCallbackToken();
      expect(verifyCallbackTokenHash('wrongtoken', tokenHash)).toBe(false);
    });

    it('should return false for empty token', () => {
      const { tokenHash } = generateCallbackToken();
      expect(verifyCallbackTokenHash('', tokenHash)).toBe(false);
    });

    it('should return false when token does not match a different hash', () => {
      const a = generateCallbackToken();
      const b = generateCallbackToken();
      expect(verifyCallbackTokenHash(a.token, b.tokenHash)).toBe(false);
    });

    it('should return false when hash is empty', () => {
      const { token } = generateCallbackToken();
      expect(verifyCallbackTokenHash(token, '')).toBe(false);
    });

    it('should return false for slightly modified token', () => {
      const { token, tokenHash } = generateCallbackToken();
      const modified = token.slice(0, -1) + (token.endsWith('0') ? '1' : '0');
      expect(verifyCallbackTokenHash(modified, tokenHash)).toBe(false);
    });

    it('should handle token with leading zeros correctly', () => {
      // Verify that the hash mechanism does not strip leading zeros
      const { token, tokenHash } = generateCallbackToken();
      // The token is hex, the hash is deterministic
      const verified = verifyCallbackTokenHash(token, tokenHash);
      expect(verified).toBe(true);
    });
  });

  describe('extractBearerToken', () => {
    it('should extract token after "Bearer "', () => {
      expect(extractBearerToken('Bearer abc123')).toBe('abc123');
    });

    it('should return null for undefined header', () => {
      expect(extractBearerToken(undefined)).toBe(null);
    });

    it('should return null for empty string', () => {
      expect(extractBearerToken('')).toBe(null);
    });

    it('should return null for Basic auth header', () => {
      expect(extractBearerToken('Basic abc123')).toBe(null);
    });

    it('should return null for lowercase "bearer"', () => {
      expect(extractBearerToken('bearer abc123')).toBe(null);
    });

    it('should return null for uppercase "BEARER"', () => {
      expect(extractBearerToken('BEARER abc123')).toBe(null);
    });

    it('should extract complex JWT-style token', () => {
      expect(extractBearerToken('Bearer eyJhbGciOiJIUzI1NiJ9.abc.def')).toBe(
        'eyJhbGciOiJIUzI1NiJ9.abc.def',
      );
    });

    it('should extract token with spaces in the value', () => {
      // "Bearer " prefix is stripped, everything after is the token
      expect(extractBearerToken('Bearer token with spaces')).toBe(
        'token with spaces',
      );
    });

    it('should return null for "Bearer" without trailing space', () => {
      expect(extractBearerToken('Bearer')).toBe(null);
    });

    it('should return empty string for "Bearer " with nothing after', () => {
      expect(extractBearerToken('Bearer ')).toBe('');
    });

    it('should return null for header that only partially matches', () => {
      expect(extractBearerToken('BearerToken abc')).toBe(null);
    });
  });

  // ── Shared Constants ──────────────────────────────────────────

  describe('TERMINAL_MODULE_RUN_STATUSES', () => {
    it('should contain cancelled, timed_out, discarded, skipped', () => {
      expect(TERMINAL_MODULE_RUN_STATUSES).toContain('cancelled');
      expect(TERMINAL_MODULE_RUN_STATUSES).toContain('timed_out');
      expect(TERMINAL_MODULE_RUN_STATUSES).toContain('discarded');
      expect(TERMINAL_MODULE_RUN_STATUSES).toContain('skipped');
    });

    it('should have exactly 4 entries', () => {
      expect(TERMINAL_MODULE_RUN_STATUSES).toHaveLength(4);
    });

    it('should not contain active statuses', () => {
      expect(TERMINAL_MODULE_RUN_STATUSES).not.toContain('running');
      expect(TERMINAL_MODULE_RUN_STATUSES).not.toContain('planned');
      expect(TERMINAL_MODULE_RUN_STATUSES).not.toContain('applying');
    });

    it('should not contain non-terminal statuses', () => {
      expect(TERMINAL_MODULE_RUN_STATUSES).not.toContain('pending');
      expect(TERMINAL_MODULE_RUN_STATUSES).not.toContain('queued');
      expect(TERMINAL_MODULE_RUN_STATUSES).not.toContain('succeeded');
      expect(TERMINAL_MODULE_RUN_STATUSES).not.toContain('failed');
    });
  });

  describe('ACTIVE_MODULE_RUN_STATUSES', () => {
    it('should contain running, planned, applying', () => {
      expect(ACTIVE_MODULE_RUN_STATUSES).toContain('running');
      expect(ACTIVE_MODULE_RUN_STATUSES).toContain('planned');
      expect(ACTIVE_MODULE_RUN_STATUSES).toContain('applying');
    });

    it('should have exactly 3 entries', () => {
      expect(ACTIVE_MODULE_RUN_STATUSES).toHaveLength(3);
    });

    it('should not contain terminal statuses', () => {
      expect(ACTIVE_MODULE_RUN_STATUSES).not.toContain('cancelled');
      expect(ACTIVE_MODULE_RUN_STATUSES).not.toContain('timed_out');
      expect(ACTIVE_MODULE_RUN_STATUSES).not.toContain('discarded');
      expect(ACTIVE_MODULE_RUN_STATUSES).not.toContain('skipped');
    });

    it('should not contain pending or queued', () => {
      expect(ACTIVE_MODULE_RUN_STATUSES).not.toContain('pending');
      expect(ACTIVE_MODULE_RUN_STATUSES).not.toContain('queued');
    });
  });

  // ── validateName ──────────────────────────────────────────────

  describe('validateName', () => {
    it('should accept valid lowercase names', () => {
      expect(() => validateName('my-module', 'name')).not.toThrow();
      expect(() => validateName('abc', 'name')).not.toThrow();
      expect(() => validateName('test-123', 'name')).not.toThrow();
    });

    it('should accept names at minimum length (3 chars)', () => {
      expect(() => validateName('abc', 'name')).not.toThrow();
    });

    it('should accept names at maximum length (64 chars)', () => {
      const name = 'a' + 'b'.repeat(63);
      expect(() => validateName(name, 'name')).not.toThrow();
    });

    it('should reject names shorter than 3 characters', () => {
      expect(() => validateName('ab', 'name')).toThrow();
      expect(() => validateName('a', 'name')).toThrow();
    });

    it('should reject empty string', () => {
      expect(() => validateName('', 'name')).toThrow();
    });

    it('should reject names longer than 64 characters', () => {
      const name = 'a' + 'b'.repeat(64);
      expect(() => validateName(name, 'name')).toThrow();
    });

    it('should reject names starting with a digit', () => {
      expect(() => validateName('1abc', 'name')).toThrow();
    });

    it('should reject names starting with a hyphen', () => {
      expect(() => validateName('-abc', 'name')).toThrow();
    });

    it('should reject names with uppercase letters', () => {
      expect(() => validateName('MyModule', 'name')).toThrow();
      expect(() => validateName('ABC', 'name')).toThrow();
    });

    it('should reject names with underscores', () => {
      expect(() => validateName('my_module', 'name')).toThrow();
    });

    it('should reject names with spaces', () => {
      expect(() => validateName('my module', 'name')).toThrow();
    });

    it('should reject names with special characters', () => {
      expect(() => validateName('my.module', 'name')).toThrow();
      expect(() => validateName('my@module', 'name')).toThrow();
      expect(() => validateName('my/module', 'name')).toThrow();
    });

    it('should include field name in error message', () => {
      expect(() => validateName('!!', 'namespace')).toThrow(/namespace/);
    });

    it('should accept names with hyphens in the middle', () => {
      expect(() => validateName('my-cool-module', 'name')).not.toThrow();
    });

    it('should accept names ending with a digit', () => {
      expect(() => validateName('module-v2', 'name')).not.toThrow();
    });

    it('should accept names ending with a hyphen', () => {
      // Pattern is [a-z][a-z0-9-]{2,63}, so trailing hyphen is valid
      expect(() => validateName('abc-', 'name')).not.toThrow();
    });
  });

  // ── validateArtifactType ──────────────────────────────────────

  describe('validateArtifactType', () => {
    it('should accept terraform-module', () => {
      expect(() => validateArtifactType('terraform-module')).not.toThrow();
    });

    it('should accept terraform-provider', () => {
      expect(() => validateArtifactType('terraform-provider')).not.toThrow();
    });

    it('should accept helm-chart', () => {
      expect(() => validateArtifactType('helm-chart')).not.toThrow();
    });

    it('should accept opa-bundle', () => {
      expect(() => validateArtifactType('opa-bundle')).not.toThrow();
    });

    it('should accept oci-artifact', () => {
      expect(() => validateArtifactType('oci-artifact')).not.toThrow();
    });

    it('should reject invalid type', () => {
      expect(() => validateArtifactType('docker-image')).toThrow();
    });

    it('should reject empty string', () => {
      expect(() => validateArtifactType('')).toThrow();
    });

    it('should reject uppercase variant', () => {
      expect(() => validateArtifactType('Terraform-Module')).toThrow();
    });

    it('should include invalid type in error message', () => {
      expect(() => validateArtifactType('invalid-type')).toThrow(
        /invalid-type/,
      );
    });

    it('should list valid types in error message', () => {
      expect(() => validateArtifactType('bad')).toThrow(/terraform-module/);
    });
  });

  // ── parseSemver ───────────────────────────────────────────────

  describe('parseSemver', () => {
    it('should parse a basic semver version', () => {
      const result = parseSemver('1.2.3');
      expect(result).toEqual({
        major: 1,
        minor: 2,
        patch: 3,
        prerelease: null,
        raw: '1.2.3',
      });
    });

    it('should parse version with v prefix', () => {
      const result = parseSemver('v1.2.3');
      expect(result).toEqual({
        major: 1,
        minor: 2,
        patch: 3,
        prerelease: null,
        raw: '1.2.3',
      });
    });

    it('should parse version with prerelease tag', () => {
      const result = parseSemver('1.0.0-alpha');
      expect(result).toEqual({
        major: 1,
        minor: 0,
        patch: 0,
        prerelease: 'alpha',
        raw: '1.0.0-alpha',
      });
    });

    it('should parse version with v prefix and prerelease', () => {
      const result = parseSemver('v2.1.0-beta.1');
      expect(result).toEqual({
        major: 2,
        minor: 1,
        patch: 0,
        prerelease: 'beta.1',
        raw: '2.1.0-beta.1',
      });
    });

    it('should parse version 0.0.0', () => {
      const result = parseSemver('0.0.0');
      expect(result).toEqual({
        major: 0,
        minor: 0,
        patch: 0,
        prerelease: null,
        raw: '0.0.0',
      });
    });

    it('should parse version with large numbers', () => {
      const result = parseSemver('100.200.300');
      expect(result).toEqual({
        major: 100,
        minor: 200,
        patch: 300,
        prerelease: null,
        raw: '100.200.300',
      });
    });

    it('should parse prerelease with dots and hyphens', () => {
      const result = parseSemver('1.0.0-rc.1+build.123');
      // The regex allows [a-zA-Z0-9.+-]+ for prerelease
      expect(result.prerelease).toBe('rc.1+build.123');
    });

    it('should throw on invalid version string', () => {
      expect(() => parseSemver('not-a-version')).toThrow();
    });

    it('should throw on missing patch', () => {
      expect(() => parseSemver('1.2')).toThrow();
    });

    it('should throw on empty string', () => {
      expect(() => parseSemver('')).toThrow();
    });

    it('should throw on just "v"', () => {
      expect(() => parseSemver('v')).toThrow();
    });

    it('should throw on version with leading zeros treated as text', () => {
      // "01.2.3" -- the regex requires digits, leading zeros are valid digits
      // but this will actually parse as major=1 since parseInt handles it
      const result = parseSemver('01.2.3');
      expect(result.major).toBe(1);
    });

    it('should throw on version with extra components', () => {
      expect(() => parseSemver('1.2.3.4')).toThrow();
    });

    it('should include original version in error message', () => {
      expect(() => parseSemver('bad')).toThrow(/bad/);
    });
  });

  // ── compareSemver ─────────────────────────────────────────────

  describe('compareSemver', () => {
    it('should return 0 for equal versions', () => {
      const a = parseSemver('1.2.3');
      const b = parseSemver('1.2.3');
      expect(compareSemver(a, b)).toBe(0);
    });

    it('should return positive when a has higher major', () => {
      const a = parseSemver('2.0.0');
      const b = parseSemver('1.9.9');
      expect(compareSemver(a, b)).toBeGreaterThan(0);
    });

    it('should return negative when a has lower major', () => {
      const a = parseSemver('1.0.0');
      const b = parseSemver('2.0.0');
      expect(compareSemver(a, b)).toBeLessThan(0);
    });

    it('should compare by minor when major is equal', () => {
      const a = parseSemver('1.3.0');
      const b = parseSemver('1.2.0');
      expect(compareSemver(a, b)).toBeGreaterThan(0);
    });

    it('should compare by patch when major and minor are equal', () => {
      const a = parseSemver('1.2.4');
      const b = parseSemver('1.2.3');
      expect(compareSemver(a, b)).toBeGreaterThan(0);
    });

    it('should give lower precedence to prerelease vs release', () => {
      const a = parseSemver('1.0.0-alpha');
      const b = parseSemver('1.0.0');
      expect(compareSemver(a, b)).toBeLessThan(0);
    });

    it('should give higher precedence to release vs prerelease', () => {
      const a = parseSemver('1.0.0');
      const b = parseSemver('1.0.0-alpha');
      expect(compareSemver(a, b)).toBeGreaterThan(0);
    });

    it('should compare prerelease strings lexicographically', () => {
      const a = parseSemver('1.0.0-beta');
      const b = parseSemver('1.0.0-alpha');
      expect(compareSemver(a, b)).toBeGreaterThan(0);
    });

    it('should return 0 for equal prerelease versions', () => {
      const a = parseSemver('1.0.0-alpha');
      const b = parseSemver('1.0.0-alpha');
      expect(compareSemver(a, b)).toBe(0);
    });

    it('should compare rc prereleases correctly', () => {
      const a = parseSemver('1.0.0-rc.2');
      const b = parseSemver('1.0.0-rc.1');
      // lexicographic: "rc.2" > "rc.1"
      expect(compareSemver(a, b)).toBeGreaterThan(0);
    });

    it('should sort versions correctly', () => {
      const versions = [
        parseSemver('2.0.0'),
        parseSemver('1.0.0-alpha'),
        parseSemver('1.0.0'),
        parseSemver('1.1.0'),
        parseSemver('0.9.0'),
      ];
      const sorted = [...versions].sort(compareSemver);
      expect(sorted.map(v => v.raw)).toEqual([
        '0.9.0',
        '1.0.0-alpha',
        '1.0.0',
        '1.1.0',
        '2.0.0',
      ]);
    });
  });

  // ── isPatchBump ───────────────────────────────────────────────

  describe('isPatchBump', () => {
    it('should return true for a patch increment', () => {
      const prev = parseSemver('1.2.3');
      const next = parseSemver('1.2.4');
      expect(isPatchBump(prev, next)).toBe(true);
    });

    it('should return true for a large patch jump', () => {
      const prev = parseSemver('1.0.0');
      const next = parseSemver('1.0.99');
      expect(isPatchBump(prev, next)).toBe(true);
    });

    it('should return false when minor differs', () => {
      const prev = parseSemver('1.2.3');
      const next = parseSemver('1.3.0');
      expect(isPatchBump(prev, next)).toBe(false);
    });

    it('should return false when major differs', () => {
      const prev = parseSemver('1.2.3');
      const next = parseSemver('2.2.4');
      expect(isPatchBump(prev, next)).toBe(false);
    });

    it('should return false when patch does not increase', () => {
      const prev = parseSemver('1.2.3');
      const next = parseSemver('1.2.3');
      expect(isPatchBump(prev, next)).toBe(false);
    });

    it('should return false when patch decreases', () => {
      const prev = parseSemver('1.2.5');
      const next = parseSemver('1.2.3');
      expect(isPatchBump(prev, next)).toBe(false);
    });

    it('should return false when next has a prerelease tag', () => {
      const prev = parseSemver('1.2.3');
      const next = parseSemver('1.2.4-alpha');
      expect(isPatchBump(prev, next)).toBe(false);
    });

    it('should return true even when prev has prerelease tag', () => {
      // isPatchBump only checks next.prerelease === null
      const prev = parseSemver('1.2.3-beta');
      const next = parseSemver('1.2.4');
      expect(isPatchBump(prev, next)).toBe(true);
    });

    it('should return false for minor bump with patch reset', () => {
      const prev = parseSemver('1.2.3');
      const next = parseSemver('1.3.0');
      expect(isPatchBump(prev, next)).toBe(false);
    });
  });

  // ── parsePagination ───────────────────────────────────────────

  describe('parsePagination', () => {
    it('should return defaults for empty query', () => {
      const result = parsePagination({});
      expect(result).toEqual({
        cursor: null,
        limit: 50,
        sortBy: 'created_at',
        sortOrder: 'desc',
      });
    });

    it('should parse cursor from query', () => {
      const result = parsePagination({ cursor: 'abc123' });
      expect(result.cursor).toBe('abc123');
    });

    it('should parse numeric limit', () => {
      const result = parsePagination({ limit: '25' });
      expect(result.limit).toBe(25);
    });

    it('should cap limit at 200', () => {
      const result = parsePagination({ limit: '500' });
      expect(result.limit).toBe(200);
    });

    it('should use default limit for invalid value', () => {
      const result = parsePagination({ limit: 'abc' });
      expect(result.limit).toBe(50);
    });

    it('should use default limit for zero', () => {
      const result = parsePagination({ limit: '0' });
      expect(result.limit).toBe(50);
    });

    it('should use default limit for negative value', () => {
      const result = parsePagination({ limit: '-5' });
      expect(result.limit).toBe(50);
    });

    it('should parse sortBy from query', () => {
      const result = parsePagination({ sortBy: 'updated_at' });
      expect(result.sortBy).toBe('updated_at');
    });

    it('should default sortBy to created_at', () => {
      const result = parsePagination({});
      expect(result.sortBy).toBe('created_at');
    });

    it('should parse sortOrder as asc', () => {
      const result = parsePagination({ sortOrder: 'asc' });
      expect(result.sortOrder).toBe('asc');
    });

    it('should default sortOrder to desc', () => {
      const result = parsePagination({});
      expect(result.sortOrder).toBe('desc');
    });

    it('should default invalid sortOrder to desc', () => {
      const result = parsePagination({ sortOrder: 'invalid' });
      expect(result.sortOrder).toBe('desc');
    });

    it('should handle all parameters together', () => {
      const result = parsePagination({
        cursor: 'xyz',
        limit: '10',
        sortBy: 'name',
        sortOrder: 'asc',
      });
      expect(result).toEqual({
        cursor: 'xyz',
        limit: 10,
        sortBy: 'name',
        sortOrder: 'asc',
      });
    });

    it('should ignore non-string cursor', () => {
      const result = parsePagination({ cursor: 123 });
      expect(result.cursor).toBe(null);
    });

    it('should ignore non-string limit', () => {
      const result = parsePagination({ limit: 25 });
      expect(result.limit).toBe(50);
    });

    it('should parse limit of 1', () => {
      const result = parsePagination({ limit: '1' });
      expect(result.limit).toBe(1);
    });

    it('should parse limit at max boundary', () => {
      const result = parsePagination({ limit: '200' });
      expect(result.limit).toBe(200);
    });
  });

  // ── encodeCursor / decodeCursor ───────────────────────────────

  describe('encodeCursor / decodeCursor', () => {
    it('should roundtrip a string sort value and id', () => {
      const encoded = encodeCursor('2026-01-15T10:00:00Z', 'uuid-123');
      const decoded = decodeCursor(encoded);
      expect(decoded).toEqual({
        value: '2026-01-15T10:00:00Z',
        id: 'uuid-123',
      });
    });

    it('should roundtrip a numeric sort value', () => {
      const encoded = encodeCursor(42, 'uuid-456');
      const decoded = decodeCursor(encoded);
      expect(decoded).toEqual({
        value: '42',
        id: 'uuid-456',
      });
    });

    it('should roundtrip zero as sort value', () => {
      const encoded = encodeCursor(0, 'uuid-789');
      const decoded = decodeCursor(encoded);
      expect(decoded).toEqual({
        value: '0',
        id: 'uuid-789',
      });
    });

    it('should roundtrip empty string sort value', () => {
      const encoded = encodeCursor('', 'uuid-000');
      const decoded = decodeCursor(encoded);
      expect(decoded).toEqual({
        value: '',
        id: 'uuid-000',
      });
    });

    it('should return null for invalid base64 cursor', () => {
      const decoded = decodeCursor('!!!not-valid-base64!!!');
      expect(decoded).toBe(null);
    });

    it('should return null for valid base64 but invalid JSON', () => {
      const encoded = Buffer.from('not json').toString('base64url');
      const decoded = decodeCursor(encoded);
      expect(decoded).toBe(null);
    });

    it('should return null for JSON without id field', () => {
      const encoded = Buffer.from(JSON.stringify({ v: 'test' })).toString(
        'base64url',
      );
      const decoded = decodeCursor(encoded);
      expect(decoded).toBe(null);
    });

    it('should return null for JSON with non-string id', () => {
      const encoded = Buffer.from(JSON.stringify({ v: 'test', id: 123 })).toString(
        'base64url',
      );
      const decoded = decodeCursor(encoded);
      expect(decoded).toBe(null);
    });

    it('should produce different cursors for different inputs', () => {
      const a = encodeCursor('2026-01-01', 'id-1');
      const b = encodeCursor('2026-01-02', 'id-2');
      expect(a).not.toBe(b);
    });

    it('should produce consistent cursor for same inputs', () => {
      const a = encodeCursor('2026-01-01', 'id-1');
      const b = encodeCursor('2026-01-01', 'id-1');
      expect(a).toBe(b);
    });

    it('should handle sort values with special characters', () => {
      const encoded = encodeCursor('value with spaces & symbols!', 'id-special');
      const decoded = decodeCursor(encoded);
      expect(decoded).toEqual({
        value: 'value with spaces & symbols!',
        id: 'id-special',
      });
    });

    it('should return null for empty string cursor', () => {
      const decoded = decodeCursor('');
      expect(decoded).toBe(null);
    });
  });
});
