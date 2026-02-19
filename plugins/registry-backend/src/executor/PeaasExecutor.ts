/*
 * Copyright 2026 The Butler Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { LoggerService } from '@backstage/backend-plugin-api';
import { RegistryDatabase } from '../database/RegistryDatabase';
import { RunRow } from '../database/types';
import { buildJobSpec } from './jobSpec';

export interface PeaasExecutorConfig {
  enabled: boolean;
  namespace: string;
  serviceAccount?: string;
  defaultTerraformVersion: string;
  timeoutSeconds: number;
  maxConcurrentRuns: number;
  confirmationTimeoutSeconds: number;
}

/**
 * PeaaS (Platform Engineer as a Service) executor.
 *
 * Manages the lifecycle of Terraform runs executed as Kubernetes Jobs
 * on the management cluster.
 *
 * Responsibilities:
 * - Polls for queued PeaaS runs and generates Job specs
 * - Tracks running jobs and collects logs
 * - Handles timeouts and cancellations
 * - Expires unconfirmed plan runs
 * - Crash recovery: resumes tracking for runs that were in-progress during restart
 *
 * NOTE: This implementation builds Job specs but does not directly call the
 * Kubernetes API. In production, integrate with @kubernetes/client-node.
 * The Job specs are stored on the run record for the operator to apply.
 */
export class PeaasExecutor {
  private running = false;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private sweepInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly db: RegistryDatabase,
    private readonly config: PeaasExecutorConfig,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Start the executor polling loops.
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      this.logger.info('PeaaS executor disabled');
      return;
    }

    this.running = true;
    this.logger.info('PeaaS executor starting', {
      namespace: this.config.namespace,
      maxConcurrent: this.config.maxConcurrentRuns,
      timeout: this.config.timeoutSeconds,
    });

    // Crash recovery — reconcile any runs that were in-progress
    await this.recoverRunningRuns();

    // Poll for queued runs every 5 seconds
    this.pollInterval = setInterval(() => {
      this.pollQueuedRuns().catch(err => {
        this.logger.error('PeaaS poll error', { error: String(err) });
      });
    }, 5000);

    // Sweep for expired plans every 60 seconds
    this.sweepInterval = setInterval(() => {
      this.sweepExpiredPlans().catch(err => {
        this.logger.error('PeaaS sweep error', { error: String(err) });
      });
    }, 60000);

    this.logger.info('PeaaS executor started');
  }

  /**
   * Stop the executor.
   */
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
    this.logger.info('PeaaS executor stopped');
  }

  /**
   * On startup, check for runs that were 'running' when the process last stopped.
   * These need to be reconciled — either the K8s Job completed while we were down,
   * or it's still running and we need to resume log collection.
   */
  private async recoverRunningRuns(): Promise<void> {
    try {
      // Find all PeaaS runs that are still in 'running' status
      const result = await this.db.listRunsByModeAndStatus('peaas', 'running');
      if (result.length === 0) {
        this.logger.info('No running PeaaS runs to recover');
        return;
      }

      this.logger.info('Recovering running PeaaS runs', { count: result.length });

      for (const run of result) {
        // In production: check if the K8s Job/Pod still exists
        // For now, mark stale runs as failed (they were likely interrupted)
        const ageMs = Date.now() - new Date(run.created_at).getTime();
        const timeoutMs = this.config.timeoutSeconds * 1000;

        if (ageMs > timeoutMs) {
          this.logger.warn('Marking timed-out PeaaS run as failed', { runId: run.id });
          await this.db.updateRunStatus(run.id, 'timed_out', {
            completed_at: new Date().toISOString(),
          });
        } else {
          this.logger.info('Recovered PeaaS run still within timeout, resuming tracking', {
            runId: run.id,
            ageSeconds: Math.round(ageMs / 1000),
          });
          // In production: resume log streaming from last collected sequence
        }
      }
    } catch (err) {
      this.logger.error('Failed to recover running runs', { error: String(err) });
    }
  }

  /**
   * Poll for queued PeaaS runs and start them.
   */
  private async pollQueuedRuns(): Promise<void> {
    if (!this.running) return;

    try {
      // Check how many are currently running
      const runningRuns = await this.db.listRunsByModeAndStatus('peaas', 'running');
      const available = this.config.maxConcurrentRuns - runningRuns.length;

      if (available <= 0) return;

      // Get queued PeaaS runs
      const queuedRuns = await this.db.listRunsByModeAndStatus('peaas', 'queued');
      const toStart = queuedRuns.slice(0, available);

      for (const run of toStart) {
        await this.startRun(run);
      }
    } catch (err) {
      this.logger.error('Failed to poll queued runs', { error: String(err) });
    }
  }

  /**
   * Start a single PeaaS run by building a Job spec and transitioning to 'running'.
   */
  private async startRun(run: RunRow): Promise<void> {
    try {
      const jobSpec = buildJobSpec({
        run,
        namespace: this.config.namespace,
        serviceAccount: this.config.serviceAccount,
        timeoutSeconds: this.config.timeoutSeconds,
        defaultTerraformVersion: this.config.defaultTerraformVersion,
      });

      const jobName = (jobSpec as any).metadata?.name ?? `butler-run-${run.id.substring(0, 8)}`;

      this.logger.info('Starting PeaaS run', {
        runId: run.id,
        operation: run.operation,
        jobName,
      });

      // In production: create the Job via K8s API
      // await k8sClient.createNamespacedJob(this.config.namespace, jobSpec);

      // Transition to running
      await this.db.updateRunStatus(run.id, 'running', {
        started_at: new Date().toISOString(),
        k8s_job_name: jobName,
        k8s_namespace: this.config.namespace,
      });

      // Store the job spec as pipeline_config for debugging
      await this.db.saveRunOutput({
        run_id: run.id,
        output_type: 'job_spec',
        content: JSON.stringify(jobSpec, null, 2),
      });

      this.logger.info('PeaaS run started', { runId: run.id, jobName });
    } catch (err) {
      this.logger.error('Failed to start PeaaS run', { runId: run.id, error: String(err) });
      await this.db.updateRunStatus(run.id, 'failed', {
        completed_at: new Date().toISOString(),
        exit_code: -1,
      });
    }
  }

  /**
   * Sweep for plan runs that have succeeded but not been confirmed within the timeout.
   */
  private async sweepExpiredPlans(): Promise<void> {
    if (!this.running) return;

    try {
      const expired = await this.db.expireTimedOutPlans(this.config.confirmationTimeoutSeconds);
      if (expired > 0) {
        this.logger.info('Expired unconfirmed plan runs', { count: expired });
      }
    } catch (err) {
      this.logger.error('Failed to sweep expired plans', { error: String(err) });
    }
  }

  /**
   * Cancel a PeaaS run. In production, this deletes the K8s Job.
   */
  async cancelRun(runId: string): Promise<void> {
    const run = await this.db.getRun(runId);
    if (!run || run.mode !== 'peaas') return;

    if (run.k8s_job_name && run.k8s_namespace) {
      this.logger.info('Deleting K8s Job for cancelled run', {
        runId,
        jobName: run.k8s_job_name,
        namespace: run.k8s_namespace,
      });
      // In production: delete the Job
      // await k8sClient.deleteNamespacedJob(run.k8s_job_name, run.k8s_namespace);
    }
  }
}
