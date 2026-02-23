// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import Router from 'express-promise-router';
import { sendError, notFound, badRequest, forbidden, assertTeamAccess, requireMinRole } from '../util/errors';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import {
  registryProjectCreatePermission,
  registryProjectUpdatePermission,
  registryProjectDeletePermission,
} from '@internal/plugin-registry-common';
import { parsePagination } from '../util/pagination';
import type { RouterOptions } from '../router';

export function createProjectRouter(options: RouterOptions) {
  const { db, httpAuth, permissions } = options;
  const router = Router();

  // ── Project CRUD ──────────────────────────────────────────────────

  // List projects
  router.get('/v1/projects', async (req, res) => {
    try {
      const { cursor, limit } = parsePagination(req.query);
      const team = req.activeTeam;
      const status = req.query.status as string | undefined;
      const result = await db.listProjects({ team, status, cursor: cursor ?? undefined, limit });
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Create project
  router.post('/v1/projects', async (req, res) => {
    try {
      const credentials = await httpAuth.credentials(req);
      const [decision] = await permissions.authorize([{ permission: registryProjectCreatePermission }], { credentials });
      if (decision.result !== AuthorizeResult.ALLOW) throw forbidden('Permission denied');
      requireMinRole(req, 'operator');

      const { name, description, execution_mode } = req.body;
      if (!name) throw badRequest('name is required');

      const team = req.activeTeam ?? (req.body.team as string | undefined);
      if (!team) throw badRequest('team is required — projects must be team-scoped');

      const project = await db.createProject({
        name,
        description,
        team,
        execution_mode: execution_mode ?? 'byoc',
        created_by: req.registryUser?.email,
      });

      await db.writeAuditLog({
        actor: req.registryUser?.email ?? 'unknown',
        action: 'project.created',
        resource_type: 'project',
        resource_id: project.id,
        resource_name: project.name,
      });

      res.status(201).json(project);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Get project detail (includes environment summaries)
  router.get('/v1/projects/:projectId', async (req, res) => {
    try {
      const project = await db.getProject(req.params.projectId);
      if (!project) throw notFound('ARTIFACT_NOT_FOUND', 'Project not found');
      assertTeamAccess(project, req.activeTeam);

      // Include environment summaries
      const envResult = await db.listEnvironments({ projectId: req.params.projectId });
      const environments = envResult.items.map(env => ({
        id: env.id,
        name: env.name,
        status: env.status,
        locked: env.locked,
        total_resources: env.total_resources,
        last_run_at: env.last_run_at,
        state_backend_type: env.state_backend?.type ?? null,
      }));

      res.json({ ...project, environments });
    } catch (err) {
      sendError(res, err);
    }
  });

  // Update project
  router.patch('/v1/projects/:projectId', async (req, res) => {
    try {
      const credentials = await httpAuth.credentials(req);
      const [decision] = await permissions.authorize([{ permission: registryProjectUpdatePermission }], { credentials });
      if (decision.result !== AuthorizeResult.ALLOW) throw forbidden('Permission denied');
      requireMinRole(req, 'operator');

      const existing = await db.getProject(req.params.projectId);
      if (!existing) throw notFound('ARTIFACT_NOT_FOUND', 'Project not found');
      assertTeamAccess(existing, req.activeTeam);

      const { name, description, status, execution_mode } = req.body;
      const project = await db.updateProject(req.params.projectId, {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(execution_mode !== undefined ? { execution_mode } : {}),
      });
      if (!project) throw notFound('ARTIFACT_NOT_FOUND', 'Project not found');
      res.json(project);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Archive project (soft delete)
  router.delete('/v1/projects/:projectId', async (req, res) => {
    try {
      const credentials = await httpAuth.credentials(req);
      const [decision] = await permissions.authorize([{ permission: registryProjectDeletePermission }], { credentials });
      if (decision.result !== AuthorizeResult.ALLOW) throw forbidden('Permission denied');
      requireMinRole(req, 'admin');

      const project = await db.getProject(req.params.projectId);
      if (!project) throw notFound('ARTIFACT_NOT_FOUND', 'Project not found');
      assertTeamAccess(project, req.activeTeam);

      await db.deleteProject(req.params.projectId);

      await db.writeAuditLog({
        actor: req.registryUser?.email ?? 'unknown',
        action: 'project.archived',
        resource_type: 'project',
        resource_id: project.id,
        resource_name: project.name,
      });

      res.status(204).end();
    } catch (err) {
      sendError(res, err);
    }
  });

  // Get project module DAG
  router.get('/v1/projects/:projectId/graph', async (req, res) => {
    try {
      const project = await db.getProject(req.params.projectId);
      if (!project) throw notFound('ARTIFACT_NOT_FOUND', 'Project not found');
      assertTeamAccess(project, req.activeTeam);

      const { modules, deps } = await db.getProjectGraph(req.params.projectId);
      const nodes = modules.map(m => ({
        id: m.id,
        name: m.name,
        artifact_name: m.artifact_name,
        status: m.status,
      }));
      const edges = deps.map(d => ({
        from: d.depends_on_id,
        to: d.module_id,
      }));

      res.json({ nodes, edges });
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}
