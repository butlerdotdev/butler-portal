// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import Router from 'express-promise-router';
import crypto from 'crypto';
import { sendError, notFound, badRequest, forbidden, assertTeamAccess, requireMinRole } from '../util/errors';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import { registryRunCreatePermission } from '@internal/plugin-registry-common';
import { parsePagination } from '../util/pagination';
import type { RouterOptions } from '../router';

export function createModuleRunRouter(options: RouterOptions) {
  const { config, db, logger, httpAuth, permissions } = options;
  const router = Router();

  // ── Module Runs (within an environment module) ────────────────────

  // List runs for a module
  router.get(
    '/v1/environments/:envId/modules/:moduleId/runs',
    async (req, res) => {
      try {
        const mod = await db.getModule(req.params.moduleId);
        if (!mod || mod.environment_id !== req.params.envId) {
          throw notFound('RUN_NOT_FOUND', 'Module not found');
        }
        const env = await db.getEnvironment(req.params.envId);
        assertTeamAccess(env, req.activeTeam);
        const { cursor, limit } = parsePagination(req.query);
        const status = req.query.status as string | undefined;
        const result = await db.listModuleRuns(req.params.moduleId, {
          status,
          cursor: cursor ?? undefined,
          limit,
        });
        res.json(result);
      } catch (err) {
        sendError(res, err);
      }
    },
  );

  // Create a module run
  router.post(
    '/v1/environments/:envId/modules/:moduleId/runs',
    async (req, res) => {
      try {
        const credentials = await httpAuth.credentials(req);
        const [decision] = await permissions.authorize([{ permission: registryRunCreatePermission }], { credentials });
        if (decision.result !== AuthorizeResult.ALLOW) throw forbidden('Permission denied');
        requireMinRole(req, 'operator');

        const env = await db.getEnvironment(req.params.envId);
        if (!env) throw notFound('ARTIFACT_NOT_FOUND', 'Environment not found');
        assertTeamAccess(env, req.activeTeam);

        // Check environment lock
        if (env.locked) {
          res.status(423).json({
            error: { message: 'Environment is locked', code: 'VALIDATION_ERROR' },
          });
          return;
        }

        const mod = await db.getModule(req.params.moduleId);
        if (!mod || mod.environment_id !== req.params.envId) {
          throw notFound('RUN_NOT_FOUND', 'Module not found');
        }

        const { operation, module_version, ci_provider } = req.body;
        if (!operation) throw badRequest('operation is required');

        const mode = mod.execution_mode;

        // For BYOC, generate callback token
        let callbackToken: string | undefined;
        let callbackTokenHash: string | undefined;

        if (mode === 'byoc') {
          callbackToken = `brce_${crypto.randomBytes(32).toString('hex')}`;
          callbackTokenHash = crypto
            .createHash('sha256')
            .update(callbackToken)
            .digest('hex');
        }

        // Snapshot variables at run creation time
        const variablesSnapshot = await db.snapshotModuleVariables(
          req.params.moduleId,
        );

        const run = await db.createModuleRun({
          id: crypto.randomUUID(),
          module_id: req.params.moduleId,
          environment_id: req.params.envId,
          module_name: mod.name,
          artifact_namespace: mod.artifact_namespace,
          artifact_name: mod.artifact_name,
          module_version: module_version ?? mod.pinned_version ?? undefined,
          operation,
          mode,
          status: 'pending',
          triggered_by: req.registryUser?.email ?? undefined,
          trigger_source: 'manual',
          priority: 'user',
          ci_provider: ci_provider ?? undefined,
          callback_token_hash: callbackTokenHash,
          tf_version: mod.tf_version ?? undefined,
          variables_snapshot: variablesSnapshot,
          state_backend_snapshot: mod.state_backend ?? undefined,
        });

        // Build butler URL for BYOC — runner fetches config from /config endpoint
        let butlerUrl: string | undefined;
        if (mode === 'byoc') {
          butlerUrl =
            config.getOptionalString('registry.iac.byoc.callbackBaseUrl') ??
            config.getOptionalString('registry.baseUrl') ??
            '';
          if (butlerUrl) {
            butlerUrl = `${butlerUrl}/api/registry`;
          }
        }

        await db.writeAuditLog({
          actor: req.registryUser?.email ?? 'unknown',
          action: 'module_run.created',
          resource_type: 'module_run',
          resource_id: run.id,
          resource_name: `${env.name}/${mod.name}`,
          resource_namespace: env.name,
          details: { operation, mode },
        });

        logger.info('Module run created', {
          runId: run.id,
          moduleId: mod.id,
          operation,
          mode,
        });

        // Strip internal fields
        const {
          callback_token_hash: _h,
          k8s_job_name: _j,
          k8s_namespace: _n,
          pipeline_config: _p,
          ...runResponse
        } = run;
        res.status(201).json({
          run: runResponse,
          ...(callbackToken ? { callbackToken } : {}),
          ...(butlerUrl ? { butlerUrl } : {}),
        });
      } catch (err) {
        sendError(res, err);
      }
    },
  );

  // ── Module Run Detail (by run ID) ─────────────────────────────────

  // Get module run detail
  router.get('/v1/module-runs/:runId', async (req, res) => {
    try {
      const run = await db.getModuleRun(req.params.runId);
      if (!run) throw notFound('RUN_NOT_FOUND', 'Module run not found');
      const env = await db.getEnvironment(run.environment_id);
      assertTeamAccess(env, req.activeTeam);
      const {
        callback_token_hash: _h,
        k8s_job_name: _j,
        k8s_namespace: _n,
        ...runResponse
      } = run;
      res.json(runResponse);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Get module run logs
  router.get('/v1/module-runs/:runId/logs', async (req, res) => {
    try {
      const run = await db.getModuleRun(req.params.runId);
      if (!run) throw notFound('RUN_NOT_FOUND', 'Module run not found');
      const env = await db.getEnvironment(run.environment_id);
      assertTeamAccess(env, req.activeTeam);
      const after = req.query.after ? Number(req.query.after) : undefined;
      const logs = await db.getModuleRunLogs(run.id, after);
      res.json({ logs });
    } catch (err) {
      sendError(res, err);
    }
  });

  // Get module run plan output
  router.get('/v1/module-runs/:runId/plan', async (req, res) => {
    try {
      const run = await db.getModuleRun(req.params.runId);
      if (!run) throw notFound('RUN_NOT_FOUND', 'Module run not found');
      const env = await db.getEnvironment(run.environment_id);
      assertTeamAccess(env, req.activeTeam);

      const planText = await db.getModuleRunOutput(run.id, 'plan_text');
      const planJson = await db.getModuleRunOutput(run.id, 'plan_json');
      if (!planText && !planJson) {
        throw notFound('RUN_NOT_FOUND', 'No plan output available');
      }
      res.json({
        plan_text: planText?.content ?? null,
        plan_json: planJson?.content ?? null,
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  // Get module run terraform outputs
  router.get('/v1/module-runs/:runId/outputs', async (req, res) => {
    try {
      const run = await db.getModuleRun(req.params.runId);
      if (!run) throw notFound('RUN_NOT_FOUND', 'Module run not found');
      const env = await db.getEnvironment(run.environment_id);
      assertTeamAccess(env, req.activeTeam);
      res.json({ outputs: run.tf_outputs ?? {} });
    } catch (err) {
      sendError(res, err);
    }
  });

  // Confirm apply after plan
  router.post('/v1/module-runs/:runId/confirm', async (req, res) => {
    try {
      const run = await db.getModuleRun(req.params.runId);
      if (!run) throw notFound('RUN_NOT_FOUND', 'Module run not found');
      const env = await db.getEnvironment(run.environment_id);
      assertTeamAccess(env, req.activeTeam);

      if (run.status === 'timed_out') {
        res.status(410).json({
          error: { message: 'Plan has expired', code: 'RUN_EXPIRED' },
        });
        return;
      }
      if (run.status !== 'planned') {
        throw badRequest('Can only confirm a run in planned status');
      }

      const now = new Date().toISOString();
      const updated = await db.updateModuleRunStatus(run.id, 'confirmed', {
        confirmed_at: now,
        confirmed_by: req.registryUser?.email ?? 'unknown',
      });

      await db.writeAuditLog({
        actor: req.registryUser?.email ?? 'unknown',
        action: 'module_run.confirmed',
        resource_type: 'module_run',
        resource_id: run.id,
        resource_name: run.module_name,
      });

      const {
        callback_token_hash: _h,
        k8s_job_name: _j,
        k8s_namespace: _n,
        ...runResponse
      } = updated!;
      res.json(runResponse);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Discard a planned run
  router.post('/v1/module-runs/:runId/discard', async (req, res) => {
    try {
      const run = await db.getModuleRun(req.params.runId);
      if (!run) throw notFound('RUN_NOT_FOUND', 'Module run not found');
      const env = await db.getEnvironment(run.environment_id);
      assertTeamAccess(env, req.activeTeam);

      if (run.status !== 'planned') {
        throw badRequest('Can only discard a run in planned status');
      }

      const now = new Date().toISOString();
      const updated = await db.updateModuleRunStatus(run.id, 'discarded', {
        completed_at: now,
      });

      // Dequeue next run for this module
      await db.dequeueNextModuleRun(run.module_id);

      await db.writeAuditLog({
        actor: req.registryUser?.email ?? 'unknown',
        action: 'module_run.discarded',
        resource_type: 'module_run',
        resource_id: run.id,
        resource_name: run.module_name,
      });

      const {
        callback_token_hash: _h,
        k8s_job_name: _j,
        k8s_namespace: _n,
        ...runResponse
      } = updated!;
      res.json(runResponse);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Cancel a module run
  router.post('/v1/module-runs/:runId/cancel', async (req, res) => {
    try {
      const run = await db.getModuleRun(req.params.runId);
      if (!run) throw notFound('RUN_NOT_FOUND', 'Module run not found');
      const env = await db.getEnvironment(run.environment_id);
      assertTeamAccess(env, req.activeTeam);

      const terminalStatuses = [
        'succeeded',
        'failed',
        'cancelled',
        'timed_out',
        'discarded',
        'skipped',
      ];
      if (terminalStatuses.includes(run.status)) {
        throw badRequest(`Cannot cancel a run with status '${run.status}'`);
      }

      const now = new Date().toISOString();
      const updated = await db.updateModuleRunStatus(run.id, 'cancelled', {
        completed_at: now,
      });

      // Dequeue next run for this module
      await db.dequeueNextModuleRun(run.module_id);

      await db.writeAuditLog({
        actor: req.registryUser?.email ?? 'unknown',
        action: 'module_run.cancelled',
        resource_type: 'module_run',
        resource_id: run.id,
        resource_name: run.module_name,
      });

      const {
        callback_token_hash: _h,
        k8s_job_name: _j,
        k8s_namespace: _n,
        ...runResponse
      } = updated!;
      res.json(runResponse);
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}
