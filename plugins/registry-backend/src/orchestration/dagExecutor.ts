// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import crypto from 'crypto';
import { LoggerService } from '@backstage/backend-plugin-api';
import { RegistryDatabase } from '../database/RegistryDatabase';
import { OutputResolver } from './outputResolver';
import type {
  EnvironmentModuleRow,
  ModuleDependencyRow,
  ModuleRunRow,
} from '../database/types';

/**
 * DAG Executor — orchestrates environment-wide runs (plan-all, apply-all, destroy-all).
 *
 * Uses Kahn's algorithm for topological sort with in-degree tracking
 * to support diamond dependencies (A→B, A→C, B→D, C→D — D starts
 * when BOTH B and C complete).
 */
export class DagExecutor {
  readonly outputResolver: OutputResolver;

  constructor(
    private readonly db: RegistryDatabase,
    private readonly logger: LoggerService,
  ) {
    this.outputResolver = new OutputResolver(db);
  }

  /**
   * Start an environment run. Creates module runs in topological order.
   * Modules with no dependencies start as 'queued'; others start as 'pending'.
   */
  async startEnvironmentRun(envRunId: string): Promise<void> {
    const envRun = await this.db.getEnvironmentRun(envRunId);
    if (!envRun) throw new Error(`Environment run ${envRunId} not found`);

    const modules = await this.db.listModules(envRun.environment_id);
    const activeModules = modules.filter(m => m.status === 'active');
    const deps = (
      await this.db.getEnvironmentGraph(envRun.environment_id)
    ).deps;

    // Build adjacency and in-degree maps
    const { inDegree } = this.buildGraph(activeModules, deps);

    // Map operation: plan-all → plan, apply-all → apply, destroy-all → destroy
    const moduleOp = this.mapOperation(envRun.operation);

    const now = new Date().toISOString();

    // Create module runs for each active module
    for (const mod of activeModules) {
      const hasNoDeps = (inDegree.get(mod.id) ?? 0) === 0;

      const variablesSnapshot = await this.db.snapshotModuleVariables(mod.id);

      await this.db.createModuleRun({
        id: crypto.randomUUID(),
        module_id: mod.id,
        environment_id: envRun.environment_id,
        environment_run_id: envRunId,
        module_name: mod.name,
        artifact_namespace: mod.artifact_namespace,
        artifact_name: mod.artifact_name,
        module_version: mod.pinned_version ?? undefined,
        operation: moduleOp,
        mode: mod.execution_mode,
        status: hasNoDeps ? 'queued' : 'pending',
        triggered_by: envRun.triggered_by ?? undefined,
        trigger_source: 'env_run',
        priority: 'user',
        tf_version: mod.tf_version ?? undefined,
        variables_snapshot: variablesSnapshot,
        state_backend_snapshot: mod.state_backend ?? undefined,
      });
    }

    // Transition environment run to running
    await this.db.updateEnvironmentRunStatus(envRunId, 'running', {
      started_at: now,
    });

    this.logger.info('Environment run started', {
      envRunId,
      totalModules: activeModules.length,
      rootModules: activeModules.filter(
        m => (inDegree.get(m.id) ?? 0) === 0,
      ).length,
    });
  }

