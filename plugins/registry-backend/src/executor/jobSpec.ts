/*
 * Copyright 2026 The Butler Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { RunRow } from '../database/types';

const BUTLER_RUNNER_IMAGE = 'ghcr.io/butlerdotdev/butler-runner:latest';

/**
 * Resolved environment variable — either a literal value or a K8s secret reference.
 */
export interface ResolvedEnvVar {
  name: string;
  value?: string;
  valueFrom?: {
    secretKeyRef: {
      name: string;
      key: string;
    };
  };
}

/**
 * Resolves env_vars config from a run row into K8s container env entries.
 *
 * - source: "secret" -> valueFrom.secretKeyRef
 * - source: "literal" -> value (direct string)
 */
export function resolveEnvVars(
  envVars: Record<string, { source: string; ref?: string; key?: string; value?: string }> | null | undefined,
): ResolvedEnvVar[] {
  if (!envVars) return [];

  return Object.entries(envVars).map(([varName, config]) => {
    if (config.source === 'secret' && config.ref && config.key) {
      // ref format is "namespace/name" or just "name"
      const parts = config.ref.split('/');
      const secretName = parts.length > 1 ? parts[parts.length - 1] : parts[0];
      return {
        name: varName,
        valueFrom: {
          secretKeyRef: {
            name: secretName,
            key: config.key,
          },
        },
      };
    }
    // literal or unknown source — inject value directly
    return {
      name: varName,
      value: config.value ?? '',
    };
  });
}

export interface JobSpecOptions {
  run: RunRow;
  namespace: string;
  serviceAccount?: string;
  timeoutSeconds: number;
  defaultTerraformVersion: string;
}

/**
 * @deprecated Use buildModuleRunJobSpec for new module runs.
 * Retained for artifact-level PeaaS runs.
 */
export function buildJobSpec(options: JobSpecOptions): Record<string, unknown> {
  const { run, namespace, serviceAccount, timeoutSeconds, defaultTerraformVersion } = options;

  const tfVersion = run.tf_version ?? defaultTerraformVersion;
  const image = tfVersion.startsWith('opentofu')
    ? `ghcr.io/opentofu/opentofu:${tfVersion.replace('opentofu-', '')}`
    : `hashicorp/terraform:${tfVersion}`;

  const operation = run.operation;
  const workDir = run.working_directory ?? '.';

  // Build terraform command
  let tfCommand: string;
  switch (operation) {
    case 'plan':
      tfCommand = 'terraform plan -input=false -no-color -out=tfplan -json';
      break;
    case 'apply':
      tfCommand = 'terraform apply -input=false -no-color -auto-approve';
      break;
    case 'validate':
      tfCommand = 'terraform validate -no-color -json';
      break;
    case 'test':
      tfCommand = 'terraform test -no-color -json';
      break;
    case 'destroy':
      tfCommand = 'terraform destroy -input=false -no-color -auto-approve';
      break;
    default:
      tfCommand = `terraform ${operation} -input=false -no-color`;
  }

  // Resolve env vars from run config
  const envVars = resolveEnvVars(run.env_vars as any);

  // Add butler-specific env vars
  envVars.push(
    { name: 'BUTLER_RUN_ID', value: run.id },
    { name: 'BUTLER_OPERATION', value: operation },
    { name: 'TF_IN_AUTOMATION', value: 'true' },
    { name: 'TF_INPUT', value: '0' },
  );

  // Build the init+run script
  const script = [
    '#!/bin/sh',
    'set -e',
    '',
    '# Initialize terraform',
    `cd /workspace/${workDir}`,
    'terraform init -input=false -no-color',
    '',
    '# Run operation',
    'set +e',
    `${tfCommand} 2>&1 | tee /tmp/tf-output.log`,
    'TF_EXIT=$?',
    'echo "$TF_EXIT" > /tmp/tf-exit-code',
    '',
    // For plan operations, capture plan JSON
    ...(operation === 'plan'
      ? [
          '# Capture plan JSON',
          'if [ -f tfplan ]; then',
          '  terraform show -json tfplan > /tmp/tf-plan.json 2>/dev/null',
          'fi',
          '',
        ]
      : []),
    'exit $TF_EXIT',
  ].join('\n');

  return {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: {
      name: `butler-run-${run.id.substring(0, 8)}`,
      namespace,
      labels: {
        'butler.butlerlabs.dev/run-id': run.id,
        'butler.butlerlabs.dev/operation': operation,
        'butler.butlerlabs.dev/managed-by': 'butler-registry',
      },
    },
    spec: {
      backoffLimit: 0,
      activeDeadlineSeconds: timeoutSeconds,
      ttlSecondsAfterFinished: 300,
      template: {
        metadata: {
          labels: {
            'butler.butlerlabs.dev/run-id': run.id,
            'butler.butlerlabs.dev/operation': operation,
          },
        },
        spec: {
          restartPolicy: 'Never',
          automountServiceAccountToken: false,
          ...(serviceAccount ? { serviceAccountName: serviceAccount } : {}),
          securityContext: {
            runAsNonRoot: true,
            runAsUser: 65534,
            fsGroup: 65534,
            seccompProfile: {
              type: 'RuntimeDefault',
            },
          },
          containers: [
            {
              name: 'terraform',
              image,
              command: ['/bin/sh', '-c', script],
              securityContext: {
                allowPrivilegeEscalation: false,
                readOnlyRootFilesystem: true,
                capabilities: {
                  drop: ['ALL'],
                },
              },
              resources: {
                limits: {
                  cpu: '2',
                  memory: '2Gi',
                },
                requests: {
                  cpu: '500m',
                  memory: '512Mi',
                },
              },
              env: envVars.map(e => {
                if (e.valueFrom) {
                  return { name: e.name, valueFrom: e.valueFrom };
                }
                return { name: e.name, value: e.value };
              }),
              volumeMounts: [
                { name: 'tmp', mountPath: '/tmp' },
                { name: 'workspace', mountPath: '/workspace' },
              ],
            },
          ],
          volumes: [
            { name: 'tmp', emptyDir: {} },
            { name: 'workspace', emptyDir: {} },
          ],
        },
      },
    },
  };
}

