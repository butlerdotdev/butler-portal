// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── cloud_integrations ──────────────────────────────────────────────
  // Reusable cloud provider credential configurations.
  // Butler stores metadata (role ARNs, CI secret names), NOT actual credential values.
  await knex.schema.createTable('cloud_integrations', table => {
    table.uuid('id').primary(); // UUID generated client-side with uuidv4()
    table.string('name', 128).notNullable();
    table.text('description').nullable();
    table.string('team', 128).nullable(); // NULL = platform-wide

    table.string('provider', 32).notNullable(); // aws, gcp, azure, custom
    table.string('auth_method', 32).notNullable(); // oidc, static, assume_role

    // Provider-specific configuration (metadata only — no secrets)
    // AWS OIDC:  { roleArn, region, sessionName?, sessionDuration?, audience? }
    // AWS static: { ciSecrets: { accessKeyId, secretAccessKey }, region }
    // GCP OIDC:  { workloadIdentityProvider, serviceAccount, projectId? }
    // GCP static: { ciSecrets: { credentialsJson }, projectId? }
    // Azure OIDC: { clientId, tenantId, subscriptionId? }
    // Azure static: { ciSecrets: { clientId, clientSecret, tenantId } }
    // Custom: { envVars: { VAR_NAME: { source, value } } }
    table.json('credential_config').notNullable();

    // CI provider compatibility (which pipeline generators can use this integration)
    table.json('supported_ci_providers').nullable(); // ["github-actions", "gitlab-ci"] or NULL = all

    // Health/validation
    table.string('status', 32).notNullable().defaultTo('active'); // active, disabled, error
    table.timestamp('last_validated_at', { useTz: true }).nullable();
    table.text('validation_error').nullable();

    table.string('created_by', 256).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['team', 'name']);
  });

  // ── variable_sets ───────────────────────────────────────────────────
  // Reusable collections of variables (like TF Cloud Variable Sets or Spacelift Contexts)
  await knex.schema.createTable('variable_sets', table => {
    table.uuid('id').primary(); // UUID generated client-side
    table.string('name', 128).notNullable();
    table.text('description').nullable();
    table.string('team', 128).nullable(); // NULL = platform-wide

    // Scope
    table.boolean('auto_attach').notNullable().defaultTo(false); // if true, auto-binds to all envs in team
    table.string('status', 32).notNullable().defaultTo('active'); // active, archived

    table.string('created_by', 256).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['team', 'name']);
  });

  // ── variable_set_entries ────────────────────────────────────────────
  // Individual variables within a variable set
  await knex.schema.createTable('variable_set_entries', table => {
    table.uuid('id').primary(); // UUID generated client-side
    table
      .uuid('variable_set_id')
      .notNullable()
      .references('id')
      .inTable('variable_sets')
      .onDelete('CASCADE');
    table.string('key', 256).notNullable();
    table.text('value').nullable(); // plaintext for non-sensitive; NULL for sensitive
    table.boolean('sensitive').notNullable().defaultTo(false);
    table.boolean('hcl').notNullable().defaultTo(false);
    table.string('category', 16).notNullable().defaultTo('terraform'); // terraform or env
    table.text('description').nullable();
    // For sensitive vars: reference to CI-native secret
    table.string('ci_secret_name', 256).nullable(); // GitHub secret name or GitLab CI variable name
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['variable_set_id', 'key', 'category']);
  });

  // ── environment_cloud_integrations ──────────────────────────────────
  // Binds cloud integrations to environments.
  // All modules in the environment inherit unless overridden at module level.
  await knex.schema.createTable('environment_cloud_integrations', table => {
    table.uuid('id').primary(); // UUID generated client-side
    table
      .uuid('environment_id')
      .notNullable()
      .references('id')
      .inTable('environments')
      .onDelete('CASCADE');
    table
      .uuid('cloud_integration_id')
      .notNullable()
      .references('id')
      .inTable('cloud_integrations')
      .onDelete('CASCADE');
    table.integer('priority').notNullable().defaultTo(0); // higher = applied later (overrides lower)
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['environment_id', 'cloud_integration_id']);
  });

  // ── module_cloud_integrations ───────────────────────────────────────
  // Binds cloud integrations to specific modules (overrides env-level)
  await knex.schema.createTable('module_cloud_integrations', table => {
    table.uuid('id').primary(); // UUID generated client-side
    table
      .uuid('module_id')
      .notNullable()
      .references('id')
      .inTable('environment_modules')
      .onDelete('CASCADE');
    table
      .uuid('cloud_integration_id')
      .notNullable()
      .references('id')
      .inTable('cloud_integrations')
      .onDelete('CASCADE');
    table.integer('priority').notNullable().defaultTo(0);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['module_id', 'cloud_integration_id']);
  });

  // ── environment_variable_sets ───────────────────────────────────────
  // Binds variable sets to environments
  await knex.schema.createTable('environment_variable_sets', table => {
    table.uuid('id').primary(); // UUID generated client-side
    table
      .uuid('environment_id')
      .notNullable()
      .references('id')
      .inTable('environments')
      .onDelete('CASCADE');
    table
      .uuid('variable_set_id')
      .notNullable()
      .references('id')
      .inTable('variable_sets')
      .onDelete('CASCADE');
    table.integer('priority').notNullable().defaultTo(0); // higher = applied later (overrides lower)
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['environment_id', 'variable_set_id']);
  });

  // ── module_variable_sets ────────────────────────────────────────────
  // Binds variable sets to specific modules (overrides env-level)
  await knex.schema.createTable('module_variable_sets', table => {
    table.uuid('id').primary(); // UUID generated client-side
    table
      .uuid('module_id')
      .notNullable()
      .references('id')
      .inTable('environment_modules')
      .onDelete('CASCADE');
    table
      .uuid('variable_set_id')
      .notNullable()
      .references('id')
      .inTable('variable_sets')
      .onDelete('CASCADE');
    table.integer('priority').notNullable().defaultTo(0);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['module_id', 'variable_set_id']);
  });

  // ── indexes ─────────────────────────────────────────────────────────
  await knex.raw('CREATE INDEX idx_cloud_integrations_team ON cloud_integrations(team)');
  await knex.raw('CREATE INDEX idx_cloud_integrations_provider ON cloud_integrations(provider)');
  await knex.raw('CREATE INDEX idx_variable_sets_team ON variable_sets(team)');
  await knex.raw('CREATE INDEX idx_vs_entries_set ON variable_set_entries(variable_set_id)');
  await knex.raw('CREATE INDEX idx_env_cloud_int_env ON environment_cloud_integrations(environment_id)');
  await knex.raw('CREATE INDEX idx_env_cloud_int_ci ON environment_cloud_integrations(cloud_integration_id)');
  await knex.raw('CREATE INDEX idx_mod_cloud_int_mod ON module_cloud_integrations(module_id)');
  await knex.raw('CREATE INDEX idx_env_vs_env ON environment_variable_sets(environment_id)');
  await knex.raw('CREATE INDEX idx_env_vs_vs ON environment_variable_sets(variable_set_id)');
  await knex.raw('CREATE INDEX idx_mod_vs_mod ON module_variable_sets(module_id)');
}

