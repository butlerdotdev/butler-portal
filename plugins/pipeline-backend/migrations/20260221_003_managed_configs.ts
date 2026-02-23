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
  await knex.schema.createTable('managed_configs', table => {
    table.uuid('id').primary();
    table.string('team', 128).notNullable();
    table.string('scope_type', 32).notNullable(); // 'agent' | 'group'
    table.uuid('scope_id').notNullable();
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

    table.unique(['scope_type', 'scope_id', 'version']);
  });

  await knex.schema.raw(
    'CREATE INDEX idx_managed_configs_scope ON managed_configs(scope_type, scope_id, version DESC)',
  );
  await knex.schema.raw(
    'CREATE INDEX idx_managed_configs_team ON managed_configs(team)',
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('managed_configs');
}
