// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import {
  shouldCascade,
  terraformConstraintToSemverRange,
} from '../orchestration/cascadeManager';
import {
  generateCallbackToken,
  verifyCallbackTokenHash,
  extractBearerToken,
  TERMINAL_MODULE_RUN_STATUSES,
  ACTIVE_MODULE_RUN_STATUSES,
} from '../runs/shared';
import {
  buildEnvVarsFromModuleVariables,
  getTfWorkspaceName,
  buildStateBackendConfig,
  resolveModuleVariablesToEnv,
} from '../runs/envVarBuilder';
import type { EnvironmentModuleVariableRow } from '../database/types';

// ─────────────────────────────────────────────────────────────────────────────
// Tests for Phase 3: IaC Environments
// ─────────────────────────────────────────────────────────────────────────────

describe('Registry Backend - Phase 3: IaC Environments', () => {
  // ── Semver Constraint Evaluation ───────────────────────────────

  describe('shouldCascade', () => {
    it('should cascade when pinned_version is null (tracks latest)', () => {
      expect(shouldCascade(null, '1.3.0')).toBe(true);
    });

    it('should cascade on exact version match', () => {
      expect(shouldCascade('1.3.0', '1.3.0')).toBe(true);
    });

    it('should NOT cascade on exact version mismatch', () => {
      expect(shouldCascade('1.2.0', '1.3.0')).toBe(false);
    });

    it('should cascade with pessimistic ~> major.minor constraint matching', () => {
      // ~> 1.2 means >=1.2.0 <2.0.0
      expect(shouldCascade('~> 1.2', '1.3.0')).toBe(true);
      expect(shouldCascade('~> 1.2', '1.9.9')).toBe(true);
    });

    it('should NOT cascade with pessimistic ~> major.minor when major bumps', () => {
      expect(shouldCascade('~> 1.2', '2.0.0')).toBe(false);
    });

    it('should cascade with pessimistic ~> major.minor.patch constraint matching', () => {
      // ~> 1.2.0 means >=1.2.0 <1.3.0
      expect(shouldCascade('~> 1.2.0', '1.2.5')).toBe(true);
    });

    it('should NOT cascade with pessimistic ~> major.minor.patch when minor bumps', () => {
      // ~> 1.2.0 means >=1.2.0 <1.3.0
      expect(shouldCascade('~> 1.2.0', '1.3.0')).toBe(false);
    });

    it('should cascade with >= constraint', () => {
      expect(shouldCascade('>= 1.0', '2.0.0')).toBe(true);
    });

    it('should cascade with range constraint', () => {
      // >= 1.0, < 2.0
      expect(shouldCascade('>= 1.0, < 2.0', '1.5.0')).toBe(true);
      expect(shouldCascade('>= 1.0, < 2.0', '2.0.0')).toBe(false);
    });

    it('should cascade with = prefix exact match', () => {
      expect(shouldCascade('= 1.2.3', '1.2.3')).toBe(true);
      expect(shouldCascade('= 1.2.3', '1.2.4')).toBe(false);
    });

    it('should NOT cascade with invalid constraint string (fallback to exact match)', () => {
      expect(shouldCascade('not-a-version', '1.0.0')).toBe(false);
      expect(shouldCascade('not-a-version', 'not-a-version')).toBe(true);
    });

    it('should cascade null pinned_version regardless of new version', () => {
      expect(shouldCascade(null, '0.0.1')).toBe(true);
      expect(shouldCascade(null, '99.99.99')).toBe(true);
    });

    it('should handle ~> constraint at patch boundary', () => {
      // ~> 2.0.0 means >=2.0.0 <2.1.0
      expect(shouldCascade('~> 2.0.0', '2.0.0')).toBe(true);
      expect(shouldCascade('~> 2.0.0', '2.0.99')).toBe(true);
      expect(shouldCascade('~> 2.0.0', '2.1.0')).toBe(false);
    });

    it('should handle ~> constraint at minor boundary', () => {
      // ~> 0.9 means >=0.9.0 <1.0.0
      expect(shouldCascade('~> 0.9', '0.9.0')).toBe(true);
      expect(shouldCascade('~> 0.9', '0.10.0')).toBe(true);
      expect(shouldCascade('~> 0.9', '1.0.0')).toBe(false);
    });
  });

  describe('terraformConstraintToSemverRange', () => {
    it('should convert ~> major.minor to semver range', () => {
      expect(terraformConstraintToSemverRange('~> 1.2')).toBe(
        '>=1.2.0 <2.0.0',
      );
    });

    it('should convert ~> major.minor.patch to semver range', () => {
      expect(terraformConstraintToSemverRange('~> 1.2.0')).toBe(
        '>=1.2.0 <1.3.0',
      );
    });

    it('should handle = prefix', () => {
      expect(terraformConstraintToSemverRange('= 1.2.3')).toBe('1.2.3');
    });

    it('should handle = prefix without space', () => {
      expect(terraformConstraintToSemverRange('=1.2.3')).toBe('1.2.3');
    });

    it('should pass through plain semver', () => {
      expect(terraformConstraintToSemverRange('1.2.3')).toBe('1.2.3');
    });

    it('should return null for invalid constraints', () => {
      expect(terraformConstraintToSemverRange('not-a-version')).toBe(null);
    });

    it('should handle ~> at major zero boundary', () => {
      expect(terraformConstraintToSemverRange('~> 0.1')).toBe(
        '>=0.1.0 <1.0.0',
      );
    });

    it('should handle ~> with high patch numbers', () => {
      expect(terraformConstraintToSemverRange('~> 3.14.159')).toBe(
        '>=3.14.159 <3.15.0',
      );
    });

    it('should convert >= constraint', () => {
      const result = terraformConstraintToSemverRange('>= 1.0');
      // semver normalizes to a range string; just check it is not null
      expect(result).not.toBeNull();
    });

    it('should handle whitespace trimming', () => {
      expect(terraformConstraintToSemverRange('  ~> 1.2  ')).toBe(
        '>=1.2.0 <2.0.0',
      );
    });
  });

  // ── Callback Token Utilities ──────────────────────────────────

  describe('callback token utilities', () => {
    it('should generate a token and matching hash', () => {
      const { token, tokenHash } = generateCallbackToken();
      expect(token).toHaveLength(69); // "brce_" (5) + 32 bytes hex (64)
      expect(tokenHash).toHaveLength(64); // SHA256 hex
      expect(verifyCallbackTokenHash(token, tokenHash)).toBe(true);
    });

    it('should reject wrong token', () => {
      const { tokenHash } = generateCallbackToken();
      expect(verifyCallbackTokenHash('wrongtoken', tokenHash)).toBe(false);
    });

    it('should reject empty token', () => {
      const { tokenHash } = generateCallbackToken();
      expect(verifyCallbackTokenHash('', tokenHash)).toBe(false);
    });

    it('should generate unique tokens on successive calls', () => {
      const a = generateCallbackToken();
      const b = generateCallbackToken();
      expect(a.token).not.toBe(b.token);
      expect(a.tokenHash).not.toBe(b.tokenHash);
    });

    it('should not verify token against wrong hash', () => {
      const a = generateCallbackToken();
      const b = generateCallbackToken();
      expect(verifyCallbackTokenHash(a.token, b.tokenHash)).toBe(false);
    });

    it('should extract bearer token from header', () => {
      expect(extractBearerToken('Bearer abc123')).toBe('abc123');
      expect(extractBearerToken(undefined)).toBe(null);
      expect(extractBearerToken('Basic abc123')).toBe(null);
      expect(extractBearerToken('')).toBe(null);
    });

    it('should extract bearer token with complex value', () => {
      expect(extractBearerToken('Bearer eyJhbGciOiJIUzI1NiJ9.abc.def')).toBe(
        'eyJhbGciOiJIUzI1NiJ9.abc.def',
      );
    });

    it('should not extract bearer when case does not match', () => {
      expect(extractBearerToken('bearer abc123')).toBe(null);
      expect(extractBearerToken('BEARER abc123')).toBe(null);
    });
  });

  describe('shared constants', () => {
    it('should define terminal module run statuses', () => {
      expect(TERMINAL_MODULE_RUN_STATUSES).toContain('cancelled');
      expect(TERMINAL_MODULE_RUN_STATUSES).toContain('timed_out');
      expect(TERMINAL_MODULE_RUN_STATUSES).toContain('discarded');
      expect(TERMINAL_MODULE_RUN_STATUSES).toContain('skipped');
      expect(TERMINAL_MODULE_RUN_STATUSES).not.toContain('running');
    });

    it('should define active module run statuses', () => {
      expect(ACTIVE_MODULE_RUN_STATUSES).toContain('running');
      expect(ACTIVE_MODULE_RUN_STATUSES).toContain('planned');
      expect(ACTIVE_MODULE_RUN_STATUSES).toContain('applying');
      expect(ACTIVE_MODULE_RUN_STATUSES).not.toContain('pending');
    });
  });

  // ── DAG Topological Sort ──────────────────────────────────────

  describe('DAG topological sort', () => {
    it('should sort linear dependencies correctly', () => {
      // A -> B -> C: execution order should be A, B, C
      const modules = [
        { id: 'a', name: 'vpc' },
        { id: 'b', name: 'subnets' },
        { id: 'c', name: 'eks' },
      ];
      const deps = [
        { module_id: 'b', depends_on_id: 'a' },
        { module_id: 'c', depends_on_id: 'b' },
      ];

      const { sorted } = topoSort(modules, deps);
      expect(sorted.indexOf('a')).toBeLessThan(sorted.indexOf('b'));
      expect(sorted.indexOf('b')).toBeLessThan(sorted.indexOf('c'));
    });

    it('should handle diamond dependencies', () => {
      // A -> B, A -> C, B -> D, C -> D
      const modules = [
        { id: 'a', name: 'vpc' },
        { id: 'b', name: 'subnets' },
        { id: 'c', name: 'sg' },
        { id: 'd', name: 'eks' },
      ];
      const deps = [
        { module_id: 'b', depends_on_id: 'a' },
        { module_id: 'c', depends_on_id: 'a' },
        { module_id: 'd', depends_on_id: 'b' },
        { module_id: 'd', depends_on_id: 'c' },
      ];

      const { sorted } = topoSort(modules, deps);
      expect(sorted[0]).toBe('a');
      expect(sorted.indexOf('b')).toBeLessThan(sorted.indexOf('d'));
      expect(sorted.indexOf('c')).toBeLessThan(sorted.indexOf('d'));
    });

    it('should handle independent modules', () => {
      const modules = [
        { id: 'a', name: 'vpc' },
        { id: 'b', name: 'dns' },
        { id: 'c', name: 'monitoring' },
      ];
      const deps: Array<{ module_id: string; depends_on_id: string }> = [];

      const { sorted } = topoSort(modules, deps);
      expect(sorted).toHaveLength(3);
      expect(new Set(sorted)).toEqual(new Set(['a', 'b', 'c']));
    });

    it('should detect cycles', () => {
      const modules = [
        { id: 'a', name: 'vpc' },
        { id: 'b', name: 'subnets' },
        { id: 'c', name: 'sg' },
      ];
      const deps = [
        { module_id: 'b', depends_on_id: 'a' },
        { module_id: 'c', depends_on_id: 'b' },
        { module_id: 'a', depends_on_id: 'c' }, // cycle!
      ];

      expect(() => topoSort(modules, deps)).toThrow(/cycle/i);
    });

    it('should handle single module with no deps', () => {
      const modules = [{ id: 'a', name: 'vpc' }];
      const deps: Array<{ module_id: string; depends_on_id: string }> = [];

      const { sorted } = topoSort(modules, deps);
      expect(sorted).toEqual(['a']);
    });

    it('should handle wide fan-out', () => {
      // A -> B, A -> C, A -> D, A -> E
      const modules = [
        { id: 'a', name: 'root' },
        { id: 'b', name: 'b' },
        { id: 'c', name: 'c' },
        { id: 'd', name: 'd' },
        { id: 'e', name: 'e' },
      ];
      const deps = [
        { module_id: 'b', depends_on_id: 'a' },
        { module_id: 'c', depends_on_id: 'a' },
        { module_id: 'd', depends_on_id: 'a' },
        { module_id: 'e', depends_on_id: 'a' },
      ];

      const { sorted } = topoSort(modules, deps);
      expect(sorted[0]).toBe('a');
      expect(sorted).toHaveLength(5);
    });

    it('should handle wide fan-in', () => {
      // B -> D, C -> D, A -> D
      const modules = [
        { id: 'a', name: 'a' },
        { id: 'b', name: 'b' },
        { id: 'c', name: 'c' },
        { id: 'd', name: 'sink' },
      ];
      const deps = [
        { module_id: 'd', depends_on_id: 'a' },
        { module_id: 'd', depends_on_id: 'b' },
        { module_id: 'd', depends_on_id: 'c' },
      ];

      const { sorted } = topoSort(modules, deps);
      expect(sorted[sorted.length - 1]).toBe('d');
    });

    it('should detect self-cycle', () => {
      const modules = [{ id: 'a', name: 'vpc' }];
      const deps = [{ module_id: 'a', depends_on_id: 'a' }];

      expect(() => topoSort(modules, deps)).toThrow(/cycle/i);
    });
  });

  // ── Output Resolver ───────────────────────────────────────────

  describe('output resolution', () => {
    it('should map upstream outputs to downstream variables', () => {
      const upstreamOutputs = {
        vpc_id: 'vpc-abc123',
        private_subnet_ids: ['subnet-1', 'subnet-2'],
      };

      const mapping = [
        { upstream_output: 'vpc_id', downstream_variable: 'vpc_id' },
        {
          upstream_output: 'private_subnet_ids',
          downstream_variable: 'subnet_ids',
        },
      ];

      const resolved = resolveOutputMapping(upstreamOutputs, mapping);
      expect(resolved).toEqual({
        vpc_id: 'vpc-abc123',
        subnet_ids: ['subnet-1', 'subnet-2'],
      });
    });

    it('should throw when upstream output key is missing', () => {
      const upstreamOutputs = { vpc_id: 'vpc-abc123' };
      const mapping = [
        { upstream_output: 'missing_key', downstream_variable: 'vpc_id' },
      ];

      expect(() => resolveOutputMapping(upstreamOutputs, mapping)).toThrow(
        /missing_key.*not found/i,
      );
    });

    it('should return empty object when no mapping', () => {
      const resolved = resolveOutputMapping({ vpc_id: 'vpc-abc123' }, []);
      expect(resolved).toEqual({});
    });

    it('should handle mapping with nested objects', () => {
      const upstreamOutputs = {
        config: { host: 'db.example.com', port: 5432 },
      };
      const mapping = [
        { upstream_output: 'config', downstream_variable: 'db_config' },
      ];
      const resolved = resolveOutputMapping(upstreamOutputs, mapping);
      expect(resolved).toEqual({
        db_config: { host: 'db.example.com', port: 5432 },
      });
    });

    it('should handle mapping with null upstream value', () => {
      const upstreamOutputs = { vpc_id: null };
      const mapping = [
        { upstream_output: 'vpc_id', downstream_variable: 'vpc_id' },
      ];
      const resolved = resolveOutputMapping(upstreamOutputs, mapping);
      expect(resolved).toEqual({ vpc_id: null });
    });

    it('should include available keys in error message', () => {
      const upstreamOutputs = { vpc_id: 'vpc-123', subnet_id: 'sub-456' };
      const mapping = [
        { upstream_output: 'missing_key', downstream_variable: 'x' },
      ];
      try {
        resolveOutputMapping(upstreamOutputs, mapping);
        fail('Expected error');
      } catch (err: any) {
        expect(err.message).toContain('vpc_id');
        expect(err.message).toContain('subnet_id');
      }
    });
  });

  // ── Environment Variable Builder ──────────────────────────────

  describe('envVarBuilder', () => {
    const makeVar = (
      overrides: Partial<EnvironmentModuleVariableRow>,
    ): EnvironmentModuleVariableRow => ({
      id: 'var-1',
      module_id: 'mod-1',
      key: 'test_key',
      value: 'test_value',
      sensitive: false,
      hcl: false,
      category: 'terraform',
      description: null,
      secret_ref: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      ...overrides,
    });

    it('should convert terraform variables to TF_VAR_ prefix', () => {
      const vars = [
        makeVar({
          key: 'region',
          value: 'us-east-1',
          category: 'terraform',
        }),
      ];
      const result = buildEnvVarsFromModuleVariables(vars);
      expect(result['TF_VAR_region']).toEqual({
        source: 'literal',
        value: 'us-east-1',
      });
    });

    it('should pass env vars without prefix', () => {
      const vars = [
        makeVar({
          key: 'AWS_REGION',
          value: 'us-east-1',
          category: 'env',
        }),
      ];
      const result = buildEnvVarsFromModuleVariables(vars);
      expect(result['AWS_REGION']).toEqual({
        source: 'literal',
        value: 'us-east-1',
      });
    });

    it('should use secret refs for sensitive vars', () => {
      const vars = [
        makeVar({
          key: 'db_password',
          value: null,
          sensitive: true,
          category: 'terraform',
          secret_ref: 'my-ns/db-secret:password',
        }),
      ];
      const result = buildEnvVarsFromModuleVariables(vars);
      expect(result['TF_VAR_db_password']).toEqual({
        source: 'secret',
        ref: 'my-ns/db-secret',
        key: 'password',
      });
    });

    it('should use key name as secret key when no colon in secret_ref', () => {
      const vars = [
        makeVar({
          key: 'api_key',
          value: null,
          sensitive: true,
          category: 'terraform',
          secret_ref: 'my-ns/api-secret',
        }),
      ];
      const result = buildEnvVarsFromModuleVariables(vars);
      expect(result['TF_VAR_api_key']).toEqual({
        source: 'secret',
        ref: 'my-ns/api-secret',
        key: 'api_key',
      });
    });

    it('should handle empty value as empty string', () => {
      const vars = [
        makeVar({
          key: 'empty_var',
          value: null,
          sensitive: false,
          category: 'terraform',
        }),
      ];
      const result = buildEnvVarsFromModuleVariables(vars);
      expect(result['TF_VAR_empty_var']).toEqual({
        source: 'literal',
        value: '',
      });
    });

    it('should handle multiple variables', () => {
      const vars = [
        makeVar({ key: 'region', value: 'us-east-1', category: 'terraform' }),
        makeVar({ key: 'AWS_PROFILE', value: 'prod', category: 'env' }),
        makeVar({
          key: 'token',
          value: null,
          sensitive: true,
          category: 'env',
          secret_ref: 'ns/secret:token',
        }),
      ];
      const result = buildEnvVarsFromModuleVariables(vars);
      expect(Object.keys(result)).toHaveLength(3);
      expect(result['TF_VAR_region']).toBeDefined();
      expect(result['AWS_PROFILE']).toBeDefined();
      expect(result['token']).toBeDefined();
    });

    it('should generate correct workspace name', () => {
      expect(getTfWorkspaceName('env-123', 'mod-456')).toBe(
        'env-env-123-mod-mod-456',
      );
    });

    it('should generate unique workspace names for different environments', () => {
      const ws1 = getTfWorkspaceName('env-aaa', 'mod-bbb');
      const ws2 = getTfWorkspaceName('env-ccc', 'mod-bbb');
      expect(ws1).not.toBe(ws2);
    });
  });

  describe('resolveModuleVariablesToEnv', () => {
    const makeVar = (
      overrides: Partial<EnvironmentModuleVariableRow>,
    ): EnvironmentModuleVariableRow => ({
      id: 'var-1',
      module_id: 'mod-1',
      key: 'test_key',
      value: 'test_value',
      sensitive: false,
      hcl: false,
      category: 'terraform',
      description: null,
      secret_ref: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      ...overrides,
    });

    it('should resolve terraform vars with TF_VAR_ prefix as literal', () => {
      const vars = [
        makeVar({ key: 'region', value: 'us-west-2', category: 'terraform' }),
      ];
      const result = resolveModuleVariablesToEnv(vars);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ name: 'TF_VAR_region', value: 'us-west-2' });
    });

    it('should resolve env vars without prefix', () => {
      const vars = [
        makeVar({ key: 'HOME', value: '/root', category: 'env' }),
      ];
      const result = resolveModuleVariablesToEnv(vars);
      expect(result[0]).toEqual({ name: 'HOME', value: '/root' });
    });

    it('should resolve sensitive vars as secretKeyRef', () => {
      const vars = [
        makeVar({
          key: 'db_pass',
          sensitive: true,
          value: null,
          category: 'terraform',
          secret_ref: 'default/my-secret:password',
        }),
      ];
      const result = resolveModuleVariablesToEnv(vars);
      expect(result[0]).toEqual({
        name: 'TF_VAR_db_pass',
        valueFrom: {
          secretKeyRef: {
            name: 'my-secret',
            key: 'password',
          },
        },
      });
    });

    it('should handle secret_ref without namespace', () => {
      const vars = [
        makeVar({
          key: 'api_key',
          sensitive: true,
          value: null,
          category: 'env',
          secret_ref: 'api-secret:key',
        }),
      ];
      const result = resolveModuleVariablesToEnv(vars);
      expect(result[0]).toEqual({
        name: 'api_key',
        valueFrom: {
          secretKeyRef: {
            name: 'api-secret',
            key: 'key',
          },
        },
      });
    });
  });

  describe('buildStateBackendConfig', () => {
    it('should return null when no backend provided', () => {
      const result = buildStateBackendConfig(null, {
        mode: 'peaas',
        environmentId: 'env-1',
        moduleId: 'mod-1',
      });
      expect(result).toBeNull();
    });

    it('should return null when undefined backend', () => {
      const result = buildStateBackendConfig(undefined, {
        mode: 'peaas',
        environmentId: 'env-1',
        moduleId: 'mod-1',
      });
      expect(result).toBeNull();
    });

    it('should generate pg config for peaas mode', () => {
      const result = buildStateBackendConfig(
        { type: 'pg' },
        {
          mode: 'peaas',
          environmentId: 'env-1',
          moduleId: 'mod-1',
        },
      );
      expect(result).toEqual({
        type: 'pg',
        config: {
          schema_name: 'butler_tfstate',
        },
      });
    });

    it('should use custom schema name for peaas pg', () => {
      const result = buildStateBackendConfig(
        { type: 'pg' },
        {
          mode: 'peaas',
          environmentId: 'env-1',
          moduleId: 'mod-1',
          pgSchemaName: 'custom_schema',
        },
      );
      expect(result!.config.schema_name).toBe('custom_schema');
    });

    it('should pass through s3 config for byoc mode', () => {
      const result = buildStateBackendConfig(
        {
          type: 's3',
          config: { bucket: 'my-bucket', region: 'us-east-1' },
        },
        {
          mode: 'byoc',
          environmentId: 'env-1',
          moduleId: 'mod-1',
        },
      );
      expect(result).toEqual({
        type: 's3',
        config: { bucket: 'my-bucket', region: 'us-east-1' },
      });
    });

    it('should handle backend with no config', () => {
      const result = buildStateBackendConfig(
        { type: 'gcs' },
        {
          mode: 'byoc',
          environmentId: 'env-1',
          moduleId: 'mod-1',
        },
      );
      expect(result).toEqual({
        type: 'gcs',
        config: {},
      });
    });
  });

  // ── Failure Propagation ───────────────────────────────────────

  describe('failure propagation in DAG', () => {
    it('should skip transitive dependents when upstream fails', () => {
      // A fails, B depends on A, C depends on A, D depends on B and C, E is independent
      const graph = buildTestGraph();
      const results = simulateFailurePropagation(graph, 'a');

      expect(results.get('b')).toBe('skipped');
      expect(results.get('c')).toBe('skipped');
      expect(results.get('d')).toBe('skipped');
      expect(results.get('e')).toBe('unaffected');
    });

    it('should not affect independent modules', () => {
      const graph = buildTestGraph();
      const results = simulateFailurePropagation(graph, 'a');
      expect(results.get('e')).toBe('unaffected');
    });

    it('should not affect upstream modules when downstream fails', () => {
      const graph = buildTestGraph();
      const results = simulateFailurePropagation(graph, 'd');
      // d has no downstream, so nothing gets skipped
      expect(results.get('a')).toBe('unaffected');
      expect(results.get('b')).toBe('unaffected');
      expect(results.get('c')).toBe('unaffected');
      expect(results.get('e')).toBe('unaffected');
    });

    it('should skip only branch when a middle node fails', () => {
      const graph = buildTestGraph();
      const results = simulateFailurePropagation(graph, 'b');
      // b -> d, so d is skipped. a, c, e are unaffected
      expect(results.get('d')).toBe('skipped');
      expect(results.get('a')).toBe('unaffected');
      expect(results.get('c')).toBe('unaffected');
      expect(results.get('e')).toBe('unaffected');
    });

    it('should handle failure of an independent module', () => {
      const graph = buildTestGraph();
      const results = simulateFailurePropagation(graph, 'e');
      // e is independent, nobody depends on it
      expect(results.get('a')).toBe('unaffected');
      expect(results.get('b')).toBe('unaffected');
      expect(results.get('c')).toBe('unaffected');
      expect(results.get('d')).toBe('unaffected');
    });

    it('should handle long chains', () => {
      const graph = {
        modules: ['a', 'b', 'c', 'd', 'e'],
        deps: [
          { from: 'a', to: 'b' },
          { from: 'b', to: 'c' },
          { from: 'c', to: 'd' },
          { from: 'd', to: 'e' },
        ],
      };
      const results = simulateFailurePropagation(graph, 'a');
      expect(results.get('b')).toBe('skipped');
      expect(results.get('c')).toBe('skipped');
      expect(results.get('d')).toBe('skipped');
      expect(results.get('e')).toBe('skipped');
    });
  });

  // ── Queue Management ──────────────────────────────────────────

  describe('queue management logic', () => {
    it('should start first run immediately when no active run exists', () => {
      const queue = new RunQueue();
      const run1 = queue.enqueue('mod-1', 'user');
      expect(run1.status).toBe('queued');
      expect(run1.queuePosition).toBe(null);
    });

    it('should assign queue position when active run exists', () => {
      const queue = new RunQueue();
      const run1 = queue.enqueue('mod-1', 'user');
      expect(run1.status).toBe('queued');
      expect(run1.queuePosition).toBe(null);

      const run2 = queue.enqueue('mod-1', 'user');
      expect(run2.status).toBe('pending');
      expect(run2.queuePosition).toBe(1);
    });

    it('should dequeue user runs before cascade runs', () => {
      const queue = new RunQueue();
      queue.enqueue('mod-1', 'user'); // active
      queue.enqueue('mod-1', 'cascade'); // queued #1
      queue.enqueue('mod-1', 'user'); // queued #2

      queue.completeActive('mod-1');
      const next = queue.getActive('mod-1');

      // User priority should be dequeued first
      expect(next?.priority).toBe('user');
    });

    it('should cancel older cascade runs when new cascade arrives (latest-wins)', () => {
      const queue = new RunQueue();
      queue.enqueue('mod-1', 'user'); // active
      queue.enqueue('mod-1', 'cascade');
      queue.enqueue('mod-1', 'cascade');

      // Latest-wins: older cascade should have been replaced
      expect(queue.getQueuedCount('mod-1')).toBe(1);
    });

    it('should not cancel user runs when cascade arrives', () => {
      const queue = new RunQueue();
      queue.enqueue('mod-1', 'user'); // active
      queue.enqueue('mod-1', 'user'); // queued #1
      queue.enqueue('mod-1', 'cascade'); // queued #2

      // Both user and cascade should be in queue
      expect(queue.getQueuedCount('mod-1')).toBe(2);
    });

    it('should track separate queues per module', () => {
      const queue = new RunQueue();
      const run1 = queue.enqueue('mod-1', 'user');
      const run2 = queue.enqueue('mod-2', 'user');

      // Both should be active (different modules)
      expect(run1.status).toBe('queued');
      expect(run2.status).toBe('queued');
      expect(run1.queuePosition).toBe(null);
      expect(run2.queuePosition).toBe(null);
    });

    it('should properly dequeue after completion', () => {
      const queue = new RunQueue();
      queue.enqueue('mod-1', 'user'); // active
      queue.enqueue('mod-1', 'user'); // queued #1
      queue.enqueue('mod-1', 'user'); // queued #2

      queue.completeActive('mod-1');
      expect(queue.getActive('mod-1')).not.toBeNull();

      queue.completeActive('mod-1');
      expect(queue.getActive('mod-1')).not.toBeNull();

      queue.completeActive('mod-1');
      expect(queue.getActive('mod-1')).toBeNull();
    });

    it('should not dequeue from an empty queue', () => {
      const queue = new RunQueue();
      queue.completeActive('mod-1');
      expect(queue.getActive('mod-1')).toBeNull();
    });

    it('should handle cascade latest-wins with no preceding cascade', () => {
      const queue = new RunQueue();
      queue.enqueue('mod-1', 'user'); // active
      const cascade = queue.enqueue('mod-1', 'cascade');

      // Only one cascade in queue, should not be cancelled
      expect(queue.getQueuedCount('mod-1')).toBe(1);
      expect(cascade.status).toBe('pending');
    });

    it('should maintain FIFO order within same priority', () => {
      const queue = new RunQueue();
      queue.enqueue('mod-1', 'user'); // active
      const run2 = queue.enqueue('mod-1', 'user'); // queued #1
      queue.enqueue('mod-1', 'user'); // queued #2

      queue.completeActive('mod-1');
      const next = queue.getActive('mod-1');
      expect(next?.id).toBe(run2.id);
    });
  });

  // ── Module Run Lifecycle ──────────────────────────────────────

  describe('module run lifecycle state machine', () => {
    it('should model the standard plan lifecycle', () => {
      // pending -> queued -> running -> planned -> (confirm) -> applying -> succeeded
      const validTransitions: Record<string, string[]> = {
        pending: ['queued', 'cancelled', 'skipped'],
        queued: ['running', 'cancelled'],
        running: ['planned', 'failed', 'cancelled', 'timed_out'],
        planned: ['confirmed', 'discarded', 'cancelled'],
        confirmed: ['applying', 'cancelled'],
        applying: ['succeeded', 'failed', 'timed_out'],
        succeeded: [],
        failed: [],
        cancelled: [],
        timed_out: [],
        discarded: [],
        skipped: [],
      };

      // Verify all terminal states have no transitions
      for (const terminal of [
        'succeeded',
        'failed',
        'cancelled',
        'timed_out',
        'discarded',
        'skipped',
      ]) {
        expect(validTransitions[terminal]).toEqual([]);
      }

      // Verify plan lifecycle path exists
      expect(validTransitions['pending']).toContain('queued');
      expect(validTransitions['queued']).toContain('running');
      expect(validTransitions['running']).toContain('planned');
      expect(validTransitions['planned']).toContain('confirmed');
      expect(validTransitions['confirmed']).toContain('applying');
      expect(validTransitions['applying']).toContain('succeeded');
    });

    it('should validate that all ModuleRunStatus values are accounted for', () => {
      const allStatuses: string[] = [
        'pending',
        'queued',
        'running',
        'planned',
        'confirmed',
        'applying',
        'succeeded',
        'failed',
        'cancelled',
        'timed_out',
        'discarded',
        'skipped',
      ];

      // Terminal statuses should be a subset of all statuses
      for (const status of TERMINAL_MODULE_RUN_STATUSES) {
        expect(allStatuses).toContain(status);
      }

      // Active statuses should be a subset of all statuses
      for (const status of ACTIVE_MODULE_RUN_STATUSES) {
        expect(allStatuses).toContain(status);
      }
    });
  });

  // ── Environment Run DAG Traversal ─────────────────────────────

  describe('environment run DAG traversal', () => {
    it('should identify root modules (no dependencies) for initial execution', () => {
      const modules = [
        { id: 'vpc', name: 'vpc' },
        { id: 'subnets', name: 'subnets' },
        { id: 'eks', name: 'eks' },
        { id: 'monitoring', name: 'monitoring' },
      ];
      const deps = [
        { module_id: 'subnets', depends_on_id: 'vpc' },
        { module_id: 'eks', depends_on_id: 'subnets' },
      ];

      const inDegree = computeInDegree(modules, deps);
      const roots = modules.filter(m => (inDegree.get(m.id) ?? 0) === 0);

      // vpc and monitoring have no deps
      const rootIds = roots.map(r => r.id);
      expect(rootIds).toContain('vpc');
      expect(rootIds).toContain('monitoring');
      expect(rootIds).not.toContain('subnets');
      expect(rootIds).not.toContain('eks');
    });

    it('should identify leaf modules (no dependents)', () => {
      const modules = [
        { id: 'vpc', name: 'vpc' },
        { id: 'subnets', name: 'subnets' },
        { id: 'eks', name: 'eks' },
      ];
      const deps = [
        { module_id: 'subnets', depends_on_id: 'vpc' },
        { module_id: 'eks', depends_on_id: 'subnets' },
      ];

      const outDegree = computeOutDegree(modules, deps);
      const leaves = modules.filter(m => (outDegree.get(m.id) ?? 0) === 0);

      expect(leaves.map(l => l.id)).toContain('eks');
      expect(leaves.map(l => l.id)).not.toContain('vpc');
    });

    it('should map environment operation to module operation', () => {
      expect(mapOperation('plan-all')).toBe('plan');
      expect(mapOperation('apply-all')).toBe('apply');
      expect(mapOperation('destroy-all')).toBe('destroy');
      expect(mapOperation('unknown')).toBe('plan');
    });
  });

  // ── Output Passing (tf_outputs) ───────────────────────────────

  describe('tf_outputs storage and resolution', () => {
    it('should store and retrieve simple output values', () => {
      const outputs: Record<string, unknown> = {
        vpc_id: 'vpc-abc123',
        cluster_name: 'my-cluster',
        node_count: 3,
      };

      // Simulate JSON round-trip (as the DB would do)
      const serialized = JSON.stringify(outputs);
      const deserialized = JSON.parse(serialized);

      expect(deserialized.vpc_id).toBe('vpc-abc123');
      expect(deserialized.cluster_name).toBe('my-cluster');
      expect(deserialized.node_count).toBe(3);
    });

    it('should handle complex output types', () => {
      const outputs: Record<string, unknown> = {
        subnet_ids: ['subnet-1', 'subnet-2', 'subnet-3'],
        tags: { env: 'prod', team: 'infra' },
        config: {
          nested: {
            deep: true,
            list: [1, 2, 3],
          },
        },
      };

      const serialized = JSON.stringify(outputs);
      const deserialized = JSON.parse(serialized);

      expect(deserialized.subnet_ids).toEqual([
        'subnet-1',
        'subnet-2',
        'subnet-3',
      ]);
      expect(deserialized.tags).toEqual({ env: 'prod', team: 'infra' });
      expect(deserialized.config.nested.deep).toBe(true);
    });

    it('should resolve outputs through a dependency chain', () => {
      // Simulate: vpc outputs -> subnets inputs -> eks inputs
      const vpcOutputs = { vpc_id: 'vpc-123', cidr: '10.0.0.0/16' };

      const vpcToSubnetsMapping = [
        { upstream_output: 'vpc_id', downstream_variable: 'vpc_id' },
        { upstream_output: 'cidr', downstream_variable: 'vpc_cidr' },
      ];

      const subnetsInputs = resolveOutputMapping(
        vpcOutputs,
        vpcToSubnetsMapping,
      );
      expect(subnetsInputs).toEqual({
        vpc_id: 'vpc-123',
        vpc_cidr: '10.0.0.0/16',
      });

      // subnets outputs after apply
      const subnetsOutputs = {
        private_subnet_ids: ['subnet-a', 'subnet-b'],
        public_subnet_ids: ['subnet-c'],
      };

      const subnetsToEksMapping = [
        {
          upstream_output: 'private_subnet_ids',
          downstream_variable: 'subnet_ids',
        },
      ];

      const eksInputs = resolveOutputMapping(
        subnetsOutputs,
        subnetsToEksMapping,
      );
      expect(eksInputs).toEqual({
        subnet_ids: ['subnet-a', 'subnet-b'],
      });
    });
  });
});

