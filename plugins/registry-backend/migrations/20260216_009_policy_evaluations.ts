// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── policy_evaluations ────────────────────────────────────────────
  // Records every policy evaluation (approval, download, publish).
  // Feeds the governance dashboard and provides audit trail.
  await knex.schema.createTable('policy_evaluations', table => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table
      .uuid('artifact_id')
      .nullable()
      .references('id')
      .inTable('artifacts')
      .onDelete('SET NULL');
    table
      .uuid('version_id')
      .nullable()
      .references('id')
      .inTable('artifact_versions')
      .onDelete('SET NULL');
    table.string('trigger', 32).notNullable(); // approval | download | publish
    table.string('enforcement_level', 16).notNullable(); // block | warn | audit
    table.json('rules_evaluated').notNullable(); // [{rule, result: pass|fail|skip, message}]
    table.string('outcome', 16).notNullable(); // pass | fail | warn
    table.string('overridden_by', 256).nullable(); // actor who overrode a warn-level failure
    table.string('actor', 256).nullable();
    table
      .timestamp('evaluated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  // ── indexes ────────────────────────────────────────────────────────
  // Retention sweep: delete evaluations older than configured period
  await knex.raw(
    'CREATE INDEX idx_policy_evaluations_evaluated_at ON policy_evaluations(evaluated_at DESC)',
  );
  await knex.raw(
    'CREATE INDEX idx_policy_evaluations_artifact ON policy_evaluations(artifact_id)',
  );
  await knex.raw(
    'CREATE INDEX idx_policy_evaluations_version ON policy_evaluations(version_id)',
  );
  await knex.raw(
    'CREATE INDEX idx_policy_evaluations_outcome ON policy_evaluations(outcome)',
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_policy_evaluations_outcome');
  await knex.raw('DROP INDEX IF EXISTS idx_policy_evaluations_version');
  await knex.raw('DROP INDEX IF EXISTS idx_policy_evaluations_artifact');
  await knex.raw('DROP INDEX IF EXISTS idx_policy_evaluations_evaluated_at');
  await knex.schema.dropTableIfExists('policy_evaluations');
}
