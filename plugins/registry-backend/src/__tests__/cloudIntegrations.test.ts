// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { generateCloudAuthSteps } from '../pipelines/cloudAuthSteps';
import type { CloudIntegrationRow } from '../database/types';

// ─────────────────────────────────────────────────────────────────────────────
// Tests for Phase 4: Cloud Integrations + Variable Sets
// ─────────────────────────────────────────────────────────────────────────────

describe('Registry Backend - Phase 4: Cloud Integrations + Variable Sets', () => {
  // Helper to create mock integration row
  const makeIntegration = (
    overrides: Partial<CloudIntegrationRow>,
  ): CloudIntegrationRow => ({
    id: 'ci-1',
    name: 'test-integration',
    description: null,
    team: 'platform',
    provider: 'aws',
    auth_method: 'oidc',
    credential_config: {},
    supported_ci_providers: null,
    status: 'active',
    last_validated_at: null,
    validation_error: null,
    created_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  });

  // ── AWS OIDC (GitHub Actions) ──────────────────────────────────

  describe('AWS OIDC (GitHub Actions)', () => {
    const integration = makeIntegration({
      provider: 'aws',
      auth_method: 'oidc',
      credential_config: {
        roleArn: 'arn:aws:iam::123:role/test',
        region: 'us-east-1',
      },
    });

    it('should generate configure-aws-credentials step', () => {
      const result = generateCloudAuthSteps(
        [integration],
        'github-actions',
        'run-123',
      );
      expect(result.steps).toContain('configure-aws-credentials');
    });

    it('should use SHA-pinned action reference', () => {
      const result = generateCloudAuthSteps(
        [integration],
        'github-actions',
        'run-123',
      );
      expect(result.steps).toContain(
        'ececac1a45913d1d0f770bbb2a18141f4d111ebd',
      );
    });

    it('should include the roleArn in steps', () => {
      const result = generateCloudAuthSteps(
        [integration],
        'github-actions',
        'run-123',
      );
      expect(result.steps).toContain('arn:aws:iam::123:role/test');
    });

    it('should set AWS_REGION as literal env var', () => {
      const result = generateCloudAuthSteps(
        [integration],
        'github-actions',
        'run-123',
      );
      expect(result.envVars['AWS_REGION']).toEqual({
        source: 'literal',
        value: 'us-east-1',
      });
    });

    it('should return empty gitlabBeforeScript', () => {
      const result = generateCloudAuthSteps(
        [integration],
        'github-actions',
        'run-123',
      );
      expect(result.gitlabBeforeScript).toEqual([]);
    });
  });

  // ── AWS OIDC (GitLab CI) ──────────────────────────────────────

  describe('AWS OIDC (GitLab CI)', () => {
    const integration = makeIntegration({
      provider: 'aws',
      auth_method: 'oidc',
      credential_config: {
        roleArn: 'arn:aws:iam::123:role/test',
        region: 'us-east-1',
      },
    });

    it('should return empty steps string', () => {
      const result = generateCloudAuthSteps(
        [integration],
        'gitlab-ci',
        'run-123',
      );
      expect(result.steps).toBe('');
    });

    it('should populate gitlabBeforeScript', () => {
      const result = generateCloudAuthSteps(
        [integration],
        'gitlab-ci',
        'run-123',
      );
      expect(result.gitlabBeforeScript.length).toBeGreaterThan(0);
    });

    it('should use AssumeRoleWithWebIdentity in before_script', () => {
      const result = generateCloudAuthSteps(
        [integration],
        'gitlab-ci',
        'run-123',
      );
      const joined = result.gitlabBeforeScript.join('\n');
      expect(joined).toContain('AssumeRoleWithWebIdentity');
    });

    it('should reference CI_JOB_JWT_V2 in before_script', () => {
      const result = generateCloudAuthSteps(
        [integration],
        'gitlab-ci',
        'run-123',
      );
      const joined = result.gitlabBeforeScript.join('\n');
      expect(joined).toContain('CI_JOB_JWT_V2');
    });
  });

  // ── AWS Static Credentials ────────────────────────────────────

  describe('AWS Static Credentials', () => {
    const integration = makeIntegration({
      provider: 'aws',
      auth_method: 'static',
      credential_config: {
        ciSecrets: {
          accessKeyId: 'MY_AWS_KEY',
          secretAccessKey: 'MY_AWS_SECRET',
        },
        region: 'eu-west-1',
      },
    });

    it('should map AWS_ACCESS_KEY_ID to ci_secret', () => {
      const result = generateCloudAuthSteps(
        [integration],
        'github-actions',
        'run-123',
      );
      expect(result.envVars['AWS_ACCESS_KEY_ID']).toEqual({
        source: 'ci_secret',
        name: 'MY_AWS_KEY',
      });
    });

    it('should map AWS_SECRET_ACCESS_KEY to ci_secret', () => {
      const result = generateCloudAuthSteps(
        [integration],
        'github-actions',
        'run-123',
      );
      expect(result.envVars['AWS_SECRET_ACCESS_KEY']).toEqual({
        source: 'ci_secret',
        name: 'MY_AWS_SECRET',
      });
    });

    it('should set AWS_REGION as literal', () => {
      const result = generateCloudAuthSteps(
        [integration],
        'github-actions',
        'run-123',
      );
      expect(result.envVars['AWS_REGION']).toEqual({
        source: 'literal',
        value: 'eu-west-1',
      });
    });

    it('should not generate OIDC steps for static auth', () => {
      const result = generateCloudAuthSteps(
        [integration],
        'github-actions',
        'run-123',
      );
      expect(result.steps).toBe('');
    });
  });

  // ── GCP OIDC (GitHub Actions) ─────────────────────────────────

  describe('GCP OIDC (GitHub Actions)', () => {
    const integration = makeIntegration({
      provider: 'gcp',
      auth_method: 'oidc',
      credential_config: {
        workloadIdentityProvider:
          'projects/123/locations/global/workloadIdentityPools/butler/providers/github',
        serviceAccount: 'tf@project.iam.gserviceaccount.com',
        projectId: 'my-project',
      },
    });

    it('should generate google-github-actions/auth step', () => {
      const result = generateCloudAuthSteps(
        [integration],
        'github-actions',
        'run-123',
      );
      expect(result.steps).toContain('google-github-actions/auth');
    });

    it('should use SHA-pinned GCP auth action', () => {
      const result = generateCloudAuthSteps(
        [integration],
        'github-actions',
        'run-123',
      );
      expect(result.steps).toContain(
        'ba79af03959ebeac9769e648f473a284504d9193',
      );
    });

    it('should set GOOGLE_PROJECT as literal env var', () => {
      const result = generateCloudAuthSteps(
        [integration],
        'github-actions',
        'run-123',
      );
      expect(result.envVars['GOOGLE_PROJECT']).toEqual({
        source: 'literal',
        value: 'my-project',
      });
    });
  });

  // ── GCP Static Credentials ────────────────────────────────────

  describe('GCP Static Credentials', () => {
    const integration = makeIntegration({
      provider: 'gcp',
      auth_method: 'static',
      credential_config: {
        ciSecrets: { credentialsJson: 'GCP_CREDS' },
        projectId: 'my-project',
      },
    });

    it('should map GOOGLE_CREDENTIALS to ci_secret', () => {
      const result = generateCloudAuthSteps(
        [integration],
        'github-actions',
        'run-123',
      );
      expect(result.envVars['GOOGLE_CREDENTIALS']).toEqual({
        source: 'ci_secret',
        name: 'GCP_CREDS',
      });
    });

    it('should set GOOGLE_PROJECT as literal env var', () => {
      const result = generateCloudAuthSteps(
        [integration],
        'github-actions',
        'run-123',
      );
      expect(result.envVars['GOOGLE_PROJECT']).toEqual({
        source: 'literal',
        value: 'my-project',
      });
    });
  });

  // ── Azure OIDC (GitHub Actions) ───────────────────────────────

  describe('Azure OIDC (GitHub Actions)', () => {
    const integration = makeIntegration({
      provider: 'azure',
      auth_method: 'oidc',
      credential_config: {
        clientId: 'client-123',
        tenantId: 'tenant-456',
        subscriptionId: 'sub-789',
      },
    });

    it('should generate azure/login step', () => {
      const result = generateCloudAuthSteps(
        [integration],
        'github-actions',
        'run-123',
      );
      expect(result.steps).toContain('azure/login');
    });

    it('should use SHA-pinned Azure login action', () => {
      const result = generateCloudAuthSteps(
        [integration],
        'github-actions',
        'run-123',
      );
      expect(result.steps).toContain(
        'a457da9ea143d694b1b9c7c869ebb04ebe844ef5',
      );
    });

    it('should set ARM_CLIENT_ID as literal env var', () => {
      const result = generateCloudAuthSteps(
        [integration],
        'github-actions',
        'run-123',
      );
      expect(result.envVars['ARM_CLIENT_ID']).toEqual({
        source: 'literal',
        value: 'client-123',
      });
    });

    it('should set ARM_TENANT_ID as literal env var', () => {
      const result = generateCloudAuthSteps(
        [integration],
        'github-actions',
        'run-123',
      );
      expect(result.envVars['ARM_TENANT_ID']).toEqual({
        source: 'literal',
        value: 'tenant-456',
      });
    });

    it('should set ARM_SUBSCRIPTION_ID as literal env var', () => {
      const result = generateCloudAuthSteps(
        [integration],
        'github-actions',
        'run-123',
      );
      expect(result.envVars['ARM_SUBSCRIPTION_ID']).toEqual({
        source: 'literal',
        value: 'sub-789',
      });
    });
  });

  // ── Azure Static Credentials ──────────────────────────────────

  describe('Azure Static Credentials', () => {
    const integration = makeIntegration({
      provider: 'azure',
      auth_method: 'static',
      credential_config: {
        ciSecrets: {
          clientId: 'AZ_CLIENT',
          clientSecret: 'AZ_SECRET',
          tenantId: 'AZ_TENANT',
        },
      },
    });

    it('should map ARM_CLIENT_ID to ci_secret', () => {
      const result = generateCloudAuthSteps(
        [integration],
        'github-actions',
        'run-123',
      );
      expect(result.envVars['ARM_CLIENT_ID']).toEqual({
        source: 'ci_secret',
        name: 'AZ_CLIENT',
      });
    });

    it('should map ARM_CLIENT_SECRET to ci_secret', () => {
      const result = generateCloudAuthSteps(
        [integration],
        'github-actions',
        'run-123',
      );
      expect(result.envVars['ARM_CLIENT_SECRET']).toEqual({
        source: 'ci_secret',
        name: 'AZ_SECRET',
      });
    });

    it('should map ARM_TENANT_ID to ci_secret', () => {
      const result = generateCloudAuthSteps(
        [integration],
        'github-actions',
        'run-123',
      );
      expect(result.envVars['ARM_TENANT_ID']).toEqual({
        source: 'ci_secret',
        name: 'AZ_TENANT',
      });
    });
  });

  // ── Custom Provider ───────────────────────────────────────────

  describe('Custom Provider', () => {
    const integration = makeIntegration({
      provider: 'custom',
      auth_method: 'static',
      credential_config: {
        envVars: {
          CUSTOM_TOKEN: { source: 'ci_secret', value: 'MY_TOKEN' },
          API_URL: { source: 'literal', value: 'https://api.example.com' },
        },
      },
    });

    it('should map ci_secret custom env vars', () => {
      const result = generateCloudAuthSteps(
        [integration],
        'github-actions',
        'run-123',
      );
      expect(result.envVars['CUSTOM_TOKEN']).toEqual({
        source: 'ci_secret',
        name: 'MY_TOKEN',
      });
    });

    it('should map literal custom env vars', () => {
      const result = generateCloudAuthSteps(
        [integration],
        'github-actions',
        'run-123',
      );
      expect(result.envVars['API_URL']).toEqual({
        source: 'literal',
        value: 'https://api.example.com',
      });
    });
  });

  // ── Multiple Integrations ─────────────────────────────────────

  describe('Multiple Integrations', () => {
    const awsOidcIntegration = makeIntegration({
      id: 'ci-aws',
      name: 'aws-oidc',
      provider: 'aws',
      auth_method: 'oidc',
      credential_config: {
        roleArn: 'arn:aws:iam::123:role/test',
        region: 'us-east-1',
      },
    });

    const gcpStaticIntegration = makeIntegration({
      id: 'ci-gcp',
      name: 'gcp-static',
      provider: 'gcp',
      auth_method: 'static',
      credential_config: {
        ciSecrets: { credentialsJson: 'GCP_CREDS' },
        projectId: 'my-project',
      },
    });

    it('should include env vars from both integrations', () => {
      const result = generateCloudAuthSteps(
        [awsOidcIntegration, gcpStaticIntegration],
        'github-actions',
        'run-123',
      );
      expect(result.envVars['AWS_REGION']).toBeDefined();
      expect(result.envVars['GOOGLE_PROJECT']).toBeDefined();
    });

    it('should include AWS OIDC step in steps string', () => {
      const result = generateCloudAuthSteps(
        [awsOidcIntegration, gcpStaticIntegration],
        'github-actions',
        'run-123',
      );
      expect(result.steps).toContain('configure-aws-credentials');
    });
  });

  // ── Empty Integrations ────────────────────────────────────────

  describe('Empty Integrations', () => {
    it('should return empty steps string', () => {
      const result = generateCloudAuthSteps([], 'github-actions', 'run-123');
      expect(result.steps).toBe('');
    });

    it('should return empty envVars object', () => {
      const result = generateCloudAuthSteps([], 'github-actions', 'run-123');
      expect(result.envVars).toEqual({});
    });

    it('should return empty gitlabBeforeScript array', () => {
      const result = generateCloudAuthSteps([], 'github-actions', 'run-123');
      expect(result.gitlabBeforeScript).toEqual([]);
    });
  });

  // ── Variable Precedence Logic ─────────────────────────────────

  describe('Variable Precedence (three-layer merge)', () => {
    /**
     * Simulate the three-layer variable merge:
     *   cloud integrations < variable sets < module variables
     * Later layers override earlier layers for the same key.
     */
    function mergeThreeLayers(
      cloudVars: Record<string, string>,
      varSetVars: Record<string, string>,
      moduleVars: Record<string, string>,
    ): Record<string, string> {
      return { ...cloudVars, ...varSetVars, ...moduleVars };
    }

    it('should let module var override variable set var with same key', () => {
      const result = mergeThreeLayers(
        {},
        { region: 'us-east-1' },
        { region: 'eu-west-1' },
      );
      expect(result.region).toBe('eu-west-1');
    });

    it('should let variable set var override cloud integration var with same key', () => {
      const result = mergeThreeLayers(
        { region: 'us-east-1' },
        { region: 'ap-southeast-1' },
        {},
      );
      expect(result.region).toBe('ap-southeast-1');
    });

    it('should contribute all vars when keys are different', () => {
      const result = mergeThreeLayers(
        { AWS_REGION: 'us-east-1' },
        { TF_VAR_env: 'prod' },
        { TF_VAR_app: 'web' },
      );
      expect(result).toEqual({
        AWS_REGION: 'us-east-1',
        TF_VAR_env: 'prod',
        TF_VAR_app: 'web',
      });
    });

    it('should let module var win when all three layers have same key', () => {
      const result = mergeThreeLayers(
        { region: 'cloud-value' },
        { region: 'varset-value' },
        { region: 'module-value' },
      );
      expect(result.region).toBe('module-value');
    });

    it('should handle empty layers correctly', () => {
      const result = mergeThreeLayers({}, {}, {});
      expect(result).toEqual({});
    });

    it('should handle single non-empty layer', () => {
      const result = mergeThreeLayers(
        { AWS_REGION: 'us-east-1' },
        {},
        {},
      );
      expect(result).toEqual({ AWS_REGION: 'us-east-1' });
    });

    it('should preserve all unique keys across layers', () => {
      const result = mergeThreeLayers(
        { a: '1', b: '2' },
        { c: '3', d: '4' },
        { e: '5', f: '6' },
      );
      expect(Object.keys(result)).toHaveLength(6);
      expect(result.a).toBe('1');
      expect(result.f).toBe('6');
    });
  });
});