// ── Test Helpers ─────────────────────────────────────────────────

/**
 * Pure topological sort implementation for testing.
 * Mirrors the algorithm in RegistryDatabase.topologicalSort.
 */
function topoSort(
  modules: Array<{ id: string; name: string }>,
  deps: Array<{ module_id: string; depends_on_id: string }>,
): { sorted: string[] } {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const m of modules) {
    inDegree.set(m.id, 0);
    adjacency.set(m.id, []);
  }

  for (const dep of deps) {
    const current = inDegree.get(dep.module_id) ?? 0;
    inDegree.set(dep.module_id, current + 1);
    const adj = adjacency.get(dep.depends_on_id) ?? [];
    adj.push(dep.module_id);
    adjacency.set(dep.depends_on_id, adj);
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);
    for (const downstream of adjacency.get(current) ?? []) {
      const newDegree = (inDegree.get(downstream) ?? 1) - 1;
      inDegree.set(downstream, newDegree);
      if (newDegree === 0) queue.push(downstream);
    }
  }

  if (sorted.length !== modules.length) {
    throw new Error('Cycle detected in dependency graph');
  }

  return { sorted };
}

/**
 * Resolve output mapping -- pure function for testing.
 */
function resolveOutputMapping(
  upstreamOutputs: Record<string, unknown>,
  mapping: Array<{ upstream_output: string; downstream_variable: string }>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const m of mapping) {
    if (!(m.upstream_output in upstreamOutputs)) {
      throw new Error(
        `Upstream output "${m.upstream_output}" not found. Available: ${Object.keys(upstreamOutputs).join(', ')}`,
      );
    }
    resolved[m.downstream_variable] = upstreamOutputs[m.upstream_output];
  }
  return resolved;
}

