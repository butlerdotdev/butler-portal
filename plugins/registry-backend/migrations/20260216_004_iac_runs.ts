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
  // ── iac_runs ──────────────────────────────────────────────────────
  await knex.schema.createTable('iac_runs', table => {
    table.uuid('id').primary();
    table
      .uuid('artifact_id')
      .notNullable()
      .references('id')
      .inTable('artifacts')
      .onDelete('RESTRICT');
    table
      .uuid('version_id')
      .nullable()
      .references('id')
      .inTable('artifact_versions')
      .onDelete('SET NULL');
    table.string('artifact_namespace', 64).notNullable();
    table.string('artifact_name', 64).notNullable();
    table.string('version', 128).nullable();
    table.string('operation', 32).notNullable(); // plan, apply, validate, test, destroy
    table.string('mode', 16).notNullable(); // byoc, peaas
    table.string('status', 32).notNullable().defaultTo('pending'); // pending → queued → running → succeeded | failed | cancelled | timed_out | expired
    table.string('triggered_by', 256).nullable();
    table.string('team', 128).nullable();
    table.string('ci_provider', 32).nullable(); // github-actions, gitlab-ci
    table.text('pipeline_config').nullable();
    table.string('callback_token_hash', 256).nullable(); // SHA256 of run-scoped callback token
    table.string('k8s_job_name', 256).nullable();
    table.string('k8s_namespace', 128).nullable();
    table.string('tf_version', 32).nullable();
    table.text('variables').nullable(); // JSON, stores secret references not plaintext
    table.text('env_vars').nullable(); // JSON, stores secret references not plaintext
    table.string('working_directory', 512).nullable();
    table.integer('exit_code').nullable();
    table.integer('resources_to_add').nullable();
    table.integer('resources_to_change').nullable();
    table.integer('resources_to_destroy').nullable();
    table.timestamp('queued_at', { useTz: true }).nullable();
    table.timestamp('started_at', { useTz: true }).nullable();
    table.timestamp('completed_at', { useTz: true }).nullable();
    table.integer('duration_seconds').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // ── iac_run_outputs ───────────────────────────────────────────────
  await knex.schema.createTable('iac_run_outputs', table => {
    table.uuid('id').primary();
    table
      .uuid('run_id')
      .notNullable()
      .references('id')
      .inTable('iac_runs')
      .onDelete('CASCADE');
    table.string('output_type', 32).notNullable(); // plan_json, plan_text, apply_output, test_results, error_output
    table.text('content').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['run_id', 'output_type']);
  });

  // ── iac_run_logs ──────────────────────────────────────────────────
  await knex.schema.createTable('iac_run_logs', table => {
    table.uuid('id').primary();
    table
      .uuid('run_id')
      .notNullable()
      .references('id')
      .inTable('iac_runs')
      .onDelete('CASCADE');
    table.integer('sequence').notNullable();
    table.string('stream', 8).notNullable().defaultTo('stdout'); // stdout, stderr
    table.text('content').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // ── indexes ───────────────────────────────────────────────────────
  await knex.raw(`
    CREATE INDEX idx_runs_artifact ON iac_runs(artifact_id)
  `);
  await knex.raw(`
    CREATE INDEX idx_runs_version ON iac_runs(version_id)
  `);
  await knex.raw(`
    CREATE INDEX idx_runs_status ON iac_runs(status)
  `);
  await knex.raw(`
    CREATE INDEX idx_runs_created ON iac_runs(created_at DESC)
  `);
  await knex.raw(`
    CREATE INDEX idx_run_outputs_run ON iac_run_outputs(run_id)
  `);
  await knex.raw(`
    CREATE INDEX idx_run_logs_run_seq ON iac_run_logs(run_id, sequence)
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Drop indexes first
  await knex.raw('DROP INDEX IF EXISTS idx_run_logs_run_seq');
  await knex.raw('DROP INDEX IF EXISTS idx_run_outputs_run');
  await knex.raw('DROP INDEX IF EXISTS idx_runs_created');
  await knex.raw('DROP INDEX IF EXISTS idx_runs_status');
  await knex.raw('DROP INDEX IF EXISTS idx_runs_version');
  await knex.raw('DROP INDEX IF EXISTS idx_runs_artifact');

  // Drop tables in reverse dependency order
  await knex.schema.dropTableIfExists('iac_run_logs');
  await knex.schema.dropTableIfExists('iac_run_outputs');
  await knex.schema.dropTableIfExists('iac_runs');
}
