// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { CloudIntegrationRow } from '../database/types';

// SHA-pinned action versions for supply chain security
const AWS_CONFIGURE_CREDENTIALS_SHA =
  'ececac1a45913d1d0f770bbb2a18141f4d111ebd'; // v4.1.0
const GCP_AUTH_SHA =
  'ba79af03959ebeac9769e648f473a284504d9193'; // v2.1.8
const AZURE_LOGIN_SHA =
  'a457da9ea143d694b1b9c7c869ebb04ebe844ef5'; // v2.3.0

/**
 * Generate pre-init authentication steps for a CI pipeline based on
 * the cloud integrations bound to a module.
 *
 * Returns an object with:
 * - `steps`: YAML string to insert before `terraform init` (GitHub Actions steps)
 * - `envVars`: additional env vars to merge into the job env block
 * - `gitlabBeforeScript`: shell commands for GitLab CI `before_script`
 */
export function generateCloudAuthSteps(
  integrations: CloudIntegrationRow[],
  ciProvider: string,
  runId: string,
): {
  steps: string;
  envVars: Record<string, { source: string; name?: string; value?: string }>;
  gitlabBeforeScript: string[];
} {
  const steps: string[] = [];
  const envVars: Record<string, { source: string; name?: string; value?: string }> = {};
  const gitlabBeforeScript: string[] = [];

  for (const integration of integrations) {
    const config = integration.credential_config as Record<string, any>;

    if (integration.provider === 'aws') {
      generateAwsAuth(integration, config, ciProvider, runId, steps, envVars, gitlabBeforeScript);
    } else if (integration.provider === 'gcp') {
      generateGcpAuth(integration, config, ciProvider, steps, envVars, gitlabBeforeScript);
    } else if (integration.provider === 'azure') {
      generateAzureAuth(integration, config, ciProvider, steps, envVars, gitlabBeforeScript);
    } else if (integration.provider === 'custom') {
      generateCustomAuth(config, envVars);
    }
  }

  return {
    steps: steps.join('\n'),
    envVars,
    gitlabBeforeScript,
  };
}

function generateAwsAuth(
  integration: CloudIntegrationRow,
  config: Record<string, any>,
  ciProvider: string,
  runId: string,
  steps: string[],
  envVars: Record<string, { source: string; name?: string; value?: string }>,
  gitlabBeforeScript: string[],
): void {
  if (integration.auth_method === 'oidc') {
    const roleArn = config.roleArn as string;
    const region = config.region as string;
    const sessionName = (config.sessionName as string) || `butler-registry-${runId}`;
    const sessionDuration = config.sessionDuration ?? 3600;

    if (ciProvider === 'github-actions') {
      steps.push(`
      # ── AWS OIDC Authentication ───────────────────────────────────
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@${AWS_CONFIGURE_CREDENTIALS_SHA} # v4.1.0
        with:
          role-to-assume: "${roleArn}"
          aws-region: "${region}"
          role-session-name: "${sessionName}"
          role-duration-seconds: ${sessionDuration}`);
    } else if (ciProvider === 'gitlab-ci') {
      gitlabBeforeScript.push(
        `# AWS OIDC authentication`,
        `export AWS_REGION="${region}"`,
        `STS_RESPONSE=$(curl -s -X POST "https://sts.amazonaws.com/" \\`,
        `  --data-urlencode "Action=AssumeRoleWithWebIdentity" \\`,
        `  --data-urlencode "RoleArn=${roleArn}" \\`,
        `  --data-urlencode "RoleSessionName=${sessionName}" \\`,
        `  --data-urlencode "DurationSeconds=${sessionDuration}" \\`,
        `  --data-urlencode "WebIdentityToken=$CI_JOB_JWT_V2" \\`,
        `  --data-urlencode "Version=2011-06-15")`,
        `export AWS_ACCESS_KEY_ID=$(echo "$STS_RESPONSE" | grep -oP '<AccessKeyId>\\K[^<]+')`,
        `export AWS_SECRET_ACCESS_KEY=$(echo "$STS_RESPONSE" | grep -oP '<SecretAccessKey>\\K[^<]+')`,
        `export AWS_SESSION_TOKEN=$(echo "$STS_RESPONSE" | grep -oP '<SessionToken>\\K[^<]+')`,
      );
    }

    envVars['AWS_REGION'] = { source: 'literal', value: region };
  } else {
    // Static credentials via CI secrets
    const ciSecrets = (config.ciSecrets ?? {}) as Record<string, string>;
    const region = config.region as string;

    envVars['AWS_ACCESS_KEY_ID'] = {
      source: 'ci_secret',
      name: ciSecrets.accessKeyId || 'AWS_ACCESS_KEY_ID',
    };
    envVars['AWS_SECRET_ACCESS_KEY'] = {
      source: 'ci_secret',
      name: ciSecrets.secretAccessKey || 'AWS_SECRET_ACCESS_KEY',
    };
    if (ciSecrets.sessionToken) {
      envVars['AWS_SESSION_TOKEN'] = {
        source: 'ci_secret',
        name: ciSecrets.sessionToken,
      };
    }
    if (region) {
      envVars['AWS_REGION'] = { source: 'literal', value: region };
    }
  }
}

