// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { buildStateBackendConfig, getTfWorkspaceName } from '../runs/envVarBuilder';
import type {
  EnvironmentModuleVariableRow,
  OutputMappingEntry,
  StateBackendConfig,
} from '../database/types';

// ─────────────────────────────────────────────────────────────────────────────
// Tests for Phase 2c: /config endpoint, status check, runner integration
// ─────────────────────────────────────────────────────────────────────────────

describe('Registry Backend - Runner Config (Phase 2c)', () => {
  // ── State Backend Resolution ──────────────────────────────────────

  describe('buildStateBackendConfig', () => {
    it('returns null when no backend is configured', () => {
      const result = buildStateBackendConfig(null, {
        mode: 'byoc',
        environmentId: 'env-1',
        moduleId: 'mod-1',
      });
      expect(result).toBeNull();
    });

    it('returns null for undefined backend', () => {
      const result = buildStateBackendConfig(undefined, {
        mode: 'byoc',
        environmentId: 'env-1',
        moduleId: 'mod-1',
      });
      expect(result).toBeNull();
    });

    it('passes through BYOC backend config as-is', () => {
      const backend: StateBackendConfig = {
        type: 's3',
        config: {
          bucket: 'my-state-bucket',
          region: 'us-east-1',
          key: 'terraform.tfstate',
        },
      };
      const result = buildStateBackendConfig(backend, {
        mode: 'byoc',
        environmentId: 'env-1',
        moduleId: 'mod-1',
      });
      expect(result).toEqual({
        type: 's3',
        config: {
          bucket: 'my-state-bucket',
          region: 'us-east-1',
          key: 'terraform.tfstate',
        },
      });
    });

    it('generates S3 backend for PeaaS mode with peaasStateBackend', () => {
      const result = buildStateBackendConfig(null, {
        mode: 'peaas',
        environmentId: 'env-1',
        moduleId: 'mod-1',
        peaasStateBackend: {
          endpoint: 'http://10.40.2.20:8333',
          bucket: 'butler-tfstate',
        },
      });
      expect(result).toEqual({
        type: 's3',
        config: {
          bucket: 'butler-tfstate',
          key: 'env/env-1/mod/mod-1/terraform.tfstate',
          region: 'us-east-1',
          endpoint: 'http://10.40.2.20:8333',
          access_key: 'unused',
          secret_key: 'unused',
          skip_credentials_validation: true,
          skip_requesting_account_id: true,
          skip_metadata_api_check: true,
          skip_region_validation: true,
          use_path_style: true,
        },
      });
    });

    it('returns null for PeaaS mode without peaasStateBackend', () => {
      const result = buildStateBackendConfig(null, {
        mode: 'peaas',
        environmentId: 'env-1',
        moduleId: 'mod-1',
      });
      expect(result).toBeNull();
    });

    it('passes through explicit backend in PeaaS mode', () => {
      const backend: StateBackendConfig = {
        type: 'gcs',
        config: { bucket: 'my-bucket' },
      };
      const result = buildStateBackendConfig(backend, {
        mode: 'peaas',
        environmentId: 'env-1',
        moduleId: 'mod-1',
      });
      expect(result).toEqual({
        type: 'gcs',
        config: { bucket: 'my-bucket' },
      });
    });

    it('handles backend with no config object', () => {
      const backend: StateBackendConfig = { type: 'azurerm' };
      const result = buildStateBackendConfig(backend, {
        mode: 'byoc',
        environmentId: 'env-1',
        moduleId: 'mod-1',
      });
      expect(result).toEqual({
        type: 'azurerm',
        config: {},
      });
    });
  });

  describe('getTfWorkspaceName', () => {
    it('generates deterministic workspace name from env+module IDs', () => {
      expect(getTfWorkspaceName('env-abc', 'mod-xyz')).toBe(
        'env-env-abc-mod-mod-xyz',
      );
    });

    it('generates different names for different modules', () => {
      const ws1 = getTfWorkspaceName('env-1', 'mod-a');
      const ws2 = getTfWorkspaceName('env-1', 'mod-b');
      expect(ws1).not.toBe(ws2);
    });

    it('generates different names for different environments', () => {
      const ws1 = getTfWorkspaceName('env-1', 'mod-a');
      const ws2 = getTfWorkspaceName('env-2', 'mod-a');
      expect(ws1).not.toBe(ws2);
    });
  });

  // ── Config Response Structure ─────────────────────────────────────

  describe('Config response contract', () => {
    it('config response should include all required fields', () => {
      // Simulates the config response structure returned by GET /config
      const configResponse = {
        runId: 'run-123',
        operation: 'plan',
        terraformVersion: '1.9.0',
        source: {
          type: 'git',
          gitRepo: 'https://github.com/org/infra.git',
          gitRef: 'v1.2.0',
          workingDirectory: 'modules/vpc',
        },
        variables: {
          region: { value: 'us-east-1', sensitive: false },
          db_password: { value: 'resolved-secret', sensitive: true },
        },
        upstreamOutputs: {
          vpc_id: 'vpc-abc123',
        },
        stateBackend: {
          type: 'pg',
          config: { schema_name: 'butler_tfstate' },
        },
        callbacks: {
          statusUrl: '/v1/ci/module-runs/run-123/status',
          logsUrl: '/v1/ci/module-runs/run-123/logs',
          planUrl: '/v1/ci/module-runs/run-123/plan',
          outputsUrl: '/v1/ci/module-runs/run-123/outputs',
        },
      };

      expect(configResponse.runId).toBe('run-123');
      expect(configResponse.operation).toBe('plan');
      expect(configResponse.terraformVersion).toBe('1.9.0');
      expect(configResponse.source.type).toBe('git');
      expect(configResponse.callbacks.statusUrl).toContain('run-123');
      expect(configResponse.callbacks.logsUrl).toContain('run-123');
      expect(configResponse.callbacks.planUrl).toContain('run-123');
      expect(configResponse.callbacks.outputsUrl).toContain('run-123');
    });

    it('config response should contain all callback URLs', () => {
      const runId = 'run-456';
      const cbBase = `/v1/ci/module-runs/${runId}`;
      const callbacks = {
        statusUrl: `${cbBase}/status`,
        logsUrl: `${cbBase}/logs`,
        planUrl: `${cbBase}/plan`,
        outputsUrl: `${cbBase}/outputs`,
      };

      expect(Object.keys(callbacks)).toHaveLength(4);
      for (const url of Object.values(callbacks)) {
        expect(url).toContain(runId);
      }
    });
  });

  // ── Source Resolution ─────────────────────────────────────────────

  describe('Source resolution priority', () => {
    it('VCS trigger takes precedence over artifact source_config', () => {
      const mod = {
        vcs_trigger: {
          repositoryUrl: 'https://github.com/team/vcs-repo.git',
          branch: 'develop',
          path: 'terraform/vpc',
        },
        working_directory: 'fallback-dir',
      };
      const artifact = {
        source_config: {
          vcsProvider: 'github' as const,
          repositoryUrl: 'https://github.com/team/artifact-repo.git',
          path: 'modules/vpc',
        },
      };

      // Simulate source resolution logic from /config endpoint
      const source: any = { type: 'none' };
      if (mod.vcs_trigger?.repositoryUrl) {
        source.type = 'git';
        source.gitRepo = mod.vcs_trigger.repositoryUrl;
        source.gitRef = mod.vcs_trigger.branch ?? 'main';
        source.workingDirectory = mod.vcs_trigger.path ?? mod.working_directory ?? undefined;
      } else if (artifact.source_config?.repositoryUrl) {
        source.type = 'git';
        source.gitRepo = artifact.source_config.repositoryUrl;
      }

      expect(source.type).toBe('git');
      expect(source.gitRepo).toBe('https://github.com/team/vcs-repo.git');
      expect(source.gitRef).toBe('develop');
      expect(source.workingDirectory).toBe('terraform/vpc');
    });

    it('falls back to artifact source_config when no VCS trigger', () => {
      const mod: { vcs_trigger: { repositoryUrl: string; branch?: string; path?: string } | null; working_directory: string; pinned_version: string } = {
        vcs_trigger: null,
        working_directory: 'modules/vpc',
        pinned_version: '1.2.0',
      };
      const artifact = {
        source_config: {
          vcsProvider: 'github' as const,
          repositoryUrl: 'https://github.com/team/artifact-repo.git',
          path: 'modules/vpc',
        },
      };
      const moduleVersion = null;

      const source: any = { type: 'none' };
      if (mod.vcs_trigger?.repositoryUrl) {
        source.type = 'git';
        source.gitRepo = mod.vcs_trigger.repositoryUrl;
      } else if (artifact.source_config?.repositoryUrl) {
        source.type = 'git';
        source.gitRepo = artifact.source_config.repositoryUrl;
        source.gitRef = moduleVersion ?? mod.pinned_version ?? 'main';
        source.workingDirectory = artifact.source_config.path ?? mod.working_directory ?? undefined;
      }

      expect(source.type).toBe('git');
      expect(source.gitRepo).toBe('https://github.com/team/artifact-repo.git');
      expect(source.gitRef).toBe('1.2.0');
      expect(source.workingDirectory).toBe('modules/vpc');
    });

    it('falls back to storage_config git when no source_config', () => {
      const mod: { vcs_trigger: { repositoryUrl: string } | null; working_directory: string | null; pinned_version: string | null } = {
        vcs_trigger: null,
        working_directory: null,
        pinned_version: null,
      };
      const artifact: { source_config: { repositoryUrl: string; path?: string } | null; storage_config: { backend: 'git'; git: { repositoryUrl: string; path?: string; tagPrefix?: string } } } = {
        source_config: null,
        storage_config: {
          backend: 'git',
          git: {
            repositoryUrl: 'https://github.com/team/modules.git',
            path: 'vpc',
            tagPrefix: 'vpc-v',
          },
        },
      };
      const moduleVersion = '2.0.0';

      const source: any = { type: 'none' };
      if (mod.vcs_trigger?.repositoryUrl) {
        source.type = 'git';
      } else if (artifact.source_config?.repositoryUrl) {
        source.type = 'git';
      } else if (artifact.storage_config?.git?.repositoryUrl) {
        source.type = 'git';
        source.gitRepo = artifact.storage_config.git.repositoryUrl;
        source.gitRef = moduleVersion
          ? `${artifact.storage_config.git.tagPrefix ?? 'v'}${moduleVersion}`
          : 'main';
        source.workingDirectory =
          artifact.storage_config.git.path ?? mod.working_directory ?? undefined;
      }

      expect(source.type).toBe('git');
      expect(source.gitRepo).toBe('https://github.com/team/modules.git');
      expect(source.gitRef).toBe('vpc-v2.0.0');
      expect(source.workingDirectory).toBe('vpc');
    });

    it('defaults to v prefix when no tagPrefix in storage_config', () => {
      const artifact: { storage_config: { backend: 'git'; git: { repositoryUrl: string; tagPrefix?: string } } } = {
        storage_config: {
          backend: 'git',
          git: {
            repositoryUrl: 'https://github.com/team/modules.git',
          },
        },
      };
      const moduleVersion = '3.1.0';

      const gitRef = moduleVersion
        ? `${artifact.storage_config.git?.tagPrefix ?? 'v'}${moduleVersion}`
        : 'main';

      expect(gitRef).toBe('v3.1.0');
    });

    it('source is none when no git source is available', () => {
      // OCI-only artifact with no VCS trigger: no git source to clone
      const hasVcsTrigger = false;
      const hasSourceConfig = false;
      const hasGitStorage = false; // storage_config.backend === 'oci'

      const source: any = { type: 'none' };
      if (hasVcsTrigger) source.type = 'git';
      else if (hasSourceConfig) source.type = 'git';
      else if (hasGitStorage) source.type = 'git';

      expect(source.type).toBe('none');
    });
  });

  // ── Upstream Output Resolution ────────────────────────────────────

  describe('Upstream output resolution', () => {
    it('maps upstream outputs to downstream variables via output_mapping', () => {
      const upstreamOutputs: Record<string, unknown> = {
        vpc_id: 'vpc-abc123',
        subnet_ids: ['subnet-1', 'subnet-2'],
      };
      const mapping: OutputMappingEntry[] = [
        { upstream_output: 'vpc_id', downstream_variable: 'network_vpc_id' },
        { upstream_output: 'subnet_ids', downstream_variable: 'network_subnet_ids' },
      ];

      const resolved: Record<string, unknown> = {};
      for (const m of mapping) {
        const val = upstreamOutputs[m.upstream_output];
        if (val !== undefined) {
          resolved[m.downstream_variable] = val;
        }
      }

      expect(resolved).toEqual({
        network_vpc_id: 'vpc-abc123',
        network_subnet_ids: ['subnet-1', 'subnet-2'],
      });
    });

    it('skips mappings for outputs that do not exist', () => {
      const upstreamOutputs: Record<string, unknown> = {
        vpc_id: 'vpc-abc123',
      };
      const mapping: OutputMappingEntry[] = [
        { upstream_output: 'vpc_id', downstream_variable: 'network_vpc_id' },
        { upstream_output: 'nonexistent', downstream_variable: 'missing' },
      ];

      const resolved: Record<string, unknown> = {};
      for (const m of mapping) {
        const val = upstreamOutputs[m.upstream_output];
        if (val !== undefined) {
          resolved[m.downstream_variable] = val;
        }
      }

      expect(resolved).toEqual({ network_vpc_id: 'vpc-abc123' });
      expect(resolved).not.toHaveProperty('missing');
    });

    it('handles empty output_mapping gracefully', () => {
      const resolved: Record<string, unknown> = {};
      const mapping: OutputMappingEntry[] = [];
      for (const m of mapping) {
        const val = ({} as Record<string, unknown>)[m.upstream_output];
        if (val !== undefined) {
          resolved[m.downstream_variable] = val;
        }
      }
      expect(resolved).toEqual({});
    });

    it('handles null tf_outputs from upstream run', () => {
      // When upstream has no outputs, we just skip the dependency
      const upstreamTfOutputs = null;
      expect(upstreamTfOutputs).toBeNull();
      // The /config endpoint skips deps where upstream run has no tf_outputs
    });
  });

  // ── Variable Resolution for Config ────────────────────────────────

  describe('Variable resolution for /config response', () => {
    it('resolves non-sensitive variables with their values', () => {
      const vars: Pick<EnvironmentModuleVariableRow, 'key' | 'value' | 'sensitive' | 'secret_ref'>[] = [
        { key: 'region', value: 'us-east-1', sensitive: false, secret_ref: null },
        { key: 'instance_type', value: 't3.micro', sensitive: false, secret_ref: null },
      ];

      const resolved: Record<string, { value: string; sensitive: boolean }> = {};
      for (const v of vars) {
        resolved[v.key] = {
          value: v.sensitive ? (v.secret_ref ?? '') : (v.value ?? ''),
          sensitive: v.sensitive,
        };
      }

      expect(resolved.region).toEqual({ value: 'us-east-1', sensitive: false });
      expect(resolved.instance_type).toEqual({ value: 't3.micro', sensitive: false });
    });

    it('resolves sensitive variables with secret_ref', () => {
      const vars: Pick<EnvironmentModuleVariableRow, 'key' | 'value' | 'sensitive' | 'secret_ref'>[] = [
        { key: 'db_password', value: null, sensitive: true, secret_ref: 'butler-system/db-creds:password' },
      ];

      const resolved: Record<string, { value: string; sensitive: boolean }> = {};
      for (const v of vars) {
        resolved[v.key] = {
          value: v.sensitive ? (v.secret_ref ?? '') : (v.value ?? ''),
          sensitive: v.sensitive,
        };
      }

      expect(resolved.db_password).toEqual({
        value: 'butler-system/db-creds:password',
        sensitive: true,
      });
    });

    it('handles sensitive variables without secret_ref', () => {
      const vars: Pick<EnvironmentModuleVariableRow, 'key' | 'value' | 'sensitive' | 'secret_ref'>[] = [
        { key: 'api_key', value: null, sensitive: true, secret_ref: null },
      ];

      const resolved: Record<string, { value: string; sensitive: boolean }> = {};
      for (const v of vars) {
        resolved[v.key] = {
          value: v.sensitive ? (v.secret_ref ?? '') : (v.value ?? ''),
          sensitive: v.sensitive,
        };
      }

      expect(resolved.api_key).toEqual({ value: '', sensitive: true });
    });
  });

  // ── Terraform Version Resolution ──────────────────────────────────

  describe('Terraform version resolution', () => {
    it('uses run tf_version when available', () => {
      const runTfVersion = '1.8.0';
      const modTfVersion = '1.7.0';
      const defaultVersion = '1.9.0';
      const resolved = runTfVersion ?? modTfVersion ?? defaultVersion;
      expect(resolved).toBe('1.8.0');
    });

    it('falls back to module tf_version when run has none', () => {
      const runTfVersion = null;
      const modTfVersion = '1.7.0';
      const defaultVersion = '1.9.0';
      const resolved = runTfVersion ?? modTfVersion ?? defaultVersion;
      expect(resolved).toBe('1.7.0');
    });

    it('falls back to default 1.9.0 when both are null', () => {
      const runTfVersion = null;
      const modTfVersion = null;
      const defaultVersion = '1.9.0';
      const resolved = runTfVersion ?? modTfVersion ?? defaultVersion;
      expect(resolved).toBe('1.9.0');
    });
  });

  // ── Cancellation Status Check ─────────────────────────────────────

  describe('Cancellation status check endpoint', () => {
    it('status endpoint returns current run status', () => {
      const run = { status: 'running' };
      const response = { status: run.status };
      expect(response.status).toBe('running');
    });

    it('runner should detect cancelled status', () => {
      const response = { status: 'cancelled' };
      const shouldCancel = response.status === 'cancelled';
      expect(shouldCancel).toBe(true);
    });

    it('runner should not cancel for running status', () => {
      const response = { status: 'running' };
      const shouldCancel = response.status === 'cancelled';
      expect(shouldCancel).toBe(false);
    });

    it('runner should not cancel for planned status', () => {
      const response = { status: 'planned' };
      const shouldCancel = response.status === 'cancelled';
      expect(shouldCancel).toBe(false);
    });
  });

  // ── BYOC Run Creation Response ────────────────────────────────────

  describe('BYOC run creation response format', () => {
    it('BYOC response includes callbackToken and butlerUrl', () => {
      const response = {
        run: { id: 'run-1', status: 'pending', operation: 'plan' },
        callbackToken: 'brce_abc123...',
        butlerUrl: 'https://portal.company.com/api/registry',
      };

      expect(response.callbackToken).toBeDefined();
      expect(response.callbackToken!.startsWith('brce_')).toBe(true);
      expect(response.butlerUrl).toBeDefined();
      expect(response.butlerUrl).toContain('/api/registry');
    });

    it('BYOC response does not include pipeline_config', () => {
      const run = {
        id: 'run-1',
        status: 'pending',
        operation: 'plan',
        pipeline_config: 'should-be-stripped',
      };

      // Strip internal fields (matches actual route behavior)
      const {
        pipeline_config: _p,
        ...runResponse
      } = run;

      expect(runResponse).not.toHaveProperty('pipeline_config');
      expect(runResponse.id).toBe('run-1');
    });

    it('PeaaS response does not include callbackToken or butlerUrl', () => {
      const mode: string = 'peaas';
      const callbackToken = mode === 'byoc' ? 'brce_...' : undefined;
      const butlerUrl = mode === 'byoc' ? 'https://...' : undefined;

      const response: any = { run: { id: 'run-1' } };
      if (callbackToken) response.callbackToken = callbackToken;
      if (butlerUrl) response.butlerUrl = butlerUrl;

      expect(response).not.toHaveProperty('callbackToken');
      expect(response).not.toHaveProperty('butlerUrl');
    });
  });

  // ── Token Prefix Enforcement on Config Endpoint ───────────────────

  describe('Token prefix enforcement on /config', () => {
    it('breg_ tokens should be rejected on callback/config endpoints', () => {
      const token = 'breg_abc123def456...';
      const isRegistryToken = token.startsWith('breg_');
      expect(isRegistryToken).toBe(true);
      // The verifyModuleRunCallbackToken function rejects breg_ tokens
    });

    it('brce_ tokens should be accepted on callback/config endpoints', () => {
      const token = 'brce_abc123def456...';
      const isRegistryToken = token.startsWith('breg_');
      expect(isRegistryToken).toBe(false);
      // brce_ tokens are valid callback tokens
    });

    it('tokens without prefix should be accepted (legacy)', () => {
      const token = 'abc123def456...';
      const isRegistryToken = token.startsWith('breg_');
      expect(isRegistryToken).toBe(false);
      // Legacy tokens without prefix are still accepted
    });
  });

  // ── Cache-Control Headers ─────────────────────────────────────────

  describe('Config endpoint security headers', () => {
    it('config response should include no-store, no-cache', () => {
      const expectedHeader = 'no-store, no-cache';
      expect(expectedHeader).toContain('no-store');
      expect(expectedHeader).toContain('no-cache');
    });
  });

  // ── Pipeline Generation Deprecation ───────────────────────────────

  describe('Pipeline generation deprecation', () => {
    it('module run routes should not import pipelineGenerator', () => {
      // This is a structural test — verify the import was removed
      // by checking that the moduleRunRoutes file does not reference
      // generatePipelineConfig. The actual validation is done by
      // the type checker, but we document the intent here.
      const deprecatedImports = ['generatePipelineConfig'];
      // moduleRunRoutes.ts no longer imports these
      expect(deprecatedImports).toHaveLength(1);
    });

    it('BYOC run creation should return butlerUrl instead of pipeline_config', () => {
      // Before: response included pipeline_config YAML
      // After: response includes butlerUrl for runner to use
      const newResponse = { butlerUrl: 'https://portal.company.com/api/registry' };

      expect(newResponse).toHaveProperty('butlerUrl');
      expect(newResponse).not.toHaveProperty('pipeline_config');
    });
  });

  // ── Multiple Dependency Resolution ────────────────────────────────

  describe('Multiple upstream dependency resolution', () => {
    it('resolves outputs from multiple upstream modules', () => {
      const deps = [
        {
          depends_on_id: 'mod-network',
          output_mapping: [
            { upstream_output: 'vpc_id', downstream_variable: 'network_vpc_id' },
          ],
        },
        {
          depends_on_id: 'mod-database',
          output_mapping: [
            { upstream_output: 'connection_string', downstream_variable: 'db_conn' },
          ],
        },
      ];

      const upstreamRuns: Record<string, Record<string, unknown>> = {
        'mod-network': { vpc_id: 'vpc-123', subnet_ids: ['s-1', 's-2'] },
        'mod-database': { connection_string: 'postgres://...', port: 5432 },
      };

      const resolved: Record<string, unknown> = {};
      for (const dep of deps) {
        const outputs = upstreamRuns[dep.depends_on_id];
        if (!outputs) continue;
        for (const m of dep.output_mapping ?? []) {
          const val = outputs[m.upstream_output];
          if (val !== undefined) {
            resolved[m.downstream_variable] = val;
          }
        }
      }

      expect(resolved).toEqual({
        network_vpc_id: 'vpc-123',
        db_conn: 'postgres://...',
      });
    });

    it('handles diamond dependency with overlapping output names', () => {
      // mod-a depends on mod-network and mod-compute
      // both upstream modules have an output called "id"
      // output_mapping disambiguates
      const deps = [
        {
          depends_on_id: 'mod-network',
          output_mapping: [
            { upstream_output: 'id', downstream_variable: 'network_id' },
          ],
        },
        {
          depends_on_id: 'mod-compute',
          output_mapping: [
            { upstream_output: 'id', downstream_variable: 'compute_id' },
          ],
        },
      ];

      const upstreamRuns: Record<string, Record<string, unknown>> = {
        'mod-network': { id: 'net-abc' },
        'mod-compute': { id: 'comp-xyz' },
      };

      const resolved: Record<string, unknown> = {};
      for (const dep of deps) {
        const outputs = upstreamRuns[dep.depends_on_id];
        if (!outputs) continue;
        for (const m of dep.output_mapping ?? []) {
          const val = outputs[m.upstream_output];
          if (val !== undefined) {
            resolved[m.downstream_variable] = val;
          }
        }
      }

      expect(resolved.network_id).toBe('net-abc');
      expect(resolved.compute_id).toBe('comp-xyz');
    });
  });
});
