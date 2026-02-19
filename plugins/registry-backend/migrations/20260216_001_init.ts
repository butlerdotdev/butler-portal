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
  // ── artifacts ──────────────────────────────────────────────────────
  await knex.schema.createTable('artifacts', table => {
    table.uuid('id').primary(); // UUID generated client-side
    table.string('namespace', 64).notNullable();
    table.string('name', 64).notNullable();
    table.string('provider', 64).nullable(); // terraform provider, NULL for non-terraform
    table.string('type', 32).notNullable(); // terraform-module, helm-chart, opa-bundle, oci-artifact
    table.text('description').nullable();
    table.text('readme').nullable();
    table.string('team', 128).nullable();
    table.string('status', 32).notNullable().defaultTo('active');
    table.json('storage_config').notNullable();
    table.json('approval_policy').nullable();
    table.jsonb('source_config').nullable();
    table.jsonb('tags').defaultTo('[]');
    table.string('category', 128).nullable();
    table.bigInteger('download_count').notNullable().defaultTo(0);
    table.string('created_by', 256).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    // NOTE: uniqueness enforced via partial indexes in 002_indexes migration.
    // An inline UNIQUE(namespace, name, provider) fails because PostgreSQL
    // treats NULL != NULL, allowing duplicate helm-chart entries.
  });

  // ── artifact_versions ──────────────────────────────────────────────
  await knex.schema.createTable('artifact_versions', table => {
    table.uuid('id').primary();
    table
      .uuid('artifact_id')
      .notNullable()
      .references('id')
      .inTable('artifacts')
      .onDelete('RESTRICT');
    table.string('version', 128).notNullable();
    table.integer('version_major').notNullable();
    table.integer('version_minor').notNullable();
    table.integer('version_patch').notNullable();
    table.string('version_pre', 128).nullable();
    table.string('approval_status', 32).notNullable().defaultTo('pending');
    table.string('approved_by', 256).nullable();
    table.timestamp('approved_at', { useTz: true }).nullable();
    table.string('rejected_by', 256).nullable();
    table.timestamp('rejected_at', { useTz: true }).nullable();
    table.text('approval_comment').nullable();
    table.boolean('is_latest').notNullable().defaultTo(false);
    table.boolean('is_bad').notNullable().defaultTo(false);
    table.string('digest', 256).nullable();
    table.string('published_by', 256).nullable();
    table.text('changelog').nullable();
    table.json('terraform_metadata').nullable();
    table.json('helm_metadata').nullable();
    table.json('opa_metadata').nullable();
    table.json('storage_ref').nullable();
    table.bigInteger('size_bytes').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['artifact_id', 'version']);
  });

  // ── api_tokens ─────────────────────────────────────────────────────
  await knex.schema.createTable('api_tokens', table => {
    table.uuid('id').primary();
    table.string('name', 256).notNullable();
    table.string('token_hash', 256).notNullable();
    table.string('token_prefix', 16).notNullable();
    table.json('scopes').notNullable();
    table.string('namespace', 64).nullable();
    table.string('team', 128).nullable();
    table.string('created_by', 256).notNullable();
    table.timestamp('expires_at', { useTz: true }).nullable();
    table.timestamp('revoked_at', { useTz: true }).nullable();
    table.timestamp('last_used_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // ── download_logs ──────────────────────────────────────────────────
  await knex.schema.createTable('download_logs', table => {
    table.uuid('id').primary();
    table
      .uuid('artifact_id')
      .notNullable()
      .references('id')
      .inTable('artifacts')
      .onDelete('CASCADE');
    table
      .uuid('version_id')
      .nullable()
      .references('id')
      .inTable('artifact_versions')
      .onDelete('SET NULL');
    table.string('version', 128).notNullable();
    table.string('consumer_type', 32).nullable();
    table
      .uuid('token_id')
      .nullable()
      .references('id')
      .inTable('api_tokens')
      .onDelete('SET NULL');
    table.string('ip_address', 64).nullable();
    table.string('user_agent', 512).nullable();
    table.timestamp('downloaded_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // ── audit_logs ─────────────────────────────────────────────────────
  await knex.schema.createTable('audit_logs', table => {
    table.uuid('id').primary();
    table.string('actor', 256).notNullable();
    table.string('action', 64).notNullable();
    table.string('resource_type', 64).notNullable();
    table.uuid('resource_id').nullable();
    table.string('resource_name', 256).nullable();
    table.string('resource_namespace', 64).nullable();
    table.string('version', 128).nullable();
    table.json('details').nullable();
    table.timestamp('occurred_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // ── ci_results ─────────────────────────────────────────────────────
  await knex.schema.createTable('ci_results', table => {
    table.uuid('id').primary();
    table
      .uuid('version_id')
      .notNullable()
      .references('id')
      .inTable('artifact_versions')
      .onDelete('CASCADE');
    table.string('result_type', 32).notNullable();
    table.string('scanner', 128).nullable();
    table.string('grade', 8).nullable();
    table.json('summary').notNullable();
    table.json('details').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['version_id', 'result_type', 'scanner']);
  });
}

export async function down(knex: Knex): Promise<void> {
  // Drop in reverse dependency order
  await knex.schema.dropTableIfExists('ci_results');
  await knex.schema.dropTableIfExists('audit_logs');
  await knex.schema.dropTableIfExists('download_logs');
  await knex.schema.dropTableIfExists('api_tokens');
  await knex.schema.dropTableIfExists('artifact_versions');
  await knex.schema.dropTableIfExists('artifacts');
}
