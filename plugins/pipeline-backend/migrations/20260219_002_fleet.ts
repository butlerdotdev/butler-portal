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
  // ── fleet_tokens ──────────────────────────────────────────────────
  await knex.schema.createTable('fleet_tokens', table => {
    table.uuid('id').primary();
    table.string('team', 128).notNullable();
    table.string('name', 256).notNullable();
    table.string('token_prefix', 8).notNullable();
    table.string('token_hash', 128).notNullable().unique();
    table.jsonb('scopes').nullable();
    table.timestamp('expires_at', { useTz: true }).nullable();
    table.string('created_by', 256).notNullable();
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table.timestamp('revoked_at', { useTz: true }).nullable();

    table.unique(['team', 'name']);
  });

  await knex.schema.raw(
    'CREATE INDEX idx_fleet_tokens_hash ON fleet_tokens(token_hash)',
  );

  // ── fleet_groups ──────────────────────────────────────────────────
  await knex.schema.createTable('fleet_groups', table => {
    table.uuid('id').primary();
    table.string('team', 128).notNullable();
    table.string('name', 256).notNullable();
    table.text('description').nullable();
    table.jsonb('label_selector').nullable();
    table.string('created_by', 256).notNullable();
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.unique(['team', 'name']);
  });

  // ── fleet_agents ──────────────────────────────────────────────────
  await knex.schema.createTable('fleet_agents', table => {
    table.uuid('id').primary();
    table.string('team', 128).notNullable();
    table.string('agent_id', 256).notNullable();
    table.string('hostname', 256).nullable();
    table.string('ip_address', 64).nullable();
    table.jsonb('labels').notNullable().defaultTo('{}');
    table.string('vector_version', 64).nullable();
    table.string('vector_config_path', 512).nullable();
    table.text('vector_config_content').nullable();
    table.string('os', 64).nullable();
    table.string('arch', 64).nullable();
    table.string('status', 32).notNullable().defaultTo('pending');
    table.string('current_config_hash', 128).nullable();
    table.jsonb('config_sync_result').nullable();
    table
      .uuid('fleet_token_id')
      .nullable()
      .references('id')
      .inTable('fleet_tokens');
    table.timestamp('last_heartbeat_at', { useTz: true }).nullable();
    table.jsonb('errors').notNullable().defaultTo('[]');
    table
      .timestamp('registered_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.unique(['team', 'agent_id']);
  });

  await knex.schema.raw(
    'CREATE INDEX idx_fleet_agents_team ON fleet_agents(team)',
  );
  await knex.schema.raw(
    'CREATE INDEX idx_fleet_agents_status ON fleet_agents(status)',
  );

  // ── pipeline_deployments ──────────────────────────────────────────
  await knex.schema.createTable('pipeline_deployments', table => {
    table.uuid('id').primary();
    table
      .uuid('pipeline_id')
      .notNullable()
      .references('id')
      .inTable('pipelines')
      .onDelete('CASCADE');
    table
      .uuid('pipeline_version_id')
      .notNullable()
      .references('id')
      .inTable('pipeline_versions')
      .onDelete('CASCADE');
    table.string('target_type', 32).notNullable();
    table.uuid('target_id').notNullable();
    table.string('type', 32).notNullable().defaultTo('deploy');
    table.string('strategy', 32).notNullable().defaultTo('immediate');
    table.string('status', 32).notNullable().defaultTo('active');
    table.string('deployed_by', 256).notNullable();
    table
      .timestamp('deployed_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table.timestamp('superseded_at', { useTz: true }).nullable();
  });

  await knex.schema.raw(
    'CREATE INDEX idx_deployments_pipeline ON pipeline_deployments(pipeline_id)',
  );
  await knex.schema.raw(
    'CREATE INDEX idx_deployments_target ON pipeline_deployments(target_type, target_id)',
  );
  await knex.schema.raw(
    'CREATE INDEX idx_deployments_status ON pipeline_deployments(status)',
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('pipeline_deployments');
  await knex.schema.dropTableIfExists('fleet_agents');
  await knex.schema.dropTableIfExists('fleet_groups');
  await knex.schema.dropTableIfExists('fleet_tokens');
}
