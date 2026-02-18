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

import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import {
  ArtifactRow,
  VersionRow,
  TokenRow,
  AuditLogRow,
  CiResultRow,
  ArtifactType,
  ArtifactStatus,
  StorageConfig,
  ApprovalPolicy,
  SourceConfig,
  ExampleConfig,
  DependencyRef,
  ConsumerInfo,
  ListOptions,
  PaginatedResult,
  TokenScope,
  FacetsResult,
  RunRow,
  RunOutputRow,
  RunLogRow,
  RunOperation,
  RunMode,
  RunStatus,
  EnvironmentRow,
  EnvironmentModuleRow,
  ModuleDependencyRow,
  EnvironmentModuleVariableRow,
  ModuleRunRow,
  EnvironmentRunRow,
  ModuleRunOutputRow,
  ModuleRunLogRow,
  TerraformStateRow,
  OutputMappingEntry,
  StateBackendConfig,
  VcsTrigger,
  CloudIntegrationRow,
  VariableSetRow,
  VariableSetEntryRow,
  CloudIntegrationBindingRow,
  VariableSetBindingRow,
  PolicyTemplateRow,
  PolicyBindingRow,
  PolicyEvaluationRow,
  PolicyScopeType,
  PolicyRuleResult,
  PolicyEvaluationTrigger,
  PolicyEvaluationOutcome,
  EnforcementLevel,
} from './types';
import { decodeCursor, encodeCursor } from '../util/pagination';
import { conflict } from '../util/errors';

export class RegistryDatabase {
  constructor(private readonly knex: Knex) {}

  // ── Artifacts ────────────────────────────────────────────────────────

  async listArtifacts(options: ListOptions): Promise<PaginatedResult<ArtifactRow>> {
    let query = this.knex<ArtifactRow>('artifacts');

    if (options.type) {
      query = query.where('type', options.type);
    }
    if (options.status) {
      query = query.where('status', options.status);
    } else {
      // Default: exclude archived unless explicitly requested
      query = query.where('status', '!=', 'archived');
    }
    if (options.team) {
      query = query.where(function () {
        this.where('team', options.team!).orWhereNull('team');
      });
    }
    if (options.search) {
      query = query.where(function () {
        this.where('name', 'like', `%${options.search}%`)
          .orWhere('description', 'like', `%${options.search}%`);
      });
    }
    if (options.category) {
      query = query.where('category', options.category);
    }
    if (options.tags && options.tags.length > 0) {
      const isPg = this.isPostgres();
      if (isPg) {
        // PostgreSQL: use JSONB containment operator for efficient GIN index scan
        query = query.whereRaw('tags @> ?::jsonb', [JSON.stringify(options.tags)]);
      } else {
        // SQLite: use json_each to check all tags are present
        for (const tag of options.tags) {
          query = query.whereRaw(
            `EXISTS (SELECT 1 FROM json_each(artifacts.tags) WHERE json_each.value = ?)`,
            [tag],
          );
        }
      }
    }

    const countResult = await query.clone().count('* as count').first() as { count: string | number } | undefined;
    const totalCount = Number(countResult?.count ?? 0);

    const sortBy = options.sortBy ?? 'created_at';
    const sortOrder = options.sortOrder ?? 'desc';
    const limit = Math.min(options.limit ?? 50, 200);

    if (options.cursor) {
      const decoded = decodeCursor(options.cursor);
      if (decoded) {
        if (sortOrder === 'desc') {
          query = query.where(function () {
            this.where(sortBy, '<', decoded.value)
              .orWhere(function () {
                this.where(sortBy, decoded.value).where('id', '<', decoded.id);
              });
          });
        } else {
          query = query.where(function () {
            this.where(sortBy, '>', decoded.value)
              .orWhere(function () {
                this.where(sortBy, decoded.value).where('id', '>', decoded.id);
              });
          });
        }
      }
    }

    const rows = await query
      .orderBy(sortBy, sortOrder)
      .orderBy('id', sortOrder)
      .limit(limit + 1)
      .select('*');

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0
      ? encodeCursor(String((items[items.length - 1] as any)[sortBy]), items[items.length - 1].id)
      : null;

    return { items: items.map(r => this.parseArtifactRow(r)), nextCursor, totalCount };
  }

  async getArtifact(namespace: string, name: string): Promise<ArtifactRow | null> {
    const row = await this.knex<ArtifactRow>('artifacts')
      .where({ namespace, name })
      .first();
    return row ? this.parseArtifactRow(row) : null;
  }

  async getArtifactById(id: string): Promise<ArtifactRow | null> {
    const row = await this.knex<ArtifactRow>('artifacts').where({ id }).first();
    return row ? this.parseArtifactRow(row) : null;
  }

  async getArtifactByProtocol(
    namespace: string,
    name: string,
    provider?: string,
  ): Promise<ArtifactRow | null> {
    let query = this.knex<ArtifactRow>('artifacts')
      .where({ namespace, name, status: 'active' });
    if (provider !== undefined) {
      query = query.where('provider', provider);
    } else {
      query = query.whereNull('provider');
    }
    const row = await query.first();
    return row ? this.parseArtifactRow(row) : null;
  }

  async createArtifact(data: {
    namespace: string;
    name: string;
    provider?: string;
    type: ArtifactType;
    description?: string;
    team?: string;
    storage_config: StorageConfig;
    approval_policy?: ApprovalPolicy;
    source_config?: SourceConfig;
    tags?: string[];
    category?: string;
    created_by?: string;
  }): Promise<ArtifactRow> {
    try {
      const [row] = await this.knex('artifacts')
        .insert({
          id: uuidv4(),
          namespace: data.namespace,
          name: data.name,
          provider: data.provider ?? null,
          type: data.type,
          description: data.description ?? null,
          team: data.team ?? null,
          storage_config: JSON.stringify(data.storage_config),
          approval_policy: data.approval_policy ? JSON.stringify(data.approval_policy) : null,
          source_config: data.source_config ? JSON.stringify(data.source_config) : null,
          tags: JSON.stringify(data.tags ?? []),
          category: data.category ?? null,
          created_by: data.created_by ?? null,
        })
        .returning('*');
      return this.parseArtifactRow(row);
    } catch (err: any) {
      if (err?.message?.includes('UNIQUE constraint') || err?.code === '23505') {
        throw conflict(
          'ARTIFACT_ALREADY_EXISTS',
          `Artifact ${data.namespace}/${data.name}${data.provider ? `/${data.provider}` : ''} already exists`,
        );
      }
      throw err;
    }
  }

  async updateArtifact(
    id: string,
    data: Partial<{
      description: string | null;
      readme: string | null;
      status: ArtifactStatus;
      storage_config: StorageConfig;
      approval_policy: ApprovalPolicy | null;
      source_config: SourceConfig | null;
      tags: string[];
      category: string | null;
    }>,
  ): Promise<ArtifactRow | null> {
    const update: Record<string, unknown> = { updated_at: this.knex.fn.now() };
    if (data.description !== undefined) update.description = data.description;
    if (data.readme !== undefined) update.readme = data.readme;
    if (data.status !== undefined) update.status = data.status;
    if (data.storage_config !== undefined) update.storage_config = JSON.stringify(data.storage_config);
    if (data.approval_policy !== undefined) {
      update.approval_policy = data.approval_policy ? JSON.stringify(data.approval_policy) : null;
    }
    if (data.source_config !== undefined) {
      update.source_config = data.source_config ? JSON.stringify(data.source_config) : null;
    }
    if (data.tags !== undefined) update.tags = JSON.stringify(data.tags);
    if (data.category !== undefined) update.category = data.category;

    const [row] = await this.knex('artifacts').where({ id }).update(update).returning('*');
    return row ? this.parseArtifactRow(row) : null;
  }

  async findArtifactsBySourceRepo(repoUrl: string): Promise<ArtifactRow[]> {
    // Normalize URL: strip .git suffix, trailing slashes
    const normalized = repoUrl.replace(/\.git$/, '').replace(/\/+$/, '');
    const rows = await this.knex<ArtifactRow>('artifacts')
      .where('status', 'active')
      .whereNotNull('source_config')
      .whereRaw(
        `REPLACE(REPLACE(source_config->>'repositoryUrl', '.git', ''), '/', '') ILIKE REPLACE(REPLACE(?, '.git', ''), '/', '')`,
        [normalized],
      );
    return rows.map(r => this.parseArtifactRow(r));
  }

  async incrementDownloadCount(artifactId: string): Promise<void> {
    await this.knex('artifacts')
      .where({ id: artifactId })
      .increment('download_count', 1);
  }

  // ── Versions ─────────────────────────────────────────────────────────

  async listVersions(artifactId: string): Promise<VersionRow[]> {
    const rows = await this.knex<VersionRow>('artifact_versions')
      .where({ artifact_id: artifactId })
      .orderBy('version_major', 'desc')
      .orderBy('version_minor', 'desc')
      .orderBy('version_patch', 'desc')
      .select('*');
    return rows.map(r => this.parseVersionRow(r));
  }

  async listApprovedVersions(artifactId: string): Promise<VersionRow[]> {
    const rows = await this.knex<VersionRow>('artifact_versions')
      .where({ artifact_id: artifactId, approval_status: 'approved' })
      .where('is_bad', false)
      .orderBy('version_major', 'desc')
      .orderBy('version_minor', 'desc')
      .orderBy('version_patch', 'desc')
      .select('*');
    return rows.map(r => this.parseVersionRow(r));
  }

  async getVersion(artifactId: string, version: string): Promise<VersionRow | null> {
    const row = await this.knex<VersionRow>('artifact_versions')
      .where({ artifact_id: artifactId, version })
      .first();
    return row ? this.parseVersionRow(row) : null;
  }

  async getVersionById(id: string): Promise<VersionRow | null> {
    const row = await this.knex<VersionRow>('artifact_versions').where({ id }).first();
    return row ? this.parseVersionRow(row) : null;
  }

  async getLatestVersion(artifactId: string): Promise<VersionRow | null> {
    const row = await this.knex<VersionRow>('artifact_versions')
      .where({ artifact_id: artifactId, is_latest: true })
      .first();
    return row ? this.parseVersionRow(row) : null;
  }

  async createVersion(data: {
    artifact_id: string;
    version: string;
    version_major: number;
    version_minor: number;
    version_patch: number;
    version_pre?: string;
    published_by?: string;
    changelog?: string;
    digest?: string;
    terraform_metadata?: Record<string, unknown>;
    helm_metadata?: Record<string, unknown>;
    opa_metadata?: Record<string, unknown>;
    storage_ref?: Record<string, unknown>;
    examples?: ExampleConfig[];
    dependencies?: DependencyRef[];
    size_bytes?: number;
  }): Promise<VersionRow> {
    try {
      const [row] = await this.knex('artifact_versions')
        .insert({
          id: uuidv4(),
          artifact_id: data.artifact_id,
          version: data.version,
          version_major: data.version_major,
          version_minor: data.version_minor,
          version_patch: data.version_patch,
          version_pre: data.version_pre ?? null,
          published_by: data.published_by ?? null,
          changelog: data.changelog ?? null,
          digest: data.digest ?? null,
          terraform_metadata: data.terraform_metadata ? JSON.stringify(data.terraform_metadata) : null,
          helm_metadata: data.helm_metadata ? JSON.stringify(data.helm_metadata) : null,
          opa_metadata: data.opa_metadata ? JSON.stringify(data.opa_metadata) : null,
          storage_ref: data.storage_ref ? JSON.stringify(data.storage_ref) : null,
          examples: data.examples ? JSON.stringify(data.examples) : null,
          dependencies: data.dependencies ? JSON.stringify(data.dependencies) : null,
          size_bytes: data.size_bytes ?? null,
        })
        .returning('*');
      return this.parseVersionRow(row);
    } catch (err: any) {
      if (err?.message?.includes('UNIQUE constraint') || err?.code === '23505') {
        throw conflict('VERSION_ALREADY_EXISTS', `Version ${data.version} already exists for this artifact`);
      }
      throw err;
    }
  }