  /**
   * Called when a module run within an environment run completes.
   * Handles dependency-aware progression and failure propagation.
   */
  async onModuleRunComplete(moduleRun: ModuleRunRow): Promise<void> {
    if (!moduleRun.environment_run_id) return;

    const envRun = await this.db.getEnvironmentRun(
      moduleRun.environment_run_id,
    );
    if (!envRun) return;

    const allModuleRuns = await this.db.getModuleRunsForEnvRun(envRun.id);
    await this.db.listModules(envRun.environment_id);
    const { deps } = await this.db.getEnvironmentGraph(
      envRun.environment_id,
    );

    // Build reverse adjacency: module_id → [depends_on_id, ...]
    const upstreamOf = new Map<string, string[]>();
    const downstreamOf = new Map<string, string[]>();
    for (const dep of deps) {
      if (!downstreamOf.has(dep.depends_on_id)) {
        downstreamOf.set(dep.depends_on_id, []);
      }
      downstreamOf.get(dep.depends_on_id)!.push(dep.module_id);

      if (!upstreamOf.has(dep.module_id)) {
        upstreamOf.set(dep.module_id, []);
      }
      upstreamOf.get(dep.module_id)!.push(dep.depends_on_id);
    }

    const moduleRunByModuleId = new Map<string, ModuleRunRow>();
    for (const mr of allModuleRuns) {
      moduleRunByModuleId.set(mr.module_id, mr);
    }

    const now = new Date().toISOString();

    if (moduleRun.status === 'succeeded' || moduleRun.status === 'planned') {
      // Check downstream modules — queue those with ALL deps satisfied
      const downstream = downstreamOf.get(moduleRun.module_id) ?? [];
      for (const downstreamModuleId of downstream) {
        const downstreamRun = moduleRunByModuleId.get(downstreamModuleId);
        if (!downstreamRun || downstreamRun.status !== 'pending') continue;

        // Check all upstream dependencies are satisfied
        const upstreams = upstreamOf.get(downstreamModuleId) ?? [];
        const allSatisfied = upstreams.every(upId => {
          const upRun = moduleRunByModuleId.get(upId);
          return (
            upRun &&
            (upRun.status === 'succeeded' || upRun.status === 'planned')
          );
        });

        if (allSatisfied) {
          await this.db.updateModuleRunStatus(downstreamRun.id, 'queued', {
            queued_at: now,
          });
          this.logger.info('Module run queued (dependency satisfied)', {
            moduleRunId: downstreamRun.id,
            moduleName: downstreamRun.module_name,
          });
        }
      }
    } else if (
      moduleRun.status === 'failed' ||
      moduleRun.status === 'cancelled'
    ) {
      // Propagate failure to transitive dependents
      await this.propagateFailure(
        moduleRun.module_id,
        moduleRun.module_name,
        downstreamOf,
        moduleRunByModuleId,
        now,
      );
    }

    // Update environment run counters
    await this.updateEnvironmentRunCounters(envRun.id);
  }

  /**
   * Confirm an environment run after plan-all completes.
   * Optionally excludes modules (and their transitive dependents).
   */
  async confirmEnvironmentRun(
    envRunId: string,
    excludeModuleIds: string[],
  ): Promise<void> {
    const envRun = await this.db.getEnvironmentRun(envRunId);
    if (!envRun) throw new Error(`Environment run ${envRunId} not found`);

    const allModuleRuns = await this.db.getModuleRunsForEnvRun(envRunId);
    const { deps } = await this.db.getEnvironmentGraph(
      envRun.environment_id,
    );

    const excludeSet = new Set(excludeModuleIds);
    const now = new Date().toISOString();

    // Build downstream map
    const downstreamOf = new Map<string, string[]>();
    for (const dep of deps) {
      if (!downstreamOf.has(dep.depends_on_id)) {
        downstreamOf.set(dep.depends_on_id, []);
      }
      downstreamOf.get(dep.depends_on_id)!.push(dep.module_id);
    }

    // Propagate exclusion to transitive dependents
    const toExclude = new Set(excludeSet);
    const queue = [...excludeSet];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const downstream = downstreamOf.get(current) ?? [];
      for (const d of downstream) {
        if (!toExclude.has(d)) {
          toExclude.add(d);
          queue.push(d);
        }
      }
    }

    // Skip excluded modules
    const moduleRunByModuleId = new Map<string, ModuleRunRow>();
    for (const mr of allModuleRuns) {
      moduleRunByModuleId.set(mr.module_id, mr);
    }

