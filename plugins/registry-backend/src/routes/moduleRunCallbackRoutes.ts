// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import Router from 'express-promise-router';
import crypto from 'crypto';
import { sendError, notFound, badRequest, unauthorized, conflict } from '../util/errors';
import { buildStateBackendConfig } from '../runs/envVarBuilder';
import type { PeaasStateBackendConfig } from '../runs/envVarBuilder';
import type { RouterOptions } from '../router';

export function createModuleRunCallbackRouter(options: RouterOptions) {
  const { db, logger, dagExecutor, config } = options;
  const router = Router();

  // Read platform-managed state backend config (SeaweedFS S3)
  const peaasStateBackend: PeaasStateBackendConfig | undefined = (() => {
    const endpoint = config.getOptionalString('registry.iac.peaas.stateBackend.endpoint');
    const bucket = config.getOptionalString('registry.iac.peaas.stateBackend.bucket');
    if (!endpoint || !bucket) return undefined;
    return {
      endpoint,
      bucket,
      region: config.getOptionalString('registry.iac.peaas.stateBackend.region') ?? 'us-east-1',
      accessKey: config.getOptionalString('registry.iac.peaas.stateBackend.accessKey'),
      secretKey: config.getOptionalString('registry.iac.peaas.stateBackend.secretKey'),
    };
  })();

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

      // Update environment_module_state on terminal status
      if (isTerminal) {
        // Ensure the state row exists before updating
        await db.getOrCreateEnvironmentModuleState(
          run.environment_id,
          run.project_module_id,
        );
        const stateUpdates: Record<string, unknown> = {
          last_run_id: run.id,
          last_run_status: status,
          last_run_at: now,
        };
        if (resource_count_after !== undefined) {
          stateUpdates.resource_count = resource_count_after;
        }
        if (status === 'succeeded' && run.module_version) {
          stateUpdates.current_version = run.module_version;
        }
        await db.updateEnvironmentModuleState(
          run.environment_id,
          run.project_module_id,
          stateUpdates,
        );
      }

      // Dequeue next run on terminal status
      if (['succeeded', 'failed'].includes(status)) {
        await db.dequeueNextModuleRun(run.project_module_id, run.environment_id);
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

      // Runner sends {"outputs": {...}} — unwrap if present
      const rawBody = req.body;
      const outputs = (rawBody && typeof rawBody === 'object' && rawBody.outputs && typeof rawBody.outputs === 'object')
        ? rawBody.outputs
        : rawBody;
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

      // Load module and environment
      const mod = await db.getProjectModule(run.project_module_id);
      if (!mod) {
        throw notFound('RUN_NOT_FOUND', 'Module not found');
      }

      const env = await db.getEnvironment(run.environment_id);

      const artifact = await db.getArtifact(
        mod.artifact_namespace,
        mod.artifact_name,
      );

      // Resolve the effective version: explicit run version or pinned constraint.
      // Either source may contain a semver constraint (e.g. "~> 8.0") that needs
      // to be resolved to the latest matching approved version from the registry.
      let resolvedVersion: string | undefined =
        run.module_version ?? mod.pinned_version ?? undefined;

      if (resolvedVersion && artifact && /^~>|[><=^]/.test(resolvedVersion)) {
        const constraint = resolvedVersion;
        const versions = await db.listApprovedVersions(artifact.id);
        const pin = constraint.replace(/^~>\s*/, '');
        const [pMaj, pMin] = pin.split('.').map(Number);
        const match = versions.find(
          v => v.version_major === pMaj && v.version_minor >= (pMin || 0),
        );
        resolvedVersion = match?.version;
      }

      // Resolve source from artifact storage/source config or VCS trigger
      const source: {
        type: string;
        gitRepo?: string;
        gitRef?: string;
        workingDirectory?: string;
      } = { type: 'none' };

      const tagPrefix = artifact?.storage_config?.git?.tagPrefix ?? 'v';
      const gitRef = resolvedVersion ? `${tagPrefix}${resolvedVersion}` : 'main';

      if (mod.vcs_trigger?.repositoryUrl) {
        source.type = 'git';
        source.gitRepo = mod.vcs_trigger.repositoryUrl;
        source.gitRef = mod.vcs_trigger.branch ?? 'main';
        source.workingDirectory = mod.vcs_trigger.path ?? mod.working_directory ?? undefined;
      } else if (artifact?.source_config?.repositoryUrl) {
        source.type = 'git';
        source.gitRepo = artifact.source_config.repositoryUrl;
        source.gitRef = gitRef;
        source.workingDirectory = artifact.source_config.path ?? mod.working_directory ?? undefined;
      } else if (artifact?.storage_config?.git?.repositoryUrl) {
        source.type = 'git';
        source.gitRepo = artifact.storage_config.git.repositoryUrl;
        source.gitRef = gitRef;
        source.workingDirectory = artifact.storage_config.git.path ?? mod.working_directory ?? undefined;
      }

      // Resolve variables — from environment-scoped module variables
      const moduleVars = await db.listModuleVariables(run.environment_id, run.project_module_id);
      const variables: Record<string, { value: any; sensitive: boolean }> = {};
      for (const v of moduleVars) {
        let val: any = v.sensitive ? (v.secret_ref ?? '') : (v.value ?? '');
        // HCL variables (complex types like lists/objects) — parse so
        // the runner receives native JSON types instead of strings.
        if (v.hcl && !v.sensitive && typeof val === 'string') {
          try { val = JSON.parse(val); } catch { /* keep as string */ }
        }
        variables[v.key] = { value: val, sensitive: v.sensitive };
      }

      // Resolve cloud integration + variable set env vars for the runner.
      const envVars: Record<string, { value: string; sensitive: boolean }> = {};
      const cloudInts = await db.getEffectiveCloudIntegrations(
        run.project_module_id,
        run.environment_id,
      );
      for (const ci of cloudInts) {
        const ciConfig = ci.credential_config as Record<string, any>;
        if (ci.provider === 'gcp') {
          if (ciConfig.projectId) {
            envVars['GOOGLE_PROJECT'] = { value: ciConfig.projectId, sensitive: false };
          }
          if (ci.auth_method !== 'oidc' && ciConfig.credentials) {
            envVars['GOOGLE_CREDENTIALS'] = { value: ciConfig.credentials, sensitive: true };
          }
          if (ci.auth_method === 'oidc' && ciConfig.workloadIdentityProvider) {
            envVars['GOOGLE_WORKLOAD_IDENTITY_PROVIDER'] = { value: ciConfig.workloadIdentityProvider, sensitive: false };
            if (ciConfig.serviceAccount) {
              envVars['GOOGLE_SERVICE_ACCOUNT'] = { value: ciConfig.serviceAccount, sensitive: false };
            }
          }
        } else if (ci.provider === 'aws') {
          if (ciConfig.region) {
            envVars['AWS_REGION'] = { value: ciConfig.region, sensitive: false };
            envVars['AWS_DEFAULT_REGION'] = { value: ciConfig.region, sensitive: false };
          }
          if (ci.auth_method === 'oidc' && ciConfig.roleArn) {
            envVars['AWS_ROLE_ARN'] = { value: ciConfig.roleArn, sensitive: false };
          } else {
            if (ciConfig.accessKeyId) {
              envVars['AWS_ACCESS_KEY_ID'] = { value: ciConfig.accessKeyId, sensitive: true };
            }
            if (ciConfig.secretAccessKey) {
              envVars['AWS_SECRET_ACCESS_KEY'] = { value: ciConfig.secretAccessKey, sensitive: true };
            }
          }
        } else if (ci.provider === 'azure') {
          if (ciConfig.clientId) envVars['ARM_CLIENT_ID'] = { value: ciConfig.clientId, sensitive: false };
          if (ciConfig.tenantId) envVars['ARM_TENANT_ID'] = { value: ciConfig.tenantId, sensitive: false };
          if (ciConfig.subscriptionId) envVars['ARM_SUBSCRIPTION_ID'] = { value: ciConfig.subscriptionId, sensitive: false };
          if (ci.auth_method !== 'oidc' && ciConfig.clientSecret) {
            envVars['ARM_CLIENT_SECRET'] = { value: ciConfig.clientSecret, sensitive: true };
          }
        } else if (ci.provider === 'custom') {
          const customVars = (ciConfig.envVars ?? {}) as Record<string, { source: string; value: string }>;
          for (const [key, varCfg] of Object.entries(customVars)) {
            envVars[key] = { value: varCfg.value, sensitive: varCfg.source === 'ci_secret' };
          }
        }
      }

      // Variable set entries as env vars
      const varSets = await db.getEffectiveVariableSets(run.project_module_id, run.environment_id);
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
      const deps = await db.getProjectModuleDependencies(run.project_module_id);
      const upstreamOutputs: Record<string, unknown> = {};
      for (const dep of deps) {
        if (!dep.output_mapping) continue;
        const upstreamRun = await db.getLatestSuccessfulModuleRun(dep.depends_on_id, run.environment_id);
        if (!upstreamRun?.tf_outputs) continue;
        for (const mapping of dep.output_mapping) {
          const val = (upstreamRun.tf_outputs as Record<string, unknown>)[mapping.upstream_output];
          if (val !== undefined) {
            upstreamOutputs[mapping.downstream_variable] = val;
          }
        }
      }

      // State backend config — from environment, not module
      const stateBackend = buildStateBackendConfig(
        run.state_backend_snapshot ?? env?.state_backend,
        {
          mode: run.mode,
          environmentId: run.environment_id,
          moduleId: run.project_module_id,
          peaasStateBackend,
        },
      );

      // Build callback URLs
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
        moduleId: run.project_module_id,
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
