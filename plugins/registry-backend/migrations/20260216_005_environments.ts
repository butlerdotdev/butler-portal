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

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const isSqlite = knex.client.config.client === 'better-sqlite3' || knex.client.config.client === 'sqlite3';

  // ── environments ────────────────────────────────────────────────────
  await knex.schema.createTable('environments', table => {
    table.uuid('id').primary(); // UUID generated client-side
    table.string('name', 128).notNullable();
    table.text('description').nullable();
    table.string('team', 128).nullable();
    table.string('status', 32).notNullable().defaultTo('active'); // active, paused, archived
    table.boolean('locked').notNullable().defaultTo(false);
    table.string('locked_by', 256).nullable();
    table.timestamp('locked_at', { useTz: true }).nullable();
    table.string('lock_reason', 512).nullable();
    table.integer('module_count').notNullable().defaultTo(0);
    table.integer('total_resources').notNullable().defaultTo(0);
    table.timestamp('last_run_at', { useTz: true }).nullable();
    table.string('created_by', 256).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['team', 'name']);
  });

  // ── environment_modules ─────────────────────────────────────────────
  await knex.schema.createTable('environment_modules', table => {
    table.uuid('id').primary(); // UUID generated client-side
    table
      .uuid('environment_id')
      .notNullable()
      .references('id')
      .inTable('environments')
      .onDelete('CASCADE');
    table.string('name', 128).notNullable();
    table.text('description').nullable();

    // Registry artifact reference
    table
      .uuid('artifact_id')
      .notNullable()
      .references('id')
      .inTable('artifacts')
      .onDelete('RESTRICT');
    table.string('artifact_namespace', 64).notNullable();
    table.string('artifact_name', 64).notNullable();
    table.string('pinned_version', 128).nullable(); // exact version or constraint (~> 1.2.0), null = latest
    table.string('current_version', 128).nullable(); // version currently deployed
    table.boolean('auto_plan_on_module_update').notNullable().defaultTo(true);

    // VCS trigger (future work — schema present for forward-compatibility)
    table.json('vcs_trigger').nullable();
    table.boolean('auto_plan_on_push').notNullable().defaultTo(false);

    // Execution config
    table.string('execution_mode', 16).notNullable().defaultTo('byoc'); // byoc or peaas
    table.string('tf_version', 32).nullable();
    table.string('working_directory', 512).nullable();

    // State backend config
    table.json('state_backend').nullable(); // { type: "pg"|"s3"|"gcs"|"azurerm", config: {...} }

    // Run tracking (last_run_id FK added after module_runs table)
    table.uuid('last_run_id').nullable();
    table.string('last_run_status', 32).nullable();
    table.timestamp('last_run_at', { useTz: true }).nullable();
    table.integer('resource_count').defaultTo(0);

    // Drift detection (placeholder for future phase — always 'unknown' for now)
    table.string('drift_status', 32).notNullable().defaultTo('unknown');

    // Lifecycle
    table.string('status', 32).notNullable().defaultTo('active'); // active, destroyed, archived

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['environment_id', 'name']);
  });

  // ── environment_module_dependencies ─────────────────────────────────
  await knex.schema.createTable('environment_module_dependencies', table => {
    table.uuid('id').primary(); // UUID generated client-side
    table
      .uuid('module_id')
      .notNullable()
      .references('id')
      .inTable('environment_modules')
      .onDelete('CASCADE');
    table
      .uuid('depends_on_id')
      .notNullable()
      .references('id')
      .inTable('environment_modules')
      .onDelete('CASCADE');
    // Output passing: maps upstream outputs to downstream terraform variables
    table.json('output_mapping').nullable(); // [{ "upstream_output": "vpc_id", "downstream_variable": "vpc_id" }, ...]
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['module_id', 'depends_on_id']);
  });

  // Add CHECK constraint: no self-dependencies (not supported by SQLite ALTER TABLE)
  if (!isSqlite) {
    await knex.raw(`
      ALTER TABLE environment_module_dependencies
      ADD CONSTRAINT chk_no_self_dep CHECK (module_id != depends_on_id)
    `);
  }

  // ── environment_module_variables ────────────────────────────────────
  await knex.schema.createTable('environment_module_variables', table => {
    table.uuid('id').primary(); // UUID generated client-side
    table
      .uuid('module_id')
      .notNullable()
      .references('id')
      .inTable('environment_modules')
      .onDelete('CASCADE');
    table.string('key', 256).notNullable();
    table.text('value').nullable(); // plaintext for non-sensitive; NULL for sensitive
    table.boolean('sensitive').notNullable().defaultTo(false);
    table.boolean('hcl').notNullable().defaultTo(false); // interpret value as HCL expression
    table.string('category', 16).notNullable().defaultTo('terraform'); // terraform or env
    table.text('description').nullable();
    table.string('secret_ref', 256).nullable(); // K8s Secret ref for sensitive vars (ns/name:key)
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['module_id', 'key', 'category']);
  });

  // ── module_runs ─────────────────────────────────────────────────────
  await knex.schema.createTable('module_runs', table => {
    table.uuid('id').primary();
    table
      .uuid('module_id')
      .notNullable()
      .references('id')
      .inTable('environment_modules')
      .onDelete('RESTRICT');
    table
      .uuid('environment_id')
      .notNullable()
      .references('id')
      .inTable('environments')
      .onDelete('RESTRICT');
    table.uuid('environment_run_id').nullable(); // FK added after environment_runs table

    // Module context
    table.string('module_name', 128).notNullable();
    table.string('artifact_namespace', 64).notNullable();
    table.string('artifact_name', 64).notNullable();
    table.string('module_version', 128).nullable();

    // Execution
    table.string('operation', 32).notNullable(); // plan, apply, destroy, refresh, drift-check
    table.string('mode', 16).notNullable(); // byoc, peaas
    table.string('status', 32).notNullable().defaultTo('pending');
    // pending → queued → running → planned → confirmed → applying → succeeded | failed | cancelled | timed_out | discarded | skipped

    table.string('triggered_by', 256).nullable();
    table.string('trigger_source', 32).nullable(); // manual, module_update, api, env_run

    // Queue management
    table.string('priority', 16).notNullable().defaultTo('user'); // user (processed first) | cascade (lower priority)
    table.integer('queue_position').nullable(); // NULL if active; 1,2,3... if queued
    table.string('skip_reason', 512).nullable(); // set when status='skipped'

    // BYOC
    table.string('ci_provider', 32).nullable();
    table.text('pipeline_config').nullable();
    table.string('callback_token_hash', 256).nullable();

    // PeaaS
    table.string('k8s_job_name', 256).nullable();
    table.string('k8s_namespace', 128).nullable();
    table.string('tf_version', 32).nullable();

    // Config snapshot (frozen at run creation)
    table.json('variables_snapshot').nullable();
    table.json('env_vars_snapshot').nullable();
    table.json('state_backend_snapshot').nullable();

    // Results
    table.integer('exit_code').nullable();
    table.integer('resources_to_add').nullable();
    table.integer('resources_to_change').nullable();
    table.integer('resources_to_destroy').nullable();
    table.integer('resource_count_after').nullable();
    table.text('plan_summary').nullable();
    table.json('tf_outputs').nullable(); // terraform output values (for dependency passing)

    // Timing
    table.timestamp('queued_at', { useTz: true }).nullable();
    table.timestamp('started_at', { useTz: true }).nullable();
    table.timestamp('planned_at', { useTz: true }).nullable();
    table.timestamp('confirmed_at', { useTz: true }).nullable();
    table.timestamp('completed_at', { useTz: true }).nullable();
    table.integer('duration_seconds').nullable();

    // Confirmation
    table.string('confirmed_by', 256).nullable();
    table.boolean('auto_confirmed').defaultTo(false);

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // ── environment_runs ────────────────────────────────────────────────
  await knex.schema.createTable('environment_runs', table => {
    table.uuid('id').primary();
    table
      .uuid('environment_id')
      .notNullable()
      .references('id')
      .inTable('environments')
      .onDelete('RESTRICT');
    table.string('environment_name', 128).notNullable();

    table.string('operation', 32).notNullable(); // plan-all, apply-all, destroy-all
    table.string('status', 32).notNullable().defaultTo('pending');
    // pending → running → succeeded | partial_failure | failed | cancelled | expired

    table.string('triggered_by', 256).nullable();
    table.string('trigger_source', 32).nullable(); // manual, api, schedule

    // DAG execution tracking
    table.integer('total_modules').notNullable();
    table.integer('completed_modules').notNullable().defaultTo(0);
    table.integer('failed_modules').notNullable().defaultTo(0);
    table.integer('skipped_modules').notNullable().defaultTo(0);
    table.json('execution_order').nullable(); // topologically sorted module IDs

    // Timing
    table.timestamp('started_at', { useTz: true }).nullable();
    table.timestamp('completed_at', { useTz: true }).nullable();
    table.integer('duration_seconds').nullable();

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // ── Add deferred FKs (PostgreSQL only — SQLite doesn't support ALTER TABLE ADD CONSTRAINT) ──
  if (!isSqlite) {
    // environment_modules.last_run_id → module_runs
    await knex.raw(`
      ALTER TABLE environment_modules ADD CONSTRAINT fk_env_modules_last_run
        FOREIGN KEY (last_run_id) REFERENCES module_runs(id) ON DELETE SET NULL
    `);

    // module_runs.environment_run_id → environment_runs
    await knex.raw(`
      ALTER TABLE module_runs ADD CONSTRAINT fk_module_runs_env_run
        FOREIGN KEY (environment_run_id) REFERENCES environment_runs(id) ON DELETE SET NULL
    `);
  }

  // ── module_run_outputs ──────────────────────────────────────────────
  await knex.schema.createTable('module_run_outputs', table => {
    table.uuid('id').primary(); // UUID generated client-side
    table
      .uuid('run_id')
      .notNullable()
      .references('id')
      .inTable('module_runs')
      .onDelete('CASCADE');
    table.string('output_type', 32).notNullable(); // plan_json, plan_text, apply_output, state_outputs, error_output
    table.text('content').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['run_id', 'output_type']);
  });

  // ── module_run_logs ─────────────────────────────────────────────────
  await knex.schema.createTable('module_run_logs', table => {
    table.uuid('id').primary();
    table
      .uuid('run_id')
      .notNullable()
      .references('id')
      .inTable('module_runs')
      .onDelete('CASCADE');
    table.integer('sequence').notNullable();
    table.string('stream', 8).notNullable().defaultTo('stdout'); // stdout, stderr
    table.text('content').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // ── terraform_state ─────────────────────────────────────────────────
  // Metadata tracking for platform-managed state.
  // Actual state data is managed by Terraform's pg backend in its own tables.
  await knex.schema.createTable('terraform_state', table => {
    table.uuid('id').primary(); // UUID generated client-side
    table
      .uuid('module_id')
      .notNullable()
      .references('id')
      .inTable('environment_modules')
      .onDelete('CASCADE');
    table.string('workspace', 256).notNullable().unique(); // env-{envId}-mod-{moduleId}
    table.string('lock_id', 256).nullable(); // current TF lock ID (for UI display)
    table.string('locked_by', 256).nullable(); // who holds the lock
    table.timestamp('locked_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // ── indexes ─────────────────────────────────────────────────────────
  await knex.raw('CREATE INDEX idx_environments_team ON environments(team)');
  await knex.raw("CREATE INDEX idx_environments_status ON environments(status)");

  await knex.raw('CREATE INDEX idx_env_modules_env ON environment_modules(environment_id)');
  await knex.raw('CREATE INDEX idx_env_modules_artifact ON environment_modules(artifact_id)');
  await knex.raw("CREATE INDEX idx_env_modules_status ON environment_modules(status)");

  await knex.raw('CREATE INDEX idx_env_module_deps_module ON environment_module_dependencies(module_id)');
  await knex.raw('CREATE INDEX idx_env_module_deps_depends ON environment_module_dependencies(depends_on_id)');

  await knex.raw('CREATE INDEX idx_env_module_vars ON environment_module_variables(module_id)');

  await knex.raw('CREATE INDEX idx_module_runs_module ON module_runs(module_id)');
  await knex.raw('CREATE INDEX idx_module_runs_env ON module_runs(environment_id)');
  await knex.raw('CREATE INDEX idx_module_runs_env_run ON module_runs(environment_run_id)');
  await knex.raw('CREATE INDEX idx_module_runs_status ON module_runs(status)');
  await knex.raw('CREATE INDEX idx_module_runs_created ON module_runs(created_at DESC)');
  await knex.raw(`
    CREATE INDEX idx_module_runs_queue ON module_runs(module_id, queue_position)
      WHERE queue_position IS NOT NULL
  `);

  await knex.raw('CREATE INDEX idx_env_runs_env ON environment_runs(environment_id)');
  await knex.raw('CREATE INDEX idx_env_runs_status ON environment_runs(status)');

  await knex.raw('CREATE INDEX idx_module_run_outputs_run ON module_run_outputs(run_id)');
  await knex.raw('CREATE INDEX idx_module_run_logs_run_seq ON module_run_logs(run_id, sequence)');

  await knex.raw('CREATE INDEX idx_tf_state_module ON terraform_state(module_id)');
}

export async function down(knex: Knex): Promise<void> {
  const isSqlite = knex.client.config.client === 'better-sqlite3' || knex.client.config.client === 'sqlite3';

  // Drop indexes first
  await knex.raw('DROP INDEX IF EXISTS idx_tf_state_module');
  await knex.raw('DROP INDEX IF EXISTS idx_module_run_logs_run_seq');
  await knex.raw('DROP INDEX IF EXISTS idx_module_run_outputs_run');
  await knex.raw('DROP INDEX IF EXISTS idx_env_runs_status');
  await knex.raw('DROP INDEX IF EXISTS idx_env_runs_env');
  await knex.raw('DROP INDEX IF EXISTS idx_module_runs_queue');
  await knex.raw('DROP INDEX IF EXISTS idx_module_runs_created');
  await knex.raw('DROP INDEX IF EXISTS idx_module_runs_status');
  await knex.raw('DROP INDEX IF EXISTS idx_module_runs_env_run');
  await knex.raw('DROP INDEX IF EXISTS idx_module_runs_env');
  await knex.raw('DROP INDEX IF EXISTS idx_module_runs_module');
  await knex.raw('DROP INDEX IF EXISTS idx_env_module_vars');
  await knex.raw('DROP INDEX IF EXISTS idx_env_module_deps_depends');
  await knex.raw('DROP INDEX IF EXISTS idx_env_module_deps_module');
  await knex.raw('DROP INDEX IF EXISTS idx_env_modules_status');
  await knex.raw('DROP INDEX IF EXISTS idx_env_modules_artifact');
  await knex.raw('DROP INDEX IF EXISTS idx_env_modules_env');
  await knex.raw('DROP INDEX IF EXISTS idx_environments_status');
  await knex.raw('DROP INDEX IF EXISTS idx_environments_team');

  // Drop deferred FK constraints (PostgreSQL only)
  if (!isSqlite) {
    await knex.raw('ALTER TABLE module_runs DROP CONSTRAINT IF EXISTS fk_module_runs_env_run');
    await knex.raw('ALTER TABLE environment_modules DROP CONSTRAINT IF EXISTS fk_env_modules_last_run');
    await knex.raw('ALTER TABLE environment_module_dependencies DROP CONSTRAINT IF EXISTS chk_no_self_dep');
  }

  // Drop tables in reverse dependency order
  await knex.schema.dropTableIfExists('terraform_state');
  await knex.schema.dropTableIfExists('module_run_logs');
  await knex.schema.dropTableIfExists('module_run_outputs');
  await knex.schema.dropTableIfExists('environment_runs');
  await knex.schema.dropTableIfExists('module_runs');
  await knex.schema.dropTableIfExists('environment_module_variables');
  await knex.schema.dropTableIfExists('environment_module_dependencies');
  await knex.schema.dropTableIfExists('environment_modules');
  await knex.schema.dropTableIfExists('environments');
}
