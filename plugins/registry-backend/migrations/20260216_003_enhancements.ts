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
  // Add yank_reason to artifact_versions
  await knex.schema.alterTable('artifact_versions', table => {
    table.text('yank_reason').nullable();
  });

  // Add examples JSON to artifact_versions (parsed from /examples dir)
  await knex.schema.alterTable('artifact_versions', table => {
    table.json('examples').nullable();
  });

  // Add dependencies JSON to artifact_versions (external module refs)
  await knex.schema.alterTable('artifact_versions', table => {
    table.json('dependencies').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('artifact_versions', table => {
    table.dropColumn('yank_reason');
    table.dropColumn('examples');
    table.dropColumn('dependencies');
  });
}
