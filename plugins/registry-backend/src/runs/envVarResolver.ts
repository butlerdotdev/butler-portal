// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { RegistryDatabase } from '../database/RegistryDatabase';
import type { CloudIntegrationRow } from '../database/types';
import { generateCloudAuthSteps } from '../pipelines/cloudAuthSteps';
import { buildEnvVarsFromModuleVariables } from './envVarBuilder';

export interface ResolvedVariable {
  key: string;
  value: string | null;
  source: string;
  sensitive: boolean;
  category: 'terraform' | 'env';
}

/**
 * Resolves the final set of environment variables for a module run by
 * merging three layers in precedence order:
 *
 *   Layer 1 (lowest):  Cloud integration env vars
 *   Layer 2:           Variable set entries
 *   Layer 3 (highest): Module-level variables
 *
 * Returns a flat env vars record suitable for pipeline generation.
 */
export class EnvVarResolver {
  constructor(private readonly db: RegistryDatabase) {}

  /**
   * Resolve all env vars for a module, returning the merged record
   * for pipeline generation / Job spec.
   */
  async resolveForModule(
    moduleId: string,
    envId: string,
    ciProvider: string,
    runId: string,
  ): Promise<{
    envVars: Record<string, { source: string; ref?: string; key?: string; value?: string; name?: string }>;
    preInitSteps: string;
    gitlabBeforeScript: string[];
  }> {
    const result: Record<string, { source: string; ref?: string; key?: string; value?: string; name?: string }> = {};

    // Layer 1: Cloud integration env vars
    const cloudInts = await this.db.getEffectiveCloudIntegrations(moduleId, envId);
    const authResult = generateCloudAuthSteps(cloudInts, ciProvider, runId);

    // Merge cloud auth env vars (lowest priority)
    for (const [key, val] of Object.entries(authResult.envVars)) {
      if (val.source === 'ci_secret') {
        result[key] = { source: 'ci_secret', name: val.name };
      } else {
        result[key] = { source: 'literal', value: val.value };
      }
    }

    // Layer 2: Variable set entries
    const varSets = await this.db.getEffectiveVariableSets(moduleId, envId);
    for (const vs of varSets) {
      const entries = await this.db.listVariableSetEntries(vs.id);
      for (const entry of entries) {
        const envName =
          entry.category === 'terraform' ? `TF_VAR_${entry.key}` : entry.key;

        if (entry.sensitive && entry.ci_secret_name) {
          result[envName] = { source: 'ci_secret', name: entry.ci_secret_name };
        } else {
          result[envName] = { source: 'literal', value: entry.value ?? '' };
        }
      }
    }

    // Layer 3: Module variables (highest priority)
    const moduleVars = await this.db.listModuleVariables(moduleId);
    const moduleEnvVars = buildEnvVarsFromModuleVariables(moduleVars);
    for (const [key, val] of Object.entries(moduleEnvVars)) {
      result[key] = val;
    }

    return {
      envVars: result,
      preInitSteps: authResult.steps,
      gitlabBeforeScript: authResult.gitlabBeforeScript,
    };
  }

  /**
   * Preview resolved variables for debugging — returns all three layers
   * merged with source indicators and sensitive masking.
   */
  async resolveForPreview(
    moduleId: string,
    envId: string,
  ): Promise<ResolvedVariable[]> {
    const vars = new Map<string, ResolvedVariable>();

    // Layer 1: Cloud integration env vars
    const cloudInts = await this.db.getEffectiveCloudIntegrations(moduleId, envId);
    for (const ci of cloudInts) {
      const config = ci.credential_config as Record<string, any>;
      const envVarsFromIntegration = this.extractEnvVarsFromIntegration(ci, config);
      for (const [key, val] of Object.entries(envVarsFromIntegration)) {
        vars.set(key, {
          key,
          value: val.sensitive ? null : val.value,
          source: `cloud-integration:${ci.name}`,
          sensitive: val.sensitive,
          category: 'env',
        });
      }
    }

    // Layer 2: Variable set entries
    const varSets = await this.db.getEffectiveVariableSets(moduleId, envId);
    for (const vs of varSets) {
      const entries = await this.db.listVariableSetEntries(vs.id);
      for (const entry of entries) {
        const envName =
          entry.category === 'terraform' ? `TF_VAR_${entry.key}` : entry.key;
        vars.set(envName, {
          key: envName,
          value: entry.sensitive ? null : entry.value,
          source: `variable-set:${vs.name}`,
          sensitive: entry.sensitive,
          category: entry.category,
        });
      }
    }

    // Layer 3: Module variables
    const moduleVars = await this.db.listModuleVariables(moduleId);
    for (const v of moduleVars) {
      const envName = v.category === 'terraform' ? `TF_VAR_${v.key}` : v.key;
      vars.set(envName, {
        key: envName,
        value: v.sensitive ? null : v.value,
        source: 'module',
        sensitive: v.sensitive,
        category: v.category,
      });
    }

    return Array.from(vars.values()).sort((a, b) => a.key.localeCompare(b.key));
  }

  /**
   * Extract env var info from a cloud integration for preview display.
   */
  private extractEnvVarsFromIntegration(
    ci: CloudIntegrationRow,
    config: Record<string, any>,
  ): Record<string, { value: string; sensitive: boolean }> {
    const result: Record<string, { value: string; sensitive: boolean }> = {};

    if (ci.provider === 'aws') {
      if (config.region) {
        result['AWS_REGION'] = { value: config.region, sensitive: false };
      }
      if (ci.auth_method === 'oidc') {
        result['AWS_ROLE_ARN'] = { value: config.roleArn ?? '', sensitive: false };
      } else {
        result['AWS_ACCESS_KEY_ID'] = { value: '***', sensitive: true };
        result['AWS_SECRET_ACCESS_KEY'] = { value: '***', sensitive: true };
      }
    } else if (ci.provider === 'gcp') {
      if (config.projectId) {
        result['GOOGLE_PROJECT'] = { value: config.projectId, sensitive: false };
      }
      if (ci.auth_method !== 'oidc') {
        result['GOOGLE_CREDENTIALS'] = { value: '***', sensitive: true };
      }
    } else if (ci.provider === 'azure') {
      if (config.clientId) {
        result['ARM_CLIENT_ID'] = { value: config.clientId, sensitive: false };
      }
      if (config.tenantId) {
        result['ARM_TENANT_ID'] = { value: config.tenantId, sensitive: false };
      }
      if (config.subscriptionId) {
        result['ARM_SUBSCRIPTION_ID'] = { value: config.subscriptionId, sensitive: false };
      }
      if (ci.auth_method !== 'oidc') {
        result['ARM_CLIENT_SECRET'] = { value: '***', sensitive: true };
      }
    } else if (ci.provider === 'custom') {
      const customEnvVars = (config.envVars ?? {}) as Record<
        string,
        { source: string; value: string }
      >;
      for (const [key, varConfig] of Object.entries(customEnvVars)) {
        result[key] = {
          value: varConfig.source === 'ci_secret' ? '***' : varConfig.value,
          sensitive: varConfig.source === 'ci_secret',
        };
      }
    }

    return result;
  }
}
