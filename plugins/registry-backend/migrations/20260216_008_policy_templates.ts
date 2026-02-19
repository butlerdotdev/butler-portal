// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── policy_templates ──────────────────────────────────────────────
  // Reusable policy definitions that can be bound to scopes.
  // Rules are stored as JSONB matching the ApprovalPolicy shape.
  await knex.schema.createTable('policy_templates', table => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.string('name', 128).notNullable();
    table.text('description').nullable();
    table
      .string('enforcement_level', 16)
      .notNullable()
      .defaultTo('block'); // block | warn | audit
    table.json('rules').notNullable(); // ApprovalPolicy fields as JSON
    table.string('team', 128).nullable(); // NULL = platform-wide template
    table.string('created_by', 256).nullable();
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.unique(['name', 'team']); // unique name per team (or globally if team is null)
  });

  // ── policy_bindings ───────────────────────────────────────────────
  // Binds a policy template to a scope (global, team, namespace, artifact).
  await knex.schema.createTable('policy_bindings', table => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table
      .uuid('policy_template_id')
      .notNullable()
      .references('id')
      .inTable('policy_templates')
      .onDelete('CASCADE');
    table.string('scope_type', 32).notNullable(); // global | team | namespace | artifact
    table.string('scope_value', 256).nullable(); // team name, namespace, artifact_id; null for global
    table.string('created_by', 256).nullable();
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.unique(['policy_template_id', 'scope_type', 'scope_value']);
  });

  // ── indexes ────────────────────────────────────────────────────────
  await knex.raw(
    'CREATE INDEX idx_policy_templates_team ON policy_templates(team)',
  );
  await knex.raw(
    'CREATE INDEX idx_policy_bindings_scope ON policy_bindings(scope_type, scope_value)',
  );
  await knex.raw(
    'CREATE INDEX idx_policy_bindings_template ON policy_bindings(policy_template_id)',
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_policy_bindings_template');
  await knex.raw('DROP INDEX IF EXISTS idx_policy_bindings_scope');
  await knex.raw('DROP INDEX IF EXISTS idx_policy_templates_team');
  // Drop bindings first (FK dependency on templates)
  await knex.schema.dropTableIfExists('policy_bindings');
  await knex.schema.dropTableIfExists('policy_templates');
}
