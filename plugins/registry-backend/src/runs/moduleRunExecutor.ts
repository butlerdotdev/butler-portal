// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { LoggerService } from '@backstage/backend-plugin-api';
import { RegistryDatabase } from '../database/RegistryDatabase';
import { ModuleRunRow } from '../database/types';
import { buildJobSpec } from '../executor/jobSpec';
import { getTfWorkspaceName } from './envVarBuilder';
import type { DagExecutor } from '../orchestration/dagExecutor';

export interface ModuleRunExecutorConfig {
  enabled: boolean;
  namespace: string;
  serviceAccount?: string;
  defaultTerraformVersion: string;
  timeoutSeconds: number;
  maxConcurrentRuns: number;
  confirmationTimeoutSeconds: number;
  pgSchemaName?: string;
}

/**
 * Module Run Executor — extends PeaaS execution to environment module runs.
 *
 * Polls for queued PeaaS module runs, generates K8s Job specs,
 * and manages lifecycle. Calls dagExecutor.onModuleRunComplete()
 * for runs that are part of an environment run.
 */
export class ModuleRunExecutor {
  private running = false;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private sweepInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly db: RegistryDatabase,
    private readonly config: ModuleRunExecutorConfig,
    private readonly logger: LoggerService,
    private readonly dagExecutor?: DagExecutor,
  ) {}

  async start(): Promise<void> {
    if (!this.config.enabled) {
      this.logger.info('Module run executor disabled');
      return;
    }

    this.running = true;
    this.logger.info('Module run executor starting', {
      namespace: this.config.namespace,
      maxConcurrent: this.config.maxConcurrentRuns,
    });

    // Crash recovery
    await this.recoverRunningRuns();

    // Poll for queued module runs every 5 seconds
    this.pollInterval = setInterval(() => {
      this.pollQueuedRuns().catch(err => {
        this.logger.error('Module run poll error', { error: String(err) });
      });
    }, 5000);

    // Sweep for expired plan confirmations every 60 seconds
    this.sweepInterval = setInterval(() => {
      this.sweepExpiredConfirmations().catch(err => {
        this.logger.error('Module run sweep error', { error: String(err) });
      });
    }, 60000);

    this.logger.info('Module run executor started');
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = null;
    }
    this.logger.info('Module run executor stopped');
  }

  /**
   * Recover module runs that were running when the process last stopped.
   */
  private async recoverRunningRuns(): Promise<void> {
    try {
      const runningRuns = await this.db.listPendingModuleRuns('running', 'peaas');
      if (runningRuns.length === 0) return;

      this.logger.info('Recovering running module runs', { count: runningRuns.length });

      for (const run of runningRuns) {
        const ageMs = Date.now() - new Date(run.created_at).getTime();
        const timeoutMs = this.config.timeoutSeconds * 1000;

        if (ageMs > timeoutMs) {
          this.logger.warn('Marking timed-out module run as failed', { runId: run.id });
          const now = new Date().toISOString();
          await this.db.updateModuleRunStatus(run.id, 'timed_out', {
            completed_at: now,
          });
          // Notify DAG executor if part of an environment run
          if (run.environment_run_id && this.dagExecutor) {
            const updated = await this.db.getModuleRun(run.id);
            if (updated) await this.dagExecutor.onModuleRunComplete(updated);
          }
          // Dequeue next run
          await this.db.dequeueNextModuleRun(run.module_id);
        } else {
          this.logger.info('Module run still within timeout, resuming tracking', {
            runId: run.id,
            ageSeconds: Math.round(ageMs / 1000),
          });
        }
      }
    } catch (err) {
      this.logger.error('Failed to recover running module runs', { error: String(err) });
    }
  }

  /**
   * Poll for queued PeaaS module runs and start them.
   * User-priority runs are returned first by the DB query.
   */
  private async pollQueuedRuns(): Promise<void> {
    if (!this.running) return;

    try {
      const runningRuns = await this.db.listPendingModuleRuns('running', 'peaas');
      const available = this.config.maxConcurrentRuns - runningRuns.length;
      if (available <= 0) return;

      const queuedRuns = await this.db.listPendingModuleRuns('queued', 'peaas');
      const toStart = queuedRuns.slice(0, available);

      for (const run of toStart) {
        await this.startModuleRun(run);
      }
    } catch (err) {
      this.logger.error('Failed to poll queued module runs', { error: String(err) });
    }
  }

  /**
   * Start a single PeaaS module run by building a Job spec.
   */
  private async startModuleRun(run: ModuleRunRow): Promise<void> {
    try {
      // Resolve module variables from snapshot
      const envVars: Record<string, { source: string; ref?: string; key?: string; value?: string }> = {};
      if (run.variables_snapshot) {
        const vars = run.variables_snapshot as unknown as Array<{
          key: string; value: string | null; sensitive: boolean;
          hcl: boolean; category: string; secret_ref: string | null;
        }>;
        for (const v of vars) {
          const envName = v.category === 'terraform' ? `TF_VAR_${v.key}` : v.key;
          if (v.sensitive && v.secret_ref) {
            const colonIdx = v.secret_ref.indexOf(':');
            const refPath = colonIdx >= 0 ? v.secret_ref.substring(0, colonIdx) : v.secret_ref;
            const secretKey = colonIdx >= 0 ? v.secret_ref.substring(colonIdx + 1) : v.key;
            envVars[envName] = { source: 'secret', ref: refPath, key: secretKey };
          } else {
            envVars[envName] = { source: 'literal', value: v.value ?? '' };
          }
        }
      }

      // Build TF_WORKSPACE for pg backend
      const stateBackend = run.state_backend_snapshot;
      if (stateBackend?.type === 'pg') {
        envVars['TF_WORKSPACE'] = {
          source: 'literal',
          value: getTfWorkspaceName(run.environment_id, run.module_id),
        };
      }

      // Adapt ModuleRunRow to RunRow-like shape for buildJobSpec
      const jobSpec = buildJobSpec({
        run: {
          id: run.id,
          artifact_id: '',
          version_id: null,
          artifact_namespace: run.artifact_namespace,
          artifact_name: run.artifact_name,
          version: run.module_version,
          operation: run.operation as any,
          mode: 'peaas' as any,
          status: run.status as any,
          triggered_by: run.triggered_by,
          team: null,
          ci_provider: null,
          pipeline_config: null,
          callback_token_hash: null,
          k8s_job_name: null,
          k8s_namespace: null,
          tf_version: run.tf_version,
          variables: null,
          env_vars: envVars as any,
          working_directory: null,
          exit_code: null,
          resources_to_add: null,
          resources_to_change: null,
          resources_to_destroy: null,
          queued_at: run.queued_at,
          started_at: run.started_at,
          completed_at: run.completed_at,
          duration_seconds: run.duration_seconds,
          created_at: run.created_at,
          updated_at: run.updated_at,
        },
        namespace: this.config.namespace,
        serviceAccount: this.config.serviceAccount,
        timeoutSeconds: this.config.timeoutSeconds,
        defaultTerraformVersion: this.config.defaultTerraformVersion,
      });

      const jobName = (jobSpec as any).metadata?.name ?? `butler-modrun-${run.id.substring(0, 8)}`;

      this.logger.info('Starting PeaaS module run', {
        runId: run.id,
        moduleId: run.module_id,
        operation: run.operation,
        jobName,
      });

      const now = new Date().toISOString();
      await this.db.updateModuleRunStatus(run.id, 'running', {
        started_at: now,
      });

      // Store the job spec for debugging
      await this.db.saveModuleRunOutput({
        run_id: run.id,
        output_type: 'job_spec',
        content: JSON.stringify(jobSpec, null, 2),
      });

      this.logger.info('PeaaS module run started', { runId: run.id, jobName });
    } catch (err) {
      this.logger.error('Failed to start PeaaS module run', {
        runId: run.id,
        error: String(err),
      });
      const now = new Date().toISOString();
      await this.db.updateModuleRunStatus(run.id, 'failed', {
        completed_at: now,
        exit_code: -1,
      });
      // Dequeue next and notify DAG
      await this.db.dequeueNextModuleRun(run.module_id);
      if (run.environment_run_id && this.dagExecutor) {
        const updated = await this.db.getModuleRun(run.id);
        if (updated) await this.dagExecutor.onModuleRunComplete(updated);
      }
    }
  }

  /**
   * Sweep for environment runs in 'planned' status past confirmation timeout
   * and expire them. Also sweeps individual module runs.
   */
  private async sweepExpiredConfirmations(): Promise<void> {
    if (!this.running) return;

    try {
      const cutoff = new Date(
        Date.now() - this.config.confirmationTimeoutSeconds * 1000,
      ).toISOString();

      // Expire environment runs past confirmation timeout
      const expiredEnvRuns = await this.db.expireTimedOutEnvironmentRuns(cutoff);
      if (expiredEnvRuns > 0) {
        this.logger.info('Expired unconfirmed environment runs', { count: expiredEnvRuns });
      }

      // Expire individual module runs in 'planned' status past timeout
      const expiredModuleRuns = await this.db.expireTimedOutModuleRuns(cutoff);
      if (expiredModuleRuns > 0) {
        this.logger.info('Expired unconfirmed module runs', { count: expiredModuleRuns });
      }
    } catch (err) {
      this.logger.error('Failed to sweep expired confirmations', { error: String(err) });
    }
  }
}
