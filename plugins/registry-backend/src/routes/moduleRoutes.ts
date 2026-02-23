// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import Router from 'express-promise-router';
import { sendError, notFound, badRequest, forbidden, assertTeamAccess, requireMinRole } from '../util/errors';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import {
  registryProjectUpdatePermission,
  registryEnvironmentLockPermission,
} from '@internal/plugin-registry-common';
import type { RouterOptions } from '../router';

export function createModuleRouter(options: RouterOptions) {
  const { db, httpAuth, permissions } = options;
  const router = Router();

  // ── Project Module CRUD ───────────────────────────────────────────

  // List modules in project
  router.get('/v1/projects/:projectId/modules', async (req, res) => {
    try {
      const project = await db.getProject(req.params.projectId);
      if (!project) throw notFound('ARTIFACT_NOT_FOUND', 'Project not found');
      assertTeamAccess(project, req.activeTeam);
      const modules = await db.listProjectModules(req.params.projectId);
      res.json({ modules });
    } catch (err) {
      sendError(res, err);
    }
  });

  // Add module to project
  router.post('/v1/projects/:projectId/modules', async (req, res) => {
    try {
      const credentials = await httpAuth.credentials(req);
      const [decision] = await permissions.authorize([{ permission: registryProjectUpdatePermission }], { credentials });
      if (decision.result !== AuthorizeResult.ALLOW) throw forbidden('Permission denied');
      requireMinRole(req, 'operator');

      const project = await db.getProject(req.params.projectId);
      if (!project) throw notFound('ARTIFACT_NOT_FOUND', 'Project not found');
      assertTeamAccess(project, req.activeTeam);

      const {
        name,
        description,
        artifact_namespace,
        artifact_name,
        pinned_version,
        auto_plan_on_module_update,
        tf_version,
        working_directory,
      } = req.body;

      if (!name) throw badRequest('name is required');
      if (!artifact_namespace || !artifact_name) {
        throw badRequest('artifact_namespace and artifact_name are required');
      }

      // Verify artifact exists
      const artifact = await db.getArtifact(artifact_namespace, artifact_name);
      if (!artifact) throw notFound('ARTIFACT_NOT_FOUND', 'Artifact not found');

      const mod = await db.addProjectModule(req.params.projectId, {
        name,
        description,
        artifact_id: artifact.id,
        artifact_namespace,
        artifact_name,
        pinned_version,
        auto_plan_on_module_update,
        tf_version,
        working_directory,
      });

      await db.writeAuditLog({
        actor: req.registryUser?.email ?? 'unknown',
        action: 'module.added',
        resource_type: 'project_module',
        resource_id: mod.id,
        resource_name: `${project.name}/${name}`,
        resource_namespace: project.name,
      });

      res.status(201).json(mod);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Get module detail
  router.get('/v1/projects/:projectId/modules/:moduleId', async (req, res) => {
    try {
      const mod = await db.getProjectModule(req.params.moduleId);
      if (!mod || mod.project_id !== req.params.projectId) {
        throw notFound('RUN_NOT_FOUND', 'Module not found');
      }
      res.json(mod);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Update module config
  router.patch(
    '/v1/projects/:projectId/modules/:moduleId',
    async (req, res) => {
      try {
        const credentials = await httpAuth.credentials(req);
        const [decision] = await permissions.authorize([{ permission: registryProjectUpdatePermission }], { credentials });
        if (decision.result !== AuthorizeResult.ALLOW) throw forbidden('Permission denied');
        requireMinRole(req, 'operator');

        const mod = await db.getProjectModule(req.params.moduleId);
        if (!mod || mod.project_id !== req.params.projectId) {
          throw notFound('RUN_NOT_FOUND', 'Module not found');
        }

        const updated = await db.updateProjectModule(req.params.moduleId, req.body);
        res.json(updated);
      } catch (err) {
        sendError(res, err);
      }
    },
  );

  // Remove module (must have no active resources in any env)
  router.delete(
    '/v1/projects/:projectId/modules/:moduleId',
    async (req, res) => {
      try {
        const credentials = await httpAuth.credentials(req);
        const [decision] = await permissions.authorize([{ permission: registryProjectUpdatePermission }], { credentials });
        if (decision.result !== AuthorizeResult.ALLOW) throw forbidden('Permission denied');
        requireMinRole(req, 'operator');

        const mod = await db.getProjectModule(req.params.moduleId);
        if (!mod || mod.project_id !== req.params.projectId) {
          throw notFound('RUN_NOT_FOUND', 'Module not found');
        }

        await db.removeProjectModule(req.params.moduleId);

        await db.writeAuditLog({
          actor: req.registryUser?.email ?? 'unknown',
          action: 'module.removed',
          resource_type: 'project_module',
          resource_id: mod.id,
          resource_name: mod.name,
        });

        res.status(204).end();
      } catch (err) {
        sendError(res, err);
      }
    },
  );

  // ── Project Module Dependencies ───────────────────────────────────

  // List dependencies
  router.get(
    '/v1/projects/:projectId/modules/:moduleId/dependencies',
    async (req, res) => {
      try {
        const mod = await db.getProjectModule(req.params.moduleId);
        if (!mod || mod.project_id !== req.params.projectId) {
          throw notFound('RUN_NOT_FOUND', 'Module not found');
        }
        const dependencies = await db.getProjectModuleDependencies(
          req.params.moduleId,
        );
        res.json({ dependencies });
      } catch (err) {
        sendError(res, err);
      }
    },
  );

  // Set dependencies (replace all) — validates cycle detection at write time
  router.put(
    '/v1/projects/:projectId/modules/:moduleId/dependencies',
    async (req, res) => {
      try {
        const mod = await db.getProjectModule(req.params.moduleId);
        if (!mod || mod.project_id !== req.params.projectId) {
          throw notFound('RUN_NOT_FOUND', 'Module not found');
        }

        const { dependencies } = req.body;
        if (!Array.isArray(dependencies)) {
          throw badRequest('dependencies array is required');
        }

        // Validate all depends_on_ids are in the same project
        for (const dep of dependencies) {
          if (!dep.depends_on_id) {
            throw badRequest('each dependency must have a depends_on_id');
          }
          const target = await db.getProjectModule(dep.depends_on_id);
          if (!target || target.project_id !== req.params.projectId) {
            throw badRequest(
              `Dependency target ${dep.depends_on_id} not found in this project`,
            );
          }
        }

        // Cycle detection via DFS
        const dependsOnIds = dependencies.map(
          (d: any) => d.depends_on_id as string,
        );
        const cyclePath = await db.detectCycle(
          req.params.projectId,
          req.params.moduleId,
          dependsOnIds,
        );
        if (cyclePath) {
          throw badRequest(cyclePath);
        }

        const result = await db.setProjectModuleDependencies(
          req.params.moduleId,
          dependencies.map((d: any) => ({
            depends_on_id: d.depends_on_id,
            output_mapping: d.output_mapping,
          })),
        );

        res.json({ dependencies: result });
      } catch (err) {
        sendError(res, err);
      }
    },
  );

  // ── Environment-scoped Module Variables ────────────────────────────

  // List variables (sensitive values masked)
  router.get(
    '/v1/environments/:envId/modules/:moduleId/variables',
    async (req, res) => {
      try {
        const env = await db.getEnvironment(req.params.envId);
        if (!env) throw notFound('ARTIFACT_NOT_FOUND', 'Environment not found');
        assertTeamAccess(env, req.activeTeam);

        const mod = await db.getProjectModule(req.params.moduleId);
        if (!mod || mod.project_id !== env.project_id) {
          throw notFound('RUN_NOT_FOUND', 'Module not found in this project');
        }

        const variables = await db.listModuleVariables(req.params.envId, req.params.moduleId);
        const masked = variables.map(v => ({
          ...v,
          value: v.sensitive ? null : v.value,
        }));
        res.json({ variables: masked });
      } catch (err) {
        sendError(res, err);
      }
    },
  );

  // Bulk upsert variables
  router.put(
    '/v1/environments/:envId/modules/:moduleId/variables',
    async (req, res) => {
      try {
        const env = await db.getEnvironment(req.params.envId);
        if (!env) throw notFound('ARTIFACT_NOT_FOUND', 'Environment not found');
        assertTeamAccess(env, req.activeTeam);

        const mod = await db.getProjectModule(req.params.moduleId);
        if (!mod || mod.project_id !== env.project_id) {
          throw notFound('RUN_NOT_FOUND', 'Module not found in this project');
        }

        const { variables } = req.body;
        if (!Array.isArray(variables)) {
          throw badRequest('variables array is required');
        }
        const result = await db.upsertModuleVariables(
          req.params.envId,
          req.params.moduleId,
          variables,
        );
        const masked = result.map(v => ({
          ...v,
          value: v.sensitive ? null : v.value,
        }));
        res.json({ variables: masked });
      } catch (err) {
        sendError(res, err);
      }
    },
  );

  // Partial update variables
  router.patch(
    '/v1/environments/:envId/modules/:moduleId/variables',
    async (req, res) => {
      try {
        const env = await db.getEnvironment(req.params.envId);
        if (!env) throw notFound('ARTIFACT_NOT_FOUND', 'Environment not found');
        assertTeamAccess(env, req.activeTeam);

        const mod = await db.getProjectModule(req.params.moduleId);
        if (!mod || mod.project_id !== env.project_id) {
          throw notFound('RUN_NOT_FOUND', 'Module not found in this project');
        }

        const { variables } = req.body;
        if (!Array.isArray(variables)) {
          throw badRequest('variables array is required');
        }
        const result = await db.upsertModuleVariables(
          req.params.envId,
          req.params.moduleId,
          variables,
        );
        const masked = result.map(v => ({
          ...v,
          value: v.sensitive ? null : v.value,
        }));
        res.json({ variables: masked });
      } catch (err) {
        sendError(res, err);
      }
    },
  );

  // Delete variable
  router.delete(
    '/v1/environments/:envId/modules/:moduleId/variables/:key',
    async (req, res) => {
      try {
        const env = await db.getEnvironment(req.params.envId);
        if (!env) throw notFound('ARTIFACT_NOT_FOUND', 'Environment not found');
        assertTeamAccess(env, req.activeTeam);

        const mod = await db.getProjectModule(req.params.moduleId);
        if (!mod || mod.project_id !== env.project_id) {
          throw notFound('RUN_NOT_FOUND', 'Module not found in this project');
        }

        const category = (req.query.category as string) ?? 'terraform';
        await db.deleteModuleVariable(
          req.params.envId,
          req.params.moduleId,
          req.params.key,
          category,
        );
        res.status(204).end();
      } catch (err) {
        sendError(res, err);
      }
    },
  );

  // ── Environment-scoped Module Actions ─────────────────────────────

  // Get latest Terraform outputs from most recent successful apply in this env
  router.get(
    '/v1/environments/:envId/modules/:moduleId/latest-outputs',
    async (req, res) => {
      try {
        const env = await db.getEnvironment(req.params.envId);
        if (!env) throw notFound('ARTIFACT_NOT_FOUND', 'Environment not found');
        assertTeamAccess(env, req.activeTeam);

        const mod = await db.getProjectModule(req.params.moduleId);
        if (!mod || mod.project_id !== env.project_id) {
          throw notFound('RUN_NOT_FOUND', 'Module not found in this project');
        }

        const run = await db.getLatestSuccessfulModuleRun(req.params.moduleId, req.params.envId);
        res.json({ outputs: run?.tf_outputs ?? {} });
      } catch (err) {
        sendError(res, err);
      }
    },
  );

  // Force-unlock state (admin-only)
  router.post(
    '/v1/environments/:envId/modules/:moduleId/force-unlock',
    async (req, res) => {
      try {
        const credentials = await httpAuth.credentials(req);
        const [decision] = await permissions.authorize([{ permission: registryEnvironmentLockPermission }], { credentials });
        if (decision.result !== AuthorizeResult.ALLOW) throw forbidden('Permission denied');

        const env = await db.getEnvironment(req.params.envId);
        if (!env) throw notFound('ARTIFACT_NOT_FOUND', 'Environment not found');
        assertTeamAccess(env, req.activeTeam);

        const mod = await db.getProjectModule(req.params.moduleId);
        if (!mod || mod.project_id !== env.project_id) {
          throw notFound('RUN_NOT_FOUND', 'Module not found in this project');
        }

        const state = await db.forceUnlockTerraformState(req.params.envId, req.params.moduleId);

        await db.writeAuditLog({
          actor: req.registryUser?.email ?? 'unknown',
          action: 'state.force_unlocked',
          resource_type: 'project_module',
          resource_id: mod.id,
          resource_name: mod.name,
          details: {
            environment_id: req.params.envId,
            previous_lock_id: state?.lock_id,
            previous_locked_by: state?.locked_by,
          },
        });

        res.json({ status: 'unlocked' });
      } catch (err) {
        sendError(res, err);
      }
    },
  );

  // ── Cross-reference ──────────────────────────────────────────────

  // List project modules using a given artifact
  router.get(
    '/v1/artifacts/:namespace/:name/projects',
    async (req, res) => {
      try {
        const artifact = await db.getArtifact(
          req.params.namespace,
          req.params.name,
        );
        if (!artifact) throw notFound('ARTIFACT_NOT_FOUND', 'Artifact not found');
        const modules = await db.listProjectModulesForArtifact(artifact.id);
        res.json({ modules });
      } catch (err) {
        sendError(res, err);
      }
    },
  );

  return router;
}
