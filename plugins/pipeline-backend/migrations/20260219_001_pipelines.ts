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
  // ── pipelines ─────────────────────────────────────────────────────
  await knex.schema.createTable('pipelines', table => {
    table.uuid('id').primary();
    table.string('name', 256).notNullable();
    table.text('description').nullable();
    table.string('team', 128).notNullable();
    table.string('status', 32).notNullable().defaultTo('active');
    table.string('created_by', 256).notNullable();
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  await knex.schema.raw(
    'CREATE UNIQUE INDEX idx_pipelines_name_team ON pipelines(name, team)',
  );

  // ── pipeline_versions ─────────────────────────────────────────────
  await knex.schema.createTable('pipeline_versions', table => {
    table.uuid('id').primary();
    table
      .uuid('pipeline_id')
      .notNullable()
      .references('id')
      .inTable('pipelines')
      .onDelete('CASCADE');
    table.integer('version').notNullable();
    table.jsonb('dag').notNullable();
    table.text('vector_config').notNullable();
    table.string('config_hash', 128).notNullable();
    table.jsonb('metadata').nullable();
    table.text('change_summary').nullable();
    table.string('created_by', 256).notNullable();
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.unique(['pipeline_id', 'version']);
  });

  await knex.schema.raw(
    'CREATE INDEX idx_versions_pipeline ON pipeline_versions(pipeline_id, version DESC)',
  );

  // ── pipeline_audit_log ────────────────────────────────────────────
  await knex.schema.createTable('pipeline_audit_log', table => {
    table.uuid('id').primary();
    table.string('team', 128).notNullable();
    table.string('action', 64).notNullable();
    table.string('entity_type', 32).notNullable();
    table.uuid('entity_id').nullable();
    table.string('actor', 256).notNullable();
    table.jsonb('details').nullable();
    table
      .timestamp('occurred_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  await knex.schema.raw(
    'CREATE INDEX idx_audit_team_time ON pipeline_audit_log(team, occurred_at DESC)',
  );
  await knex.schema.raw(
    'CREATE INDEX idx_audit_entity ON pipeline_audit_log(entity_type, entity_id)',
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('pipeline_audit_log');
  await knex.schema.dropTableIfExists('pipeline_versions');
  await knex.schema.dropTableIfExists('pipelines');
}
