// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import Router from 'express-promise-router';
import { sendError, notFound, badRequest, conflict, forbidden, assertTeamAccess, requireMinRole } from '../util/errors';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import {
  registryEnvironmentCreatePermission,
  registryEnvironmentUpdatePermission,
  registryEnvironmentDeletePermission,
  registryEnvironmentLockPermission,
} from '@internal/plugin-registry-common';
import { parsePagination } from '../util/pagination';
import type { RouterOptions } from '../router';

export function createEnvironmentRouter(options: RouterOptions) {
  const { db, httpAuth, permissions } = options;
  const router = Router();

  // ── Environment CRUD ────────────────────────────────────────────────

  // List all environments (flat, filtered by team)
  router.get('/v1/environments', async (req, res) => {
    try {
      const { cursor, limit } = parsePagination(req.query);
      const team = req.activeTeam;
      const status = req.query.status as string | undefined;
      const result = await db.listEnvironments({ team, status, cursor: cursor ?? undefined, limit });
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  // List environments for a project
  router.get('/v1/projects/:projectId/environments', async (req, res) => {
    try {
      const project = await db.getProject(req.params.projectId);
      if (!project) throw notFound('ARTIFACT_NOT_FOUND', 'Project not found');
      assertTeamAccess(project, req.activeTeam);

      const result = await db.listEnvironments({ projectId: req.params.projectId });
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Create environment in a project
  router.post('/v1/projects/:projectId/environments', async (req, res) => {
    try {
      const credentials = await httpAuth.credentials(req);
      const [decision] = await permissions.authorize([{ permission: registryEnvironmentCreatePermission }], { credentials });
      if (decision.result !== AuthorizeResult.ALLOW) throw forbidden('Permission denied');
      requireMinRole(req, 'operator');

      const project = await db.getProject(req.params.projectId);
      if (!project) throw notFound('ARTIFACT_NOT_FOUND', 'Project not found');
      assertTeamAccess(project, req.activeTeam);

      const { name, description, state_backend } = req.body;
      if (!name) throw badRequest('name is required');

      const env = await db.createEnvironment(req.params.projectId, {
        name,
        description,
        team: project.team ?? undefined,
        state_backend,
        created_by: req.registryUser?.email,
      });

      await db.writeAuditLog({
        actor: req.registryUser?.email ?? 'unknown',
        action: 'environment.created',
        resource_type: 'environment',
        resource_id: env.id,
        resource_name: env.name,
        details: { project_id: req.params.projectId },
      });

      res.status(201).json(env);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Get environment detail
  router.get('/v1/environments/:envId', async (req, res) => {
    try {
      const env = await db.getEnvironment(req.params.envId);
      if (!env) throw notFound('ARTIFACT_NOT_FOUND', 'Environment not found');
      assertTeamAccess(env, req.activeTeam);

      // Include module states for this environment
      const moduleStates = await db.listEnvironmentModuleStates(req.params.envId);

      res.json({ ...env, module_states: moduleStates });
    } catch (err) {
      sendError(res, err);
    }
  });

  // Update environment
  router.patch('/v1/environments/:envId', async (req, res) => {
    try {
      const credentials = await httpAuth.credentials(req);
      const [decision] = await permissions.authorize([{ permission: registryEnvironmentUpdatePermission }], { credentials });
      if (decision.result !== AuthorizeResult.ALLOW) throw forbidden('Permission denied');
      requireMinRole(req, 'operator');

      const existing = await db.getEnvironment(req.params.envId);
      if (!existing) throw notFound('ARTIFACT_NOT_FOUND', 'Environment not found');
      assertTeamAccess(existing, req.activeTeam);

      const { name, description, status, state_backend } = req.body;
      const env = await db.updateEnvironment(req.params.envId, {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(state_backend !== undefined ? { state_backend } : {}),
      });
      if (!env) throw notFound('ARTIFACT_NOT_FOUND', 'Environment not found');
      res.json(env);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Archive environment (soft delete)
  router.delete('/v1/environments/:envId', async (req, res) => {
    try {
      const credentials = await httpAuth.credentials(req);
      const [decision] = await permissions.authorize([{ permission: registryEnvironmentDeletePermission }], { credentials });
      if (decision.result !== AuthorizeResult.ALLOW) throw forbidden('Permission denied');
      requireMinRole(req, 'admin');

      const env = await db.getEnvironment(req.params.envId);
      if (!env) throw notFound('ARTIFACT_NOT_FOUND', 'Environment not found');
      assertTeamAccess(env, req.activeTeam);

      // Check no active resources via module states
      const moduleStates = await db.listEnvironmentModuleStates(req.params.envId);
      const withResources = moduleStates.filter(s => s.resource_count > 0);
      if (withResources.length > 0) {
        throw badRequest(
          `Cannot archive environment: ${withResources.length} module(s) have active resources — destroy first`,
        );
      }

      await db.deleteEnvironment(req.params.envId);

      await db.writeAuditLog({
        actor: req.registryUser?.email ?? 'unknown',
        action: 'environment.archived',
        resource_type: 'environment',
        resource_id: env.id,
        resource_name: env.name,
      });

      res.status(204).end();
    } catch (err) {
      sendError(res, err);
    }
  });

  // Lock environment
  router.post('/v1/environments/:envId/lock', async (req, res) => {
    try {
      const credentials = await httpAuth.credentials(req);
      const [decision] = await permissions.authorize([{ permission: registryEnvironmentLockPermission }], { credentials });
      if (decision.result !== AuthorizeResult.ALLOW) throw forbidden('Permission denied');
      requireMinRole(req, 'admin');

      const env = await db.getEnvironment(req.params.envId);
      if (!env) throw notFound('ARTIFACT_NOT_FOUND', 'Environment not found');
      assertTeamAccess(env, req.activeTeam);
      if (env.locked) throw conflict('APPROVAL_DENIED', 'Environment is already locked');

      const updated = await db.updateEnvironment(req.params.envId, {
        locked: true,
        locked_by: req.registryUser?.email ?? null,
        locked_at: new Date().toISOString(),
        lock_reason: req.body.reason ?? null,
      });

      await db.writeAuditLog({
        actor: req.registryUser?.email ?? 'unknown',
        action: 'environment.locked',
        resource_type: 'environment',
        resource_id: env.id,
        resource_name: env.name,
        details: { reason: req.body.reason },
      });

      res.json(updated);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Unlock environment
  router.post('/v1/environments/:envId/unlock', async (req, res) => {
    try {
      const credentials = await httpAuth.credentials(req);
      const [decision] = await permissions.authorize([{ permission: registryEnvironmentLockPermission }], { credentials });
      if (decision.result !== AuthorizeResult.ALLOW) throw forbidden('Permission denied');
      requireMinRole(req, 'admin');

      const env = await db.getEnvironment(req.params.envId);
      if (!env) throw notFound('ARTIFACT_NOT_FOUND', 'Environment not found');
      assertTeamAccess(env, req.activeTeam);
      if (!env.locked) throw conflict('APPROVAL_DENIED', 'Environment is not locked');

      const updated = await db.updateEnvironment(req.params.envId, {
        locked: false,
        locked_by: null,
        locked_at: null,
        lock_reason: null,
      });

      await db.writeAuditLog({
        actor: req.registryUser?.email ?? 'unknown',
        action: 'environment.unlocked',
        resource_type: 'environment',
        resource_id: env.id,
        resource_name: env.name,
      });

      res.json(updated);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── State Backend Connection Test ───────────────────────────────────

  router.post('/v1/state-backend/test', async (req, res) => {
    try {
      requireMinRole(req, 'operator');

      const { type, config: backendConfig } = req.body;
      if (!type) throw badRequest('type is required');

      const result = await testStateBackendConnection(type, backendConfig ?? {}, options.logger);
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}

/**
 * Test connectivity to a state backend.
 * Returns { ok: boolean, message: string, latencyMs?: number }
 */
async function testStateBackendConnection(
  type: string,
  config: Record<string, unknown>,
  logger: import('@backstage/backend-plugin-api').LoggerService,
): Promise<{ ok: boolean; message: string; latencyMs?: number }> {
  const start = Date.now();

  try {
    switch (type) {
      case 's3': {
        const endpoint = config.endpoint as string | undefined;
        const bucket = config.bucket as string | undefined;
        const region = config.region as string ?? 'us-east-1';
        const accessKey = config.access_key as string | undefined;
        const secretKey = config.secret_key as string | undefined;

        if (!bucket) {
          return { ok: false, message: 'Bucket name is required' };
        }

        // Build a basic S3 HeadBucket request using AWS Signature V4 or
        // simple unauthenticated probe. For S3-compatible stores (SeaweedFS,
        // MinIO), try a HEAD request to the bucket endpoint.
        const baseUrl = endpoint ?? `https://s3.${region}.amazonaws.com`;
        const url = `${baseUrl}/${bucket}`;

        const headers: Record<string, string> = {};
        if (accessKey && secretKey) {
          // For S3-compatible stores, basic auth or query params may work.
          // We use a simple GET with path-style access as a connectivity check.
          headers['x-amz-content-sha256'] = 'UNSIGNED-PAYLOAD';
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
          const resp = await fetch(url, {
            method: 'HEAD',
            headers,
            signal: controller.signal,
          });
          clearTimeout(timeout);
          const latencyMs = Date.now() - start;

          // 200 = bucket exists and accessible
          // 403 = bucket exists but credentials may be wrong (still reachable)
          // 404 = bucket doesn't exist
          // 301 = wrong region redirect
          if (resp.status === 200 || resp.status === 204) {
            return { ok: true, message: `Connected to bucket "${bucket}"`, latencyMs };
          }
          if (resp.status === 403) {
            return { ok: true, message: `Endpoint reachable, bucket "${bucket}" exists (credentials may need verification)`, latencyMs };
          }
          if (resp.status === 404) {
            return { ok: false, message: `Bucket "${bucket}" not found at ${baseUrl}`, latencyMs };
          }
          if (resp.status === 301) {
            return { ok: false, message: `Bucket "${bucket}" is in a different region — check region setting`, latencyMs };
          }
          return { ok: false, message: `Unexpected response: HTTP ${resp.status}`, latencyMs };
        } finally {
          clearTimeout(timeout);
        }
      }

      case 'gcs': {
        const bucket = config.bucket as string | undefined;
        if (!bucket) {
          return { ok: false, message: 'Bucket name is required' };
        }
        const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
          const resp = await fetch(url, { method: 'GET', signal: controller.signal });
          clearTimeout(timeout);
          const latencyMs = Date.now() - start;
          if (resp.status === 200) {
            return { ok: true, message: `Connected to GCS bucket "${bucket}"`, latencyMs };
          }
          if (resp.status === 404) {
            return { ok: false, message: `GCS bucket "${bucket}" not found`, latencyMs };
          }
          if (resp.status === 401 || resp.status === 403) {
            return { ok: true, message: `GCS bucket "${bucket}" exists (authentication required for full access)`, latencyMs };
          }
          return { ok: false, message: `Unexpected response: HTTP ${resp.status}`, latencyMs };
        } finally {
          clearTimeout(timeout);
        }
      }

      case 'azurerm': {
        const accountName = config.storage_account_name as string | undefined;
        const containerName = config.container_name as string | undefined;
        if (!accountName) {
          return { ok: false, message: 'Storage account name is required' };
        }
        if (!containerName) {
          return { ok: false, message: 'Container name is required' };
        }
        const url = `https://${accountName}.blob.core.windows.net/${containerName}?restype=container`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
          const resp = await fetch(url, { method: 'HEAD', signal: controller.signal });
          clearTimeout(timeout);
          const latencyMs = Date.now() - start;
          if (resp.status === 200) {
            return { ok: true, message: `Connected to Azure container "${containerName}"`, latencyMs };
          }
          if (resp.status === 404) {
            return { ok: false, message: `Container "${containerName}" not found in storage account "${accountName}"`, latencyMs };
          }
          if (resp.status === 403) {
            return { ok: true, message: `Azure storage reachable, container "${containerName}" exists (credentials needed for full access)`, latencyMs };
          }
          return { ok: false, message: `Unexpected response: HTTP ${resp.status}`, latencyMs };
        } finally {
          clearTimeout(timeout);
        }
      }

      case 'consul': {
        const address = (config.address as string) || 'http://127.0.0.1:8500';
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
          const resp = await fetch(`${address}/v1/status/leader`, { signal: controller.signal });
          clearTimeout(timeout);
          const latencyMs = Date.now() - start;
          if (resp.ok) {
            return { ok: true, message: 'Connected to Consul', latencyMs };
          }
          return { ok: false, message: `Consul returned HTTP ${resp.status}`, latencyMs };
        } finally {
          clearTimeout(timeout);
        }
      }

      case 'http': {
        const address = config.address as string | undefined;
        if (!address) {
          return { ok: false, message: 'HTTP address is required' };
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
          const resp = await fetch(address, { method: 'GET', signal: controller.signal });
          clearTimeout(timeout);
          const latencyMs = Date.now() - start;
          return { ok: resp.ok, message: resp.ok ? 'HTTP endpoint reachable' : `HTTP ${resp.status}`, latencyMs };
        } finally {
          clearTimeout(timeout);
        }
      }

      default:
        return { ok: false, message: `Connection testing not supported for backend type "${type}"` };
    }
  } catch (err) {
    const latencyMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('abort') || message.includes('AbortError')) {
      return { ok: false, message: 'Connection timed out (10s)', latencyMs };
    }
    logger.warn('State backend connection test failed', { type, error: message });
    return { ok: false, message: `Connection failed: ${message}`, latencyMs };
  }
}