  async upsertVersion(data: {
    artifact_id: string;
    version: string;
    version_major: number;
    version_minor: number;
    version_patch: number;
    version_pre?: string;
    published_by?: string;
    storage_ref?: Record<string, unknown>;
  }): Promise<VersionRow> {
    const [row] = await this.knex('artifact_versions')
      .insert({
        id: uuidv4(),
        artifact_id: data.artifact_id,
        version: data.version,
        version_major: data.version_major,
        version_minor: data.version_minor,
        version_patch: data.version_patch,
        version_pre: data.version_pre ?? null,
        published_by: data.published_by ?? null,
        storage_ref: data.storage_ref ? JSON.stringify(data.storage_ref) : null,
      })
      .onConflict(['artifact_id', 'version'])
      .merge({ updated_at: this.knex.fn.now() })
      .returning('*');
    return this.parseVersionRow(row);
  }

  /**
   * Approve a version atomically. Uses SELECT FOR UPDATE to prevent
   * concurrent double-approval and atomically updates is_latest.
   */
  async approveVersion(
    versionId: string,
    approvedBy: string,
    comment?: string,
  ): Promise<VersionRow | null> {
    return this.knex.transaction(async trx => {
      // Lock the version row
      const version = await trx<VersionRow>('artifact_versions')
        .where({ id: versionId })
        .forUpdate()
        .first();

      if (!version || version.approval_status !== 'pending') {
        return null; // Already processed — idempotency guard
      }

      // Clear is_latest on all versions for this artifact
      await trx('artifact_versions')
        .where({ artifact_id: version.artifact_id, is_latest: true })
        .update({ is_latest: false, updated_at: trx.fn.now() });

      // Approve and set as latest
      const [updated] = await trx('artifact_versions')
        .where({ id: versionId })
        .update({
          approval_status: 'approved',
          approved_by: approvedBy,
          approved_at: trx.fn.now(),
          approval_comment: comment ?? null,
          is_latest: true,
          updated_at: trx.fn.now(),
        })
        .returning('*');

      return updated ? this.parseVersionRow(updated) : null;
    });
  }

  async rejectVersion(
    versionId: string,
    rejectedBy: string,
    comment?: string,
  ): Promise<VersionRow | null> {
    const [row] = await this.knex('artifact_versions')
      .where({ id: versionId, approval_status: 'pending' })
      .update({
        approval_status: 'rejected',
        rejected_by: rejectedBy,
        rejected_at: this.knex.fn.now(),
        approval_comment: comment ?? null,
        updated_at: this.knex.fn.now(),
      })
      .returning('*');
    return row ? this.parseVersionRow(row) : null;
  }

  async yankVersion(versionId: string, reason?: string): Promise<VersionRow | null> {
    const [row] = await this.knex('artifact_versions')
      .where({ id: versionId })
      .update({
        is_bad: true,
        yank_reason: reason ?? null,
        updated_at: this.knex.fn.now(),
      })
      .returning('*');
    return row ? this.parseVersionRow(row) : null;
  }

  // ── Tokens ───────────────────────────────────────────────────────────

  private parseTokenRow(row: any): TokenRow {
    return {
      ...row,
      scopes: typeof row.scopes === 'string' ? JSON.parse(row.scopes) : (row.scopes ?? []),
    };
  }

  async listTokens(createdBy: string, team?: string | null): Promise<TokenRow[]> {
    let query = this.knex<TokenRow>('api_tokens')
      .where({ created_by: createdBy })
      .whereNull('revoked_at');

    if (team) {
      query = query.where('team', team);
    }

    const rows = await query
      .orderBy('created_at', 'desc')
      .select('*');
    return rows.map(r => this.parseTokenRow(r));
  }

  async listAllTokens(team?: string | null): Promise<TokenRow[]> {
    let query = this.knex<TokenRow>('api_tokens')
      .whereNull('revoked_at');

    if (team) {
      query = query.where('team', team);
    }

    const rows = await query
      .orderBy('created_at', 'desc')
      .select('*');
    return rows.map(r => this.parseTokenRow(r));
  }

  async createToken(data: {
    name: string;
    token_hash: string;
    token_prefix: string;
    scopes: TokenScope[];
    namespace?: string;
    team?: string;
    created_by: string;
    expires_at?: string;
  }): Promise<TokenRow> {
    const [row] = await this.knex('api_tokens')
      .insert({
        id: uuidv4(),
        name: data.name,
        token_hash: data.token_hash,
        token_prefix: data.token_prefix,
        scopes: JSON.stringify(data.scopes),
        namespace: data.namespace ?? null,
        team: data.team ?? null,
        created_by: data.created_by,
        expires_at: data.expires_at ?? null,
      })
      .returning('*');
    return this.parseTokenRow(row);
  }

  async getTokenByHash(tokenHash: string): Promise<TokenRow | null> {
    const row = await this.knex<TokenRow>('api_tokens')
      .where({ token_hash: tokenHash })
      .first();
    return row ? this.parseTokenRow(row) : null;
  }

  async revokeToken(id: string, revokedBy: string): Promise<boolean> {
    const count = await this.knex('api_tokens')
      .where({ id, created_by: revokedBy })
      .whereNull('revoked_at')
      .update({ revoked_at: this.knex.fn.now() });
    return count > 0;
  }

  async updateTokenLastUsed(id: string): Promise<void> {
    await this.knex('api_tokens')
      .where({ id })
      .update({ last_used_at: this.knex.fn.now() });
  }

  // ── Download Logs ────────────────────────────────────────────────────

  async logDownload(data: {
    artifact_id: string;
    version_id?: string;
    version: string;
    consumer_type?: string;
    token_id?: string;
    ip_address?: string;
    user_agent?: string;
  }): Promise<void> {
    await this.knex('download_logs').insert({
      id: uuidv4(),
      artifact_id: data.artifact_id,
      version_id: data.version_id ?? null,
      version: data.version,
      consumer_type: data.consumer_type ?? null,
      token_id: data.token_id ?? null,
      ip_address: data.ip_address ?? null,
      user_agent: data.user_agent ?? null,
    });
  }

  async getDownloadStats(
    artifactId: string,
    days: number = 30,
  ): Promise<{ total: number; dataPoints: Array<{ date: string; count: number }> }> {
    const total = await this.knex('download_logs')
      .where({ artifact_id: artifactId })
      .count('* as count')
      .first();

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const dataPoints = await this.knex('download_logs')
      .where({ artifact_id: artifactId })
      .where('downloaded_at', '>=', cutoff.toISOString())
      .select(this.knex.raw("DATE(downloaded_at) as date"))
      .count('* as count')
      .groupByRaw('DATE(downloaded_at)')
      .orderBy('date', 'asc');

    return {
      total: Number(total?.count ?? 0),
      dataPoints: dataPoints.map(dp => ({
        date: String(dp.date),
        count: Number(dp.count),
      })),
    };
  }

  // ── Consumers ──────────────────────────────────────────────────────

  async getConsumers(artifactId: string): Promise<ConsumerInfo[]> {
    const rows = await this.knex('download_logs as d')
      .leftJoin('api_tokens as t', 'd.token_id', 't.id')
      .where('d.artifact_id', artifactId)
      .whereNotNull('d.token_id')
      .select(
        't.name as token_name',
        't.token_prefix',
      )
      .max('d.downloaded_at as last_download')
      .count('d.id as download_count')
      .groupBy('t.name', 't.token_prefix');

    // Also get consumer_types per token
    const typeRows = await this.knex('download_logs')
      .where('artifact_id', artifactId)
      .whereNotNull('token_id')
      .select('token_id')
      .distinct('consumer_type');

    const typeMap = new Map<string, string[]>();
    for (const row of typeRows) {
      const existing = typeMap.get(row.token_id) ?? [];
      if (row.consumer_type) existing.push(row.consumer_type);
      typeMap.set(row.token_id, existing);
    }

    return rows.map((r: any) => ({
      token_name: r.token_name ?? 'Unknown',
      token_prefix: r.token_prefix ?? '',
      last_download: r.last_download,
      download_count: Number(r.download_count),
      consumer_types: typeMap.get(r.token_id) ?? [],
    }));
  }

  // Also track anonymous/user-agent based consumers
  async getAnonymousConsumers(artifactId: string): Promise<Array<{
    user_agent: string;
    consumer_type: string;
    download_count: number;
    last_download: string;
  }>> {
    const rows = await this.knex('download_logs')
      .where('artifact_id', artifactId)
      .whereNull('token_id')
      .whereNotNull('user_agent')
      .select('consumer_type')
      .max('downloaded_at as last_download')
      .count('id as download_count')
      .groupBy('consumer_type');

    return rows.map((r: any) => ({
      user_agent: '',
      consumer_type: r.consumer_type ?? 'unknown',
      download_count: Number(r.download_count),
      last_download: r.last_download,
    }));
  }

  // ── Audit Logs ───────────────────────────────────────────────────────

  async writeAuditLog(data: {
    actor: string;
    action: string;
    resource_type: string;
    resource_id?: string;
    resource_name?: string;
    resource_namespace?: string;
    version?: string;
    details?: Record<string, unknown>;
  }): Promise<void> {
    await this.knex('audit_logs').insert({
      id: uuidv4(),
      actor: data.actor,
      action: data.action,
      resource_type: data.resource_type,
      resource_id: data.resource_id ?? null,
      resource_name: data.resource_name ?? null,
      resource_namespace: data.resource_namespace ?? null,
      version: data.version ?? null,
      details: data.details ? JSON.stringify(data.details) : null,
    });
  }