/**
 * Build test DAG graph for failure propagation tests.
 *
 * Graph: A -> B, A -> C, B -> D, C -> D, E (independent)
 */
function buildTestGraph() {
  return {
    modules: ['a', 'b', 'c', 'd', 'e'],
    deps: [
      { from: 'a', to: 'b' },
      { from: 'a', to: 'c' },
      { from: 'b', to: 'd' },
      { from: 'c', to: 'd' },
    ],
  };
}

/**
 * Simulate failure propagation through a DAG.
 */
function simulateFailurePropagation(
  graph: { modules: string[]; deps: Array<{ from: string; to: string }> },
  failedModule: string,
): Map<string, string> {
  const results = new Map<string, string>();
  const downstreamOf = new Map<string, string[]>();

  for (const dep of graph.deps) {
    if (!downstreamOf.has(dep.from)) downstreamOf.set(dep.from, []);
    downstreamOf.get(dep.from)!.push(dep.to);
  }

  // BFS from failed module
  const visited = new Set<string>();
  const queue = [failedModule];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const downstream = downstreamOf.get(current) ?? [];
    for (const d of downstream) {
      results.set(d, 'skipped');
      queue.push(d);
    }
  }

  // Mark unaffected modules
  for (const m of graph.modules) {
    if (m !== failedModule && !results.has(m)) {
      results.set(m, 'unaffected');
    }
  }

  return results;
}

