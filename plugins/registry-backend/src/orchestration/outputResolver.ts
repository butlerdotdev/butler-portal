// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { RegistryDatabase } from '../database/RegistryDatabase';

/**
 * Resolves upstream terraform outputs for dependent modules.
 *
 * Before starting a dependent module's run, the output resolver:
 * 1. For each upstream dependency, queries the latest successful apply run's tf_outputs
 * 2. Maps upstream outputs to downstream variables using the dependency's output_mapping
 * 3. Returns resolved values to be written as terraform.tfvars.json
 */
export class OutputResolver {
  constructor(private readonly db: RegistryDatabase) {}

  /**
   * Resolve all upstream outputs for a module, mapped to downstream variable names.
   *
   * @returns A record of { downstreamVariable: value } to inject as tfvars.
   * @throws If an upstream has no outputs or a mapped key is missing.
   */
  async resolveUpstreamOutputs(
    moduleId: string,
  ): Promise<Record<string, unknown>> {
    const deps = await this.db.getModuleDependencies(moduleId);
    const resolved: Record<string, unknown> = {};

    for (const dep of deps) {
      if (!dep.output_mapping || dep.output_mapping.length === 0) continue;

      const upstreamRun = await this.db.getLatestSuccessfulModuleRun(
        dep.depends_on_id,
      );
      if (!upstreamRun?.tf_outputs) {
        const depName = (dep as any).depends_on_name ?? dep.depends_on_id;
        throw new Error(
          `Dependency '${depName}' has no outputs — apply it first`,
        );
      }

      for (const mapping of dep.output_mapping) {
        if (!(mapping.upstream_output in upstreamRun.tf_outputs)) {
          const depName = (dep as any).depends_on_name ?? dep.depends_on_id;
          const available = Object.keys(upstreamRun.tf_outputs).join(', ');
          throw new Error(
            `Upstream module output "${mapping.upstream_output}" not found in '${depName}'. ` +
              `Available: ${available || '(none)'}`,
          );
        }
        resolved[mapping.downstream_variable] =
          upstreamRun.tf_outputs[mapping.upstream_output];
      }
    }

    return resolved;
  }

  /**
   * Check if all upstream dependencies for a module have outputs available.
   * Used during plan-all to determine if a module can proceed.
   */
  async hasUpstreamOutputs(moduleId: string): Promise<boolean> {
    const deps = await this.db.getModuleDependencies(moduleId);
    for (const dep of deps) {
      if (!dep.output_mapping || dep.output_mapping.length === 0) continue;
      const upstreamRun = await this.db.getLatestSuccessfulModuleRun(
        dep.depends_on_id,
      );
      if (!upstreamRun?.tf_outputs) return false;
    }
    return true;
  }
}
