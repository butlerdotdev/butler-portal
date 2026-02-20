// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { EnvironmentModuleVariableRow, StateBackendConfig } from '../database/types';
import type { ResolvedEnvVar } from '../executor/jobSpec';

/**
 * Convert module variables to env_vars format suitable for pipeline generation
 * and K8s Job specs.
 *
 * - category='terraform' vars become TF_VAR_{key}
 * - category='env' vars become {key} directly
 * - sensitive vars with secret_ref become secretKeyRef entries
 * - non-sensitive vars become literal values
 */
export function buildEnvVarsFromModuleVariables(
  variables: EnvironmentModuleVariableRow[],
): Record<string, { source: string; ref?: string; key?: string; value?: string }> {
  const result: Record<string, { source: string; ref?: string; key?: string; value?: string }> = {};

  for (const v of variables) {
    const envName = v.category === 'terraform' ? `TF_VAR_${v.key}` : v.key;

    if (v.sensitive && v.secret_ref) {
      // Parse secret_ref format: "namespace/name:key" or "name:key"
      const colonIdx = v.secret_ref.indexOf(':');
      const refPath = colonIdx >= 0 ? v.secret_ref.substring(0, colonIdx) : v.secret_ref;
      const secretKey = colonIdx >= 0 ? v.secret_ref.substring(colonIdx + 1) : v.key;

      result[envName] = {
        source: 'secret',
        ref: refPath,
        key: secretKey,
      };
    } else {
      result[envName] = {
        source: 'literal',
        value: v.value ?? '',
      };
    }
  }

  return result;
}

/**
 * Resolve module variables directly to K8s container env entries.
 * Used by PeaaS executor for module runs.
 */
export function resolveModuleVariablesToEnv(
  variables: EnvironmentModuleVariableRow[],
): ResolvedEnvVar[] {
  const result: ResolvedEnvVar[] = [];

  for (const v of variables) {
    const envName = v.category === 'terraform' ? `TF_VAR_${v.key}` : v.key;

    if (v.sensitive && v.secret_ref) {
      const colonIdx = v.secret_ref.indexOf(':');
      const refPath = colonIdx >= 0 ? v.secret_ref.substring(0, colonIdx) : v.secret_ref;
      const secretKey = colonIdx >= 0 ? v.secret_ref.substring(colonIdx + 1) : v.key;

      const parts = refPath.split('/');
      const secretName = parts.length > 1 ? parts[parts.length - 1] : parts[0];

      result.push({
        name: envName,
        valueFrom: {
          secretKeyRef: {
            name: secretName,
            key: secretKey,
          },
        },
      });
    } else {
      result.push({
        name: envName,
        value: v.value ?? '',
      });
    }
  }

  return result;
}

/**
 * Build state backend config for Terraform init.
 *
 * For PeaaS with no explicit backend: generates S3 backend pointing at
 * platform-managed SeaweedFS. Each module gets a unique state key.
 * For BYOC: passes through user's backend config as-is.
 */
export function buildStateBackendConfig(
  backend: StateBackendConfig | null | undefined,
  options: {
    mode: 'byoc' | 'peaas';
    environmentId: string;
    moduleId: string;
    peaasStateBackend?: PeaasStateBackendConfig;
  },
): { type: string; config: Record<string, unknown> } | null {
  // BYOC with explicit backend — pass through user config
  if (backend) {
    return {
      type: backend.type,
      config: (backend.config ?? {}) as Record<string, unknown>,
    };
  }

  // PeaaS without explicit backend — use platform-managed S3 (SeaweedFS)
  if (options.mode === 'peaas' && options.peaasStateBackend) {
    const s3 = options.peaasStateBackend;
    const stateKey = `env/${options.environmentId}/mod/${options.moduleId}/terraform.tfstate`;
    return {
      type: 's3',
      config: {
        bucket: s3.bucket,
        key: stateKey,
        region: s3.region ?? 'us-east-1',
        endpoint: s3.endpoint,
        skip_credentials_validation: true,
        skip_requesting_account_id: true,
        skip_metadata_api_check: true,
        skip_region_validation: true,
        use_path_style: true,
        ...(s3.accessKey ? { access_key: s3.accessKey } : {}),
        ...(s3.secretKey ? { secret_key: s3.secretKey } : {}),
      },
    };
  }

  return null;
}

export interface PeaasStateBackendConfig {
  endpoint: string;
  bucket: string;
  region?: string;
  accessKey?: string;
  secretKey?: string;
}

/**
 * Generate the TF_WORKSPACE value for platform-managed state.
 */
export function getTfWorkspaceName(
  environmentId: string,
  moduleId: string,
): string {
  return `env-${environmentId}-mod-${moduleId}`;
}
