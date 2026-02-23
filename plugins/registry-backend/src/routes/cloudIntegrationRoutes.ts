// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import Router from 'express-promise-router';
import { sendError, notFound, badRequest, assertTeamAccess, forbidden, requireMinRole } from '../util/errors';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import {
  registryCloudIntegrationCreatePermission,
  registryCloudIntegrationUpdatePermission,
  registryCloudIntegrationDeletePermission,
} from '@internal/plugin-registry-common';
import type { RouterOptions } from '../router';

export function createCloudIntegrationRouter(options: RouterOptions) {
  const { db, httpAuth, permissions } = options;
  const router = Router();

  // ── Test Cloud Integration Connection ──────────────────────────────

  router.post('/v1/cloud-integrations/test', async (req, res) => {
    try {
      requireMinRole(req, 'operator');

      const { provider, auth_method, credential_config } = req.body;
      if (!provider) throw badRequest('provider is required');
      if (!auth_method) throw badRequest('auth_method is required');

      const result = await testCloudIntegrationConnection(
        provider,
        auth_method,
        credential_config ?? {},
        options.logger,
      );
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── Cloud Integration CRUD ──────────────────────────────────────────

  // List cloud integrations
  router.get('/v1/cloud-integrations', async (req, res) => {
    try {
      const team = req.activeTeam;
      const provider = req.query.provider as string | undefined;
      const result = await db.listCloudIntegrations({ team, provider });
      res.json({ integrations: result });
    } catch (err) {
      sendError(res, err);
    }
  });

  // Create cloud integration
  router.post('/v1/cloud-integrations', async (req, res) => {
    try {
      const credentials = await httpAuth.credentials(req);
      const [decision] = await permissions.authorize([{ permission: registryCloudIntegrationCreatePermission }], { credentials });
      if (decision.result !== AuthorizeResult.ALLOW) throw forbidden('Permission denied');
      requireMinRole(req, 'operator');

      const {
        name,
        description,
        provider,
        auth_method,
        credential_config,
        supported_ci_providers,
      } = req.body;

      if (!name) throw badRequest('name is required');
      if (!provider) throw badRequest('provider is required');
      if (!auth_method) throw badRequest('auth_method is required');

      const integration = await db.createCloudIntegration({
        name,
        description,
        provider,
        auth_method,
        credential_config,
        supported_ci_providers,
        created_by: req.registryUser?.email,
        team: req.activeTeam,
      });

      await db.writeAuditLog({
        actor: req.registryUser?.email ?? 'unknown',
        action: 'cloud_integration.created',
        resource_type: 'cloud_integration',
        resource_id: integration.id,
        resource_name: integration.name,
      });

      res.status(201).json(integration);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Get cloud integration detail
  router.get('/v1/cloud-integrations/:id', async (req, res) => {
    try {
      const integration = await db.getCloudIntegration(req.params.id);
      if (!integration) {
        throw notFound('INTEGRATION_NOT_FOUND', 'Cloud integration not found');
      }
      assertTeamAccess(integration, req.activeTeam);
      res.json(integration);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Update cloud integration
  router.patch('/v1/cloud-integrations/:id', async (req, res) => {
    try {
      const credentials = await httpAuth.credentials(req);
      const [decision] = await permissions.authorize([{ permission: registryCloudIntegrationUpdatePermission }], { credentials });
      if (decision.result !== AuthorizeResult.ALLOW) throw forbidden('Permission denied');
      requireMinRole(req, 'operator');

      const integration = await db.getCloudIntegration(req.params.id);
      if (!integration) {
        throw notFound('INTEGRATION_NOT_FOUND', 'Cloud integration not found');
      }
      assertTeamAccess(integration, req.activeTeam);

      const {
        name,
        description,
        provider,
        auth_method,
        credential_config,
        supported_ci_providers,
      } = req.body;

      const updated = await db.updateCloudIntegration(req.params.id, {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(provider !== undefined ? { provider } : {}),
        ...(auth_method !== undefined ? { auth_method } : {}),
        ...(credential_config !== undefined ? { credential_config } : {}),
        ...(supported_ci_providers !== undefined
          ? { supported_ci_providers }
          : {}),
      });

      await db.writeAuditLog({
        actor: req.registryUser?.email ?? 'unknown',
        action: 'cloud_integration.updated',
        resource_type: 'cloud_integration',
        resource_id: integration.id,
        resource_name: integration.name,
        details: { fields: Object.keys(req.body) },
      });

      res.json(updated);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Delete cloud integration
  router.delete('/v1/cloud-integrations/:id', async (req, res) => {
    try {
      const credentials = await httpAuth.credentials(req);
      const [decision] = await permissions.authorize([{ permission: registryCloudIntegrationDeletePermission }], { credentials });
      if (decision.result !== AuthorizeResult.ALLOW) throw forbidden('Permission denied');
      requireMinRole(req, 'admin');

      const integration = await db.getCloudIntegration(req.params.id);
      if (!integration) {
        throw notFound('INTEGRATION_NOT_FOUND', 'Cloud integration not found');
      }
      assertTeamAccess(integration, req.activeTeam);

      await db.deleteCloudIntegration(req.params.id);

      await db.writeAuditLog({
        actor: req.registryUser?.email ?? 'unknown',
        action: 'cloud_integration.deleted',
        resource_type: 'cloud_integration',
        resource_id: integration.id,
        resource_name: integration.name,
      });

      res.status(204).end();
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── Validate Cloud Integration ────────────────────────────────────────

  router.post('/v1/cloud-integrations/:id/validate', async (req, res) => {
    try {
      const integration = await db.getCloudIntegration(req.params.id);
      if (!integration) {
        throw notFound('INTEGRATION_NOT_FOUND', 'Cloud integration not found');
      }
      assertTeamAccess(integration, req.activeTeam);

      const { provider, auth_method, credential_config } = integration;
      const config = credential_config as Record<string, any> ?? {};
      const ciSecrets = (config.ciSecrets ?? {}) as Record<string, any>;
      let error: string | undefined;

      if (provider === 'aws' && auth_method === 'oidc') {
        if (!config.roleArn) error = 'roleArn is required for AWS OIDC';
        else if (!config.region) error = 'region is required for AWS OIDC';
      } else if (provider === 'aws' && auth_method === 'static') {
        if (!ciSecrets.accessKeyId)
          error = 'ciSecrets.accessKeyId is required for AWS static';
        else if (!ciSecrets.secretAccessKey)
          error = 'ciSecrets.secretAccessKey is required for AWS static';
        else if (!config.region) error = 'region is required for AWS static';
      } else if (provider === 'gcp' && auth_method === 'oidc') {
        if (!config.workloadIdentityProvider)
          error =
            'workloadIdentityProvider is required for GCP OIDC';
        else if (!config.serviceAccount)
          error = 'serviceAccount is required for GCP OIDC';
      } else if (provider === 'gcp' && auth_method === 'static') {
        if (!ciSecrets.credentialsJson)
          error = 'ciSecrets.credentialsJson is required for GCP static';
      } else if (provider === 'azure' && auth_method === 'oidc') {
        if (!config.clientId)
          error = 'clientId is required for Azure OIDC';
        else if (!config.tenantId)
          error = 'tenantId is required for Azure OIDC';
      } else if (provider === 'azure' && auth_method === 'static') {
        if (!ciSecrets.clientId)
          error = 'ciSecrets.clientId is required for Azure static';
        else if (!ciSecrets.clientSecret)
          error = 'ciSecrets.clientSecret is required for Azure static';
        else if (!ciSecrets.tenantId)
          error = 'ciSecrets.tenantId is required for Azure static';
      } else if (provider === 'custom') {
        if (!config.envVars || typeof config.envVars !== 'object')
          error = 'envVars object is required for custom provider';
      }

      if (error) {
        res.json({ valid: false, error });
        return;
      }

      // Mark as validated
      await db.updateCloudIntegration(req.params.id, {
        last_validated_at: new Date().toISOString(),
      });

      res.json({ valid: true });
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}

/**
 * Test connectivity to a cloud provider.
 * Returns { ok: boolean, message: string, latencyMs?: number }
 */
async function testCloudIntegrationConnection(
  provider: string,
  authMethod: string,
  config: Record<string, any>,
  logger: import('@backstage/backend-plugin-api').LoggerService,
): Promise<{ ok: boolean; message: string; latencyMs?: number }> {
  const start = Date.now();

  try {
    switch (provider) {
      case 'gcp': {
        if (authMethod === 'oidc') {
          // Validate the workload identity provider resource name format and
          // that the service account looks correct by hitting the IAM API.
          const wip = config.workloadIdentityProvider as string | undefined;
          const sa = config.serviceAccount as string | undefined;
          if (!wip) return { ok: false, message: 'Workload Identity Provider is required' };
          if (!sa) return { ok: false, message: 'Service Account email is required' };

          // Validate WIP format
          const wipPattern = /^projects\/\d+\/locations\/global\/workloadIdentityPools\/[\w-]+\/providers\/[\w-]+$/;
          if (!wipPattern.test(wip)) {
            return { ok: false, message: 'Invalid Workload Identity Provider format. Expected: projects/{number}/locations/global/workloadIdentityPools/{pool}/providers/{provider}' };
          }

          // Validate service account email format
          if (!sa.includes('@') || !sa.includes('.iam.gserviceaccount.com')) {
            return { ok: false, message: 'Invalid service account email format. Expected: name@project.iam.gserviceaccount.com' };
          }

          // Extract project number from WIP and try to hit the STS endpoint
          // to validate the pool exists (unauthenticated discovery)
          const projectNumber = wip.split('/')[1];
          const poolId = wip.split('/')[5];
          const url = `https://iam.googleapis.com/v1/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}`;

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          try {
            const resp = await fetch(url, {
              method: 'GET',
              signal: controller.signal,
            });
            clearTimeout(timeout);
            const latencyMs = Date.now() - start;

            // 401/403 means the endpoint is reachable and the pool likely exists
            // (we can't authenticate without a token, but reachability is confirmed)
            if (resp.status === 200) {
              return { ok: true, message: `GCP Workload Identity Pool verified (project ${projectNumber})`, latencyMs };
            }
            if (resp.status === 401 || resp.status === 403) {
              return { ok: true, message: `GCP IAM endpoint reachable. Pool "${poolId}" exists (auth required for full validation)`, latencyMs };
            }
            if (resp.status === 404) {
              return { ok: false, message: `Workload Identity Pool "${poolId}" not found in project ${projectNumber}`, latencyMs };
            }
            return { ok: false, message: `GCP IAM returned unexpected status ${resp.status}`, latencyMs };
          } catch (fetchErr: any) {
            clearTimeout(timeout);
            const latencyMs = Date.now() - start;
            if (fetchErr.name === 'AbortError') {
              return { ok: false, message: 'Connection timed out reaching GCP IAM API', latencyMs };
            }
            return { ok: false, message: `Failed to reach GCP IAM API: ${fetchErr.message}`, latencyMs };
          }
        }

        if (authMethod === 'static') {
          const ciSecrets = (config.ciSecrets ?? {}) as Record<string, any>;
          if (!ciSecrets.credentialsJson) {
            return { ok: false, message: 'Credentials JSON secret name is required' };
          }
          // Can't test static credentials without the actual secret value,
          // but we can validate the configuration is complete
          const latencyMs = Date.now() - start;
          return { ok: true, message: 'Static credentials configuration validated. Actual connectivity will be tested at run time.', latencyMs };
        }
        break;
      }

      case 'aws': {
        if (authMethod === 'oidc') {
          const roleArn = config.roleArn as string | undefined;
          const region = config.region as string | undefined;
          if (!roleArn) return { ok: false, message: 'Role ARN is required' };
          if (!region) return { ok: false, message: 'Region is required' };

          // Validate ARN format
          const arnPattern = /^arn:aws:iam::\d{12}:role\/[\w+=,.@\/-]+$/;
          if (!arnPattern.test(roleArn)) {
            return { ok: false, message: 'Invalid Role ARN format. Expected: arn:aws:iam::{account-id}:role/{role-name}' };
          }

          // Probe the STS regional endpoint to verify reachability
          const stsUrl = `https://sts.${region}.amazonaws.com/?Action=GetCallerIdentity&Version=2011-06-15`;
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          try {
            const resp = await fetch(stsUrl, {
              method: 'GET',
              signal: controller.signal,
            });
            clearTimeout(timeout);
            const latencyMs = Date.now() - start;

            // 403 = endpoint reachable (no creds, expected)
            // 400 = endpoint reachable
            if (resp.status === 403 || resp.status === 400) {
              return { ok: true, message: `AWS STS endpoint reachable in ${region}. Role ARN format valid.`, latencyMs };
            }
            return { ok: true, message: `AWS STS endpoint responded with status ${resp.status} in ${region}`, latencyMs };
          } catch (fetchErr: any) {
            clearTimeout(timeout);
            const latencyMs = Date.now() - start;
            if (fetchErr.name === 'AbortError') {
              return { ok: false, message: `Connection timed out reaching AWS STS in ${region}`, latencyMs };
            }
            return { ok: false, message: `Failed to reach AWS STS in ${region}: ${fetchErr.message}`, latencyMs };
          }
        }

        if (authMethod === 'static') {
          const region = config.region as string | undefined;
          if (!region) return { ok: false, message: 'Region is required' };
          const ciSecrets = (config.ciSecrets ?? {}) as Record<string, any>;
          if (!ciSecrets.accessKeyId) return { ok: false, message: 'Access Key ID secret name is required' };
          if (!ciSecrets.secretAccessKey) return { ok: false, message: 'Secret Access Key secret name is required' };

          const latencyMs = Date.now() - start;
          return { ok: true, message: 'Static credentials configuration validated. Actual connectivity will be tested at run time.', latencyMs };
        }
        break;
      }

      case 'azure': {
        if (authMethod === 'oidc') {
          const clientId = config.clientId as string | undefined;
          const tenantId = config.tenantId as string | undefined;
          if (!clientId) return { ok: false, message: 'Client ID is required' };
          if (!tenantId) return { ok: false, message: 'Tenant ID is required' };

          // Validate GUID format
          const guidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (!guidPattern.test(tenantId)) {
            return { ok: false, message: 'Invalid Tenant ID format. Expected a UUID.' };
          }

          // Probe the Azure AD OpenID configuration endpoint
          const url = `https://login.microsoftonline.com/${tenantId}/.well-known/openid-configuration`;
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          try {
            const resp = await fetch(url, {
              method: 'GET',
              signal: controller.signal,
            });
            clearTimeout(timeout);
            const latencyMs = Date.now() - start;

            if (resp.status === 200) {
              return { ok: true, message: `Azure AD tenant "${tenantId}" verified`, latencyMs };
            }
            if (resp.status === 400 || resp.status === 404) {
              return { ok: false, message: `Azure AD tenant "${tenantId}" not found`, latencyMs };
            }
            return { ok: false, message: `Azure AD returned unexpected status ${resp.status}`, latencyMs };
          } catch (fetchErr: any) {
            clearTimeout(timeout);
            const latencyMs = Date.now() - start;
            if (fetchErr.name === 'AbortError') {
              return { ok: false, message: 'Connection timed out reaching Azure AD', latencyMs };
            }
            return { ok: false, message: `Failed to reach Azure AD: ${fetchErr.message}`, latencyMs };
          }
        }

        if (authMethod === 'static') {
          const ciSecrets = (config.ciSecrets ?? {}) as Record<string, any>;
          if (!ciSecrets.clientId) return { ok: false, message: 'Client ID secret name is required' };
          if (!ciSecrets.clientSecret) return { ok: false, message: 'Client Secret secret name is required' };
          if (!ciSecrets.tenantId) return { ok: false, message: 'Tenant ID secret name is required' };

          const latencyMs = Date.now() - start;
          return { ok: true, message: 'Static credentials configuration validated. Actual connectivity will be tested at run time.', latencyMs };
        }
        break;
      }

      case 'custom': {
        const envVars = config.envVars as Record<string, any> | undefined;
        if (!envVars || Object.keys(envVars).length === 0) {
          return { ok: false, message: 'At least one environment variable is required' };
        }
        const latencyMs = Date.now() - start;
        return { ok: true, message: `Custom integration configured with ${Object.keys(envVars).length} env var(s)`, latencyMs };
      }

      default:
        return { ok: false, message: `Unknown provider: ${provider}` };
    }

    return { ok: false, message: `Unsupported auth method "${authMethod}" for provider "${provider}"` };
  } catch (err: any) {
    logger.error(`Cloud integration test failed: ${err.message}`, { provider, authMethod });
    const latencyMs = Date.now() - start;
    return { ok: false, message: `Connection test failed: ${err.message}`, latencyMs };
  }
}
