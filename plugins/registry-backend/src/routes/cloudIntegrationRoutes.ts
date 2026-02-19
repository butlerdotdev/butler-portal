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
