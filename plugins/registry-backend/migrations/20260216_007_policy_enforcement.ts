// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── version_approvals ──────────────────────────────────────────────
  // Tracks individual approvals for multi-approver workflows.
  // Replaces the JSONB-on-version approach with a proper join table.
  await knex.schema.createTable('version_approvals', table => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table
      .uuid('version_id')
      .notNullable()
      .references('id')
      .inTable('artifact_versions')
      .onDelete('CASCADE');
    table.string('actor', 256).notNullable();
    table.text('comment').nullable();
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.unique(['version_id', 'actor']); // one approval per person per version
  });

  // ── indexes ────────────────────────────────────────────────────────
  await knex.raw(
    'CREATE INDEX idx_version_approvals_version ON version_approvals(version_id)',
  );
  await knex.raw(
    'CREATE INDEX idx_version_approvals_actor ON version_approvals(actor)',
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_version_approvals_actor');
  await knex.raw('DROP INDEX IF EXISTS idx_version_approvals_version');
  await knex.schema.dropTableIfExists('version_approvals');
}
