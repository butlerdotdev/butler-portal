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
import { v4 as uuidv4 } from 'uuid';
import type {
  PipelineRow,
  PipelineVersionRow,
  PipelineAuditRow,
  PipelineAgentRow,
  PipelineStatus,
  PipelineDag,
  PipelineListOptions,
  AuditListOptions,
  PaginatedResult,
  FleetTokenRow,
  FleetAgentRow,
  FleetGroupRow,
  PipelineDeploymentRow,
  ManagedConfigRow,
  ManagedConfigScopeType,
  FleetTokenListOptions,
  FleetAgentListOptions,
  FleetGroupListOptions,
  DeploymentListOptions,
  ConfigSyncResult,
} from './types';
import { decodeCursor, encodeCursor } from '../util/pagination';
import { conflict } from '../util/errors';

export class PipelineDatabase {
  constructor(private readonly knex: Knex) {}

  // ── Pipelines ──────────────────────────────────────────────────────

  async listPipelines(
    options: PipelineListOptions,
  ): Promise<PaginatedResult<PipelineRow>> {
    let query = this.knex<PipelineRow>('pipelines');

    if (options.team) {
      query = query.where('team', options.team);
    }
    if (options.status) {
      query = query.where('status', options.status);
    } else {
      query = query.where('status', '!=', 'archived');
    }
    if (options.search) {
      query = query.where(function () {
        this.where('name', 'like', `%${options.search}%`).orWhere(
          'description',
          'like',
          `%${options.search}%`,
        );
      });
    }

    const countResult = (await query
      .clone()
      .count('* as count')
      .first()) as { count: string | number } | undefined;
    const totalCount = Number(countResult?.count ?? 0);

    const sortBy = options.sortBy ?? 'created_at';
    const sortOrder = options.sortOrder ?? 'desc';
    const limit = Math.min(options.limit ?? 50, 200);

    if (options.cursor) {
      const decoded = decodeCursor(options.cursor);
      if (decoded) {
        if (sortOrder === 'desc') {
          query = query.where(function () {
            this.where(sortBy, '<', decoded.value).orWhere(function () {
              this.where(sortBy, decoded.value).where('id', '<', decoded.id);
            });
          });
        } else {
          query = query.where(function () {
            this.where(sortBy, '>', decoded.value).orWhere(function () {
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
    const nextCursor =
      hasMore && items.length > 0
        ? encodeCursor(
            String((items[items.length - 1] as any)[sortBy]),
            items[items.length - 1].id,
          )
        : null;

    return { items, nextCursor, totalCount };
  }

  async getPipeline(id: string): Promise<PipelineRow | null> {
    const row = await this.knex<PipelineRow>('pipelines')
      .where({ id })
      .first();
    return row ?? null;
  }

  async getPipelineByName(
    team: string,
    name: string,
  ): Promise<PipelineRow | null> {
    const row = await this.knex<PipelineRow>('pipelines')
      .where({ team, name })
      .first();
    return row ?? null;
  }

  async createPipeline(data: {
    name: string;
    description?: string;
    team: string;
    created_by: string;
  }): Promise<PipelineRow> {
    try {
      const [row] = await this.knex('pipelines')
        .insert({
          id: uuidv4(),
          name: data.name,
          description: data.description ?? null,
          team: data.team,
          status: 'active' as PipelineStatus,
          created_by: data.created_by,
        })
        .returning('*');
      return row;
    } catch (err: any) {
      if (
        err?.message?.includes('UNIQUE constraint') ||
        err?.code === '23505'
      ) {
        throw conflict(
          'PIPELINE_ALREADY_EXISTS',
          `Pipeline "${data.name}" already exists for team "${data.team}"`,
        );
      }
      throw err;
    }
  }

  async updatePipeline(
    id: string,
    data: Partial<{
      name: string;
      description: string | null;
    }>,
  ): Promise<PipelineRow | null> {
    const update: Record<string, unknown> = {
      updated_at: this.knex.fn.now(),
    };
    if (data.name !== undefined) update.name = data.name;
    if (data.description !== undefined) update.description = data.description;

    const [row] = await this.knex('pipelines')
      .where({ id })
      .update(update)
      .returning('*');
    return row ?? null;
  }

  async archivePipeline(id: string): Promise<PipelineRow | null> {
    const [row] = await this.knex('pipelines')
      .where({ id })
      .update({
        status: 'archived' as PipelineStatus,
        updated_at: this.knex.fn.now(),
      })
      .returning('*');
    return row ?? null;
  }

  // ── Pipeline Agents (many-to-many for HA aggregators) ─────────────

  async addPipelineAgent(
    pipelineId: string,
    agentId: string,
  ): Promise<PipelineAgentRow> {
    const existing = await this.knex<PipelineAgentRow>('pipeline_agents')
      .where({ pipeline_id: pipelineId, agent_id: agentId })
      .first();
    if (existing) return existing;

    const [row] = await this.knex('pipeline_agents')
      .insert({
        id: uuidv4(),
        pipeline_id: pipelineId,
        agent_id: agentId,
      })
      .returning('*');
    return row;
  }

  async removePipelineAgent(
    pipelineId: string,
    agentId: string,
  ): Promise<void> {
    await this.knex('pipeline_agents')
      .where({ pipeline_id: pipelineId, agent_id: agentId })
      .delete();
  }

  async getPipelineAgents(
    pipelineId: string,
  ): Promise<Array<FleetAgentRow & { joined_at: string }>> {
    const rows = await this.knex('pipeline_agents')
      .join('fleet_agents', 'pipeline_agents.agent_id', 'fleet_agents.id')
      .where('pipeline_agents.pipeline_id', pipelineId)
      .select('fleet_agents.*', 'pipeline_agents.joined_at')
      .orderBy('pipeline_agents.joined_at', 'asc');
    return rows.map((r: any) => ({
      ...r,
      labels: typeof r.labels === 'string' ? JSON.parse(r.labels) : r.labels ?? {},
      errors: typeof r.errors === 'string' ? JSON.parse(r.errors) : r.errors ?? [],
      config_sync_result:
        typeof r.config_sync_result === 'string'
          ? JSON.parse(r.config_sync_result)
          : r.config_sync_result ?? null,
    }));
  }

  async getPipelineAgentCount(pipelineId: string): Promise<number> {
    const [{ count }] = await this.knex('pipeline_agents')
      .where({ pipeline_id: pipelineId })
      .count('* as count');
    return Number(count);
  }

  async getPipelineForAgent(agentId: string): Promise<PipelineRow | null> {
    const row = await this.knex('pipeline_agents')
      .join('pipelines', 'pipeline_agents.pipeline_id', 'pipelines.id')
      .where('pipeline_agents.agent_id', agentId)
      .select('pipelines.*')
      .first();
    return row ?? null;
  }

  // ── Versions ───────────────────────────────────────────────────────

  async listVersions(pipelineId: string): Promise<PipelineVersionRow[]> {
    const rows = await this.knex<PipelineVersionRow>('pipeline_versions')
      .where({ pipeline_id: pipelineId })
      .orderBy('version', 'desc')
      .select('*');
    return rows.map(r => this.parseVersionRow(r));
  }

  async getVersion(
    pipelineId: string,
    version: number,
  ): Promise<PipelineVersionRow | null> {
    const row = await this.knex<PipelineVersionRow>('pipeline_versions')
      .where({ pipeline_id: pipelineId, version })
      .first();
    return row ? this.parseVersionRow(row) : null;
  }

  async getVersionById(id: string): Promise<PipelineVersionRow | null> {
    const row = await this.knex<PipelineVersionRow>('pipeline_versions')
      .where({ id })
      .first();
    return row ? this.parseVersionRow(row) : null;
  }

  async getLatestVersion(
    pipelineId: string,
  ): Promise<PipelineVersionRow | null> {
    const row = await this.knex<PipelineVersionRow>('pipeline_versions')
      .where({ pipeline_id: pipelineId })
      .orderBy('version', 'desc')
      .first();
    return row ? this.parseVersionRow(row) : null;
  }

  async createVersion(data: {
    pipeline_id: string;
    dag: PipelineDag;
    vector_config: string;
    config_hash: string;
    metadata?: Record<string, unknown>;
    change_summary?: string;
    created_by: string;
  }): Promise<PipelineVersionRow> {
    const nextVersion = await this.getNextVersionNumber(data.pipeline_id);

    const [row] = await this.knex('pipeline_versions')
      .insert({
        id: uuidv4(),
        pipeline_id: data.pipeline_id,
        version: nextVersion,
        dag: JSON.stringify(data.dag),
        vector_config: data.vector_config,
        config_hash: data.config_hash,
        metadata: data.metadata ? JSON.stringify(data.metadata) : null,
        change_summary: data.change_summary ?? null,
        created_by: data.created_by,
      })
      .returning('*');

    await this.knex('pipelines')
      .where({ id: data.pipeline_id })
      .update({ updated_at: this.knex.fn.now() });

    return this.parseVersionRow(row);
  }

  private async getNextVersionNumber(pipelineId: string): Promise<number> {
    const result = (await this.knex('pipeline_versions')
      .where({ pipeline_id: pipelineId })
      .max('version as max_version')
      .first()) as { max_version: number | null } | undefined;
    return (result?.max_version ?? 0) + 1;
  }

  // ── Audit Log ──────────────────────────────────────────────────────

  async writeAuditLog(data: {
    team: string;
    action: string;
    entity_type: string;
    entity_id?: string;
    actor: string;
    details?: Record<string, unknown>;
  }): Promise<void> {
    await this.knex('pipeline_audit_log').insert({
      id: uuidv4(),
      team: data.team,
      action: data.action,
      entity_type: data.entity_type,
      entity_id: data.entity_id ?? null,
      actor: data.actor,
      details: data.details ? JSON.stringify(data.details) : null,
    });
  }

  async listAuditLogs(
    options: AuditListOptions,
  ): Promise<PaginatedResult<PipelineAuditRow>> {
    let query = this.knex<PipelineAuditRow>('pipeline_audit_log');

    if (options.team) {
      query = query.where('team', options.team);
    }
    if (options.entityType) {
      query = query.where('entity_type', options.entityType);
    }
    if (options.entityId) {
      query = query.where('entity_id', options.entityId);
    }

    const countResult = (await query
      .clone()
      .count('* as count')
      .first()) as { count: string | number } | undefined;
    const totalCount = Number(countResult?.count ?? 0);

    const limit = Math.min(options.limit ?? 50, 200);

    if (options.cursor) {
      const decoded = decodeCursor(options.cursor);
      if (decoded) {
        query = query.where(function () {
          this.where('occurred_at', '<', decoded.value).orWhere(function () {
            this.where('occurred_at', decoded.value).where(
              'id',
              '<',
              decoded.id,
            );
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
    const nextCursor =
      hasMore && items.length > 0
        ? encodeCursor(
            items[items.length - 1].occurred_at,
            items[items.length - 1].id,
          )
        : null;

    return {
      items: items.map(r => this.parseAuditRow(r)),
      nextCursor,
      totalCount,
    };
  }

  // ── Fleet Tokens ──────────────────────────────────────────────────

  async listFleetTokens(
    options: FleetTokenListOptions,
  ): Promise<FleetTokenRow[]> {
    const query = this.knex<FleetTokenRow>('fleet_tokens')
      .whereNull('revoked_at')
      .orderBy('created_at', 'desc')
      .select('*');
    if (options.team) {
      query.where('team', options.team);
    }
    return query;
  }

  async getFleetTokenByHash(
    tokenHash: string,
  ): Promise<FleetTokenRow | null> {
    const row = await this.knex<FleetTokenRow>('fleet_tokens')
      .where('token_hash', tokenHash)
      .first();
    return row ?? null;
  }

  async createFleetToken(data: {
    team: string;
    name: string;
    token_prefix: string;
    token_hash: string;
    created_by: string;
    expires_at?: string;
  }): Promise<FleetTokenRow> {
    try {
      const [row] = await this.knex('fleet_tokens')
        .insert({
          id: uuidv4(),
          team: data.team,
          name: data.name,
          token_prefix: data.token_prefix,
          token_hash: data.token_hash,
          created_by: data.created_by,
          expires_at: data.expires_at ?? null,
        })
        .returning('*');
      return row;
    } catch (err: any) {
      if (
        err?.message?.includes('UNIQUE constraint') ||
        err?.code === '23505'
      ) {
        throw conflict(
          'PIPELINE_ALREADY_EXISTS',
          `Fleet token "${data.name}" already exists for team "${data.team}"`,
        );
      }
      throw err;
    }
  }

  async revokeFleetToken(id: string): Promise<FleetTokenRow | null> {
    const [row] = await this.knex('fleet_tokens')
      .where({ id })
      .delete()
      .returning('*');
    return row ?? null;
  }

  // ── Fleet Agents ─────────────────────────────────────────────────

  async listFleetAgents(
    options: FleetAgentListOptions,
  ): Promise<PaginatedResult<FleetAgentRow>> {
    let query = this.knex<FleetAgentRow>('fleet_agents');
    if (options.team) {
      query = query.where('team', options.team);
    }

    if (options.status) {
      query = query.where('status', options.status);
    }

    if (options.labelKey && options.labelValue) {
      if (this.isPostgres()) {
        query = query.whereRaw('labels->>? = ?', [
          options.labelKey,
          options.labelValue,
        ]);
      } else {
        query = query.whereRaw("json_extract(labels, '$.' || ?) = ?", [
          options.labelKey,
          options.labelValue,
        ]);
      }
    }

    const countResult = (await query
      .clone()
      .count('* as count')
      .first()) as { count: string | number } | undefined;
    const totalCount = Number(countResult?.count ?? 0);

    const limit = Math.min(options.limit ?? 50, 200);

    if (options.cursor) {
      const decoded = decodeCursor(options.cursor);
      if (decoded) {
        query = query.where(function () {
          this.where('registered_at', '<', decoded.value).orWhere(
            function () {
              this.where('registered_at', decoded.value).where(
                'id',
                '<',
                decoded.id,
              );
            },
          );
        });
      }
    }

    const rows = await query
      .orderBy('registered_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1)
      .select('*');

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && items.length > 0
        ? encodeCursor(
            items[items.length - 1].registered_at,
            items[items.length - 1].id,
          )
        : null;

    return {
      items: items.map(r => this.parseFleetAgentRow(r)),
      nextCursor,
      totalCount,
    };
  }

  async getFleetAgent(id: string): Promise<FleetAgentRow | null> {
    const row = await this.knex<FleetAgentRow>('fleet_agents')
      .where({ id })
      .first();
    return row ? this.parseFleetAgentRow(row) : null;
  }

  async getFleetAgentByAgentId(
    team: string,
    agentId: string,
  ): Promise<FleetAgentRow | null> {
    const row = await this.knex<FleetAgentRow>('fleet_agents')
      .where({ team, agent_id: agentId })
      .first();
    return row ? this.parseFleetAgentRow(row) : null;
  }

  async registerFleetAgent(data: {
    team: string;
    agent_id: string;
    hostname?: string;
    ip_address?: string;
    labels: Record<string, string>;
    vector_version?: string;
    vector_config_path?: string;
    vector_config_content?: string;
    os?: string;
    arch?: string;
    fleet_token_id: string;
  }): Promise<FleetAgentRow> {
    const existing = await this.getFleetAgentByAgentId(
      data.team,
      data.agent_id,
    );

    if (existing) {
      const update: Record<string, unknown> = {
        hostname: data.hostname ?? existing.hostname,
        ip_address: data.ip_address ?? existing.ip_address,
        labels: JSON.stringify(data.labels),
        vector_version: data.vector_version ?? existing.vector_version,
        vector_config_path:
          data.vector_config_path ?? existing.vector_config_path,
        os: data.os ?? existing.os,
        arch: data.arch ?? existing.arch,
        fleet_token_id: data.fleet_token_id,
        status: 'online',
        last_heartbeat_at: this.knex.fn.now(),
        updated_at: this.knex.fn.now(),
      };
      if (data.vector_config_content) {
        update.vector_config_content = data.vector_config_content;
      }
      const [row] = await this.knex('fleet_agents')
        .where({ id: existing.id })
        .update(update)
        .returning('*');
      return this.parseFleetAgentRow(row);
    }

    const [row] = await this.knex('fleet_agents')
      .insert({
        id: uuidv4(),
        team: data.team,
        agent_id: data.agent_id,
        hostname: data.hostname ?? null,
        ip_address: data.ip_address ?? null,
        labels: JSON.stringify(data.labels),
        vector_version: data.vector_version ?? null,
        vector_config_path: data.vector_config_path ?? null,
        vector_config_content: data.vector_config_content ?? null,
        os: data.os ?? null,
        arch: data.arch ?? null,
        status: 'pending',
        fleet_token_id: data.fleet_token_id,
        errors: JSON.stringify([]),
      })
      .returning('*');
    return this.parseFleetAgentRow(row);
  }

  async updateFleetAgent(
    id: string,
    data: Partial<{
      labels: Record<string, string>;
      status: string;
      current_config_hash: string;
      config_sync_result: ConfigSyncResult;
      last_heartbeat_at: string;
      errors: Array<{ message: string; timestamp: string }>;
    }>,
  ): Promise<FleetAgentRow | null> {
    const update: Record<string, unknown> = {
      updated_at: this.knex.fn.now(),
    };
    if (data.labels !== undefined)
      update.labels = JSON.stringify(data.labels);
    if (data.status !== undefined) update.status = data.status;
    if (data.current_config_hash !== undefined)
      update.current_config_hash = data.current_config_hash;
    if (data.config_sync_result !== undefined)
      update.config_sync_result = JSON.stringify(data.config_sync_result);
    if (data.last_heartbeat_at !== undefined)
      update.last_heartbeat_at = data.last_heartbeat_at;
    if (data.errors !== undefined)
      update.errors = JSON.stringify(data.errors);

    const [row] = await this.knex('fleet_agents')
      .where({ id })
      .update(update)
      .returning('*');
    return row ? this.parseFleetAgentRow(row) : null;
  }

  async deleteFleetAgent(id: string): Promise<boolean> {
    const count = await this.knex('fleet_agents').where({ id }).delete();
    return count > 0;
  }

  // ── Fleet Groups ─────────────────────────────────────────────────

  async listFleetGroups(
    options: FleetGroupListOptions,
  ): Promise<FleetGroupRow[]> {
    const query = this.knex<FleetGroupRow>('fleet_groups')
      .orderBy('name', 'asc')
      .select('*');
    if (options.team) {
      query.where('team', options.team);
    }
    const rows = await query;
    return rows.map(r => this.parseFleetGroupRow(r));
  }

  async getFleetGroup(id: string): Promise<FleetGroupRow | null> {
    const row = await this.knex<FleetGroupRow>('fleet_groups')
      .where({ id })
      .first();
    return row ? this.parseFleetGroupRow(row) : null;
  }

  async createFleetGroup(data: {
    team: string;
    name: string;
    description?: string;
    label_selector?: Record<string, string>;
    created_by: string;
  }): Promise<FleetGroupRow> {
    try {
      const [row] = await this.knex('fleet_groups')
        .insert({
          id: uuidv4(),
          team: data.team,
          name: data.name,
          description: data.description ?? null,
          label_selector: data.label_selector
            ? JSON.stringify(data.label_selector)
            : null,
          created_by: data.created_by,
        })
        .returning('*');
      return this.parseFleetGroupRow(row);
    } catch (err: any) {
      if (
        err?.message?.includes('UNIQUE constraint') ||
        err?.code === '23505'
      ) {
        throw conflict(
          'PIPELINE_ALREADY_EXISTS',
          `Fleet group "${data.name}" already exists for team "${data.team}"`,
        );
      }
      throw err;
    }
  }

  async updateFleetGroup(
    id: string,
    data: Partial<{
      name: string;
      description: string;
      label_selector: Record<string, string>;
    }>,
  ): Promise<FleetGroupRow | null> {
    const update: Record<string, unknown> = {
      updated_at: this.knex.fn.now(),
    };
    if (data.name !== undefined) update.name = data.name;
    if (data.description !== undefined) update.description = data.description;
    if (data.label_selector !== undefined)
      update.label_selector = JSON.stringify(data.label_selector);

    const [row] = await this.knex('fleet_groups')
      .where({ id })
      .update(update)
      .returning('*');
    return row ? this.parseFleetGroupRow(row) : null;
  }

  async deleteFleetGroup(id: string): Promise<boolean> {
    const count = await this.knex('fleet_groups').where({ id }).delete();
    return count > 0;
  }

  async getGroupsMatchingAgent(
    team: string,
    agentLabels: Record<string, string>,
  ): Promise<FleetGroupRow[]> {
    const rows = await this.knex<FleetGroupRow>('fleet_groups')
      .where('team', team)
      .select('*');

    return rows
      .map(r => this.parseFleetGroupRow(r))
      .filter(g => this.matchesLabelSelector(agentLabels, g.label_selector));
  }

  // ── Deployments ──────────────────────────────────────────────────

  async listDeployments(
    options: DeploymentListOptions,
  ): Promise<PaginatedResult<PipelineDeploymentRow>> {
    let query = this.knex<PipelineDeploymentRow>(
      'pipeline_deployments',
    ).where('pipeline_id', options.pipelineId);

    if (options.status) {
      query = query.where('status', options.status);
    }

    const countResult = (await query
      .clone()
      .count('* as count')
      .first()) as { count: string | number } | undefined;
    const totalCount = Number(countResult?.count ?? 0);

    const limit = Math.min(options.limit ?? 50, 200);

    if (options.cursor) {
      const decoded = decodeCursor(options.cursor);
      if (decoded) {
        query = query.where(function () {
          this.where('deployed_at', '<', decoded.value).orWhere(
            function () {
              this.where('deployed_at', decoded.value).where(
                'id',
                '<',
                decoded.id,
              );
            },
          );
        });
      }
    }

    const rows = await query
      .orderBy('deployed_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1)
      .select('*');

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && items.length > 0
        ? encodeCursor(
            items[items.length - 1].deployed_at,
            items[items.length - 1].id,
          )
        : null;

    return { items, nextCursor, totalCount };
  }

  async getDeployment(id: string): Promise<PipelineDeploymentRow | null> {
    const row = await this.knex<PipelineDeploymentRow>(
      'pipeline_deployments',
    )
      .where({ id })
      .first();
    return row ?? null;
  }

  async createDeployment(data: {
    pipeline_id: string;
    pipeline_version_id: string;
    target_type: string;
    target_id: string;
    type?: string;
    strategy?: string;
    deployed_by: string;
  }): Promise<PipelineDeploymentRow> {
    const [row] = await this.knex('pipeline_deployments')
      .insert({
        id: uuidv4(),
        pipeline_id: data.pipeline_id,
        pipeline_version_id: data.pipeline_version_id,
        target_type: data.target_type,
        target_id: data.target_id,
        type: data.type ?? 'deploy',
        strategy: data.strategy ?? 'immediate',
        status: 'active',
        deployed_by: data.deployed_by,
      })
      .returning('*');
    return row;
  }

  async supersedeDeployment(
    id: string,
  ): Promise<PipelineDeploymentRow | null> {
    const [row] = await this.knex('pipeline_deployments')
      .where({ id })
      .update({
        status: 'superseded',
        superseded_at: this.knex.fn.now(),
      })
      .returning('*');
    return row ?? null;
  }

  async getActiveDeploymentsForAgent(
    agentId: string,
    team: string,
  ): Promise<
    Array<
      PipelineDeploymentRow & { vector_config: string; pipeline_name: string }
    >
  > {
    const agent = await this.getFleetAgentByAgentId(team, agentId);
    if (!agent) {
      return [];
    }

    // Direct agent deployments
    const directRows = await this.knex('pipeline_deployments as d')
      .join('pipeline_versions as pv', 'pv.id', 'd.pipeline_version_id')
      .join('pipelines as p', 'p.id', 'd.pipeline_id')
      .where('d.target_type', 'agent')
      .where('d.target_id', agent.id)
      .where('d.status', 'active')
      .select(
        'd.*',
        'pv.vector_config',
        'p.name as pipeline_name',
      );

    // Group-based deployments
    const matchingGroups = await this.getGroupsMatchingAgent(
      team,
      agent.labels,
    );

    let groupRows: Array<any> = [];
    if (matchingGroups.length > 0) {
      const groupIds = matchingGroups.map(g => g.id);
      groupRows = await this.knex('pipeline_deployments as d')
        .join('pipeline_versions as pv', 'pv.id', 'd.pipeline_version_id')
        .join('pipelines as p', 'p.id', 'd.pipeline_id')
        .where('d.target_type', 'group')
        .whereIn('d.target_id', groupIds)
        .where('d.status', 'active')
        .select(
          'd.*',
          'pv.vector_config',
          'p.name as pipeline_name',
        );
    }

    return [...directRows, ...groupRows];
  }

  async getActiveDeploymentsForTarget(
    targetType: string,
    targetId: string,
  ): Promise<PipelineDeploymentRow[]> {
    const rows = await this.knex<PipelineDeploymentRow>(
      'pipeline_deployments',
    )
      .where('target_type', targetType)
      .where('target_id', targetId)
      .where('status', 'active')
      .select('*');
    return rows;
  }

  async getMostRecentSupersededDeployment(
    pipelineId: string,
    targetType: string,
    targetId: string,
  ): Promise<PipelineDeploymentRow | null> {
    const row = await this.knex<PipelineDeploymentRow>(
      'pipeline_deployments',
    )
      .where('pipeline_id', pipelineId)
      .where('target_type', targetType)
      .where('target_id', targetId)
      .where('status', 'superseded')
      .orderBy('superseded_at', 'desc')
      .first();
    return row ?? null;
  }

  // ── Health ─────────────────────────────────────────────────────────

  async healthCheck(): Promise<boolean> {
    try {
      await this.knex.raw('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private isPostgres(): boolean {
    const client = this.knex.client.config.client;
    return client === 'pg' || client === 'postgresql';
  }

  private parseVersionRow(row: any): PipelineVersionRow {
    return {
      ...row,
      dag:
        typeof row.dag === 'string' ? JSON.parse(row.dag) : row.dag,
      metadata:
        row.metadata && typeof row.metadata === 'string'
          ? JSON.parse(row.metadata)
          : row.metadata,
    };
  }

  private parseAuditRow(row: any): PipelineAuditRow {
    return {
      ...row,
      details:
        row.details && typeof row.details === 'string'
          ? JSON.parse(row.details)
          : row.details,
    };
  }

  private parseFleetAgentRow(row: any): FleetAgentRow {
    return {
      ...row,
      labels:
        typeof row.labels === 'string'
          ? JSON.parse(row.labels)
          : row.labels ?? {},
      config_sync_result:
        row.config_sync_result && typeof row.config_sync_result === 'string'
          ? JSON.parse(row.config_sync_result)
          : row.config_sync_result ?? null,
      errors:
        typeof row.errors === 'string'
          ? JSON.parse(row.errors)
          : row.errors ?? [],
    };
  }

  private parseFleetGroupRow(row: any): FleetGroupRow {
    return {
      ...row,
      label_selector:
        row.label_selector && typeof row.label_selector === 'string'
          ? JSON.parse(row.label_selector)
          : row.label_selector ?? null,
    };
  }

  private matchesLabelSelector(
    agentLabels: Record<string, string>,
    selector: Record<string, string> | null,
  ): boolean {
    if (!selector || Object.keys(selector).length === 0) {
      return true;
    }
    return Object.entries(selector).every(
      ([key, value]) => agentLabels[key] === value,
    );
  }

  // ── Managed Configs ──────────────────────────────────────────────────

  async getLatestManagedConfig(
    scopeType: ManagedConfigScopeType,
    scopeId: string,
  ): Promise<ManagedConfigRow | null> {
    const row = await this.knex('managed_configs')
      .where({ scope_type: scopeType, scope_id: scopeId })
      .orderBy('version', 'desc')
      .first();
    if (!row) return null;
    return this.parseManagedConfigRow(row);
  }

  async listManagedConfigVersions(
    scopeType: ManagedConfigScopeType,
    scopeId: string,
  ): Promise<ManagedConfigRow[]> {
    const rows = await this.knex('managed_configs')
      .where({ scope_type: scopeType, scope_id: scopeId })
      .orderBy('version', 'desc');
    return rows.map(r => this.parseManagedConfigRow(r));
  }

  async createManagedConfigVersion(data: {
    team: string;
    scope_type: ManagedConfigScopeType;
    scope_id: string;
    dag: PipelineDag;
    vector_config: string;
    config_hash: string;
    metadata?: Record<string, unknown>;
    change_summary?: string;
    created_by: string;
  }): Promise<ManagedConfigRow> {
    // Determine next version number
    const latest = await this.knex('managed_configs')
      .where({ scope_type: data.scope_type, scope_id: data.scope_id })
      .max('version as maxVersion')
      .first();
    const nextVersion = ((latest?.maxVersion as number) ?? 0) + 1;

    const [row] = await this.knex('managed_configs')
      .insert({
        id: uuidv4(),
        team: data.team,
        scope_type: data.scope_type,
        scope_id: data.scope_id,
        version: nextVersion,
        dag: JSON.stringify(data.dag),
        vector_config: data.vector_config,
        config_hash: data.config_hash,
        metadata: data.metadata ? JSON.stringify(data.metadata) : null,
        change_summary: data.change_summary ?? null,
        created_by: data.created_by,
      })
      .returning('*');
    return this.parseManagedConfigRow(row);
  }

  async deleteManagedConfig(
    scopeType: ManagedConfigScopeType,
    scopeId: string,
  ): Promise<number> {
    return this.knex('managed_configs')
      .where({ scope_type: scopeType, scope_id: scopeId })
      .delete();
  }

  private parseManagedConfigRow(row: any): ManagedConfigRow {
    return {
      ...row,
      dag:
        typeof row.dag === 'string' ? JSON.parse(row.dag) : row.dag,
      metadata:
        row.metadata && typeof row.metadata === 'string'
          ? JSON.parse(row.metadata)
          : row.metadata ?? null,
    };
  }
}