  async listAuditLogs(options: {
    resource_type?: string;
    resource_id?: string;
    resource_namespace?: string;
    resource_name?: string;
    action?: string;
    limit?: number;
    cursor?: string;
  }): Promise<PaginatedResult<AuditLogRow>> {
    let query = this.knex<AuditLogRow>('audit_logs');

    if (options.resource_type) query = query.where('resource_type', options.resource_type);
    if (options.resource_id) query = query.where('resource_id', options.resource_id);
    if (options.resource_namespace) query = query.where('resource_namespace', options.resource_namespace);
    if (options.resource_name) query = query.where('resource_name', options.resource_name);
    if (options.action) query = query.where('action', options.action);

    const countResult = await query.clone().count('* as count').first() as { count: string | number } | undefined;
    const totalCount = Number(countResult?.count ?? 0);

    const limit = Math.min(options.limit ?? 50, 200);

    if (options.cursor) {
      const decoded = decodeCursor(options.cursor);
      if (decoded) {
        query = query.where(function () {
          this.where('occurred_at', '<', decoded.value)
            .orWhere(function () {
              this.where('occurred_at', decoded.value).where('id', '<', decoded.id);
            });
        });
      }
    }

    const rows = await query
      .orderBy('occurred_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1)
      .select('*');

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0
      ? encodeCursor(items[items.length - 1].occurred_at, items[items.length - 1].id)
      : null;

    return { items, nextCursor, totalCount };
  }

  // ── CI Results ───────────────────────────────────────────────────────

  async upsertCiResult(data: {
    version_id: string;
    result_type: string;
    scanner?: string;
    grade?: string;
    summary: Record<string, unknown>;
    details?: Record<string, unknown>;
  }): Promise<CiResultRow> {
    const [row] = await this.knex('ci_results')
      .insert({
        id: uuidv4(),
        version_id: data.version_id,
        result_type: data.result_type,
        scanner: data.scanner ?? null,
        grade: data.grade ?? null,
        summary: JSON.stringify(data.summary),
        details: data.details ? JSON.stringify(data.details) : null,
      })
      .onConflict(['version_id', 'result_type', 'scanner'])
      .merge({
        grade: data.grade ?? null,
        summary: JSON.stringify(data.summary),
        details: data.details ? JSON.stringify(data.details) : null,
        created_at: this.knex.fn.now(),
      })
      .returning('*');
    return row;
  }

  async getCiResults(versionId: string): Promise<CiResultRow[]> {
    return this.knex<CiResultRow>('ci_results')
      .where({ version_id: versionId })
      .orderBy('created_at', 'desc')
      .select('*');
  }

  // ── Version Approvals (Multi-Approver) ──────────────────────────────

  async addVersionApproval(
    versionId: string,
    actor: string,
    comment?: string,
  ): Promise<void> {
    await this.knex('version_approvals')
      .insert({
        id: this.knex.fn.uuid(),
        version_id: versionId,
        actor,
        comment: comment ?? null,
      })
      .onConflict(['version_id', 'actor'])
      .ignore(); // idempotent — duplicate approval by same actor is a no-op
  }

  async getVersionApprovalCount(versionId: string): Promise<number> {
    const result = await this.knex('version_approvals')
      .where({ version_id: versionId })
      .count('* as count')
      .first();
    return Number(result?.count ?? 0);
  }

  async getVersionApprovals(
    versionId: string,
  ): Promise<Array<{ actor: string; comment: string | null; created_at: string }>> {
    return this.knex('version_approvals')
      .where({ version_id: versionId })
      .select('actor', 'comment', 'created_at')
      .orderBy('created_at', 'asc');
  }

  // ── Governance Queries ───────────────────────────────────────────────

  async getPendingApprovals(team?: string): Promise<Array<VersionRow & { artifact_name: string; artifact_namespace: string; artifact_type: string }>> {
    let query = this.knex('artifact_versions as v')
      .join('artifacts as a', 'v.artifact_id', 'a.id')
      .where('v.approval_status', 'pending')
      .where('a.status', 'active');

    if (team) {
      query = query.where('a.team', team);
    }

    const rows = await query
      .select('v.*', 'a.name as artifact_name', 'a.namespace as artifact_namespace', 'a.type as artifact_type')
      .orderBy('v.created_at', 'asc');

    return rows.map(r => ({
      ...this.parseVersionRow(r),
      artifact_name: r.artifact_name,
      artifact_namespace: r.artifact_namespace,
      artifact_type: r.artifact_type,
    }));
  }

  async getGovernanceSummary(team?: string): Promise<{
    pendingApprovals: number;
    approvedVersions: number;
    rejectedVersions: number;
    totalArtifacts: number;
    activeArtifacts: number;
  }> {
    let artifactQuery = this.knex('artifacts').where('status', '!=', 'archived');
    let pendingQuery = this.knex('artifact_versions as v')
      .join('artifacts as a', 'v.artifact_id', 'a.id')
      .where('v.approval_status', 'pending')
      .where('a.status', 'active');
    let approvedQuery = this.knex('artifact_versions as v')
      .join('artifacts as a', 'v.artifact_id', 'a.id')
      .where('v.approval_status', 'approved');
    let rejectedQuery = this.knex('artifact_versions as v')
      .join('artifacts as a', 'v.artifact_id', 'a.id')
      .where('v.approval_status', 'rejected');

    if (team) {
      artifactQuery = artifactQuery.where('team', team);
      pendingQuery = pendingQuery.where('a.team', team);
      approvedQuery = approvedQuery.where('a.team', team);
      rejectedQuery = rejectedQuery.where('a.team', team);
    }

    const [artifacts, pending, approved, rejected] = await Promise.all([
      artifactQuery.count('* as count').first(),
      pendingQuery.count('* as count').first(),
      approvedQuery.count('* as count').first(),
      rejectedQuery.count('* as count').first(),
    ]);

    const totalArtifacts = Number(artifacts?.count ?? 0);

    return {
      pendingApprovals: Number(pending?.count ?? 0),
      approvedVersions: Number(approved?.count ?? 0),
      rejectedVersions: Number(rejected?.count ?? 0),
      totalArtifacts,
      activeArtifacts: totalArtifacts,
    };
  }

  async getStalenessAlerts(team?: string, daysThreshold = 90): Promise<Array<{
    artifactId: string;
    namespace: string;
    name: string;
    type: string;
    lastUpdated: string;
    daysSinceUpdate: number;
  }>> {
    let query = this.knex<ArtifactRow>('artifacts')
      .where('status', 'active');

    if (team) {
      query = query.where('team', team);
    }

    const rows = await query.select('id', 'namespace', 'name', 'type', 'updated_at');

    const now = Date.now();
    const msPerDay = 86_400_000;

    return rows
      .map(r => {
        const daysSince = Math.floor((now - new Date(r.updated_at).getTime()) / msPerDay);
        return {
          artifactId: r.id,
          namespace: r.namespace,
          name: r.name,
          type: r.type,
          lastUpdated: r.updated_at,
          daysSinceUpdate: daysSince,
        };
      })
      .filter(a => a.daysSinceUpdate >= daysThreshold)
      .sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate);
  }

  // ── Facets ─────────────────────────────────────────────────────────

  async getArtifactFacets(team?: string): Promise<FacetsResult> {
    let baseFilter = this.knex('artifacts').where('status', '!=', 'archived');
    if (team) {
      baseFilter = baseFilter.where(function () {
        this.where('team', team!).orWhereNull('team');
      });
    }

    // Type facets
    const typeCounts = await baseFilter.clone()
      .select('type')
      .count('* as count')
      .groupBy('type')
      .orderBy('count', 'desc');

    // Category facets (exclude nulls)
    const categoryCounts = await baseFilter.clone()
      .whereNotNull('category')
      .select('category')
      .count('* as count')
      .groupBy('category')
      .orderBy('count', 'desc');

    // Tag facets — extract individual tags from JSON arrays
    let tagCounts: Array<{ name: string; count: number }>;
    if (this.isPostgres()) {
      const tagRows = await this.knex.raw(`
        SELECT t.value AS name, COUNT(DISTINCT a.id) AS count
        FROM artifacts a, jsonb_array_elements_text(a.tags) AS t(value)
        WHERE a.status != 'archived' ${team ? 'AND (a.team = ? OR a.team IS NULL)' : ''}
        GROUP BY t.value
        ORDER BY count DESC
      `, team ? [team] : []);
      tagCounts = (tagRows.rows ?? tagRows).map((r: any) => ({
        name: String(r.name),
        count: Number(r.count),
      }));
    } else {
      // SQLite: use json_each
      const tagRows = await this.knex.raw(`
        SELECT je.value AS name, COUNT(DISTINCT a.id) AS count
        FROM artifacts a, json_each(a.tags) je
        WHERE a.status != 'archived' ${team ? 'AND (a.team = ? OR a.team IS NULL)' : ''}
        GROUP BY je.value
        ORDER BY count DESC
      `, team ? [team] : []);
      tagCounts = (tagRows as any[]).map((r: any) => ({
        name: String(r.name),
        count: Number(r.count),
      }));
    }

    return {
      types: typeCounts.map((r: any) => ({ name: String(r.type), count: Number(r.count) })),
      categories: categoryCounts.map((r: any) => ({ name: String(r.category), count: Number(r.count) })),
      tags: tagCounts,
    };
  }

  // ── IaC Runs ─────────────────────────────────────────────────────────

  async createRun(data: {
    id?: string;
    artifact_id: string;
    version_id?: string;
    artifact_namespace: string;
    artifact_name: string;
    version?: string;
    operation: RunOperation;
    mode: RunMode;
    status?: RunStatus;
    triggered_by?: string;
    team?: string;
    ci_provider?: string;
    pipeline_config?: string;
    callback_token_hash?: string;
    tf_version?: string;
    variables?: Record<string, unknown>;
    env_vars?: Record<string, unknown>;
    working_directory?: string;
  }): Promise<RunRow> {
    const [row] = await this.knex('iac_runs')
      .insert({
        id: data.id ?? uuidv4(),
        artifact_id: data.artifact_id,
        version_id: data.version_id ?? null,
        artifact_namespace: data.artifact_namespace,
        artifact_name: data.artifact_name,
        version: data.version ?? null,
        operation: data.operation,
        mode: data.mode,
        status: data.status ?? 'pending',
        triggered_by: data.triggered_by ?? null,
        team: data.team ?? null,
        ci_provider: data.ci_provider ?? null,
        pipeline_config: data.pipeline_config ?? null,
        callback_token_hash: data.callback_token_hash ?? null,
        tf_version: data.tf_version ?? null,
        variables: data.variables ? JSON.stringify(data.variables) : null,
        env_vars: data.env_vars ? JSON.stringify(data.env_vars) : null,
        working_directory: data.working_directory ?? null,
      })
      .returning('*');
    return this.parseRunRow(row);
  }

  async getRun(id: string): Promise<RunRow | null> {
    const row = await this.knex<RunRow>('iac_runs').where({ id }).first();
    return row ? this.parseRunRow(row) : null;
  }

  async listRuns(
    artifactId: string,
    options?: { status?: string; limit?: number; cursor?: string },
  ): Promise<PaginatedResult<RunRow>> {
    let query = this.knex<RunRow>('iac_runs').where('artifact_id', artifactId);

    if (options?.status) {
      query = query.where('status', options.status);
    }

    const countResult = await query.clone().count('* as count').first() as { count: string | number } | undefined;
    const totalCount = Number(countResult?.count ?? 0);

    const limit = Math.min(options?.limit ?? 50, 200);

    if (options?.cursor) {
      const decoded = decodeCursor(options.cursor);
      if (decoded) {
        query = query.where(function () {
          this.where('created_at', '<', decoded.value)
            .orWhere(function () {
              this.where('created_at', decoded.value).where('id', '<', decoded.id);
            });
        });
      }
    }

    const rows = await query
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1)
      .select('*');

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0
      ? encodeCursor(items[items.length - 1].created_at, items[items.length - 1].id)
      : null;