/**
 * Compute in-degree map for modules.
 */
function computeInDegree(
  modules: Array<{ id: string; name: string }>,
  deps: Array<{ module_id: string; depends_on_id: string }>,
): Map<string, number> {
  const inDegree = new Map<string, number>();
  for (const m of modules) {
    inDegree.set(m.id, 0);
  }
  for (const dep of deps) {
    inDegree.set(dep.module_id, (inDegree.get(dep.module_id) ?? 0) + 1);
  }
  return inDegree;
}

/**
 * Compute out-degree map for modules (how many downstream dependents).
 */
function computeOutDegree(
  modules: Array<{ id: string; name: string }>,
  deps: Array<{ module_id: string; depends_on_id: string }>,
): Map<string, number> {
  const outDegree = new Map<string, number>();
  for (const m of modules) {
    outDegree.set(m.id, 0);
  }
  for (const dep of deps) {
    outDegree.set(
      dep.depends_on_id,
      (outDegree.get(dep.depends_on_id) ?? 0) + 1,
    );
  }
  return outDegree;
}

/**
 * Map environment run operation to module run operation.
 * Mirrors DagExecutor.mapOperation.
 */
function mapOperation(envOp: string): 'plan' | 'apply' | 'destroy' {
  switch (envOp) {
    case 'plan-all':
      return 'plan';
    case 'apply-all':
      return 'apply';
    case 'destroy-all':
      return 'destroy';
    default:
      return 'plan';
  }
}