function generateGcpAuth(
  integration: CloudIntegrationRow,
  config: Record<string, any>,
  ciProvider: string,
  steps: string[],
  envVars: Record<string, { source: string; name?: string; value?: string }>,
  gitlabBeforeScript: string[],
): void {
  if (integration.auth_method === 'oidc') {
    const workloadIdentityProvider = config.workloadIdentityProvider as string;
    const serviceAccount = config.serviceAccount as string;
    const projectId = config.projectId as string | undefined;

    if (ciProvider === 'github-actions') {
      steps.push(`
      # ── GCP OIDC Authentication ──────────────────────────────────
      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@${GCP_AUTH_SHA} # v2.1.8
        with:
          workload_identity_provider: "${workloadIdentityProvider}"
          service_account: "${serviceAccount}"`);
    } else if (ciProvider === 'gitlab-ci') {
      gitlabBeforeScript.push(
        `# GCP Workload Identity Federation`,
        `echo "$CI_JOB_JWT_V2" > /tmp/gcp_token.txt`,
        `gcloud auth login --cred-file=/tmp/gcp_token.txt --update-adc 2>/dev/null || \\`,
        `  echo "GCP auth via WIF requires gcloud SDK in image"`,
      );
    }

    if (projectId) {
      envVars['GOOGLE_PROJECT'] = { source: 'literal', value: projectId };
    }
  } else {
    // Static credentials via CI secrets
    const ciSecrets = (config.ciSecrets ?? {}) as Record<string, string>;
    const projectId = config.projectId as string | undefined;

    envVars['GOOGLE_CREDENTIALS'] = {
      source: 'ci_secret',
      name: ciSecrets.credentialsJson || 'GCP_CREDENTIALS_JSON',
    };
    if (projectId) {
      envVars['GOOGLE_PROJECT'] = { source: 'literal', value: projectId };
    }
  }
}

function generateAzureAuth(
  integration: CloudIntegrationRow,
  config: Record<string, any>,
  ciProvider: string,
  steps: string[],
  envVars: Record<string, { source: string; name?: string; value?: string }>,
  gitlabBeforeScript: string[],
): void {
  if (integration.auth_method === 'oidc') {
    const clientId = config.clientId as string;
    const tenantId = config.tenantId as string;
    const subscriptionId = config.subscriptionId as string | undefined;

    if (ciProvider === 'github-actions') {
      const withBlock = [
        `          client-id: "${clientId}"`,
        `          tenant-id: "${tenantId}"`,
      ];
      if (subscriptionId) {
        withBlock.push(`          subscription-id: "${subscriptionId}"`);
      }
      steps.push(`
      # ── Azure OIDC Authentication ────────────────────────────────
      - name: Azure Login
        uses: azure/login@${AZURE_LOGIN_SHA} # v2.3.0
        with:
${withBlock.join('\n')}`);
    } else if (ciProvider === 'gitlab-ci') {
      gitlabBeforeScript.push(
        `# Azure OIDC authentication`,
        `az login --service-principal --federated-token "$CI_JOB_JWT_V2" \\`,
        `  --tenant "${tenantId}" -u "${clientId}" --output none`,
      );
      if (subscriptionId) {
        gitlabBeforeScript.push(`az account set --subscription "${subscriptionId}"`);
      }
    }

    envVars['ARM_CLIENT_ID'] = { source: 'literal', value: clientId };
    envVars['ARM_TENANT_ID'] = { source: 'literal', value: tenantId };
    if (subscriptionId) {
      envVars['ARM_SUBSCRIPTION_ID'] = { source: 'literal', value: subscriptionId };
    }
  } else {
    // Static credentials via CI secrets
    const ciSecrets = (config.ciSecrets ?? {}) as Record<string, string>;
    const subscriptionId = config.subscriptionId as string | undefined;

    envVars['ARM_CLIENT_ID'] = {
      source: 'ci_secret',
      name: ciSecrets.clientId || 'AZURE_CLIENT_ID',
    };
    envVars['ARM_CLIENT_SECRET'] = {
      source: 'ci_secret',
      name: ciSecrets.clientSecret || 'AZURE_CLIENT_SECRET',
    };
    envVars['ARM_TENANT_ID'] = {
      source: 'ci_secret',
      name: ciSecrets.tenantId || 'AZURE_TENANT_ID',
    };
    if (subscriptionId) {
      envVars['ARM_SUBSCRIPTION_ID'] = { source: 'literal', value: subscriptionId };
    }
  }
}

function generateCustomAuth(
  config: Record<string, any>,
  envVars: Record<string, { source: string; name?: string; value?: string }>,
): void {
  const customEnvVars = (config.envVars ?? {}) as Record<
    string,
    { source: string; value: string }
  >;
  for (const [key, varConfig] of Object.entries(customEnvVars)) {
    if (varConfig.source === 'ci_secret') {
      envVars[key] = { source: 'ci_secret', name: varConfig.value };
    } else {
      envVars[key] = { source: 'literal', value: varConfig.value };
    }
  }
}
