// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import Router from 'express-promise-router';
import crypto from 'crypto';
import { sendError, notFound, badRequest, forbidden, assertTeamAccess, requireMinRole } from '../util/errors';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import { registryRunCreatePermission } from '@internal/plugin-registry-common';
import type { RouterOptions } from '../router';

export function createEnvironmentRunRouter(options: RouterOptions) {
  const { db, logger, httpAuth, permissions, dagExecutor } = options;
  const router = Router();

  // ── Environment Runs (DAG-wide execution) ─────────────────────────

  // List environment runs
  router.get('/v1/environments/:envId/runs', async (req, res) => {
    try {
      const env = await db.getEnvironment(req.params.envId);
      if (!env) throw notFound('ARTIFACT_NOT_FOUND', 'Environment not found');
      assertTeamAccess(env, req.activeTeam);
      const runs = await db.listEnvironmentRuns(req.params.envId);
      res.json({ runs });
    } catch (err) {
      sendError(res, err);
    }
  });

  // Create environment run (plan-all, apply-all, destroy-all)
  router.post('/v1/environments/:envId/runs', async (req, res) => {
    try {
      const credentials = await httpAuth.credentials(req);
      const [decision] = await permissions.authorize([{ permission: registryRunCreatePermission }], { credentials });
      if (decision.result !== AuthorizeResult.ALLOW) throw forbidden('Permission denied');
      requireMinRole(req, 'operator');

      const env = await db.getEnvironment(req.params.envId);
      if (!env) throw notFound('ARTIFACT_NOT_FOUND', 'Environment not found');
      assertTeamAccess(env, req.activeTeam);

      if (env.locked) {
        res.status(423).json({
          error: { message: 'Environment is locked', code: 'VALIDATION_ERROR' },
        });
        return;
      }

      const { operation } = req.body;
      if (
        !operation ||
        !['plan-all', 'apply-all', 'destroy-all'].includes(operation)
      ) {
        throw badRequest(
          'operation must be plan-all, apply-all, or destroy-all',
        );
      }

      // Get modules and compute execution order
      const modules = await db.listModules(req.params.envId);
      const activeModules = modules.filter(m => m.status === 'active');
      if (activeModules.length === 0) {
        throw badRequest('No active modules in this environment');
      }

      const executionOrder = await db.topologicalSort(req.params.envId);

      const envRun = await db.createEnvironmentRun({
        id: crypto.randomUUID(),
        environment_id: req.params.envId,
        environment_name: env.name,
        operation,
        triggered_by: req.registryUser?.email ?? undefined,
        trigger_source: 'manual',
        total_modules: activeModules.length,
        execution_order: executionOrder,
      });

      await db.writeAuditLog({
        actor: req.registryUser?.email ?? 'unknown',
        action: 'environment_run.created',
        resource_type: 'environment_run',
        resource_id: envRun.id,
        resource_name: env.name,
        details: { operation, total_modules: activeModules.length },
      });

      logger.info('Environment run created', {
        runId: envRun.id,
        envId: env.id,
        operation,
        totalModules: activeModules.length,
      });

      // Start the DAG — creates individual module runs in topological order
      if (dagExecutor) {
        await dagExecutor.startEnvironmentRun(envRun.id);
      }

      res.status(201).json(envRun);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── Environment Run Detail ────────────────────────────────────────

  // Get environment run detail (includes per-module run status)
  router.get('/v1/environment-runs/:runId', async (req, res) => {
    try {
      const envRun = await db.getEnvironmentRun(req.params.runId);
      if (!envRun) {
        throw notFound('RUN_NOT_FOUND', 'Environment run not found');
      }
      const env = await db.getEnvironment(envRun.environment_id);
      assertTeamAccess(env, req.activeTeam);

      const moduleRuns = await db.getModuleRunsForEnvRun(envRun.id);

      res.json({
        ...envRun,
        module_runs: moduleRuns.map(r => {
          const {
            callback_token_hash: _h,
            k8s_job_name: _j,
            k8s_namespace: _n,
            variables_snapshot: _vs,
            env_vars_snapshot: _es,
            state_backend_snapshot: _sb,
            ...rest
          } = r;
          return rest;
        }),
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  // Confirm environment run after plan-all
  router.post('/v1/environment-runs/:runId/confirm', async (req, res) => {
    try {
      const envRun = await db.getEnvironmentRun(req.params.runId);
      if (!envRun) {
        throw notFound('RUN_NOT_FOUND', 'Environment run not found');
      }
      const env = await db.getEnvironment(envRun.environment_id);
      assertTeamAccess(env, req.activeTeam);

      if (envRun.status === 'expired') {
        res.status(410).json({
          error: {
            message: 'Environment run has expired',
            code: 'RUN_EXPIRED',
          },
        });
        return;
      }

      // Environment runs move to a "planned" equivalent when all module plans complete.
      // We check that the operation is plan-all and status allows confirmation.
      if (envRun.operation !== 'plan-all') {
        throw badRequest('Can only confirm a plan-all environment run');
      }

      // Check that all module runs are in a terminal or planned state
      const moduleRuns = await db.getModuleRunsForEnvRun(envRun.id);
      const unfinished = moduleRuns.filter(
        r => !['planned', 'skipped', 'failed', 'cancelled'].includes(r.status),
      );
      if (unfinished.length > 0) {
        throw badRequest(
          `${unfinished.length} module run(s) are not yet complete`,
        );
      }

      const { excludeModules } = req.body ?? {};
      const excludeSet = new Set<string>(excludeModules ?? []);

      // Mark excluded modules as skipped
      for (const mr of moduleRuns) {
        if (excludeSet.has(mr.module_id) && mr.status === 'planned') {
          await db.updateModuleRunStatus(mr.id, 'skipped', {
            skip_reason: 'Excluded from apply',
            completed_at: new Date().toISOString(),
          });
        }
      }

      // Also skip dependents of excluded modules
      const deps = await db.getEnvironmentGraph(envRun.environment_id);
      const excludedNames = new Map<string, string>();
      for (const mr of moduleRuns) {
        if (excludeSet.has(mr.module_id)) {
          excludedNames.set(mr.module_id, mr.module_name);
        }
      }

      // Propagate exclusion to dependents
      const toSkip = new Set<string>(excludeSet);
      let changed = true;
      while (changed) {
        changed = false;
        for (const dep of deps.deps) {
          if (toSkip.has(dep.depends_on_id) && !toSkip.has(dep.module_id)) {
            toSkip.add(dep.module_id);
            const upstreamName =
              excludedNames.get(dep.depends_on_id) ?? dep.depends_on_id;
            excludedNames.set(dep.module_id, '');

            const mr = moduleRuns.find(r => r.module_id === dep.module_id);
            if (mr && mr.status === 'planned') {
              await db.updateModuleRunStatus(mr.id, 'skipped', {
                skip_reason: `Upstream module '${upstreamName}' excluded from apply`,
                completed_at: new Date().toISOString(),
              });
            }
            changed = true;
          }
        }
      }

      // Transition environment run to running (apply phase)
      const now = new Date().toISOString();
      const updated = await db.updateEnvironmentRunStatus(
        envRun.id,
        'running',
        { started_at: envRun.started_at ?? now },
      );

      await db.writeAuditLog({
        actor: req.registryUser?.email ?? 'unknown',
        action: 'environment_run.confirmed',
        resource_type: 'environment_run',
        resource_id: envRun.id,
        resource_name: envRun.environment_name,
        details: { excludeModules: Array.from(excludeSet) },
      });

      res.json(updated);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Cancel environment run
  router.post('/v1/environment-runs/:runId/cancel', async (req, res) => {
    try {
      const envRun = await db.getEnvironmentRun(req.params.runId);
      if (!envRun) {
        throw notFound('RUN_NOT_FOUND', 'Environment run not found');
      }
      const env = await db.getEnvironment(envRun.environment_id);
      assertTeamAccess(env, req.activeTeam);

      const terminalStatuses = [
        'succeeded',
        'failed',
        'partial_failure',
        'cancelled',
        'expired',
      ];
      if (terminalStatuses.includes(envRun.status)) {
        throw badRequest(
          `Cannot cancel an environment run with status '${envRun.status}'`,
        );
      }

      // Cancel all pending/queued module runs
      const moduleRuns = await db.getModuleRunsForEnvRun(envRun.id);
      const now = new Date().toISOString();
      for (const mr of moduleRuns) {
        if (['pending', 'queued', 'planned'].includes(mr.status)) {
          await db.updateModuleRunStatus(mr.id, 'cancelled', {
            completed_at: now,
          });
        }
      }

      const updated = await db.updateEnvironmentRunStatus(
        envRun.id,
        'cancelled',
        { completed_at: now },
      );

      await db.writeAuditLog({
        actor: req.registryUser?.email ?? 'unknown',
        action: 'environment_run.cancelled',
        resource_type: 'environment_run',
        resource_id: envRun.id,
        resource_name: envRun.environment_name,
      });

      res.json(updated);
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}