/**
 * Simple run queue simulator for testing queue management logic.
 */
class RunQueue {
  private nextId = 1;
  private runs = new Map<
    string,
    {
      id: string;
      moduleId: string;
      priority: string;
      status: string;
      queuePosition: number | null;
    }
  >();
  private activeByModule = new Map<string, string>();

  enqueue(
    moduleId: string,
    priority: 'user' | 'cascade',
  ): {
    id: string;
    status: string;
    queuePosition: number | null;
    priority: string;
  } {
    const id = `run-${this.nextId++}`;
    const activeRunId = this.activeByModule.get(moduleId);

    if (!activeRunId) {
      // No active run -- start immediately
      const run = {
        id,
        moduleId,
        priority,
        status: 'queued',
        queuePosition: null,
      };
      this.runs.set(id, run);
      this.activeByModule.set(moduleId, id);
      return run;
    }

    // Latest-wins for cascade: cancel older queued cascade runs
    if (priority === 'cascade') {
      for (const [runId, run] of this.runs) {
        if (
          run.moduleId === moduleId &&
          run.priority === 'cascade' &&
          run.queuePosition !== null
        ) {
          this.runs.delete(runId);
        }
      }
    }

    // Calculate queue position
    let maxPos = 0;
    for (const run of this.runs.values()) {
      if (run.moduleId === moduleId && run.queuePosition !== null) {
        maxPos = Math.max(maxPos, run.queuePosition);
      }
    }

    const run = {
      id,
      moduleId,
      priority,
      status: 'pending',
      queuePosition: maxPos + 1,
    };
    this.runs.set(id, run);
    return run;
  }

