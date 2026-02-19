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
  // Partial unique indexes to handle NULL provider correctly.
  // PostgreSQL treats NULL != NULL so a single UNIQUE(namespace, name, provider)
  // would allow duplicate non-terraform artifacts with the same namespace+name.
  await knex.raw(`
    CREATE UNIQUE INDEX idx_artifacts_unique_with_provider
      ON artifacts(namespace, name, provider) WHERE provider IS NOT NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX idx_artifacts_unique_without_provider
      ON artifacts(namespace, name) WHERE provider IS NULL
  `);

  // Protocol lookups (terraform: namespace/name/provider)
  await knex.raw(`
    CREATE INDEX idx_artifacts_protocol
      ON artifacts(namespace, name, provider) WHERE status = 'active'
  `);

  // Version filtering
  await knex.raw(`
    CREATE INDEX idx_versions_artifact_status
      ON artifact_versions(artifact_id, approval_status)
  `);
  await knex.raw(`
    CREATE INDEX idx_versions_artifact_latest
      ON artifact_versions(artifact_id, is_latest) WHERE is_latest = TRUE
  `);
  await knex.raw(`
    CREATE INDEX idx_versions_semver
      ON artifact_versions(artifact_id, version_major DESC, version_minor DESC, version_patch DESC)
  `);

  // Download analytics
  await knex.raw(`
    CREATE INDEX idx_downloads_version_date
      ON download_logs(version_id, downloaded_at)
  `);
  await knex.raw(`
    CREATE INDEX idx_downloads_artifact_date
      ON download_logs(artifact_id, downloaded_at)
  `);

  // Audit log time-range queries
  await knex.raw(`
    CREATE INDEX idx_audit_occurred ON audit_logs(occurred_at DESC)
  `);
  await knex.raw(`
    CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id)
  `);

  // Token lookup by hash (fast auth check)
  await knex.raw(`
    CREATE INDEX idx_tokens_hash ON api_tokens(token_hash)
  `);
  await knex.raw(`
    CREATE INDEX idx_tokens_prefix ON api_tokens(token_prefix)
  `);

  // Artifact listing with filters
  await knex.raw(`
    CREATE INDEX idx_artifacts_type_status ON artifacts(type, status)
  `);
  await knex.raw(`
    CREATE INDEX idx_artifacts_team ON artifacts(team)
  `);

  // CI results by version
  await knex.raw(`
    CREATE INDEX idx_ci_results_version ON ci_results(version_id)
  `);

  // GIN indexes only available on PostgreSQL. Skip for SQLite dev.
  const client = knex.client.config.client;
  const isPg = client === 'pg' || client === 'postgresql';
  if (isPg) {
    // Ensure columns are jsonb (may be json from earlier migration)
    await knex.raw(`ALTER TABLE artifacts ALTER COLUMN source_config TYPE jsonb USING source_config::jsonb`);
    await knex.raw(`ALTER TABLE artifacts ALTER COLUMN tags TYPE jsonb USING tags::jsonb`);

    // Webhook-to-artifact lookup via source_config JSONB
    await knex.raw(`
      CREATE INDEX idx_artifacts_source_repo
        ON artifacts USING GIN (source_config jsonb_path_ops)
    `);

    // Tag search via JSONB containment (@>)
    await knex.raw(`
      CREATE INDEX idx_artifacts_tags
        ON artifacts USING GIN (tags)
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_artifacts_tags');
  await knex.raw('DROP INDEX IF EXISTS idx_artifacts_source_repo');
  await knex.raw('DROP INDEX IF EXISTS idx_ci_results_version');
  await knex.raw('DROP INDEX IF EXISTS idx_artifacts_team');
  await knex.raw('DROP INDEX IF EXISTS idx_artifacts_type_status');
  await knex.raw('DROP INDEX IF EXISTS idx_tokens_prefix');
  await knex.raw('DROP INDEX IF EXISTS idx_tokens_hash');
  await knex.raw('DROP INDEX IF EXISTS idx_audit_resource');
  await knex.raw('DROP INDEX IF EXISTS idx_audit_occurred');
  await knex.raw('DROP INDEX IF EXISTS idx_downloads_artifact_date');
  await knex.raw('DROP INDEX IF EXISTS idx_downloads_version_date');
  await knex.raw('DROP INDEX IF EXISTS idx_versions_semver');
  await knex.raw('DROP INDEX IF EXISTS idx_versions_artifact_latest');
  await knex.raw('DROP INDEX IF EXISTS idx_versions_artifact_status');
  await knex.raw('DROP INDEX IF EXISTS idx_artifacts_protocol');
  await knex.raw('DROP INDEX IF EXISTS idx_artifacts_unique_without_provider');
  await knex.raw('DROP INDEX IF EXISTS idx_artifacts_unique_with_provider');
}
