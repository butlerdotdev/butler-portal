// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { LoggerService } from '@backstage/backend-plugin-api';
import { RegistryDatabase } from '../database/RegistryDatabase';
import { ModuleRunRow } from '../database/types';
import { buildModuleRunJobSpec, buildRunSecretSpec } from '../executor/jobSpec';
import { generateCallbackToken } from './shared';
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
  butlerUrl?: string;
  runnerImage?: string;
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
   * Start a single PeaaS module run using butler-runner.
   *
   * 1. Generate callback token + per-run Secret spec
   * 2. Build butler-runner Job spec (3 env vars only)
   * 3. Store callback token hash on the run
   * 4. In production: create Secret + Job via K8s API
   */
  private async startModuleRun(run: ModuleRunRow): Promise<void> {
    try {
      // Generate callback token for this run
      const { token: callbackToken, tokenHash } = generateCallbackToken();
      const secretName = `butler-run-${run.id.substring(0, 8)}`;

      const butlerUrl = this.config.butlerUrl ?? '';

      // Build per-run Secret spec (stores the callback token)
      const secretSpec = buildRunSecretSpec({
        runId: run.id,
        callbackToken,
        namespace: this.config.namespace,
      });

      // Build butler-runner Job spec
      const jobSpec = buildModuleRunJobSpec({
        runId: run.id,
        butlerUrl,
        callbackSecretName: secretName,
        namespace: this.config.namespace,
        serviceAccount: this.config.serviceAccount,
        timeoutSeconds: this.config.timeoutSeconds,
        runnerImage: this.config.runnerImage,
      });

      const jobName = (jobSpec as any).metadata?.name ?? `butler-modrun-${run.id.substring(0, 8)}`;

      this.logger.info('Starting PeaaS module run', {
        runId: run.id,
        moduleId: run.module_id,
        operation: run.operation,
        jobName,
      });

      // In production: create Secret and Job via K8s API
      // await k8sClient.createNamespacedSecret(this.config.namespace, secretSpec);
      // await k8sClient.createNamespacedJob(this.config.namespace, jobSpec);

      const now = new Date().toISOString();
      await this.db.updateModuleRunStatus(run.id, 'running', {
        started_at: now,
        callback_token_hash: tokenHash,
      });

      // Store specs for debugging (not the token)
      await this.db.saveModuleRunOutput({
        run_id: run.id,
        output_type: 'job_spec',
        content: JSON.stringify(jobSpec, null, 2),
      });
      await this.db.saveModuleRunOutput({
        run_id: run.id,
        output_type: 'secret_spec',
        content: JSON.stringify({ ...secretSpec, stringData: { 'callback-token': '***' } }, null, 2),
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
