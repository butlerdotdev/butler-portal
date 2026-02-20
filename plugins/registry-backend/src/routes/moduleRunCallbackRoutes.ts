// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import Router from 'express-promise-router';
import crypto from 'crypto';
import { sendError, notFound, badRequest, unauthorized, conflict } from '../util/errors';
import { buildStateBackendConfig } from '../runs/envVarBuilder';
import type { RouterOptions } from '../router';

export function createModuleRunCallbackRouter(options: RouterOptions) {
  const { db, logger, dagExecutor } = options;
  const router = Router();

  // Verify module-run callback token
  const verifyModuleRunCallbackToken = async (
    authHeader: string | undefined,
    runId: string,
  ) => {
    if (!authHeader?.startsWith('Bearer ')) {
      throw unauthorized('Missing callback token');
    }
    const token = authHeader.slice(7);

    // Reject registry API tokens on callback endpoints
    if (token.startsWith('breg_')) {
      throw unauthorized('Registry API tokens cannot be used on callback endpoints');
    }

    const tokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    const run = await db.getModuleRun(runId);
    if (!run) {
      throw notFound('RUN_NOT_FOUND', 'Module run not found');
    }
    if (run.callback_token_hash !== tokenHash) {
      throw unauthorized('Invalid callback token');
    }
    if (
      ['cancelled', 'timed_out', 'discarded', 'skipped'].includes(run.status)
    ) {
      throw conflict(
        'APPROVAL_DENIED',
        `Module run is ${run.status} — updates rejected`,
      );
    }
    return run;
  };

  // ── BYOC Module Run Callbacks ─────────────────────────────────────

  // Update module run status
  router.post('/v1/ci/module-runs/:runId/status', async (req, res) => {
    try {
      const run = await verifyModuleRunCallbackToken(
        req.headers.authorization,
        req.params.runId,
      );

      const {
        status,
        exit_code,
        resources_to_add,
        resources_to_change,
        resources_to_destroy,
        resource_count_after,
        plan_summary,
        plan_json,
        plan_text,
      } = req.body;

      if (!status) throw badRequest('status is required');

      const now = new Date().toISOString();
      const startedAt = run.started_at ?? now;
      const isTerminal = [
        'succeeded',
        'failed',
        'planned',
      ].includes(status);
      const completedAt =
        ['succeeded', 'failed'].includes(status) ? now : undefined;
      const plannedAt = status === 'planned' ? now : undefined;
      const durationMs =
        completedAt && run.started_at
          ? Math.round(
              (new Date(completedAt).getTime() -
                new Date(run.started_at).getTime()) /
                1000,
            )
          : undefined;

      await db.updateModuleRunStatus(run.id, status, {
        exit_code,
        resources_to_add,
        resources_to_change,
        resources_to_destroy,
        resource_count_after,
        plan_summary,
        started_at: startedAt,
        completed_at: completedAt,
        planned_at: plannedAt,
        duration_seconds: durationMs,
      });

      // Save outputs if provided
      if (plan_json) {
        await db.saveModuleRunOutput({
          run_id: run.id,
          output_type: 'plan_json',
          content: plan_json,
        });
      }
      if (plan_text) {
        await db.saveModuleRunOutput({
          run_id: run.id,
          output_type: 'plan_text',
          content: plan_text,
        });
      }

      // Update module last_run fields on terminal status
      if (isTerminal) {
        const updates: Record<string, unknown> = {
          last_run_id: run.id,
          last_run_status: status,
          last_run_at: now,
        };
        if (resource_count_after !== undefined) {
          updates.resource_count = resource_count_after;
        }
        if (status === 'succeeded' && run.module_version) {
          updates.current_version = run.module_version;
        }
        await db.updateModule(run.module_id, updates);
      }

      // Dequeue next run on terminal status
      if (['succeeded', 'failed'].includes(status)) {
        await db.dequeueNextModuleRun(run.module_id);
      }

      // Progress DAG — notify environment run orchestrator
      if (isTerminal && dagExecutor && run.environment_run_id) {
        const updated = await db.getModuleRun(run.id);
        if (updated) {
          await dagExecutor.onModuleRunComplete(updated).catch(err => {
            logger.error('DAG progression failed', { runId: run.id, error: String(err) });
          });
        }
      }

      logger.info('Module run status updated via callback', {
        runId: run.id,
        status,
      });
      res.json({ status: 'ok' });
    } catch (err) {
      sendError(res, err);
    }
  });

  // Append module run logs
  router.post('/v1/ci/module-runs/:runId/logs', async (req, res) => {
    try {
      await verifyModuleRunCallbackToken(
        req.headers.authorization,
        req.params.runId,
      );

      const { logs } = req.body;
      if (!Array.isArray(logs) || logs.length === 0) {
        throw badRequest('logs array is required');
      }

      await db.appendModuleRunLogs(req.params.runId, logs);
      res.json({ status: 'ok', count: logs.length });
    } catch (err) {
      sendError(res, err);
    }
  });

  // Submit plan output
  router.post('/v1/ci/module-runs/:runId/plan', async (req, res) => {
    try {
      await verifyModuleRunCallbackToken(
        req.headers.authorization,
        req.params.runId,
      );

      const { plan_json, plan_text } = req.body;
      if (!plan_json && !plan_text) {
        throw badRequest('plan_json or plan_text is required');
      }

      if (plan_json) {
        await db.saveModuleRunOutput({
          run_id: req.params.runId,
          output_type: 'plan_json',
          content:
            typeof plan_json === 'string'
              ? plan_json
              : JSON.stringify(plan_json),
        });
      }
      if (plan_text) {
        await db.saveModuleRunOutput({
          run_id: req.params.runId,
          output_type: 'plan_text',
          content: plan_text,
        });
      }

      res.json({ status: 'ok' });
    } catch (err) {
      sendError(res, err);
    }
  });

  // Submit terraform outputs (for dependency passing)
  router.post('/v1/ci/module-runs/:runId/outputs', async (req, res) => {
    try {
      const run = await verifyModuleRunCallbackToken(
        req.headers.authorization,
        req.params.runId,
      );

      const outputs = req.body;
      if (!outputs || typeof outputs !== 'object') {
        throw badRequest('Request body must be a JSON object of outputs');
      }

      // Terraform output -json format: { "key": { "value": <any>, "type": <str>, "sensitive": <bool> } }
      // Simplify to { "key": <value> } for storage
      const simplified: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(outputs)) {
        if (
          val &&
          typeof val === 'object' &&
          'value' in (val as Record<string, unknown>)
        ) {
          simplified[key] = (val as Record<string, unknown>).value;
        } else {
          simplified[key] = val;
        }
      }

      // Store simplified outputs on the run row
      await db.updateModuleRunStatus(run.id, run.status as any, {
        tf_outputs: simplified,
      });

      // Also store raw output for debugging
      await db.saveModuleRunOutput({
        run_id: run.id,
        output_type: 'tf_outputs',
        content: JSON.stringify(outputs),
      });

      logger.info('Module run outputs submitted', {
        runId: run.id,
        outputKeys: Object.keys(simplified),
      });
      res.json({ status: 'ok' });
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── Execution Config (butler-runner fetches this) ────────────────

  // GET /v1/ci/module-runs/:runId/config
  // Returns the full execution config for butler-runner.
  // Authenticates via brce_ callback token. NEVER logs response body.
  router.get('/v1/ci/module-runs/:runId/config', async (req, res) => {
    try {
      const run = await verifyModuleRunCallbackToken(
        req.headers.authorization,
        req.params.runId,
      );

      // Load module, environment, and artifact
      const mod = await db.getModule(run.module_id);
      if (!mod) {
        throw notFound('RUN_NOT_FOUND', 'Module not found');
      }

      const artifact = await db.getArtifact(
        mod.artifact_namespace,
        mod.artifact_name,
      );

      // Resolve source from artifact storage/source config or VCS trigger
      const source: {
        type: string;
        gitRepo?: string;
        gitRef?: string;
        workingDirectory?: string;
      } = { type: 'none' };

      if (mod.vcs_trigger?.repositoryUrl) {
        source.type = 'git';
        source.gitRepo = mod.vcs_trigger.repositoryUrl;
        source.gitRef = mod.vcs_trigger.branch ?? 'main';
        source.workingDirectory = mod.vcs_trigger.path ?? mod.working_directory ?? undefined;
      } else if (artifact?.source_config?.repositoryUrl) {
        source.type = 'git';
        source.gitRepo = artifact.source_config.repositoryUrl;
        source.gitRef = run.module_version ?? mod.pinned_version ?? 'main';
        source.workingDirectory = artifact.source_config.path ?? mod.working_directory ?? undefined;
      } else if (artifact?.storage_config?.git?.repositoryUrl) {
        source.type = 'git';
        source.gitRepo = artifact.storage_config.git.repositoryUrl;
        source.gitRef = run.module_version
          ? `${artifact.storage_config.git.tagPrefix ?? 'v'}${run.module_version}`
          : 'main';
        source.workingDirectory = artifact.storage_config.git.path ?? mod.working_directory ?? undefined;
      }

      // Resolve variables — merge all three layers
      const moduleVars = await db.listModuleVariables(run.module_id);
      const variables: Record<string, { value: string; sensitive: boolean }> = {};
      for (const v of moduleVars) {
        variables[v.key] = {
          value: v.sensitive ? (v.secret_ref ?? '') : (v.value ?? ''),
          sensitive: v.sensitive,
        };
      }

      // Resolve cloud integration + variable set env vars for the runner.
      // These are environment variables (GOOGLE_PROJECT, AWS_REGION, etc.)
      // that must be set before running terraform.
      const envVars: Record<string, { value: string; sensitive: boolean }> = {};
      const cloudInts = await db.getEffectiveCloudIntegrations(
        run.module_id,
        run.environment_id,
      );
      for (const ci of cloudInts) {
        const config = ci.credential_config as Record<string, any>;
        if (ci.provider === 'gcp') {
          if (config.projectId) {
            envVars['GOOGLE_PROJECT'] = { value: config.projectId, sensitive: false };
          }
          if (ci.auth_method !== 'oidc' && config.credentials) {
            envVars['GOOGLE_CREDENTIALS'] = { value: config.credentials, sensitive: true };
          }
          if (ci.auth_method === 'oidc' && config.workloadIdentityProvider) {
            envVars['GOOGLE_WORKLOAD_IDENTITY_PROVIDER'] = { value: config.workloadIdentityProvider, sensitive: false };
            if (config.serviceAccount) {
              envVars['GOOGLE_SERVICE_ACCOUNT'] = { value: config.serviceAccount, sensitive: false };
            }
          }
        } else if (ci.provider === 'aws') {
          if (config.region) {
            envVars['AWS_REGION'] = { value: config.region, sensitive: false };
            envVars['AWS_DEFAULT_REGION'] = { value: config.region, sensitive: false };
          }
          if (ci.auth_method === 'oidc' && config.roleArn) {
            envVars['AWS_ROLE_ARN'] = { value: config.roleArn, sensitive: false };
          } else {
            if (config.accessKeyId) {
              envVars['AWS_ACCESS_KEY_ID'] = { value: config.accessKeyId, sensitive: true };
            }
            if (config.secretAccessKey) {
              envVars['AWS_SECRET_ACCESS_KEY'] = { value: config.secretAccessKey, sensitive: true };
            }
          }
        } else if (ci.provider === 'azure') {
          if (config.clientId) envVars['ARM_CLIENT_ID'] = { value: config.clientId, sensitive: false };
          if (config.tenantId) envVars['ARM_TENANT_ID'] = { value: config.tenantId, sensitive: false };
          if (config.subscriptionId) envVars['ARM_SUBSCRIPTION_ID'] = { value: config.subscriptionId, sensitive: false };
          if (ci.auth_method !== 'oidc' && config.clientSecret) {
            envVars['ARM_CLIENT_SECRET'] = { value: config.clientSecret, sensitive: true };
          }
        } else if (ci.provider === 'custom') {
          const customVars = (config.envVars ?? {}) as Record<string, { source: string; value: string }>;
          for (const [key, varCfg] of Object.entries(customVars)) {
            envVars[key] = { value: varCfg.value, sensitive: varCfg.source === 'ci_secret' };
          }
        }
      }

      // Variable set entries as env vars
      const varSets = await db.getEffectiveVariableSets(run.module_id, run.environment_id);
      for (const vs of varSets) {
        const entries = await db.listVariableSetEntries(vs.id);
        for (const entry of entries) {
          const envName = entry.category === 'terraform' ? `TF_VAR_${entry.key}` : entry.key;
          envVars[envName] = {
            value: entry.sensitive ? (entry.ci_secret_name ?? '') : (entry.value ?? ''),
            sensitive: entry.sensitive,
          };
        }
      }

      // Resolve upstream outputs from dependencies
      const deps = await db.getModuleDependencies(run.module_id);
      const upstreamOutputs: Record<string, unknown> = {};
      for (const dep of deps) {
        if (!dep.output_mapping) continue;
        const upstreamRun = await db.getLatestSuccessfulModuleRun(dep.depends_on_id);
        if (!upstreamRun?.tf_outputs) continue;
        for (const mapping of dep.output_mapping) {
          const val = (upstreamRun.tf_outputs as Record<string, unknown>)[mapping.upstream_output];
          if (val !== undefined) {
            upstreamOutputs[mapping.downstream_variable] = val;
          }
        }
      }

      // State backend config
      const stateBackend = buildStateBackendConfig(
        run.state_backend_snapshot ?? mod.state_backend,
        {
          mode: run.mode,
          environmentId: run.environment_id,
          moduleId: run.module_id,
        },
      );

      // Build callback URLs — paths are relative to the plugin base URL.
      // butler-runner prepends BUTLER_URL (e.g. https://portal.example.com/api/registry)
      // so callback paths must NOT include the /api/registry prefix.
      const cbBase = `/v1/ci/module-runs/${run.id}`;

      const configResponse = {
        runId: run.id,
        operation: run.operation,
        terraformVersion: run.tf_version ?? mod.tf_version ?? '1.9.0',
        source,
        variables,
        envVars,
        upstreamOutputs,
        stateBackend,
        callbacks: {
          statusUrl: `${cbBase}/status`,
          logsUrl: `${cbBase}/logs`,
          planUrl: `${cbBase}/plan`,
          outputsUrl: `${cbBase}/outputs`,
        },
      };

      // Log run/module only — NEVER log response body (contains secrets)
      logger.info('Config fetched for module run', {
        runId: run.id,
        moduleId: run.module_id,
      });

      res.setHeader('Cache-Control', 'no-store, no-cache');
      res.json(configResponse);
    } catch (err) {
      sendError(res, err);
    }
  });

  // GET /v1/ci/module-runs/:runId/status (cancellation check for runner)
  router.get('/v1/ci/module-runs/:runId/status', async (req, res) => {
    try {
      if (!req.headers.authorization?.startsWith('Bearer ')) {
        throw unauthorized('Missing callback token');
      }
      const token = req.headers.authorization.slice(7);
      if (token.startsWith('breg_')) {
        throw unauthorized('Registry API tokens cannot be used on callback endpoints');
      }

      const tokenHash = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');

      const run = await db.getModuleRun(req.params.runId);
      if (!run) {
        throw notFound('RUN_NOT_FOUND', 'Module run not found');
      }
      if (run.callback_token_hash !== tokenHash) {
        throw unauthorized('Invalid callback token');
      }

      res.json({ status: run.status });
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}
