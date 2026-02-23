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

/**
 * Restructure from Team → Environments → Modules to Team → Projects → Environments.
 *
 * Projects own modules and their DAG. Environments are deployment targets within
 * a project (dev/staging/prod) that own variable values, state backend config, and
 * per-module deployment state.
 *
 * No migration path — drops and recreates all environment/module tables.
 */
export async function up(knex: Knex): Promise<void> {
  const isSqlite = knex.client.config.client === 'better-sqlite3' || knex.client.config.client === 'sqlite3';

  // ── Drop old tables (reverse dependency order) ──────────────────────
  // Drop binding tables from migration 006 that reference environment_modules
  await knex.schema.dropTableIfExists('module_variable_sets');
  await knex.schema.dropTableIfExists('module_cloud_integrations');
  await knex.schema.dropTableIfExists('environment_variable_sets');
  await knex.schema.dropTableIfExists('environment_cloud_integrations');

  // Drop environment tables from migration 005
  await knex.schema.dropTableIfExists('terraform_state');
  await knex.schema.dropTableIfExists('module_run_logs');
  await knex.schema.dropTableIfExists('module_run_outputs');
  // Drop FK constraints before dropping tables (PG only)
  if (!isSqlite) {
    await knex.raw('ALTER TABLE module_runs DROP CONSTRAINT IF EXISTS fk_module_runs_env_run');
    await knex.raw('ALTER TABLE environment_modules DROP CONSTRAINT IF EXISTS fk_env_modules_last_run');
    await knex.raw('ALTER TABLE environment_module_dependencies DROP CONSTRAINT IF EXISTS chk_no_self_dep');
  }
  await knex.schema.dropTableIfExists('environment_runs');
  await knex.schema.dropTableIfExists('module_runs');
  await knex.schema.dropTableIfExists('environment_module_variables');
  await knex.schema.dropTableIfExists('environment_module_dependencies');
  await knex.schema.dropTableIfExists('environment_modules');
  await knex.schema.dropTableIfExists('environments');

  // ── projects ──────────────────────────────────────────────────────────
  await knex.schema.createTable('projects', table => {
    table.uuid('id').primary();
    table.string('name', 128).notNullable();
    table.text('description').nullable();
    table.string('team', 128).nullable();
    table.string('execution_mode', 16).notNullable().defaultTo('byoc'); // byoc or peaas
    table.string('status', 32).notNullable().defaultTo('active'); // active, paused, archived
    table.integer('module_count').notNullable().defaultTo(0);
    table.integer('total_resources').notNullable().defaultTo(0);
    table.timestamp('last_run_at', { useTz: true }).nullable();
    table.string('created_by', 256).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['team', 'name']);
  });

  // ── project_modules ───────────────────────────────────────────────────
  await knex.schema.createTable('project_modules', table => {
    table.uuid('id').primary();
    table
      .uuid('project_id')
      .notNullable()
      .references('id')
      .inTable('projects')
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
    table.string('pinned_version', 128).nullable();
    table.boolean('auto_plan_on_module_update').notNullable().defaultTo(true);

    // VCS trigger
    table.json('vcs_trigger').nullable();
    table.boolean('auto_plan_on_push').notNullable().defaultTo(false);

    // Execution config (execution_mode is on the project, not the module)
    table.string('tf_version', 32).nullable();
    table.string('working_directory', 512).nullable();

    // Lifecycle
    table.string('status', 32).notNullable().defaultTo('active'); // active, archived

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['project_id', 'name']);
  });

  // ── project_module_dependencies ───────────────────────────────────────
  await knex.schema.createTable('project_module_dependencies', table => {
    table.uuid('id').primary();
    table
      .uuid('module_id')
      .notNullable()
      .references('id')
      .inTable('project_modules')
      .onDelete('CASCADE');
    table
      .uuid('depends_on_id')
      .notNullable()
      .references('id')
      .inTable('project_modules')
      .onDelete('CASCADE');
    table.json('output_mapping').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['module_id', 'depends_on_id']);
  });

  if (!isSqlite) {
    await knex.raw(`
      ALTER TABLE project_module_dependencies
      ADD CONSTRAINT chk_no_self_dep CHECK (module_id != depends_on_id)
    `);
  }

  // ── environments (modified — now belongs to a project) ────────────────
  await knex.schema.createTable('environments', table => {
    table.uuid('id').primary();
    table.string('name', 128).notNullable();
    table.text('description').nullable();
    table
      .uuid('project_id')
      .notNullable()
      .references('id')
      .inTable('projects')
      .onDelete('CASCADE');
    table.string('team', 128).nullable(); // denormalized from project for query convenience
    table.string('status', 32).notNullable().defaultTo('active');
    table.boolean('locked').notNullable().defaultTo(false);
    table.string('locked_by', 256).nullable();
    table.timestamp('locked_at', { useTz: true }).nullable();
    table.string('lock_reason', 512).nullable();

    // State backend at environment level (all modules share)
    table.json('state_backend').nullable();

    table.integer('total_resources').notNullable().defaultTo(0);
    table.timestamp('last_run_at', { useTz: true }).nullable();
    table.string('created_by', 256).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['project_id', 'name']);
  });

  // ── environment_module_state ──────────────────────────────────────────
  // Per-environment-per-module deployment tracking.
  // Automatically created when a module run is first created for an env+module pair.
  await knex.schema.createTable('environment_module_state', table => {
    table.uuid('id').primary();
    table
      .uuid('environment_id')
      .notNullable()
      .references('id')
      .inTable('environments')
      .onDelete('CASCADE');
    table
      .uuid('project_module_id')
      .notNullable()
      .references('id')
      .inTable('project_modules')
      .onDelete('CASCADE');
    table.string('current_version', 128).nullable();
    table.uuid('last_run_id').nullable(); // FK added after module_runs table
    table.string('last_run_status', 32).nullable();
    table.timestamp('last_run_at', { useTz: true }).nullable();
    table.integer('resource_count').notNullable().defaultTo(0);
    table.string('drift_status', 32).notNullable().defaultTo('unknown');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['environment_id', 'project_module_id']);
  });

  // ── environment_module_variables ──────────────────────────────────────
  // Variables are per-environment-per-module (same module may have different vars in dev vs prod)
  await knex.schema.createTable('environment_module_variables', table => {
    table.uuid('id').primary();
    table
      .uuid('environment_id')
      .notNullable()
      .references('id')
      .inTable('environments')
      .onDelete('CASCADE');
    table
      .uuid('project_module_id')
      .notNullable()
      .references('id')
      .inTable('project_modules')
      .onDelete('CASCADE');
    table.string('key', 256).notNullable();
    table.text('value').nullable();
    table.boolean('sensitive').notNullable().defaultTo(false);
    table.boolean('hcl').notNullable().defaultTo(false);
    table.string('category', 16).notNullable().defaultTo('terraform');
    table.text('description').nullable();
    table.string('secret_ref', 256).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['environment_id', 'project_module_id', 'key', 'category']);
  });

  // ── module_runs ───────────────────────────────────────────────────────
  await knex.schema.createTable('module_runs', table => {
    table.uuid('id').primary();
    table
      .uuid('project_module_id')
      .notNullable()
      .references('id')
      .inTable('project_modules')
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
    table.string('operation', 32).notNullable();
    table.string('mode', 16).notNullable(); // byoc, peaas
    table.string('status', 32).notNullable().defaultTo('pending');

    table.string('triggered_by', 256).nullable();
    table.string('trigger_source', 32).nullable();

    // Queue management
    table.string('priority', 16).notNullable().defaultTo('user');
    table.integer('queue_position').nullable();
    table.string('skip_reason', 512).nullable();

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
    table.json('tf_outputs').nullable();

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

  // ── environment_runs ──────────────────────────────────────────────────
  await knex.schema.createTable('environment_runs', table => {
    table.uuid('id').primary();
    table
      .uuid('environment_id')
      .notNullable()
      .references('id')
      .inTable('environments')
      .onDelete('RESTRICT');
    table.string('environment_name', 128).notNullable();

    table.string('operation', 32).notNullable();
    table.string('status', 32).notNullable().defaultTo('pending');

    table.string('triggered_by', 256).nullable();
    table.string('trigger_source', 32).nullable();

    table.integer('total_modules').notNullable();
    table.integer('completed_modules').notNullable().defaultTo(0);
    table.integer('failed_modules').notNullable().defaultTo(0);
    table.integer('skipped_modules').notNullable().defaultTo(0);
    table.json('execution_order').nullable();

    table.timestamp('started_at', { useTz: true }).nullable();
    table.timestamp('completed_at', { useTz: true }).nullable();
    table.integer('duration_seconds').nullable();

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // ── Deferred FKs ──────────────────────────────────────────────────────
  if (!isSqlite) {
    await knex.raw(`
      ALTER TABLE environment_module_state ADD CONSTRAINT fk_env_mod_state_last_run
        FOREIGN KEY (last_run_id) REFERENCES module_runs(id) ON DELETE SET NULL
    `);
    await knex.raw(`
      ALTER TABLE module_runs ADD CONSTRAINT fk_module_runs_env_run
        FOREIGN KEY (environment_run_id) REFERENCES environment_runs(id) ON DELETE SET NULL
    `);
  }

  // ── module_run_outputs ────────────────────────────────────────────────
  await knex.schema.createTable('module_run_outputs', table => {
    table.uuid('id').primary();
    table
      .uuid('run_id')
      .notNullable()
      .references('id')
      .inTable('module_runs')
      .onDelete('CASCADE');
    table.string('output_type', 32).notNullable();
    table.text('content').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['run_id', 'output_type']);
  });

  // ── module_run_logs ───────────────────────────────────────────────────
  await knex.schema.createTable('module_run_logs', table => {
    table.uuid('id').primary();
    table
      .uuid('run_id')
      .notNullable()
      .references('id')
      .inTable('module_runs')
      .onDelete('CASCADE');
    table.integer('sequence').notNullable();
    table.string('stream', 8).notNullable().defaultTo('stdout');
    table.text('content').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // ── terraform_state ───────────────────────────────────────────────────
  // Keyed on (environment_id, project_module_id) — each env+module gets its own state
  await knex.schema.createTable('terraform_state', table => {
    table.uuid('id').primary();
    table
      .uuid('environment_id')
      .notNullable()
      .references('id')
      .inTable('environments')
      .onDelete('CASCADE');
    table
      .uuid('project_module_id')
      .notNullable()
      .references('id')
      .inTable('project_modules')
      .onDelete('CASCADE');
    table.string('workspace', 256).notNullable().unique();
    table.string('lock_id', 256).nullable();
    table.string('locked_by', 256).nullable();
    table.timestamp('locked_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['environment_id', 'project_module_id']);
  });

  // ── Recreate binding tables with project_modules FK ───────────────────

  // environment_cloud_integrations (unchanged — still references environments)
  await knex.schema.createTable('environment_cloud_integrations', table => {
    table.uuid('id').primary();
    table
      .uuid('environment_id')
      .notNullable()
      .references('id')
      .inTable('environments')
      .onDelete('CASCADE');
    table
      .uuid('cloud_integration_id')
      .notNullable()
      .references('id')
      .inTable('cloud_integrations')
      .onDelete('CASCADE');
    table.integer('priority').notNullable().defaultTo(0);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['environment_id', 'cloud_integration_id']);
  });

  // module_cloud_integrations — now references project_modules
  await knex.schema.createTable('module_cloud_integrations', table => {
    table.uuid('id').primary();
    table
      .uuid('module_id')
      .notNullable()
      .references('id')
      .inTable('project_modules')
      .onDelete('CASCADE');
    table
      .uuid('cloud_integration_id')
      .notNullable()
      .references('id')
      .inTable('cloud_integrations')
      .onDelete('CASCADE');
    table.integer('priority').notNullable().defaultTo(0);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['module_id', 'cloud_integration_id']);
  });

  // environment_variable_sets (unchanged — still references environments)
  await knex.schema.createTable('environment_variable_sets', table => {
    table.uuid('id').primary();
    table
      .uuid('environment_id')
      .notNullable()
      .references('id')
      .inTable('environments')
      .onDelete('CASCADE');
    table
      .uuid('variable_set_id')
      .notNullable()
      .references('id')
      .inTable('variable_sets')
      .onDelete('CASCADE');
    table.integer('priority').notNullable().defaultTo(0);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['environment_id', 'variable_set_id']);
  });

  // module_variable_sets — now references project_modules
  await knex.schema.createTable('module_variable_sets', table => {
    table.uuid('id').primary();
    table
      .uuid('module_id')
      .notNullable()
      .references('id')
      .inTable('project_modules')
      .onDelete('CASCADE');
    table
      .uuid('variable_set_id')
      .notNullable()
      .references('id')
      .inTable('variable_sets')
      .onDelete('CASCADE');
    table.integer('priority').notNullable().defaultTo(0);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['module_id', 'variable_set_id']);
  });

  // ── indexes ───────────────────────────────────────────────────────────
  await knex.raw('CREATE INDEX idx_projects_team ON projects(team)');
  await knex.raw('CREATE INDEX idx_projects_status ON projects(status)');

  await knex.raw('CREATE INDEX idx_project_modules_project ON project_modules(project_id)');
  await knex.raw('CREATE INDEX idx_project_modules_artifact ON project_modules(artifact_id)');
  await knex.raw('CREATE INDEX idx_project_modules_status ON project_modules(status)');

  await knex.raw('CREATE INDEX idx_proj_mod_deps_module ON project_module_dependencies(module_id)');
  await knex.raw('CREATE INDEX idx_proj_mod_deps_depends ON project_module_dependencies(depends_on_id)');

  await knex.raw('CREATE INDEX idx_environments_project ON environments(project_id)');
  await knex.raw('CREATE INDEX idx_environments_team ON environments(team)');
  await knex.raw('CREATE INDEX idx_environments_status ON environments(status)');

  await knex.raw('CREATE INDEX idx_env_mod_state_env ON environment_module_state(environment_id)');
  await knex.raw('CREATE INDEX idx_env_mod_state_module ON environment_module_state(project_module_id)');

  await knex.raw('CREATE INDEX idx_env_module_vars_env ON environment_module_variables(environment_id)');
  await knex.raw('CREATE INDEX idx_env_module_vars_mod ON environment_module_variables(project_module_id)');

  await knex.raw('CREATE INDEX idx_module_runs_module ON module_runs(project_module_id)');
  await knex.raw('CREATE INDEX idx_module_runs_env ON module_runs(environment_id)');
  await knex.raw('CREATE INDEX idx_module_runs_env_run ON module_runs(environment_run_id)');
  await knex.raw('CREATE INDEX idx_module_runs_status ON module_runs(status)');
  await knex.raw('CREATE INDEX idx_module_runs_created ON module_runs(created_at DESC)');
  await knex.raw(`
    CREATE INDEX idx_module_runs_queue ON module_runs(project_module_id, queue_position)
      WHERE queue_position IS NOT NULL
  `);

  await knex.raw('CREATE INDEX idx_env_runs_env ON environment_runs(environment_id)');
  await knex.raw('CREATE INDEX idx_env_runs_status ON environment_runs(status)');

  await knex.raw('CREATE INDEX idx_module_run_outputs_run ON module_run_outputs(run_id)');
  await knex.raw('CREATE INDEX idx_module_run_logs_run_seq ON module_run_logs(run_id, sequence)');

  await knex.raw('CREATE INDEX idx_tf_state_env ON terraform_state(environment_id)');
  await knex.raw('CREATE INDEX idx_tf_state_module ON terraform_state(project_module_id)');

  await knex.raw('CREATE INDEX idx_env_cloud_int_env ON environment_cloud_integrations(environment_id)');
  await knex.raw('CREATE INDEX idx_env_cloud_int_ci ON environment_cloud_integrations(cloud_integration_id)');
  await knex.raw('CREATE INDEX idx_mod_cloud_int_mod ON module_cloud_integrations(module_id)');
  await knex.raw('CREATE INDEX idx_env_vs_env ON environment_variable_sets(environment_id)');
  await knex.raw('CREATE INDEX idx_env_vs_vs ON environment_variable_sets(variable_set_id)');
  await knex.raw('CREATE INDEX idx_mod_vs_mod ON module_variable_sets(module_id)');
}

export async function down(knex: Knex): Promise<void> {
  const isSqlite = knex.client.config.client === 'better-sqlite3' || knex.client.config.client === 'sqlite3';

  // Drop all new indexes
  const indexes = [
    'idx_mod_vs_mod', 'idx_env_vs_vs', 'idx_env_vs_env',
    'idx_mod_cloud_int_mod', 'idx_env_cloud_int_ci', 'idx_env_cloud_int_env',
    'idx_tf_state_module', 'idx_tf_state_env',
    'idx_module_run_logs_run_seq', 'idx_module_run_outputs_run',
    'idx_env_runs_status', 'idx_env_runs_env',
    'idx_module_runs_queue', 'idx_module_runs_created',
    'idx_module_runs_status', 'idx_module_runs_env_run',
    'idx_module_runs_env', 'idx_module_runs_module',
    'idx_env_module_vars_mod', 'idx_env_module_vars_env',
    'idx_env_mod_state_module', 'idx_env_mod_state_env',
    'idx_environments_status', 'idx_environments_team', 'idx_environments_project',
    'idx_proj_mod_deps_depends', 'idx_proj_mod_deps_module',
    'idx_project_modules_status', 'idx_project_modules_artifact', 'idx_project_modules_project',
    'idx_projects_status', 'idx_projects_team',
  ];
  for (const idx of indexes) {
    await knex.raw(`DROP INDEX IF EXISTS ${idx}`);
  }

  // Drop FK constraints
  if (!isSqlite) {
    await knex.raw('ALTER TABLE module_runs DROP CONSTRAINT IF EXISTS fk_module_runs_env_run');
    await knex.raw('ALTER TABLE environment_module_state DROP CONSTRAINT IF EXISTS fk_env_mod_state_last_run');
    await knex.raw('ALTER TABLE project_module_dependencies DROP CONSTRAINT IF EXISTS chk_no_self_dep');
  }

  // Drop new tables in reverse dependency order
  await knex.schema.dropTableIfExists('module_variable_sets');
  await knex.schema.dropTableIfExists('environment_variable_sets');
  await knex.schema.dropTableIfExists('module_cloud_integrations');
  await knex.schema.dropTableIfExists('environment_cloud_integrations');
  await knex.schema.dropTableIfExists('terraform_state');
  await knex.schema.dropTableIfExists('module_run_logs');
  await knex.schema.dropTableIfExists('module_run_outputs');
  await knex.schema.dropTableIfExists('environment_runs');
  await knex.schema.dropTableIfExists('module_runs');
  await knex.schema.dropTableIfExists('environment_module_variables');
  await knex.schema.dropTableIfExists('environment_module_state');
  await knex.schema.dropTableIfExists('environments');
  await knex.schema.dropTableIfExists('project_module_dependencies');
  await knex.schema.dropTableIfExists('project_modules');
  await knex.schema.dropTableIfExists('projects');

  // Note: running down() on this migration leaves the DB without environment/module tables.
  // The original tables from migrations 005 and 006 are NOT recreated.
  // Re-run all migrations from scratch if you need the old schema.
}
