// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { LoggerService } from '@backstage/backend-plugin-api';
import { RegistryDatabase } from '../database/RegistryDatabase';
import { ModuleRunRow } from '../database/types';
import { generateCallbackToken } from './shared';
import type { DagExecutor } from '../orchestration/dagExecutor';

export interface RunDispatcherConfig {
  enabled: boolean;
  butlerUrl: string;
  githubToken?: string;
  peaasOwner?: string;
  peaasRepo?: string;
  maxConcurrentRuns: number;
  timeoutSeconds: number;
  confirmationTimeoutSeconds: number;
}

/**
 * Run Dispatcher — unified execution engine for PeaaS and BYOC module runs.
 *
 * Both modes use the same mechanism: GitHub repository_dispatch + butler-runner
 * + callback APIs. The only difference is where the dispatch targets:
 *
 * - PeaaS: Butler Labs' own repo on self-hosted runners
 * - BYOC:  Customer's repo (from module vcs_trigger) on their runners
 *
 * Polls for queued module runs every 5 seconds, dispatches them, and
 * handles crash recovery + confirmation timeout sweeps.
 */
export class RunDispatcher {
  private running = false;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private sweepInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly db: RegistryDatabase,
    private readonly config: RunDispatcherConfig,
    private readonly logger: LoggerService,
    private readonly dagExecutor?: DagExecutor,
  ) {}

  async start(): Promise<void> {
    if (!this.config.enabled) {
      this.logger.info('Run dispatcher disabled');
      return;
    }

    this.running = true;
    this.logger.info('Run dispatcher starting', {
      peaasTarget: this.config.peaasOwner
        ? `${this.config.peaasOwner}/${this.config.peaasRepo}`
        : 'not configured',
      hasGithubToken: !!this.config.githubToken,
      maxConcurrent: this.config.maxConcurrentRuns,
    });

    // Crash recovery
    await this.recoverRunningRuns();

    // Poll for queued runs every 5 seconds
    this.pollInterval = setInterval(() => {
      this.pollQueuedRuns().catch(err => {
        this.logger.error('Run dispatcher poll error', { error: String(err) });
      });
    }, 5000);

    // Sweep for expired confirmations every 60 seconds
    this.sweepInterval = setInterval(() => {
      this.sweepExpiredConfirmations().catch(err => {
        this.logger.error('Run dispatcher sweep error', { error: String(err) });
      });
    }, 60000);

    this.logger.info('Run dispatcher started');
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
    this.logger.info('Run dispatcher stopped');
  }

  // ── Polling ──────────────────────────────────────────────────────────

  private async pollQueuedRuns(): Promise<void> {
    if (!this.running) return;

    try {
      // Count currently running across both modes
      const runningPeaas = await this.db.listPendingModuleRuns(
        'running',
        'peaas',
      );
      const runningByoc = await this.db.listPendingModuleRuns(
        'running',
        'byoc',
      );
      const totalRunning = runningPeaas.length + runningByoc.length;
      const available = this.config.maxConcurrentRuns - totalRunning;
      if (available <= 0) return;

      // Fetch queued runs from both modes
      const queuedPeaas = await this.db.listPendingModuleRuns(
        'queued',
        'peaas',
      );
      const queuedByoc = await this.db.listPendingModuleRuns(
        'queued',
        'byoc',
      );

      // Interleave: user-priority runs come first from DB ordering
      const allQueued = [...queuedPeaas, ...queuedByoc];
      const toDispatch = allQueued.slice(0, available);

      for (const run of toDispatch) {
        await this.dispatchRun(run);
      }
    } catch (err) {
      this.logger.error('Failed to poll queued runs', {
        error: String(err),
      });
    }
  }

  // ── Dispatch ─────────────────────────────────────────────────────────

  private async dispatchRun(run: ModuleRunRow): Promise<void> {
    try {
      // Generate fresh callback token
      const { token: callbackToken, tokenHash } = generateCallbackToken();
      const now = new Date().toISOString();

      // Resolve target repo
      const target = await this.resolveDispatchTarget(run);
      if (!target) {
        this.logger.warn('Cannot dispatch run — no target repo configured', {
          runId: run.id,
          mode: run.mode,
          moduleName: run.module_name,
        });
        return; // Leave queued — will retry on next poll
      }

      if (!this.config.githubToken) {
        this.logger.error(
          'Cannot dispatch run — no GitHub token configured (registry.storage.git.github.token)',
          { runId: run.id },
        );
        return;
      }

      // Transition to running before dispatch — prevents double-dispatch
      await this.db.updateModuleRunStatus(run.id, 'running', {
        started_at: now,
        callback_token_hash: tokenHash,
      });

      // Resolve cloud integration OIDC details for the workflow
      // (GitHub Actions needs auth steps BEFORE the runner container starts)
      const oidcPayload: Record<string, string> = {};
      try {
        const cloudInts = await this.db.getEffectiveCloudIntegrations(
          run.module_id,
          run.environment_id,
        );
        for (const ci of cloudInts) {
          const config = ci.credential_config as Record<string, any>;
          if (ci.provider === 'gcp' && ci.auth_method === 'oidc') {
            if (config.workloadIdentityProvider) {
              oidcPayload.gcp_wif_provider = config.workloadIdentityProvider;
            }
            if (config.serviceAccount) {
              oidcPayload.gcp_service_account = config.serviceAccount;
            }
            if (config.projectId) {
              oidcPayload.gcp_project_id = config.projectId;
            }
          } else if (ci.provider === 'aws' && ci.auth_method === 'oidc') {
            if (config.roleArn) {
              oidcPayload.aws_role_arn = config.roleArn;
            }
            if (config.region) {
              oidcPayload.aws_region = config.region;
            }
          }
        }
      } catch (err) {
        this.logger.warn('Failed to resolve cloud integrations for dispatch payload', {
          runId: run.id,
          error: String(err),
        });
      }

      // Dispatch via GitHub repository_dispatch
      const response = await fetch(
        `https://api.github.com/repos/${target.owner}/${target.repo}/dispatches`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.githubToken}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          body: JSON.stringify({
            event_type: 'butler-run',
            client_payload: {
              butler_url: this.config.butlerUrl,
              run_id: run.id,
              callback_token: callbackToken,
              operation: run.operation,
              module_name: run.module_name,
              ...oidcPayload,
            },
          }),
        },
      );

      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `GitHub dispatch failed: ${response.status} ${response.statusText} — ${body}`,
        );
      }

      this.logger.info('Run dispatched', {
        runId: run.id,
        mode: run.mode,
        target: `${target.owner}/${target.repo}`,
        operation: run.operation,
        moduleName: run.module_name,
      });
    } catch (err) {
      this.logger.error('Failed to dispatch run', {
        runId: run.id,
        mode: run.mode,
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
        if (updated) {
          await this.dagExecutor.onModuleRunComplete(updated).catch(dagErr => {
            this.logger.error('DAG progression failed after dispatch error', {
              runId: run.id,
              error: String(dagErr),
            });
          });
        }
      }
    }
  }

  /**
   * Resolve the GitHub owner/repo to dispatch to based on execution mode.
   *
   * - PeaaS: Butler Labs' configured repo (e.g. butlerdotdev/butler-runner)
   * - BYOC: Customer's repo from module vcs_trigger
   */
  private async resolveDispatchTarget(
    run: ModuleRunRow,
  ): Promise<{ owner: string; repo: string } | null> {
    if (run.mode === 'peaas') {
      if (!this.config.peaasOwner || !this.config.peaasRepo) {
        return null;
      }
      return { owner: this.config.peaasOwner, repo: this.config.peaasRepo };
    }

    // BYOC — resolve from module's vcs_trigger
    const mod = await this.db.getModule(run.module_id);
    if (!mod?.vcs_trigger?.repositoryUrl) {
      this.logger.warn(
        'BYOC module has no vcs_trigger.repositoryUrl — cannot dispatch',
        { runId: run.id, moduleId: run.module_id },
      );
      return null;
    }

    return parseGitHubRepoUrl(mod.vcs_trigger.repositoryUrl);
  }

  // ── Crash Recovery ───────────────────────────────────────────────────

  private async recoverRunningRuns(): Promise<void> {
    try {
      const runningPeaas = await this.db.listPendingModuleRuns(
        'running',
        'peaas',
      );
      const runningByoc = await this.db.listPendingModuleRuns(
        'running',
        'byoc',
      );
      const allRunning = [...runningPeaas, ...runningByoc];

      if (allRunning.length === 0) return;

      this.logger.info('Recovering running module runs', {
        count: allRunning.length,
      });

      for (const run of allRunning) {
        const ageMs = Date.now() - new Date(run.created_at).getTime();
        const timeoutMs = this.config.timeoutSeconds * 1000;

        if (ageMs > timeoutMs) {
          this.logger.warn('Marking timed-out module run as failed', {
            runId: run.id,
            ageSeconds: Math.round(ageMs / 1000),
          });
          const now = new Date().toISOString();
          await this.db.updateModuleRunStatus(run.id, 'timed_out', {
            completed_at: now,
          });

          // Notify DAG executor
          if (run.environment_run_id && this.dagExecutor) {
            const updated = await this.db.getModuleRun(run.id);
            if (updated) {
              await this.dagExecutor
                .onModuleRunComplete(updated)
                .catch(() => {});
            }
          }

          // Dequeue next
          await this.db.dequeueNextModuleRun(run.module_id);
        } else {
          this.logger.info('Module run still within timeout, waiting', {
            runId: run.id,
            ageSeconds: Math.round(ageMs / 1000),
          });
        }
      }
    } catch (err) {
      this.logger.error('Failed to recover running runs', {
        error: String(err),
      });
    }
  }

  // ── Confirmation Sweep ───────────────────────────────────────────────

  private async sweepExpiredConfirmations(): Promise<void> {
    if (!this.running) return;

    try {
      const cutoff = new Date(
        Date.now() - this.config.confirmationTimeoutSeconds * 1000,
      ).toISOString();

      // Expire environment runs past confirmation timeout
      const expiredEnvRuns =
        await this.db.expireTimedOutEnvironmentRuns(cutoff);
      if (expiredEnvRuns > 0) {
        this.logger.info('Expired unconfirmed environment runs', {
          count: expiredEnvRuns,
        });
      }

      // Expire individual module runs in 'planned' status past timeout
      const expiredModuleRuns =
        await this.db.expireTimedOutModuleRuns(cutoff);
      if (expiredModuleRuns > 0) {
        this.logger.info('Expired unconfirmed module runs', {
          count: expiredModuleRuns,
        });
      }
    } catch (err) {
      this.logger.error('Failed to sweep expired confirmations', {
        error: String(err),
      });
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Parse a GitHub repository URL into owner and repo.
 * Handles HTTPS and SSH formats:
 * - https://github.com/owner/repo.git
 * - https://github.com/owner/repo
 * - git@github.com:owner/repo.git
 */
function parseGitHubRepoUrl(
  url: string,
): { owner: string; repo: string } | null {
  const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}