    return { items: items.map(r => this.parseRunRow(r)), nextCursor, totalCount };
  }

  async listRunsByModeAndStatus(mode: string, status: string): Promise<RunRow[]> {
    const rows = await this.knex<RunRow>('iac_runs')
      .where('mode', mode)
      .andWhere('status', status)
      .orderBy('created_at', 'asc')
      .select('*');
    return rows.map(r => this.parseRunRow(r));
  }

  async updateRunStatus(
    id: string,
    status: RunStatus,
    extra?: Partial<{
      exit_code: number;
      resources_to_add: number;
      resources_to_change: number;
      resources_to_destroy: number;
      started_at: string;
      completed_at: string;
      queued_at: string;
      duration_seconds: number;
      k8s_job_name: string;
      k8s_namespace: string;
    }>,
  ): Promise<RunRow | null> {
    const update: Record<string, unknown> = {
      status,
      updated_at: this.knex.fn.now(),
    };

    if (extra?.exit_code !== undefined) update.exit_code = extra.exit_code;
    if (extra?.resources_to_add !== undefined) update.resources_to_add = extra.resources_to_add;
    if (extra?.resources_to_change !== undefined) update.resources_to_change = extra.resources_to_change;
    if (extra?.resources_to_destroy !== undefined) update.resources_to_destroy = extra.resources_to_destroy;
    if (extra?.started_at !== undefined) update.started_at = extra.started_at;
    if (extra?.completed_at !== undefined) update.completed_at = extra.completed_at;
    if (extra?.queued_at !== undefined) update.queued_at = extra.queued_at;
    if (extra?.duration_seconds !== undefined) update.duration_seconds = extra.duration_seconds;
    if (extra?.k8s_job_name !== undefined) update.k8s_job_name = extra.k8s_job_name;
    if (extra?.k8s_namespace !== undefined) update.k8s_namespace = extra.k8s_namespace;

    const [row] = await this.knex('iac_runs').where({ id }).update(update).returning('*');
    return row ? this.parseRunRow(row) : null;
  }

  async saveRunOutput(data: {
    run_id: string;
    output_type: string;
    content: string;
  }): Promise<RunOutputRow> {
    const [row] = await this.knex('iac_run_outputs')
      .insert({
        id: uuidv4(),
        run_id: data.run_id,
        output_type: data.output_type,
        content: data.content,
      })
      .onConflict(['run_id', 'output_type'])
      .merge({
        content: data.content,
        created_at: this.knex.fn.now(),
      })
      .returning('*');
    return row;
  }

  async getRunOutput(runId: string, outputType: string): Promise<RunOutputRow | null> {
    const row = await this.knex<RunOutputRow>('iac_run_outputs')
      .where({ run_id: runId, output_type: outputType })
      .first();
    return row ?? null;
  }

  async appendRunLogs(
    runId: string,
    logs: Array<{ sequence: number; stream: string; content: string }>,
  ): Promise<void> {
    const rows = logs.map(log => ({
      id: uuidv4(),
      run_id: runId,
      sequence: log.sequence,
      stream: log.stream,
      content: log.content,
    }));
    await this.knex('iac_run_logs').insert(rows);
  }

  async getRunLogs(
    runId: string,
    afterSequence?: number,
  ): Promise<RunLogRow[]> {
    let query = this.knex<RunLogRow>('iac_run_logs').where({ run_id: runId });
    if (afterSequence !== undefined) {
      query = query.where('sequence', '>', afterSequence);
    }
    return query.orderBy('sequence', 'asc').select('*');
  }

  async expireTimedOutPlans(timeoutSeconds: number): Promise<number> {
    const cutoff = new Date(Date.now() - timeoutSeconds * 1000).toISOString();
    const count = await this.knex('iac_runs')
      .where('status', 'succeeded')
      .where('operation', 'plan')
      .where('completed_at', '<', cutoff)
      .update({
        status: 'expired',
        updated_at: this.knex.fn.now(),
      });
    return count;
  }

  // ── Environments ────────────────────────────────────────────────────

  async createEnvironment(data: {
    name: string;
    description?: string;
    team?: string;
    created_by?: string;
  }): Promise<EnvironmentRow> {
    const [row] = await this.knex('environments')
      .insert({
        id: uuidv4(),
        name: data.name,
        description: data.description ?? null,
        team: data.team ?? null,
        created_by: data.created_by ?? null,
      })
      .returning('*');
    return this.parseEnvironmentRow(row);
  }

  async getEnvironment(id: string): Promise<EnvironmentRow | null> {
    const row = await this.knex('environments').where({ id }).first();
    return row ? this.parseEnvironmentRow(row) : null;
  }

  async listEnvironments(options: {
    team?: string;
    status?: string;
    cursor?: string;
    limit?: number;
  }): Promise<PaginatedResult<EnvironmentRow>> {
    const limit = options.limit ?? 20;
    let query = this.knex('environments');

    if (options.team) query = query.where('team', options.team);
    if (options.status) query = query.where('status', options.status);

    const countResult = await query.clone().count('* as count').first();
    const totalCount = Number(countResult?.count ?? 0);

    if (options.cursor) {
      const decoded = decodeCursor(options.cursor);
      if (decoded) {
        query = query.where(function () {
          this.where('created_at', '<', decoded.value)
            .orWhere(function () {
              this.where('created_at', decoded.value).where('id', '<', decoded.id);
            });
        });
      }
    }

    const rows = await query
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1)
      .select('*');

    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map((r: any) =>
      this.parseEnvironmentRow(r),
    );
    const nextCursor =
      hasMore && items.length > 0
        ? encodeCursor(
            String(items[items.length - 1].created_at),
            items[items.length - 1].id,
          )
        : null;

    return { items, nextCursor, totalCount };
  }

  async updateEnvironment(
    id: string,
    data: Partial<{
      name: string;
      description: string | null;
      status: string;
      locked: boolean;
      locked_by: string | null;
      locked_at: string | null;
      lock_reason: string | null;
      module_count: number;
      total_resources: number;
      last_run_at: string | null;
    }>,
  ): Promise<EnvironmentRow | null> {
    const [row] = await this.knex('environments')
      .where({ id })
      .update({ ...data, updated_at: this.knex.fn.now() })
      .returning('*');
    return row ? this.parseEnvironmentRow(row) : null;
  }

  async deleteEnvironment(id: string): Promise<void> {
    await this.knex('environments')
      .where({ id })
      .update({ status: 'archived', updated_at: this.knex.fn.now() });
  }

  // ── Environment Modules ───────────────────────────────────────────────

  async addModule(
    environmentId: string,
    data: {
      name: string;
      description?: string;
      artifact_id: string;
      artifact_namespace: string;
      artifact_name: string;
      pinned_version?: string;
      auto_plan_on_module_update?: boolean;
      vcs_trigger?: VcsTrigger;
      auto_plan_on_push?: boolean;
      execution_mode?: string;
      tf_version?: string;
      working_directory?: string;
      state_backend?: StateBackendConfig;
    },
  ): Promise<EnvironmentModuleRow> {
    const [row] = await this.knex('environment_modules')
      .insert({
        id: uuidv4(),
        environment_id: environmentId,
        name: data.name,
        description: data.description ?? null,
        artifact_id: data.artifact_id,
        artifact_namespace: data.artifact_namespace,
        artifact_name: data.artifact_name,
        pinned_version: data.pinned_version ?? null,
        auto_plan_on_module_update: data.auto_plan_on_module_update ?? true,
        vcs_trigger: data.vcs_trigger ? JSON.stringify(data.vcs_trigger) : null,
        auto_plan_on_push: data.auto_plan_on_push ?? false,
        execution_mode: data.execution_mode ?? 'byoc',
        tf_version: data.tf_version ?? null,
        working_directory: data.working_directory ?? null,
        state_backend: data.state_backend
          ? JSON.stringify(data.state_backend)
          : null,
      })
      .returning('*');

    // Increment module count on environment
    await this.knex('environments')
      .where({ id: environmentId })
      .increment('module_count', 1)
      .update({ updated_at: this.knex.fn.now() });

    return this.parseEnvironmentModuleRow(row);
  }

  async getModule(id: string): Promise<EnvironmentModuleRow | null> {
    const row = await this.knex('environment_modules').where({ id }).first();
    return row ? this.parseEnvironmentModuleRow(row) : null;
  }

  async listModules(environmentId: string): Promise<EnvironmentModuleRow[]> {
    const rows = await this.knex('environment_modules')
      .where({ environment_id: environmentId })
      .orderBy('name', 'asc')
      .select('*');
    return rows.map((r: any) => this.parseEnvironmentModuleRow(r));
  }

  async updateModule(
    id: string,
    data: Partial<{
      name: string;
      description: string | null;
      pinned_version: string | null;
      current_version: string | null;
      auto_plan_on_module_update: boolean;
      vcs_trigger: VcsTrigger | null;
      auto_plan_on_push: boolean;
      execution_mode: string;
      tf_version: string | null;
      working_directory: string | null;
      state_backend: StateBackendConfig | null;
      last_run_id: string | null;
      last_run_status: string | null;
      last_run_at: string | null;
      resource_count: number;
      status: string;
    }>,
  ): Promise<EnvironmentModuleRow | null> {
    const update: Record<string, any> = {
      ...data,
      updated_at: this.knex.fn.now(),
    };
    if (data.vcs_trigger !== undefined) {
      update.vcs_trigger = data.vcs_trigger
        ? JSON.stringify(data.vcs_trigger)
        : null;
    }
    if (data.state_backend !== undefined) {
      update.state_backend = data.state_backend
        ? JSON.stringify(data.state_backend)
        : null;
    }
    const [row] = await this.knex('environment_modules')
      .where({ id })
      .update(update)
      .returning('*');
    return row ? this.parseEnvironmentModuleRow(row) : null;
  }

  async removeModule(id: string): Promise<void> {
    const mod = await this.getModule(id);
    if (!mod) return;
    await this.knex('environment_modules').where({ id }).del();
    // Decrement module count on environment
    await this.knex('environments')
      .where({ id: mod.environment_id })
      .decrement('module_count', 1)
      .update({ updated_at: this.knex.fn.now() });
  }

  async listModulesForArtifact(
    artifactId: string,
  ): Promise<EnvironmentModuleRow[]> {
    const rows = await this.knex('environment_modules')
      .where({ artifact_id: artifactId, status: 'active' })
      .select('*');
    return rows.map((r: any) => this.parseEnvironmentModuleRow(r));
  }

  async getModulesWithVersionConstraint(
    artifactId: string,
  ): Promise<EnvironmentModuleRow[]> {
    const rows = await this.knex('environment_modules as em')
      .join('environments as e', 'em.environment_id', 'e.id')
      .where('em.artifact_id', artifactId)
      .where('em.auto_plan_on_module_update', true)
      .where('em.status', 'active')
      .where('e.status', 'active')
      .where('e.locked', false)
      .select('em.*');
    return rows.map((r: any) => this.parseEnvironmentModuleRow(r));
  }

  async getLockedEnvironments(envIds: string[]): Promise<EnvironmentRow[]> {
    if (envIds.length === 0) return [];
    const rows = await this.knex('environments')
      .whereIn('id', envIds)
      .where('locked', true)
      .select('*');
    return rows.map((r: any) => this.parseEnvironmentRow(r));
  }

  // ── Module Dependencies ──────────────────────────────────────────────

  async getModuleDependencies(
    moduleId: string,
  ): Promise<(ModuleDependencyRow & { depends_on_name: string })[]> {
    const rows = await this.knex('environment_module_dependencies as d')
      .join('environment_modules as m', 'd.depends_on_id', 'm.id')
      .where('d.module_id', moduleId)
      .select('d.*', 'm.name as depends_on_name');
    return rows.map((r: any) => ({
      ...r,
      output_mapping: r.output_mapping
        ? typeof r.output_mapping === 'string'
          ? JSON.parse(r.output_mapping)
          : r.output_mapping
        : null,
    }));
  }

  async setModuleDependencies(
    moduleId: string,
    dependencies: Array<{
      depends_on_id: string;
      output_mapping?: OutputMappingEntry[];
    }>,
  ): Promise<(ModuleDependencyRow & { depends_on_name: string })[]> {
    // Delete existing dependencies
    await this.knex('environment_module_dependencies')
      .where({ module_id: moduleId })
      .del();

    if (dependencies.length === 0) {
      return [];
    }

    // Insert new dependencies
    await this.knex('environment_module_dependencies').insert(
      dependencies.map(d => ({
        id: uuidv4(),
        module_id: moduleId,
        depends_on_id: d.depends_on_id,
        output_mapping: d.output_mapping
          ? JSON.stringify(d.output_mapping)
          : null,
      })),
    );

    return this.getModuleDependencies(moduleId);
  }

  async getEnvironmentGraph(
    environmentId: string,
  ): Promise<{
    modules: EnvironmentModuleRow[];
    deps: (ModuleDependencyRow & { depends_on_name: string })[];
  }> {
    const modules = await this.listModules(environmentId);
    const moduleIds = modules.map(m => m.id);
    if (moduleIds.length === 0) return { modules, deps: [] };

    const depRows = await this.knex('environment_module_dependencies as d')
      .join('environment_modules as m', 'd.depends_on_id', 'm.id')
      .whereIn('d.module_id', moduleIds)
      .select('d.*', 'm.name as depends_on_name');

    const deps = depRows.map((r: any) => ({
      ...r,
      output_mapping: r.output_mapping
        ? typeof r.output_mapping === 'string'
          ? JSON.parse(r.output_mapping)
          : r.output_mapping
        : null,
    }));

    return { modules, deps };
  }

  /**
   * Topological sort using Kahn's algorithm.
   * Returns module IDs in execution order.
   * Throws if a cycle is detected (defense in depth).
   */
  async topologicalSort(environmentId: string): Promise<string[]> {
    const { modules, deps } = await this.getEnvironmentGraph(environmentId);
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const m of modules) {
      inDegree.set(m.id, 0);
      adjacency.set(m.id, []);
    }

    for (const dep of deps) {
      const current = inDegree.get(dep.module_id) ?? 0;
      inDegree.set(dep.module_id, current + 1);
      const adj = adjacency.get(dep.depends_on_id) ?? [];
      adj.push(dep.module_id);
      adjacency.set(dep.depends_on_id, adj);
    }

    // Start with modules that have no dependencies
    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) queue.push(id);
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);
      for (const downstream of adjacency.get(current) ?? []) {
        const newDegree = (inDegree.get(downstream) ?? 1) - 1;
        inDegree.set(downstream, newDegree);
        if (newDegree === 0) queue.push(downstream);
      }
    }

    if (sorted.length !== modules.length) {
      // Cycle detected — find the cycle path
      const remaining = modules
        .filter(m => !sorted.includes(m.id))
        .map(m => m.name);
      throw new Error(
        `Cycle detected in dependency graph involving modules: ${remaining.join(', ')}`,
      );
    }

    return sorted;
  }

  /**
   * Detect cycles before adding dependencies.
   * Uses DFS from each target to check if we can reach the source.
   * Returns null if no cycle, or the cycle path string if a cycle is detected.
   */
  async detectCycle(
    environmentId: string,
    moduleId: string,
    dependsOnIds: string[],
  ): Promise<string | null> {
    const { modules, deps } = await this.getEnvironmentGraph(environmentId);
    const moduleMap = new Map(modules.map(m => [m.id, m]));

    // Build adjacency list (module → depends_on) including the proposed new edges
    const dependsOn = new Map<string, Set<string>>();
    for (const m of modules) {
      dependsOn.set(m.id, new Set());
    }
    for (const dep of deps) {
      // Skip existing edges from this module (we're replacing them)
      if (dep.module_id === moduleId) continue;
      dependsOn.get(dep.module_id)?.add(dep.depends_on_id);
    }
    // Add proposed new edges
    for (const depId of dependsOnIds) {
      dependsOn.get(moduleId)?.add(depId);
    }

    // DFS cycle detection from moduleId
    const visited = new Set<string>();
    const path: string[] = [];

    const dfs = (current: string): boolean => {
      if (current === moduleId && path.length > 0) {
        path.push(moduleMap.get(current)?.name ?? current);
        return true; // cycle found
      }
      if (visited.has(current)) return false;
      visited.add(current);
      path.push(moduleMap.get(current)?.name ?? current);
      for (const dep of dependsOn.get(current) ?? []) {
        if (dfs(dep)) return true;
      }
      path.pop();
      return false;
    };

    // Start DFS from each proposed dependency target
    for (const depId of dependsOnIds) {
      visited.clear();
      path.length = 0;
      path.push(moduleMap.get(moduleId)?.name ?? moduleId);
      visited.add(moduleId);
      if (dfs(depId)) {
        return `Cycle detected: ${path.join(' → ')}`;
      }
    }

    return null;
  }

  // ── Module Variables ─────────────────────────────────────────────────

  async listModuleVariables(
    moduleId: string,
  ): Promise<EnvironmentModuleVariableRow[]> {
    return this.knex('environment_module_variables')
      .where({ module_id: moduleId })
      .orderBy('key', 'asc')
      .select('*');
  }

  async upsertModuleVariables(
    moduleId: string,
    variables: Array<{
      key: string;
      value?: string | null;
      sensitive?: boolean;
      hcl?: boolean;
      category?: string;
      description?: string | null;
      secret_ref?: string | null;
    }>,
  ): Promise<EnvironmentModuleVariableRow[]> {
    for (const v of variables) {
      await this.knex('environment_module_variables')
        .insert({
          id: uuidv4(),
          module_id: moduleId,
          key: v.key,
          value: v.sensitive ? null : (v.value ?? null),
          sensitive: v.sensitive ?? false,
          hcl: v.hcl ?? false,
          category: v.category ?? 'terraform',
          description: v.description ?? null,
          secret_ref: v.secret_ref ?? null,
        })
        .onConflict(['module_id', 'key', 'category'])
        .merge({
          value: v.sensitive ? null : (v.value ?? null),
          sensitive: v.sensitive ?? false,
          hcl: v.hcl ?? false,
          description: v.description ?? null,
          secret_ref: v.secret_ref ?? null,
          updated_at: this.knex.fn.now(),
        });
    }
    return this.listModuleVariables(moduleId);
  }

  async deleteModuleVariable(
    moduleId: string,
    key: string,
    category: string = 'terraform',
  ): Promise<void> {
    await this.knex('environment_module_variables')
      .where({ module_id: moduleId, key, category })
      .del();
  }

  async snapshotModuleVariables(
    moduleId: string,
  ): Promise<Record<string, unknown>> {
    const vars = await this.listModuleVariables(moduleId);
    const snapshot: Record<string, any> = {};
    for (const v of vars) {
      snapshot[v.key] = {
        value: v.sensitive ? '***' : v.value,
        sensitive: v.sensitive,
        hcl: v.hcl,
        category: v.category,
        secret_ref: v.secret_ref,
      };
    }
    return snapshot;
  }

  // ── Module Runs ──────────────────────────────────────────────────────

  async createModuleRun(data: {
    id?: string;
    module_id: string;
    environment_id: string;
    environment_run_id?: string;
    module_name: string;
    artifact_namespace: string;
    artifact_name: string;
    module_version?: string;
    operation: string;
    mode: string;
    status?: string;
    triggered_by?: string;
    trigger_source?: string;
    priority?: string;
    ci_provider?: string;
    pipeline_config?: string;
    callback_token_hash?: string;
    tf_version?: string;
    variables_snapshot?: Record<string, unknown>;
    env_vars_snapshot?: Record<string, unknown>;
    state_backend_snapshot?: StateBackendConfig;
  }): Promise<ModuleRunRow> {
    const id = data.id ?? uuidv4();

    // Check for active run to determine queue position
    const activeRun = await this.getActiveModuleRun(data.module_id);
    let status = data.status ?? 'pending';
    let queuePosition: number | null = null;

    if (activeRun) {
      // Queue behind the active run
      const maxPos = await this.knex('module_runs')
        .where({ module_id: data.module_id })
        .whereNotNull('queue_position')
        .max('queue_position as max')
        .first();
      queuePosition = ((maxPos?.max as number) ?? 0) + 1;
      status = 'pending';

      // Latest-wins for cascade: cancel older queued cascade runs for same module
      if (data.priority === 'cascade') {
        await this.knex('module_runs')
          .where({ module_id: data.module_id, priority: 'cascade' })
          .whereNotNull('queue_position')
          .del();
        // Recalculate position after cleanup
        const newMax = await this.knex('module_runs')
          .where({ module_id: data.module_id })
          .whereNotNull('queue_position')
          .max('queue_position as max')
          .first();
        queuePosition = ((newMax?.max as number) ?? 0) + 1;
      }
    } else {
      status = data.status ?? 'queued';
    }

    const [row] = await this.knex('module_runs')
      .insert({
        id,
        module_id: data.module_id,
        environment_id: data.environment_id,
        environment_run_id: data.environment_run_id ?? null,
        module_name: data.module_name,
        artifact_namespace: data.artifact_namespace,
        artifact_name: data.artifact_name,
        module_version: data.module_version ?? null,
        operation: data.operation,
        mode: data.mode,
        status,
        triggered_by: data.triggered_by ?? null,
        trigger_source: data.trigger_source ?? null,
        priority: data.priority ?? 'user',
        queue_position: queuePosition,
        ci_provider: data.ci_provider ?? null,
        pipeline_config: data.pipeline_config ?? null,
        callback_token_hash: data.callback_token_hash ?? null,
        tf_version: data.tf_version ?? null,
        variables_snapshot: data.variables_snapshot
          ? JSON.stringify(data.variables_snapshot)
          : null,
        env_vars_snapshot: data.env_vars_snapshot
          ? JSON.stringify(data.env_vars_snapshot)
          : null,
        state_backend_snapshot: data.state_backend_snapshot
          ? JSON.stringify(data.state_backend_snapshot)
          : null,
      })
      .returning('*');
    return this.parseModuleRunRow(row);
  }

  async getModuleRun(id: string): Promise<ModuleRunRow | null> {
    const row = await this.knex('module_runs').where({ id }).first();
    return row ? this.parseModuleRunRow(row) : null;
  }

  async listModuleRuns(
    moduleId: string,
    options?: { status?: string; cursor?: string; limit?: number },
  ): Promise<PaginatedResult<ModuleRunRow>> {
    const limit = options?.limit ?? 20;
    let query = this.knex('module_runs').where({ module_id: moduleId });

    if (options?.status) query = query.where('status', options.status);

    const countResult = await query.clone().count('* as count').first();
    const totalCount = Number(countResult?.count ?? 0);

    if (options?.cursor) {
      const decoded = decodeCursor(options.cursor);
      if (decoded) {
        query = query.where(function () {
          this.where('created_at', '<', decoded.value)
            .orWhere(function () {
              this.where('created_at', decoded.value).where('id', '<', decoded.id);
            });
        });
      }
    }

    const rows = await query
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1)
      .select('*');

    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map((r: any) =>
      this.parseModuleRunRow(r),
    );
    const nextCursor =
      hasMore && items.length > 0
        ? encodeCursor(
            String(items[items.length - 1].created_at),
            items[items.length - 1].id,
          )
        : null;

    return { items, nextCursor, totalCount };
  }

  async getActiveModuleRun(moduleId: string): Promise<ModuleRunRow | null> {
    const row = await this.knex('module_runs')
      .where({ module_id: moduleId })
      .whereIn('status', ['running', 'planned', 'applying'])
      .first();
    return row ? this.parseModuleRunRow(row) : null;
  }

  async updateModuleRunStatus(
    id: string,
    status: string,
    extra?: Partial<{
      exit_code: number;
      resources_to_add: number;
      resources_to_change: number;
      resources_to_destroy: number;
      resource_count_after: number;
      plan_summary: string;
      tf_outputs: Record<string, unknown>;
      k8s_job_name: string;
      k8s_namespace: string;
      queued_at: string;
      started_at: string;
      planned_at: string;
      confirmed_at: string;
      completed_at: string;
      duration_seconds: number;
      confirmed_by: string;
      auto_confirmed: boolean;
      skip_reason: string;
      queue_position: number | null;
    }>,
  ): Promise<ModuleRunRow | null> {
    const update: Record<string, any> = {
      status,
      updated_at: this.knex.fn.now(),
      ...extra,
    };
    if (extra?.tf_outputs !== undefined) {
      update.tf_outputs = JSON.stringify(extra.tf_outputs);
    }
    const [row] = await this.knex('module_runs')
      .where({ id })
      .update(update)
      .returning('*');
    return row ? this.parseModuleRunRow(row) : null;
  }

  /**
   * Dequeue the next module run after the current one completes.
   * User-priority runs are dequeued first, then cascade.
   * Runs within the same priority are FIFO by queue_position.
   */
  async dequeueNextModuleRun(
    moduleId: string,
  ): Promise<ModuleRunRow | null> {
    return this.knex.transaction(async trx => {
      const next = await trx('module_runs')
        .where({ module_id: moduleId })
        .whereNotNull('queue_position')
        .orderByRaw(
          "CASE WHEN priority = 'user' THEN 0 ELSE 1 END ASC, queue_position ASC",
        )
        .forUpdate()
        .first();

      if (!next) return null;

      const [updated] = await trx('module_runs')
        .where({ id: next.id })
        .update({
          status: 'queued',
          queue_position: null,
          updated_at: trx.fn.now(),
        })
        .returning('*');

      // Decrement remaining queue positions
      await trx('module_runs')
        .where({ module_id: moduleId })
        .whereNotNull('queue_position')
        .decrement('queue_position', 1);

      return updated ? this.parseModuleRunRow(updated) : null;
    });
  }

  async listPendingModuleRuns(
    status: string,
    mode: string,
  ): Promise<ModuleRunRow[]> {
    const rows = await this.knex('module_runs')
      .where({ status, mode })
      .whereNull('queue_position')
      .orderByRaw(
        "CASE WHEN priority = 'user' THEN 0 ELSE 1 END ASC, created_at ASC",
      )
      .select('*');
    return rows.map((r: any) => this.parseModuleRunRow(r));
  }

  async getLatestSuccessfulModuleRun(
    moduleId: string,
  ): Promise<ModuleRunRow | null> {
    const row = await this.knex('module_runs')
      .where({ module_id: moduleId, status: 'succeeded' })
      .whereNotNull('tf_outputs')
      .orderBy('completed_at', 'desc')
      .first();
    return row ? this.parseModuleRunRow(row) : null;
  }

  // ── Module Run Outputs / Logs ─────────────────────────────────────────

  async saveModuleRunOutput(data: {
    run_id: string;
    output_type: string;
    content: string;
  }): Promise<ModuleRunOutputRow> {
    const [row] = await this.knex('module_run_outputs')
      .insert({ id: uuidv4(), ...data })
      .onConflict(['run_id', 'output_type'])
      .merge({ content: data.content, created_at: this.knex.fn.now() })
      .returning('*');
    return row;
  }

  async getModuleRunOutput(
    runId: string,
    outputType: string,
  ): Promise<ModuleRunOutputRow | null> {
    return this.knex('module_run_outputs')
      .where({ run_id: runId, output_type: outputType })
      .first();
  }

  async getModuleRunOutputs(runId: string): Promise<ModuleRunOutputRow[]> {
    return this.knex('module_run_outputs')
      .where({ run_id: runId })
      .select('*');
  }

  async appendModuleRunLogs(
    runId: string,
    logs: Array<{ sequence: number; stream: string; content: string }>,
  ): Promise<void> {
    if (logs.length === 0) return;
    await this.knex('module_run_logs').insert(
      logs.map(l => ({
        id: uuidv4(),
        run_id: runId,
        sequence: l.sequence,
        stream: l.stream,
        content: l.content,
      })),
    );
  }

  async getModuleRunLogs(
    runId: string,
    afterSequence?: number,
  ): Promise<ModuleRunLogRow[]> {
    let query = this.knex<ModuleRunLogRow>('module_run_logs').where({
      run_id: runId,
    });
    if (afterSequence !== undefined) {
      query = query.where('sequence', '>', afterSequence);
    }
    return query.orderBy('sequence', 'asc').select('*');
  }

  // ── Environment Runs ─────────────────────────────────────────────────

  async createEnvironmentRun(data: {
    id?: string;
    environment_id: string;
    environment_name: string;
    operation: string;
    triggered_by?: string;
    trigger_source?: string;
    total_modules: number;
    execution_order?: string[];
  }): Promise<EnvironmentRunRow> {
    const id = data.id ?? uuidv4();
    const [row] = await this.knex('environment_runs')
      .insert({
        id,
        environment_id: data.environment_id,
        environment_name: data.environment_name,
        operation: data.operation,
        triggered_by: data.triggered_by ?? null,
        trigger_source: data.trigger_source ?? null,
        total_modules: data.total_modules,
        execution_order: data.execution_order
          ? JSON.stringify(data.execution_order)
          : null,
      })
      .returning('*');
    return this.parseEnvironmentRunRow(row);
  }

  async getEnvironmentRun(id: string): Promise<EnvironmentRunRow | null> {
    const row = await this.knex('environment_runs').where({ id }).first();
    return row ? this.parseEnvironmentRunRow(row) : null;
  }

  async listEnvironmentRuns(
    environmentId: string,
  ): Promise<EnvironmentRunRow[]> {
    const rows = await this.knex('environment_runs')
      .where({ environment_id: environmentId })
      .orderBy('created_at', 'desc')
      .select('*');
    return rows.map((r: any) => this.parseEnvironmentRunRow(r));
  }

  async updateEnvironmentRunStatus(
    id: string,
    status: string,
    extra?: Partial<{
      completed_modules: number;
      failed_modules: number;
      skipped_modules: number;
      started_at: string;
      completed_at: string;
      duration_seconds: number;
    }>,
  ): Promise<EnvironmentRunRow | null> {
    const [row] = await this.knex('environment_runs')
      .where({ id })
      .update({ status, ...extra, updated_at: this.knex.fn.now() })
      .returning('*');
    return row ? this.parseEnvironmentRunRow(row) : null;
  }

  async getModuleRunsForEnvRun(
    envRunId: string,
  ): Promise<ModuleRunRow[]> {
    const rows = await this.knex('module_runs')
      .where({ environment_run_id: envRunId })
      .orderBy('created_at', 'asc')
      .select('*');
    return rows.map((r: any) => this.parseModuleRunRow(r));
  }

  /**
   * Expire environment runs that are in 'planned' status and past the confirmation timeout.
   */
  async expireTimedOutEnvironmentRuns(cutoff: string): Promise<number> {
    const result = await this.knex('environment_runs')
      .whereIn('status', ['planned', 'running'])
      .where('updated_at', '<', cutoff)
      .whereRaw("status NOT IN ('succeeded', 'failed', 'cancelled', 'expired', 'partial_failure')")
      .update({
        status: 'expired',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    return result;
  }

  /**
   * Expire individual module runs in 'planned' status past the confirmation timeout.
   */
  async expireTimedOutModuleRuns(cutoff: string): Promise<number> {
    const result = await this.knex('module_runs')
      .where('status', 'planned')
      .where('planned_at', '<', cutoff)
      .whereNull('environment_run_id') // Only standalone runs; env run ones are handled by env run expiry
      .update({
        status: 'timed_out',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    return result;
  }

  // ── Terraform State ──────────────────────────────────────────────────

  async getOrCreateTerraformState(
    moduleId: string,
    workspace: string,
  ): Promise<TerraformStateRow> {
    const existing = await this.knex('terraform_state')
      .where({ module_id: moduleId })
      .first();
    if (existing) return existing;
    const [row] = await this.knex('terraform_state')
      .insert({ module_id: moduleId, workspace })
      .onConflict('workspace')
      .merge({ updated_at: this.knex.fn.now() })
      .returning('*');
    return row;
  }

  async forceUnlockTerraformState(
    moduleId: string,
  ): Promise<TerraformStateRow | null> {
    const [row] = await this.knex('terraform_state')
      .where({ module_id: moduleId })
      .update({
        lock_id: null,
        locked_by: null,
        locked_at: null,
        updated_at: this.knex.fn.now(),
      })
      .returning('*');
    return row ?? null;
  }

  // ── Health ───────────────────────────────────────────────────────────

  async resetAllData(): Promise<void> {
    // Delete in dependency order — Phase 3 tables first
    await this.knex('terraform_state').del();
    await this.knex('module_run_logs').del();
    await this.knex('module_run_outputs').del();
    await this.knex('environment_runs').del();
    // Clear environment_run_id FK before deleting module_runs
    await this.knex('module_runs').update({ environment_run_id: null });
    await this.knex('module_runs').del();
    await this.knex('environment_module_variables').del();
    await this.knex('environment_module_dependencies').del();
    // Clear last_run_id FK before deleting modules
    await this.knex('environment_modules').update({ last_run_id: null });
    await this.knex('environment_modules').del();
    await this.knex('environments').del();
    // Phase 1-2 tables
    await this.knex('iac_run_logs').del();
    await this.knex('iac_run_outputs').del();
    await this.knex('iac_runs').del();
    await this.knex('ci_results').del();
    await this.knex('audit_logs').del();
    await this.knex('download_logs').del();
    await this.knex('api_tokens').del();
    await this.knex('artifact_versions').del();
    await this.knex('artifacts').del();
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.knex.raw('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  // ── Cloud Integrations ──────────────────────────────────────────────

  async createCloudIntegration(data: {
    name: string;
    description?: string;
    team?: string;
    provider: string;
    auth_method: string;
    credential_config: Record<string, unknown>;
    supported_ci_providers?: string[];
    created_by?: string;
  }): Promise<CloudIntegrationRow> {
    const [row] = await this.knex('cloud_integrations')
      .insert({
        id: uuidv4(),
        name: data.name,
        description: data.description ?? null,
        team: data.team ?? null,
        provider: data.provider,
        auth_method: data.auth_method,
        credential_config: JSON.stringify(data.credential_config),
        supported_ci_providers: data.supported_ci_providers
          ? JSON.stringify(data.supported_ci_providers)
          : null,
        created_by: data.created_by ?? null,
      })
      .returning('*');
    return this.parseCloudIntegrationRow(row);
  }

  async getCloudIntegration(id: string): Promise<CloudIntegrationRow | null> {
    const row = await this.knex('cloud_integrations').where({ id }).first();
    return row ? this.parseCloudIntegrationRow(row) : null;
  }

  async listCloudIntegrations(options: {
    team?: string;
    provider?: string;
  }): Promise<CloudIntegrationRow[]> {
    let query = this.knex('cloud_integrations').where('status', '!=', 'archived');
    if (options.team) query = query.where('team', options.team);
    if (options.provider) query = query.where('provider', options.provider);
    const rows = await query.orderBy('created_at', 'desc').select('*');
    return rows.map((r: any) => this.parseCloudIntegrationRow(r));
  }

  async updateCloudIntegration(
    id: string,
    data: Partial<{
      name: string;
      description: string | null;
      provider: string;
      auth_method: string;
      credential_config: Record<string, unknown>;
      supported_ci_providers: string[] | null;
      status: string;
      last_validated_at: string | null;
      validation_error: string | null;
    }>,
  ): Promise<CloudIntegrationRow | null> {
    const updateData: Record<string, unknown> = { updated_at: this.knex.fn.now() };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.provider !== undefined) updateData.provider = data.provider;
    if (data.auth_method !== undefined) updateData.auth_method = data.auth_method;
    if (data.credential_config !== undefined)
      updateData.credential_config = JSON.stringify(data.credential_config);
    if (data.supported_ci_providers !== undefined)
      updateData.supported_ci_providers = data.supported_ci_providers
        ? JSON.stringify(data.supported_ci_providers)
        : null;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.last_validated_at !== undefined) updateData.last_validated_at = data.last_validated_at;
    if (data.validation_error !== undefined) updateData.validation_error = data.validation_error;

    const [row] = await this.knex('cloud_integrations')
      .where({ id })
      .update(updateData)
      .returning('*');
    return row ? this.parseCloudIntegrationRow(row) : null;
  }

  async deleteCloudIntegration(id: string): Promise<void> {
    // Check for active bindings
    const envBindings = await this.knex('environment_cloud_integrations')
      .where({ cloud_integration_id: id })
      .count('* as count')
      .first();
    const modBindings = await this.knex('module_cloud_integrations')
      .where({ cloud_integration_id: id })
      .count('* as count')
      .first();
    if (Number(envBindings?.count ?? 0) > 0 || Number(modBindings?.count ?? 0) > 0) {
      throw conflict('BINDING_EXISTS', 'Cannot delete cloud integration with active bindings');
    }
    await this.knex('cloud_integrations').where({ id }).del();
  }

  async hasCloudIntegrationBindings(id: string): Promise<boolean> {
    const envBindings = await this.knex('environment_cloud_integrations')
      .where({ cloud_integration_id: id })
      .count('* as count')
      .first();
    const modBindings = await this.knex('module_cloud_integrations')
      .where({ cloud_integration_id: id })
      .count('* as count')
      .first();
    return Number(envBindings?.count ?? 0) > 0 || Number(modBindings?.count ?? 0) > 0;
  }

  // ── Variable Sets ─────────────────────────────────────────────────

  async createVariableSet(data: {
    name: string;
    description?: string;
    team?: string;
    auto_attach?: boolean;
    created_by?: string;
  }): Promise<VariableSetRow> {
    const [row] = await this.knex('variable_sets')
      .insert({
        id: uuidv4(),
        name: data.name,
        description: data.description ?? null,
        team: data.team ?? null,
        auto_attach: data.auto_attach ?? false,
        created_by: data.created_by ?? null,
      })
      .returning('*');
    return this.parseVariableSetRow(row);
  }

  async getVariableSet(id: string): Promise<VariableSetRow | null> {
    const row = await this.knex('variable_sets').where({ id }).first();
    return row ? this.parseVariableSetRow(row) : null;
  }

  async listVariableSets(options: {
    team?: string;
  }): Promise<VariableSetRow[]> {
    let query = this.knex('variable_sets').where('status', '!=', 'archived');
    if (options.team) query = query.where('team', options.team);
    const rows = await query.orderBy('created_at', 'desc').select('*');
    return rows.map((r: any) => this.parseVariableSetRow(r));
  }

  async updateVariableSet(
    id: string,
    data: Partial<{
      name: string;
      description: string | null;
      auto_attach: boolean;
      status: string;
    }>,
  ): Promise<VariableSetRow | null> {
    const [row] = await this.knex('variable_sets')
      .where({ id })
      .update({ ...data, updated_at: this.knex.fn.now() })
      .returning('*');
    return row ? this.parseVariableSetRow(row) : null;
  }

  async deleteVariableSet(id: string): Promise<void> {
    const envBindings = await this.knex('environment_variable_sets')
      .where({ variable_set_id: id })
      .count('* as count')
      .first();
    const modBindings = await this.knex('module_variable_sets')
      .where({ variable_set_id: id })
      .count('* as count')
      .first();
    if (Number(envBindings?.count ?? 0) > 0 || Number(modBindings?.count ?? 0) > 0) {
      throw conflict('BINDING_EXISTS', 'Cannot delete variable set with active bindings');
    }
    await this.knex('variable_sets').where({ id }).del();
  }

  // ── Variable Set Entries ──────────────────────────────────────────

  async listVariableSetEntries(setId: string): Promise<VariableSetEntryRow[]> {
    const rows = await this.knex('variable_set_entries')
      .where({ variable_set_id: setId })
      .orderBy('key')
      .select('*');
    return rows.map((r: any) => this.parseVariableSetEntryRow(r));
  }

  async upsertVariableSetEntries(
    setId: string,
    entries: Array<{
      key: string;
      value?: string | null;
      sensitive?: boolean;
      hcl?: boolean;
      category?: 'terraform' | 'env';
      description?: string | null;
      ci_secret_name?: string | null;
    }>,
  ): Promise<VariableSetEntryRow[]> {
    // Delete existing entries and replace
    await this.knex('variable_set_entries').where({ variable_set_id: setId }).del();

    if (entries.length === 0) return [];

    const rows = entries.map(e => ({
      id: uuidv4(),
      variable_set_id: setId,
      key: e.key,
      value: e.sensitive ? null : (e.value ?? null),
      sensitive: e.sensitive ?? false,
      hcl: e.hcl ?? false,
      category: e.category ?? 'terraform',
      description: e.description ?? null,
      ci_secret_name: e.ci_secret_name ?? null,
    }));

    await this.knex('variable_set_entries').insert(rows);

    return this.listVariableSetEntries(setId);
  }

  async deleteVariableSetEntry(
    setId: string,
    key: string,
    category: 'terraform' | 'env' = 'terraform',
  ): Promise<void> {
    await this.knex('variable_set_entries')
      .where({ variable_set_id: setId, key, category })
      .del();
  }

  // ── Cloud Integration Bindings ────────────────────────────────────

  async bindCloudIntegrationToEnv(
    envId: string,
    integrationId: string,
    priority: number = 0,
  ): Promise<CloudIntegrationBindingRow> {
    const [row] = await this.knex('environment_cloud_integrations')
      .insert({
        id: uuidv4(),
        environment_id: envId,
        cloud_integration_id: integrationId,
        priority,
      })
      .returning('*');
    return row;
  }

  async unbindCloudIntegrationFromEnv(bindingId: string): Promise<void> {
    await this.knex('environment_cloud_integrations').where({ id: bindingId }).del();
  }

  async listEnvCloudIntegrations(
    envId: string,
  ): Promise<Array<CloudIntegrationRow & { binding_id: string; priority: number }>> {
    const rows = await this.knex('environment_cloud_integrations as b')
      .join('cloud_integrations as ci', 'b.cloud_integration_id', 'ci.id')
      .where('b.environment_id', envId)
      .orderBy('b.priority', 'asc')
      .select('ci.*', 'b.id as binding_id', 'b.priority');
    return rows.map((r: any) => ({
      ...this.parseCloudIntegrationRow(r),
      binding_id: r.binding_id,
      priority: Number(r.priority),
    }));
  }

  async bindCloudIntegrationToModule(
    moduleId: string,
    integrationId: string,
    priority: number = 0,
  ): Promise<CloudIntegrationBindingRow> {
    const [row] = await this.knex('module_cloud_integrations')
      .insert({
        id: uuidv4(),
        module_id: moduleId,
        cloud_integration_id: integrationId,
        priority,
      })
      .returning('*');
    return row;
  }

  async unbindCloudIntegrationFromModule(bindingId: string): Promise<void> {
    await this.knex('module_cloud_integrations').where({ id: bindingId }).del();
  }

  async listModuleCloudIntegrations(
    moduleId: string,
  ): Promise<Array<CloudIntegrationRow & { binding_id: string; priority: number }>> {
    const rows = await this.knex('module_cloud_integrations as b')
      .join('cloud_integrations as ci', 'b.cloud_integration_id', 'ci.id')
      .where('b.module_id', moduleId)
      .orderBy('b.priority', 'asc')
      .select('ci.*', 'b.id as binding_id', 'b.priority');
    return rows.map((r: any) => ({
      ...this.parseCloudIntegrationRow(r),
      binding_id: r.binding_id,
      priority: Number(r.priority),
    }));
  }

  // ── Variable Set Bindings ─────────────────────────────────────────

  async bindVariableSetToEnv(
    envId: string,
    setId: string,
    priority: number = 0,
  ): Promise<VariableSetBindingRow> {
    const [row] = await this.knex('environment_variable_sets')
      .insert({
        id: uuidv4(),
        environment_id: envId,
        variable_set_id: setId,
        priority,
      })
      .returning('*');
    return row;
  }

  async unbindVariableSetFromEnv(bindingId: string): Promise<void> {
    await this.knex('environment_variable_sets').where({ id: bindingId }).del();
  }

  async listEnvVariableSets(
    envId: string,
  ): Promise<Array<VariableSetRow & { binding_id: string; priority: number }>> {
    const rows = await this.knex('environment_variable_sets as b')
      .join('variable_sets as vs', 'b.variable_set_id', 'vs.id')
      .where('b.environment_id', envId)
      .orderBy('b.priority', 'asc')
      .select('vs.*', 'b.id as binding_id', 'b.priority');
    return rows.map((r: any) => ({
      ...this.parseVariableSetRow(r),
      binding_id: r.binding_id,
      priority: Number(r.priority),
    }));
  }

  async bindVariableSetToModule(
    moduleId: string,
    setId: string,
    priority: number = 0,
  ): Promise<VariableSetBindingRow> {
    const [row] = await this.knex('module_variable_sets')
      .insert({
        id: uuidv4(),
        module_id: moduleId,
        variable_set_id: setId,
        priority,
      })
      .returning('*');
    return row;
  }

  async unbindVariableSetFromModule(bindingId: string): Promise<void> {
    await this.knex('module_variable_sets').where({ id: bindingId }).del();
  }

  async listModuleVariableSets(
    moduleId: string,
  ): Promise<Array<VariableSetRow & { binding_id: string; priority: number }>> {
    const rows = await this.knex('module_variable_sets as b')
      .join('variable_sets as vs', 'b.variable_set_id', 'vs.id')
      .where('b.module_id', moduleId)
      .orderBy('b.priority', 'asc')
      .select('vs.*', 'b.id as binding_id', 'b.priority');
    return rows.map((r: any) => ({
      ...this.parseVariableSetRow(r),
      binding_id: r.binding_id,
      priority: Number(r.priority),
    }));
  }

  // ── Effective Resolution (module-level overrides env-level) ────────

  async getEffectiveCloudIntegrations(
    moduleId: string,
    envId: string,
  ): Promise<Array<CloudIntegrationRow & { priority: number }>> {
    // Module-level bindings override env-level entirely
    const moduleBindings = await this.listModuleCloudIntegrations(moduleId);
    if (moduleBindings.length > 0) {
      return moduleBindings;
    }
    return this.listEnvCloudIntegrations(envId);
  }

  async getEffectiveVariableSets(
    moduleId: string,
    envId: string,
  ): Promise<Array<VariableSetRow & { priority: number }>> {
    const moduleBindings = await this.listModuleVariableSets(moduleId);
    if (moduleBindings.length > 0) {
      return moduleBindings;
    }
    return this.listEnvVariableSets(envId);
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private isPostgres(): boolean {
    const client = this.knex.client.config.client;
    return client === 'pg' || client === 'postgresql';
  }

  private parseArtifactRow(row: any): ArtifactRow {
    return {
      ...row,
      storage_config: typeof row.storage_config === 'string'
        ? JSON.parse(row.storage_config)
        : row.storage_config,
      approval_policy: row.approval_policy
        ? (typeof row.approval_policy === 'string'
          ? JSON.parse(row.approval_policy)
          : row.approval_policy)
        : null,
      source_config: row.source_config
        ? (typeof row.source_config === 'string'
          ? JSON.parse(row.source_config)
          : row.source_config)
        : null,
      tags: row.tags
        ? (typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags)
        : [],
      download_count: Number(row.download_count),
    };
  }

  private parseRunRow(row: any): RunRow {
    return {
      ...row,
      variables: row.variables
        ? (typeof row.variables === 'string'
          ? JSON.parse(row.variables)
          : row.variables)
        : null,
      env_vars: row.env_vars
        ? (typeof row.env_vars === 'string'
          ? JSON.parse(row.env_vars)
          : row.env_vars)
        : null,
      exit_code: row.exit_code != null ? Number(row.exit_code) : null,
      resources_to_add: row.resources_to_add != null ? Number(row.resources_to_add) : null,
      resources_to_change: row.resources_to_change != null ? Number(row.resources_to_change) : null,
      resources_to_destroy: row.resources_to_destroy != null ? Number(row.resources_to_destroy) : null,
      duration_seconds: row.duration_seconds != null ? Number(row.duration_seconds) : null,
    };
  }

  private parseEnvironmentRow(row: any): EnvironmentRow {
    return {
      ...row,
      locked: Boolean(row.locked),
      module_count: Number(row.module_count),
      total_resources: Number(row.total_resources),
    };
  }

  private parseEnvironmentModuleRow(row: any): EnvironmentModuleRow {
    return {
      ...row,
      auto_plan_on_module_update: Boolean(row.auto_plan_on_module_update),
      auto_plan_on_push: Boolean(row.auto_plan_on_push),
      vcs_trigger: row.vcs_trigger
        ? typeof row.vcs_trigger === 'string'
          ? JSON.parse(row.vcs_trigger)
          : row.vcs_trigger
        : null,
      state_backend: row.state_backend
        ? typeof row.state_backend === 'string'
          ? JSON.parse(row.state_backend)
          : row.state_backend
        : null,
      resource_count: Number(row.resource_count ?? 0),
    };
  }

  private parseModuleRunRow(row: any): ModuleRunRow {
    return {
      ...row,
      variables_snapshot: row.variables_snapshot
        ? typeof row.variables_snapshot === 'string'
          ? JSON.parse(row.variables_snapshot)
          : row.variables_snapshot
        : null,
      env_vars_snapshot: row.env_vars_snapshot
        ? typeof row.env_vars_snapshot === 'string'
          ? JSON.parse(row.env_vars_snapshot)
          : row.env_vars_snapshot
        : null,
      state_backend_snapshot: row.state_backend_snapshot
        ? typeof row.state_backend_snapshot === 'string'
          ? JSON.parse(row.state_backend_snapshot)
          : row.state_backend_snapshot
        : null,
      tf_outputs: row.tf_outputs
        ? typeof row.tf_outputs === 'string'
          ? JSON.parse(row.tf_outputs)
          : row.tf_outputs
        : null,
      exit_code: row.exit_code != null ? Number(row.exit_code) : null,
      resources_to_add: row.resources_to_add != null ? Number(row.resources_to_add) : null,
      resources_to_change: row.resources_to_change != null ? Number(row.resources_to_change) : null,
      resources_to_destroy: row.resources_to_destroy != null ? Number(row.resources_to_destroy) : null,
      resource_count_after: row.resource_count_after != null ? Number(row.resource_count_after) : null,
      duration_seconds: row.duration_seconds != null ? Number(row.duration_seconds) : null,
      auto_confirmed: Boolean(row.auto_confirmed),
    };
  }

  private parseEnvironmentRunRow(row: any): EnvironmentRunRow {
    return {
      ...row,
      execution_order: row.execution_order
        ? typeof row.execution_order === 'string'
          ? JSON.parse(row.execution_order)
          : row.execution_order
        : null,
      total_modules: Number(row.total_modules),
      completed_modules: Number(row.completed_modules),
      failed_modules: Number(row.failed_modules),
      skipped_modules: Number(row.skipped_modules),
      duration_seconds: row.duration_seconds != null ? Number(row.duration_seconds) : null,
    };
  }

  private parseCloudIntegrationRow(row: any): CloudIntegrationRow {
    return {
      ...row,
      credential_config: row.credential_config
        ? typeof row.credential_config === 'string'
          ? JSON.parse(row.credential_config)
          : row.credential_config
        : {},
      supported_ci_providers: row.supported_ci_providers
        ? typeof row.supported_ci_providers === 'string'
          ? JSON.parse(row.supported_ci_providers)
          : row.supported_ci_providers
        : null,
    };
  }

  private parseVariableSetRow(row: any): VariableSetRow {
    return {
      ...row,
      auto_attach: Boolean(row.auto_attach),
    };
  }

  private parseVariableSetEntryRow(row: any): VariableSetEntryRow {
    return {
      ...row,
      sensitive: Boolean(row.sensitive),
      hcl: Boolean(row.hcl),
    };
  }

  private parseVersionRow(row: any): VersionRow {
    return {
      ...row,
      terraform_metadata: row.terraform_metadata
        ? (typeof row.terraform_metadata === 'string'
          ? JSON.parse(row.terraform_metadata)
          : row.terraform_metadata)
        : null,
      helm_metadata: row.helm_metadata
        ? (typeof row.helm_metadata === 'string'
          ? JSON.parse(row.helm_metadata)
          : row.helm_metadata)
        : null,
      opa_metadata: row.opa_metadata
        ? (typeof row.opa_metadata === 'string'
          ? JSON.parse(row.opa_metadata)
          : row.opa_metadata)
        : null,
      storage_ref: row.storage_ref
        ? (typeof row.storage_ref === 'string'
          ? JSON.parse(row.storage_ref)
          : row.storage_ref)
        : null,
      examples: row.examples
        ? (typeof row.examples === 'string'
          ? JSON.parse(row.examples)
          : row.examples)
        : null,
      dependencies: row.dependencies
        ? (typeof row.dependencies === 'string'
          ? JSON.parse(row.dependencies)
          : row.dependencies)
        : null,
      size_bytes: row.size_bytes ? Number(row.size_bytes) : null,
      is_latest: Boolean(row.is_latest),
      is_bad: Boolean(row.is_bad),
    };
  }

  // ── Policy Templates ──────────────────────────────────────────────

  async listPolicyTemplates(options?: {
    team?: string;
  }): Promise<PolicyTemplateRow[]> {
    let query = this.knex<PolicyTemplateRow>('policy_templates');
    if (options?.team) {
      query = query.where(function () {
        this.where('team', options.team!).orWhereNull('team');
      });
    }
    const rows = await query.orderBy('name', 'asc');
    return rows.map(r => this.parsePolicyTemplateRow(r));
  }

  async getPolicyTemplate(id: string): Promise<PolicyTemplateRow | null> {
    const row = await this.knex<PolicyTemplateRow>('policy_templates')
      .where({ id })
      .first();
    return row ? this.parsePolicyTemplateRow(row) : null;
  }

  async createPolicyTemplate(data: {
    name: string;
    description?: string;
    enforcement_level: EnforcementLevel;
    rules: ApprovalPolicy;
    team?: string;
    created_by?: string;
  }): Promise<PolicyTemplateRow> {
    const id = uuidv4();
    await this.knex('policy_templates').insert({
      id,
      name: data.name,
      description: data.description ?? null,
      enforcement_level: data.enforcement_level,
      rules: JSON.stringify(data.rules),
      team: data.team ?? null,
      created_by: data.created_by ?? null,
    });
    return (await this.getPolicyTemplate(id))!;
  }

  async updatePolicyTemplate(
    id: string,
    data: {
      name?: string;
      description?: string;
      enforcement_level?: EnforcementLevel;
      rules?: ApprovalPolicy;
    },
  ): Promise<PolicyTemplateRow | null> {
    const updates: Record<string, unknown> = {
      updated_at: this.knex.fn.now(),
    };
    if (data.name !== undefined) updates.name = data.name;
    if (data.description !== undefined) updates.description = data.description;
    if (data.enforcement_level !== undefined)
      updates.enforcement_level = data.enforcement_level;
    if (data.rules !== undefined) updates.rules = JSON.stringify(data.rules);

    await this.knex('policy_templates').where({ id }).update(updates);
    return this.getPolicyTemplate(id);
  }

  async deletePolicyTemplate(id: string): Promise<boolean> {
    const count = await this.knex('policy_templates').where({ id }).del();
    return count > 0;
  }

  // ── Policy Bindings ───────────────────────────────────────────────

  async listPolicyBindings(policyTemplateId: string): Promise<PolicyBindingRow[]> {
    return this.knex<PolicyBindingRow>('policy_bindings')
      .where({ policy_template_id: policyTemplateId })
      .orderBy('created_at', 'asc');
  }

  async createPolicyBinding(data: {
    policy_template_id: string;
    scope_type: PolicyScopeType;
    scope_value?: string;
    created_by?: string;
  }): Promise<PolicyBindingRow> {
    const id = uuidv4();
    await this.knex('policy_bindings').insert({
      id,
      policy_template_id: data.policy_template_id,
      scope_type: data.scope_type,
      scope_value: data.scope_value ?? null,
      created_by: data.created_by ?? null,
    });
    return (await this.knex<PolicyBindingRow>('policy_bindings')
      .where({ id })
      .first())!;
  }

  async deletePolicyBinding(id: string): Promise<boolean> {
    const count = await this.knex('policy_bindings').where({ id }).del();
    return count > 0;
  }

  /**
   * Get all policy templates bound to a specific scope.
   * Used by the policy resolver to collect applicable policies.
   */
  async getPoliciesForScope(
    scopeType: PolicyScopeType,
    scopeValue?: string,
  ): Promise<PolicyTemplateRow[]> {
    const query = this.knex<PolicyTemplateRow>('policy_templates')
      .join(
        'policy_bindings',
        'policy_templates.id',
        'policy_bindings.policy_template_id',
      )
      .where('policy_bindings.scope_type', scopeType);

    if (scopeValue) {
      query.where('policy_bindings.scope_value', scopeValue);
    } else {
      query.whereNull('policy_bindings.scope_value');
    }

    const rows = await query.select('policy_templates.*');
    return rows.map(r => this.parsePolicyTemplateRow(r));
  }

  // ── Policy Evaluations ────────────────────────────────────────────

  async createPolicyEvaluation(data: {
    artifact_id?: string;
    version_id?: string;
    trigger: PolicyEvaluationTrigger;
    enforcement_level: EnforcementLevel;
    rules_evaluated: PolicyRuleResult[];
    outcome: PolicyEvaluationOutcome;
    overridden_by?: string;
    actor?: string;
  }): Promise<PolicyEvaluationRow> {
    const id = uuidv4();
    await this.knex('policy_evaluations').insert({
      id,
      artifact_id: data.artifact_id ?? null,
      version_id: data.version_id ?? null,
      trigger: data.trigger,
      enforcement_level: data.enforcement_level,
      rules_evaluated: JSON.stringify(data.rules_evaluated),
      outcome: data.outcome,
      overridden_by: data.overridden_by ?? null,
      actor: data.actor ?? null,
    });
    return (await this.knex<PolicyEvaluationRow>('policy_evaluations')
      .where({ id })
      .first())!;
  }

  async listPolicyEvaluations(options?: {
    artifact_id?: string;
    version_id?: string;
    outcome?: PolicyEvaluationOutcome;
    limit?: number;
    since?: string;
  }): Promise<PolicyEvaluationRow[]> {
    let query = this.knex<PolicyEvaluationRow>('policy_evaluations');
    if (options?.artifact_id) query = query.where('artifact_id', options.artifact_id);
    if (options?.version_id) query = query.where('version_id', options.version_id);
    if (options?.outcome) query = query.where('outcome', options.outcome);
    if (options?.since) query = query.where('evaluated_at', '>=', options.since);
    const rows = await query
      .orderBy('evaluated_at', 'desc')
      .limit(options?.limit ?? 100);
    return rows.map(r => ({
      ...r,
      rules_evaluated:
        typeof r.rules_evaluated === 'string'
          ? JSON.parse(r.rules_evaluated)
          : r.rules_evaluated,
    }));
  }

  /**
   * Delete evaluations older than the specified date.
   * Called periodically for retention management.
   * Deletes in batches to avoid long-running transactions.
   */
  async sweepOldEvaluations(olderThan: string, batchSize: number = 1000): Promise<number> {
    let totalDeleted = 0;
    let deleted: number;
    do {
      const ids = await this.knex('policy_evaluations')
        .where('evaluated_at', '<', olderThan)
        .select('id')
        .limit(batchSize);
      if (ids.length === 0) break;
      deleted = await this.knex('policy_evaluations')
        .whereIn('id', ids.map(r => r.id))
        .del();
      totalDeleted += deleted;
    } while (deleted === batchSize);
    return totalDeleted;
  }

  private parsePolicyTemplateRow(row: any): PolicyTemplateRow {
    return {
      ...row,
      rules:
        typeof row.rules === 'string' ? JSON.parse(row.rules) : row.rules,
    };
  }
}
