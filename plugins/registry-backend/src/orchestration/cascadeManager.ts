// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import crypto from 'crypto';
import * as semver from 'semver';
import { LoggerService } from '@backstage/backend-plugin-api';
import { RegistryDatabase } from '../database/RegistryDatabase';

/**
 * CascadeManager — triggers speculative plan runs on project modules
 * when a new artifact version is approved.
 *
 * Flow:
 * 1. Version approved (manual or auto-approve)
 * 2. Query project modules referencing that artifact
 * 3. Filter by semver constraint (pinned_version)
 * 4. For each matching module, find all active unlocked environments in its project
 * 5. Create speculative plan runs with priority='cascade' for each env
 */
export class CascadeManager {
  constructor(
    private readonly db: RegistryDatabase,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Trigger cascade speculative plans for all matching project modules
   * across all their active environments.
   */
  async triggerCascade(
    artifactId: string,
    newVersion: string,
  ): Promise<void> {
    const dependentModules = await this.db.getProjectModulesWithVersionConstraint(
      artifactId,
    );

    // Filter by semver constraint
    const cascadeTargets = dependentModules.filter(
      mod =>
        shouldCascade(mod.pinned_version, newVersion) &&
        mod.auto_plan_on_module_update &&
        mod.status === 'active',
    );

    // Group by project and find active environments
    const projectIds = [...new Set(cascadeTargets.map(m => m.project_id))];

    let created = 0;
    let skipped = 0;

    for (const projectId of projectIds) {
      // Get project for execution_mode
      const project = await this.db.getProject(projectId);
      if (!project || project.status !== 'active') continue;

      // Get all environments for this project
      const envResult = await this.db.listEnvironments({ projectId });
      const activeEnvs = envResult.items.filter(
        e => e.status === 'active' && !e.locked,
      );

      const projectModules = cascadeTargets.filter(m => m.project_id === projectId);

      for (const env of activeEnvs) {
        for (const mod of projectModules) {
          try {
            const variablesSnapshot = await this.db.snapshotModuleVariables(
              env.id,
              mod.id,
            );

            // createModuleRun handles latest-wins cascade cancellation internally
            await this.db.createModuleRun({
              id: crypto.randomUUID(),
              project_module_id: mod.id,
              environment_id: env.id,
              module_name: mod.name,
              artifact_namespace: mod.artifact_namespace,
              artifact_name: mod.artifact_name,
              module_version: newVersion,
              operation: 'plan',
              mode: project.execution_mode,
              status: 'pending',
              triggered_by: 'system:cascade',
              trigger_source: 'module_update',
              priority: 'cascade',
              tf_version: mod.tf_version ?? undefined,
              variables_snapshot: variablesSnapshot,
              state_backend_snapshot: env.state_backend ?? undefined,
            });
            created++;
          } catch (err) {
            this.logger.warn('Failed to create cascade run', {
              moduleId: mod.id,
              moduleName: mod.name,
              environmentId: env.id,
              error: String(err),
            });
          }
        }
      }

      // Count skipped locked envs
      const lockedEnvs = envResult.items.filter(
        e => e.status === 'active' && e.locked,
      );
      skipped += lockedEnvs.length * projectModules.length;
    }

    // Audit log the cascade
    await this.db.writeAuditLog({
      actor: 'system',
      action: 'cascade.triggered',
      resource_type: 'artifact',
      resource_id: artifactId,
      details: {
        version: newVersion,
        total_modules: dependentModules.length,
        cascade_targets: cascadeTargets.length,
        created,
        skipped_locked: skipped,
        skipped_constraint:
          dependentModules.length - cascadeTargets.length,
      },
    });

    this.logger.info('Cascade triggered', {
      artifactId,
      version: newVersion,
      totalModules: dependentModules.length,
      cascadeTargets: cascadeTargets.length,
      created,
      skippedLocked: skipped,
    });
  }
}

/**
 * Determine if a module with the given pinned_version should cascade
 * on a new artifact version.
 */
export function shouldCascade(
  pinnedVersion: string | null,
  newVersion: string,
): boolean {
  if (pinnedVersion === null) return true; // tracks latest
  const range = terraformConstraintToSemverRange(pinnedVersion);
  if (!range) return pinnedVersion === newVersion; // exact match fallback
  return semver.satisfies(newVersion, range);
}

/**
 * Convert Terraform version constraint syntax to npm semver range syntax.
 *
 * Examples:
 *   ~> 1.2     → >=1.2.0 <2.0.0
 *   ~> 1.2.0   → >=1.2.0 <1.3.0
 *   >= 1.0     → >=1.0.0
 *   >= 1.0, < 2.0 → >=1.0.0 <2.0.0
 *   = 1.2.0    → 1.2.0 (exact)
 *   1.2.3      → 1.2.3 (exact)
 */
export function terraformConstraintToSemverRange(
  constraint: string,
): string | null {
  const trimmed = constraint.trim();

  // Pessimistic constraint (~>)
  const pessimistic = trimmed.match(/^~>\s*(\d+\.\d+(?:\.\d+)?)$/);
  if (pessimistic) {
    const parts = pessimistic[1].split('.');
    if (parts.length === 2) {
      // ~> 1.2 → >=1.2.0 <2.0.0
      return `>=${parts[0]}.${parts[1]}.0 <${parseInt(parts[0], 10) + 1}.0.0`;
    }
    // ~> 1.2.0 → >=1.2.0 <1.3.0
    return `>=${pessimistic[1]} <${parts[0]}.${parseInt(parts[1], 10) + 1}.0`;
  }

  // Exact match with = prefix
  if (trimmed.startsWith('= ')) return trimmed.substring(2);
  if (trimmed.startsWith('=')) return trimmed.substring(1);

  // Plain semver string (exact match)
  if (semver.valid(trimmed)) return trimmed;

  // Range constraint (>= 1.0, < 2.0) — convert comma to space
  const rangeStr = trimmed.replace(/,\s*/g, ' ');
  try {
    const range = new semver.Range(rangeStr);
    return range.range;
  } catch {
    return null;
  }
}