export async function down(knex: Knex): Promise<void> {
  // Drop indexes first
  await knex.raw('DROP INDEX IF EXISTS idx_mod_vs_mod');
  await knex.raw('DROP INDEX IF EXISTS idx_env_vs_vs');
  await knex.raw('DROP INDEX IF EXISTS idx_env_vs_env');
  await knex.raw('DROP INDEX IF EXISTS idx_mod_cloud_int_mod');
  await knex.raw('DROP INDEX IF EXISTS idx_env_cloud_int_ci');
  await knex.raw('DROP INDEX IF EXISTS idx_env_cloud_int_env');
  await knex.raw('DROP INDEX IF EXISTS idx_vs_entries_set');
  await knex.raw('DROP INDEX IF EXISTS idx_variable_sets_team');
  await knex.raw('DROP INDEX IF EXISTS idx_cloud_integrations_provider');
  await knex.raw('DROP INDEX IF EXISTS idx_cloud_integrations_team');

  // Drop tables in reverse dependency order
  await knex.schema.dropTableIfExists('module_variable_sets');
  await knex.schema.dropTableIfExists('environment_variable_sets');
  await knex.schema.dropTableIfExists('module_cloud_integrations');
  await knex.schema.dropTableIfExists('environment_cloud_integrations');
  await knex.schema.dropTableIfExists('variable_set_entries');
  await knex.schema.dropTableIfExists('variable_sets');
  await knex.schema.dropTableIfExists('cloud_integrations');
}
