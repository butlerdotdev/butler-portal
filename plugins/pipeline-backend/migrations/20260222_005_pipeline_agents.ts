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
  // Many-to-many: a pipeline can have N aggregator agents (HA).
  await knex.schema.createTable('pipeline_agents', table => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table
      .uuid('pipeline_id')
      .notNullable()
      .references('id')
      .inTable('pipelines')
      .onDelete('CASCADE');
    table
      .uuid('agent_id')
      .notNullable()
      .references('id')
      .inTable('fleet_agents')
      .onDelete('CASCADE');
    table.timestamp('joined_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['pipeline_id', 'agent_id']);
    table.index('pipeline_id');
    table.index('agent_id');
  });

  // Migrate existing source_agent_id data into the join table.
  const rows = await knex('pipelines')
    .whereNotNull('source_agent_id')
    .select('id', 'source_agent_id');

  for (const row of rows) {
    await knex('pipeline_agents').insert({
      id: knex.fn.uuid(),
      pipeline_id: row.id,
      agent_id: row.source_agent_id,
    });
  }

  // Drop the singular FK column.
  await knex.schema.alterTable('pipelines', table => {
    table.dropColumn('source_agent_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  // Re-add the singular column.
  await knex.schema.alterTable('pipelines', table => {
    table
      .uuid('source_agent_id')
      .nullable()
      .references('id')
      .inTable('fleet_agents')
      .onDelete('SET NULL');
  });

  // Migrate back: pick the earliest joined agent per pipeline.
  const rows = await knex('pipeline_agents')
    .select('pipeline_id', 'agent_id')
    .orderBy('joined_at', 'asc');

  const seen = new Set<string>();
  for (const row of rows) {
    if (!seen.has(row.pipeline_id)) {
      seen.add(row.pipeline_id);
      await knex('pipelines')
        .where({ id: row.pipeline_id })
        .update({ source_agent_id: row.agent_id });
    }
  }

  await knex.schema.dropTable('pipeline_agents');
}
