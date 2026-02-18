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

  // List environments
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

  // Create environment
  router.post('/v1/environments', async (req, res) => {
    try {
      const credentials = await httpAuth.credentials(req);
      const [decision] = await permissions.authorize([{ permission: registryEnvironmentCreatePermission }], { credentials });
      if (decision.result !== AuthorizeResult.ALLOW) throw forbidden('Permission denied');
      requireMinRole(req, 'operator');

      const { name, description, team: bodyTeam } = req.body;
      if (!name) throw badRequest('name is required');

      // Use active team from header; fall back to body team for platform admins
      const team = req.activeTeam ?? (bodyTeam as string | undefined);
      if (!team) throw badRequest('team is required — environments must be team-scoped');

      const env = await db.createEnvironment({
        name,
        description,
        team,
        created_by: req.registryUser?.email,
      });

      await db.writeAuditLog({
        actor: req.registryUser?.email ?? 'unknown',
        action: 'environment.created',
        resource_type: 'environment',
        resource_id: env.id,
        resource_name: env.name,
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
      res.json(env);
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

      const { name, description, status } = req.body;
      const env = await db.updateEnvironment(req.params.envId, {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(status !== undefined ? { status } : {}),
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

      // Check all modules are destroyed
      const modules = await db.listModules(req.params.envId);
      const activeModules = modules.filter(m => m.status === 'active');
      if (activeModules.length > 0) {
        throw badRequest(
          `Cannot archive environment: ${activeModules.length} active module(s) must be destroyed first`,
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

  // Get dependency graph
  router.get('/v1/environments/:envId/graph', async (req, res) => {
    try {
      const env = await db.getEnvironment(req.params.envId);
      if (!env) throw notFound('ARTIFACT_NOT_FOUND', 'Environment not found');
      assertTeamAccess(env, req.activeTeam);

      const { modules, deps } = await db.getEnvironmentGraph(req.params.envId);
      const nodes = modules.map(m => ({
        id: m.id,
        name: m.name,
        artifact_name: m.artifact_name,
        status: m.status,
        last_run_status: m.last_run_status,
        resource_count: m.resource_count,
      }));
      const edges = deps.map(d => ({
        from: d.depends_on_id, // upstream
        to: d.module_id, // downstream
      }));

      res.json({ nodes, edges });
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}
