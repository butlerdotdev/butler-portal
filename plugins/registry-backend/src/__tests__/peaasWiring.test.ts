// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import {
  buildModuleRunJobSpec,
  buildRunSecretSpec,
  buildJobSpec,
  resolveEnvVars,
} from '../executor/jobSpec';
import { generateCallbackToken } from '../runs/shared';

// ─────────────────────────────────────────────────────────────────────────────
// Tests for Phase 2d: PeaaS wiring, butler-runner Job spec, per-run Secrets
// ─────────────────────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('Registry Backend - PeaaS Wiring (Phase 2d)', () => {
  // ── Butler-Runner Job Spec ────────────────────────────────────────

  describe('buildModuleRunJobSpec', () => {
    const defaultOptions = {
      runId: 'run-abc12345-def6-7890-1234-567890abcdef',
      butlerUrl: 'https://portal.company.com/api/registry',
      callbackSecretName: 'butler-run-abc12345',
      namespace: 'butler-registry-runs',
      timeoutSeconds: 3600,
    };

    it('generates a valid K8s Job with butler-runner image', () => {
      const spec = buildModuleRunJobSpec(defaultOptions) as any;

      expect(spec.apiVersion).toBe('batch/v1');
      expect(spec.kind).toBe('Job');
      expect(spec.metadata.namespace).toBe('butler-registry-runs');
    });

    it('uses ghcr.io/butlerdotdev/butler-runner:latest by default', () => {
      const spec = buildModuleRunJobSpec(defaultOptions) as any;
      const container = spec.spec.template.spec.containers[0];
      expect(container.image).toBe('ghcr.io/butlerdotdev/butler-runner:latest');
    });

    it('allows overriding the runner image', () => {
      const spec = buildModuleRunJobSpec({
        ...defaultOptions,
        runnerImage: 'ghcr.io/butlerdotdev/butler-runner:v0.1.0',
      }) as any;
      const container = spec.spec.template.spec.containers[0];
      expect(container.image).toBe('ghcr.io/butlerdotdev/butler-runner:v0.1.0');
    });

    it('has exactly one container named "runner"', () => {
      const spec = buildModuleRunJobSpec(defaultOptions) as any;
      const containers = spec.spec.template.spec.containers;
      expect(containers).toHaveLength(1);
      expect(containers[0].name).toBe('runner');
    });

    it('runs butler-runner exec command', () => {
      const spec = buildModuleRunJobSpec(defaultOptions) as any;
      const container = spec.spec.template.spec.containers[0];
      expect(container.command).toEqual(['butler-runner', 'exec']);
    });

    it('has exactly 3 env vars: BUTLER_URL, BUTLER_RUN_ID, BUTLER_TOKEN', () => {
      const spec = buildModuleRunJobSpec(defaultOptions) as any;
      const env = spec.spec.template.spec.containers[0].env;
      expect(env).toHaveLength(3);

      const names = env.map((e: any) => e.name);
      expect(names).toContain('BUTLER_URL');
      expect(names).toContain('BUTLER_RUN_ID');
      expect(names).toContain('BUTLER_TOKEN');
    });

    it('BUTLER_URL is set to the provided butlerUrl', () => {
      const spec = buildModuleRunJobSpec(defaultOptions) as any;
      const env = spec.spec.template.spec.containers[0].env;
      const butlerUrl = env.find((e: any) => e.name === 'BUTLER_URL');
      expect(butlerUrl.value).toBe('https://portal.company.com/api/registry');
    });

    it('BUTLER_RUN_ID is set to the run ID', () => {
      const spec = buildModuleRunJobSpec(defaultOptions) as any;
      const env = spec.spec.template.spec.containers[0].env;
      const runId = env.find((e: any) => e.name === 'BUTLER_RUN_ID');
      expect(runId.value).toBe(defaultOptions.runId);
    });

    it('BUTLER_TOKEN references the per-run Secret via secretKeyRef', () => {
      const spec = buildModuleRunJobSpec(defaultOptions) as any;
      const env = spec.spec.template.spec.containers[0].env;
      const token = env.find((e: any) => e.name === 'BUTLER_TOKEN');

      expect(token.valueFrom).toBeDefined();
      expect(token.valueFrom.secretKeyRef.name).toBe('butler-run-abc12345');
      expect(token.valueFrom.secretKeyRef.key).toBe('callback-token');
    });

    it('has three emptyDir volumes: workspace, tmp, tf-cache', () => {
      const spec = buildModuleRunJobSpec(defaultOptions) as any;
      const volumes = spec.spec.template.spec.volumes;
      expect(volumes).toHaveLength(3);

      const names = volumes.map((v: any) => v.name);
      expect(names).toContain('workspace');
      expect(names).toContain('tmp');
      expect(names).toContain('tf-cache');

      for (const vol of volumes) {
        expect(vol.emptyDir).toBeDefined();
      }
    });

    it('mounts tf-cache at /home/runner/.butler-runner', () => {
      const spec = buildModuleRunJobSpec(defaultOptions) as any;
      const mounts = spec.spec.template.spec.containers[0].volumeMounts;
      const tfCache = mounts.find((m: any) => m.name === 'tf-cache');
      expect(tfCache.mountPath).toBe('/home/runner/.butler-runner');
    });

    it('runs as non-root (UID 65534)', () => {
      const spec = buildModuleRunJobSpec(defaultOptions) as any;
      const secCtx = spec.spec.template.spec.securityContext;
      expect(secCtx.runAsNonRoot).toBe(true);
      expect(secCtx.runAsUser).toBe(65534);
    });

    it('drops all capabilities', () => {
      const spec = buildModuleRunJobSpec(defaultOptions) as any;
      const container = spec.spec.template.spec.containers[0];
      expect(container.securityContext.capabilities.drop).toEqual(['ALL']);
    });

    it('prevents privilege escalation', () => {
      const spec = buildModuleRunJobSpec(defaultOptions) as any;
      const container = spec.spec.template.spec.containers[0];
      expect(container.securityContext.allowPrivilegeEscalation).toBe(false);
    });

    it('uses read-only root filesystem', () => {
      const spec = buildModuleRunJobSpec(defaultOptions) as any;
      const container = spec.spec.template.spec.containers[0];
      expect(container.securityContext.readOnlyRootFilesystem).toBe(true);
    });

    it('does not mount service account token', () => {
      const spec = buildModuleRunJobSpec(defaultOptions) as any;
      expect(spec.spec.template.spec.automountServiceAccountToken).toBe(false);
    });

    it('sets backoffLimit to 0 (no retries)', () => {
      const spec = buildModuleRunJobSpec(defaultOptions) as any;
      expect(spec.spec.backoffLimit).toBe(0);
    });

    it('sets activeDeadlineSeconds from timeoutSeconds', () => {
      const spec = buildModuleRunJobSpec(defaultOptions) as any;
      expect(spec.spec.activeDeadlineSeconds).toBe(3600);
    });

    it('sets ttlSecondsAfterFinished for cleanup', () => {
      const spec = buildModuleRunJobSpec(defaultOptions) as any;
      expect(spec.spec.ttlSecondsAfterFinished).toBe(300);
    });

    it('includes run-id label on Job and Pod', () => {
      const spec = buildModuleRunJobSpec(defaultOptions) as any;
      expect(spec.metadata.labels['butler.butlerlabs.dev/run-id']).toBe(defaultOptions.runId);
      expect(spec.spec.template.metadata.labels['butler.butlerlabs.dev/run-id']).toBe(defaultOptions.runId);
    });

    it('includes serviceAccountName when provided', () => {
      const spec = buildModuleRunJobSpec({
        ...defaultOptions,
        serviceAccount: 'butler-runner-sa',
      }) as any;
      expect(spec.spec.template.spec.serviceAccountName).toBe('butler-runner-sa');
    });

    it('omits serviceAccountName when not provided', () => {
      const spec = buildModuleRunJobSpec(defaultOptions) as any;
      expect(spec.spec.template.spec.serviceAccountName).toBeUndefined();
    });

    it('sets resource limits to 2 CPU / 2Gi memory', () => {
      const spec = buildModuleRunJobSpec(defaultOptions) as any;
      const resources = spec.spec.template.spec.containers[0].resources;
      expect(resources.limits.cpu).toBe('2');
      expect(resources.limits.memory).toBe('2Gi');
    });

    it('sets resource requests to 500m CPU / 512Mi memory', () => {
      const spec = buildModuleRunJobSpec(defaultOptions) as any;
      const resources = spec.spec.template.spec.containers[0].resources;
      expect(resources.requests.cpu).toBe('500m');
      expect(resources.requests.memory).toBe('512Mi');
    });
  });

  // ── Per-Run Secret Spec ───────────────────────────────────────────

  describe('buildRunSecretSpec', () => {
    it('generates a K8s Secret with callback token', () => {
      const spec = buildRunSecretSpec({
        runId: 'run-abc12345-def6-7890-1234-567890abcdef',
        callbackToken: 'brce_abcdef123456',
        namespace: 'butler-registry-runs',
      }) as any;

      expect(spec.apiVersion).toBe('v1');
      expect(spec.kind).toBe('Secret');
      expect(spec.type).toBe('Opaque');
    });

    it('stores token in stringData under callback-token key', () => {
      const spec = buildRunSecretSpec({
        runId: 'run-abc12345',
        callbackToken: 'brce_testtoken',
        namespace: 'butler-runs',
      }) as any;

      expect(spec.stringData['callback-token']).toBe('brce_testtoken');
    });

    it('name matches the convention butler-run-{id prefix}', () => {
      const spec = buildRunSecretSpec({
        runId: 'run-abc12345-full-uuid-here',
        callbackToken: 'brce_test',
        namespace: 'ns',
      }) as any;

      expect(spec.metadata.name).toBe('butler-run-run-abc1');
    });

    it('includes run-id label', () => {
      const spec = buildRunSecretSpec({
        runId: 'my-run-id',
        callbackToken: 'brce_tok',
        namespace: 'ns',
      }) as any;

      expect(spec.metadata.labels['butler.butlerlabs.dev/run-id']).toBe('my-run-id');
    });
  });

  // ── Legacy Job Spec Compatibility ─────────────────────────────────

  describe('Legacy buildJobSpec (artifact-level runs)', () => {
    it('still generates terraform image-based Job spec', () => {
      const spec = buildJobSpec({
        run: {
          id: 'run-123',
          artifact_id: 'art-1',
          version_id: null,
          artifact_namespace: 'default',
          artifact_name: 'vpc',
          version: '1.0.0',
          operation: 'plan',
          mode: 'peaas',
          status: 'queued',
          triggered_by: null,
          team: null,
          ci_provider: null,
          pipeline_config: null,
          callback_token_hash: null,
          k8s_job_name: null,
          k8s_namespace: null,
          tf_version: '1.9.0',
          variables: null,
          env_vars: null,
          working_directory: null,
          exit_code: null,
          resources_to_add: null,
          resources_to_change: null,
          resources_to_destroy: null,
          queued_at: null,
          started_at: null,
          completed_at: null,
          duration_seconds: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        namespace: 'butler-runs',
        timeoutSeconds: 3600,
        defaultTerraformVersion: '1.9.0',
      }) as any;

      const container = spec.spec.template.spec.containers[0];
      expect(container.image).toBe('hashicorp/terraform:1.9.0');
      expect(container.name).toBe('terraform');
    });
  });

  // ── Callback Token Integration ────────────────────────────────────

  describe('Callback token in PeaaS module run flow', () => {
    it('generateCallbackToken creates brce_ prefixed token', () => {
      const { token, tokenHash } = generateCallbackToken();
      expect(token.startsWith('brce_')).toBe(true);
      expect(tokenHash).toHaveLength(64); // SHA-256 hex
    });

    it('Secret secretKeyRef name matches Job env reference', () => {
      const runId = 'abc12345-def6-7890';
      const { token } = generateCallbackToken();

      const secret = buildRunSecretSpec({
        runId,
        callbackToken: token,
        namespace: 'butler-runs',
      }) as any;

      const job = buildModuleRunJobSpec({
        runId,
        butlerUrl: 'https://portal.example.com/api/registry',
        callbackSecretName: secret.metadata.name,
        namespace: 'butler-runs',
        timeoutSeconds: 3600,
      }) as any;

      const env = job.spec.template.spec.containers[0].env;
      const tokenEnv = env.find((e: any) => e.name === 'BUTLER_TOKEN');

      expect(tokenEnv.valueFrom.secretKeyRef.name).toBe(
        secret.metadata.name,
      );
      expect(tokenEnv.valueFrom.secretKeyRef.key).toBe('callback-token');
    });
  });

  // ── resolveEnvVars ────────────────────────────────────────────────

  describe('resolveEnvVars (shared helper)', () => {
    it('returns empty array for null input', () => {
      expect(resolveEnvVars(null)).toEqual([]);
    });

    it('returns empty array for undefined input', () => {
      expect(resolveEnvVars(undefined)).toEqual([]);
    });

    it('resolves literal values', () => {
      const result = resolveEnvVars({
        AWS_REGION: { source: 'literal', value: 'us-east-1' },
      });
      expect(result).toEqual([
        { name: 'AWS_REGION', value: 'us-east-1' },
      ]);
    });

    it('resolves secret references', () => {
      const result = resolveEnvVars({
        DB_PASSWORD: { source: 'secret', ref: 'butler-system/db-creds', key: 'password' },
      });
      expect(result).toEqual([
        {
          name: 'DB_PASSWORD',
          valueFrom: {
            secretKeyRef: {
              name: 'db-creds',
              key: 'password',
            },
          },
        },
      ]);
    });

    it('handles simple secret name without namespace', () => {
      const result = resolveEnvVars({
        API_KEY: { source: 'secret', ref: 'api-secret', key: 'token' },
      });
      expect(result[0].valueFrom!.secretKeyRef.name).toBe('api-secret');
    });

    it('defaults value to empty string for literals', () => {
      const result = resolveEnvVars({
        EMPTY: { source: 'literal' },
      });
      expect(result[0].value).toBe('');
    });
  });
});