    for (const moduleId of toExclude) {
      const mr = moduleRunByModuleId.get(moduleId);
      if (!mr || mr.status !== 'planned') continue;

      const isDirectExclusion = excludeSet.has(moduleId);
      const reason = isDirectExclusion
        ? 'Excluded from apply'
        : `Upstream module excluded from apply`;

      await this.db.updateModuleRunStatus(mr.id, 'skipped', {
        skip_reason: reason,
        completed_at: now,
      });
    }
  }

  /**
   * Cancel all pending/queued module runs in an environment run.
   */
  async cancelEnvironmentRun(envRunId: string): Promise<void> {
    const moduleRuns = await this.db.getModuleRunsForEnvRun(envRunId);
    const now = new Date().toISOString();

    for (const mr of moduleRuns) {
      if (['pending', 'queued', 'planned'].includes(mr.status)) {
        await this.db.updateModuleRunStatus(mr.id, 'cancelled', {
          completed_at: now,
        });
      }
    }

    await this.db.updateEnvironmentRunStatus(envRunId, 'cancelled', {
      completed_at: now,
    });
  }

  // ── Private helpers ─────────────────────────────────────────────────

  private buildGraph(
    modules: EnvironmentModuleRow[],
    deps: ModuleDependencyRow[],
  ): {
    adjacency: Map<string, string[]>;
    inDegree: Map<string, number>;
  } {
    const moduleIds = new Set(modules.map(m => m.id));
    const adjacency = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    for (const mod of modules) {
      adjacency.set(mod.id, []);
      inDegree.set(mod.id, 0);
    }

    for (const dep of deps) {
      if (!moduleIds.has(dep.module_id) || !moduleIds.has(dep.depends_on_id)) {
        continue;
      }
      adjacency.get(dep.depends_on_id)!.push(dep.module_id);
      inDegree.set(dep.module_id, (inDegree.get(dep.module_id) ?? 0) + 1);
    }

    return { adjacency, inDegree };
  }

  private mapOperation(
    envOp: string,
  ): 'plan' | 'apply' | 'destroy' {
    switch (envOp) {
      case 'plan-all':
        return 'plan';
      case 'apply-all':
        return 'apply';
      case 'destroy-all':
        return 'destroy';
      default:
        return 'plan';
    }
  }

  /**
   * Propagate failure to all transitive dependents via BFS.
   */
  private async propagateFailure(
    failedModuleId: string,
    failedModuleName: string,
    downstreamOf: Map<string, string[]>,
    moduleRunByModuleId: Map<string, ModuleRunRow>,
    now: string,
  ): Promise<void> {
    const queue = [failedModuleId];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const downstream = downstreamOf.get(current) ?? [];
      for (const downstreamId of downstream) {
        const mr = moduleRunByModuleId.get(downstreamId);
        if (!mr || !['pending', 'queued'].includes(mr.status)) continue;

        const reason =
          current === failedModuleId
            ? `Upstream dependency '${failedModuleName}' failed`
            : `Upstream module '${mr.module_name}' skipped`;

        await this.db.updateModuleRunStatus(mr.id, 'skipped', {
          skip_reason: reason,
          completed_at: now,
        });

        this.logger.info('Module run skipped (upstream failure)', {
          moduleRunId: mr.id,
          moduleName: mr.module_name,
          reason,
        });

        queue.push(downstreamId);
      }
    }
  }

  /**
   * Recalculate environment run counters and finalize if all done.
   */
  private async updateEnvironmentRunCounters(
    envRunId: string,
  ): Promise<void> {
    const moduleRuns = await this.db.getModuleRunsForEnvRun(envRunId);
    const envRun = await this.db.getEnvironmentRun(envRunId);
    if (!envRun) return;

    let completed = 0;
    let failed = 0;
    let skipped = 0;
    let pending = 0;

    for (const mr of moduleRuns) {
      switch (mr.status) {
        case 'succeeded':
        case 'planned':
          completed++;
          break;
        case 'failed':
          failed++;
          completed++;
          break;
        case 'skipped':
        case 'discarded':
          skipped++;
          break;
        case 'cancelled':
          failed++;
          break;
        case 'pending':
        case 'queued':
        case 'running':
        case 'applying':
        case 'confirmed':
          pending++;
          break;
      }
    }

    let finalStatus: string | undefined;
    const updates: Record<string, unknown> = {
      completed_modules: completed,
      failed_modules: failed,
      skipped_modules: skipped,
    };

    // Check if all module runs are terminal
    const allDone = pending === 0;
    if (allDone) {
      const now = new Date().toISOString();
      const startedAt = envRun.started_at
        ? new Date(envRun.started_at).getTime()
        : 0;
      const durationSeconds = startedAt
        ? Math.round((Date.now() - startedAt) / 1000)
        : null;

      updates.completed_at = now;
      updates.duration_seconds = durationSeconds;

      if (failed === 0 && skipped === 0) {
        finalStatus = 'succeeded';
      } else if (completed > failed) {
        finalStatus = 'partial_failure';
      } else {
        finalStatus = 'failed';
      }

      this.logger.info('Environment run completed', {
        envRunId,
        status: finalStatus,
        completed,
        failed,
        skipped,
      });
    }

    // Use raw knex update since updateEnvironmentRunStatus only updates status
    await this.db.updateEnvironmentRunStatus(
      envRunId,
      finalStatus ?? envRun.status,
      updates,
    );
  }
}