// ── Module Run Job Spec (butler-runner) ─────────────────────────────────

export interface ModuleRunJobSpecOptions {
  runId: string;
  butlerUrl: string;
  callbackSecretName: string;
  namespace: string;
  serviceAccount?: string;
  timeoutSeconds: number;
  runnerImage?: string;
}

/**
 * Builds a security-hardened K8s Job spec for a module run using butler-runner.
 *
 * Single container, three env vars (BUTLER_URL, BUTLER_RUN_ID, BUTLER_TOKEN).
 * The runner fetches everything else from the /config endpoint.
 *
 * Security measures:
 * - runAsNonRoot: true (UID 65534 = nobody)
 * - automountServiceAccountToken: false
 * - readOnlyRootFilesystem: true (/tmp, /workspace, /home/runner are emptyDir)
 * - capabilities: drop ALL
 * - seccompProfile: RuntimeDefault
 */
export function buildModuleRunJobSpec(
  options: ModuleRunJobSpecOptions,
): Record<string, unknown> {
  const {
    runId,
    butlerUrl,
    callbackSecretName,
    namespace,
    serviceAccount,
    timeoutSeconds,
    runnerImage,
  } = options;

  const image = runnerImage ?? BUTLER_RUNNER_IMAGE;

  return {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: {
      name: `butler-modrun-${runId.substring(0, 8)}`,
      namespace,
      labels: {
        'butler.butlerlabs.dev/run-id': runId,
        'butler.butlerlabs.dev/managed-by': 'butler-registry',
      },
    },
    spec: {
      backoffLimit: 0,
      activeDeadlineSeconds: timeoutSeconds,
      ttlSecondsAfterFinished: 300,
      template: {
        metadata: {
          labels: {
            'butler.butlerlabs.dev/run-id': runId,
          },
        },
        spec: {
          restartPolicy: 'Never',
          automountServiceAccountToken: false,
          ...(serviceAccount ? { serviceAccountName: serviceAccount } : {}),
          securityContext: {
            runAsNonRoot: true,
            runAsUser: 65534,
            fsGroup: 65534,
            seccompProfile: {
              type: 'RuntimeDefault',
            },
          },
          containers: [
            {
              name: 'runner',
              image,
              command: ['butler-runner', 'exec'],
              env: [
                { name: 'BUTLER_URL', value: butlerUrl },
                { name: 'BUTLER_RUN_ID', value: runId },
                {
                  name: 'BUTLER_TOKEN',
                  valueFrom: {
                    secretKeyRef: {
                      name: callbackSecretName,
                      key: 'callback-token',
                    },
                  },
                },
              ],
              securityContext: {
                allowPrivilegeEscalation: false,
                readOnlyRootFilesystem: true,
                capabilities: {
                  drop: ['ALL'],
                },
              },
              resources: {
                limits: {
                  cpu: '2',
                  memory: '2Gi',
                },
                requests: {
                  cpu: '500m',
                  memory: '512Mi',
                },
              },
              volumeMounts: [
                { name: 'workspace', mountPath: '/workspace' },
                { name: 'tmp', mountPath: '/tmp' },
                { name: 'tf-cache', mountPath: '/home/runner/.butler-runner' },
              ],
            },
          ],
          volumes: [
            { name: 'workspace', emptyDir: {} },
            { name: 'tmp', emptyDir: {} },
            { name: 'tf-cache', emptyDir: {} },
          ],
        },
      },
    },
  };
}

/**
 * Build a K8s Secret spec for storing a per-run callback token.
 * The Secret is created before the Job and referenced via secretKeyRef.
 */
export function buildRunSecretSpec(options: {
  runId: string;
  callbackToken: string;
  namespace: string;
}): Record<string, unknown> {
  return {
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: {
      name: `butler-run-${options.runId.substring(0, 8)}`,
      namespace: options.namespace,
      labels: {
        'butler.butlerlabs.dev/run-id': options.runId,
        'butler.butlerlabs.dev/managed-by': 'butler-registry',
      },
    },
    type: 'Opaque',
    stringData: {
      'callback-token': options.callbackToken,
    },
  };
}