  completeActive(moduleId: string): void {
    const activeId = this.activeByModule.get(moduleId);
    if (activeId) {
      this.runs.delete(activeId);
      this.activeByModule.delete(moduleId);
    }

    // Dequeue: user priority first, then cascade, then by position
    let nextRun: {
      id: string;
      moduleId: string;
      priority: string;
      status: string;
      queuePosition: number | null;
    } | null = null;
    for (const run of this.runs.values()) {
      if (run.moduleId !== moduleId || run.queuePosition === null) continue;
      if (!nextRun) {
        nextRun = run;
        continue;
      }
      // User > cascade
      if (run.priority === 'user' && nextRun.priority !== 'user') {
        nextRun = run;
        continue;
      }
      if (run.priority !== 'user' && nextRun.priority === 'user') continue;
      // Same priority -- lower position first
      if ((run.queuePosition ?? 999) < (nextRun.queuePosition ?? 999)) {
        nextRun = run;
      }
    }

    if (nextRun) {
      nextRun.status = 'queued';
      nextRun.queuePosition = null;
      this.activeByModule.set(moduleId, nextRun.id);
    }
  }

  getActive(
    moduleId: string,
  ): { id: string; priority: string } | null {
    const activeId = this.activeByModule.get(moduleId);
    if (!activeId) return null;
    const run = this.runs.get(activeId);
    return run ? { id: run.id, priority: run.priority } : null;
  }

  isActive(runId: string): boolean {
    for (const [, activeId] of this.activeByModule) {
      if (activeId === runId) return true;
    }
    return false;
  }

  getQueuedCount(moduleId: string): number {
    let count = 0;
    for (const run of this.runs.values()) {
      if (run.moduleId === moduleId && run.queuePosition !== null) count++;
    }
    return count;
  }
}
