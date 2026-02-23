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

import Router from 'express-promise-router';
import type express from 'express';
import type { PipelineDatabase } from '../database/PipelineDatabase';
import { mergeConfigs } from '../compiler/configMerger';
import type { PipelineConfig } from '../compiler/configMerger';
import { parseConfig } from '../compiler/configParser';
import { compileConfig } from '../compiler';
import { parsePagination } from '../util/pagination';
import {
  sendError,
  assertTeamAccess,
  requireMinRole,
  badRequest,
  notFound,
} from '../util/errors';
import type { LoggerService } from '@backstage/backend-plugin-api';

export interface FleetRoutesOptions {
  db: PipelineDatabase;
  logger: LoggerService;
  fleetAuth: express.RequestHandler;
}

export function createFleetRoutes(options: FleetRoutesOptions) {
  const { db, logger, fleetAuth } = options;
  const router = Router();

  // ── Agent-facing routes (fleet token auth) ─────────────────────────

  // POST /v1/fleet/agents/register — register agent
  router.post('/v1/fleet/agents/register', fleetAuth, async (req, res) => {
    try {
      const team = req.fleetTeam;
      if (!team) {
        throw badRequest('Fleet token team context missing');
      }

      const { agentId, labels, vectorVersion, hostname, os, arch, vectorConfigPath, vectorConfigContent } =
        req.body;

      if (!agentId) {
        throw badRequest('agentId is required');
      }

      const ipAddress =
        req.ip ||
        (typeof req.headers['x-forwarded-for'] === 'string'
          ? req.headers['x-forwarded-for'].split(',')[0].trim()
          : undefined);

      const agent = await db.registerFleetAgent({
        team,
        agent_id: agentId,
        hostname,
        ip_address: ipAddress,
        labels: labels ?? {},
        vector_version: vectorVersion,
        vector_config_path: vectorConfigPath,
        vector_config_content: vectorConfigContent,
        os,
        arch,
        fleet_token_id: req.fleetToken!.id,
      });

      logger.info(`Fleet agent registered: ${agentId}`, {
        agentDbId: agent.id,
        team,
      });

      // Auto-create/join pipeline for aggregator agents with config content.
      // Multiple HA agents join the same pipeline via the butler/pipeline label.
      if (
        labels?.role === 'aggregator' &&
        vectorConfigContent &&
        typeof vectorConfigContent === 'string'
      ) {
        try {
          // Determine pipeline name: butler/pipeline label or fall back to agentId
          const pipelineName = labels['butler/pipeline'] ?? agentId;

          const existing = await db.getPipelineByName(team, pipelineName);
          if (existing) {
            // Pipeline exists — add this agent as a member (HA)
            await db.addPipelineAgent(existing.id, agent.id);
            logger.info(
              `Agent ${agentId} joined existing pipeline "${pipelineName}"`,
              { pipelineId: existing.id, team },
            );
          } else {
            // Create new pipeline and add this agent
            const pipeline = await db.createPipeline({
              name: pipelineName,
              description: `Auto-discovered from fleet agent ${agentId}`,
              team,
              created_by: 'fleet-agent',
            });

            await db.addPipelineAgent(pipeline.id, agent.id);

            const parsed = parseConfig(vectorConfigContent);
            const compiled = compileConfig(parsed.dag, pipelineName, 1);

            await db.createVersion({
              pipeline_id: pipeline.id,
              dag: parsed.dag,
              vector_config: compiled.yaml,
              config_hash: compiled.hash,
              metadata: { source: 'fleet-auto-discovery', agentId },
              change_summary: 'Auto-imported from agent registration',
              created_by: 'fleet-agent',
            });

            logger.info(`Auto-created pipeline "${pipelineName}" for aggregator ${agentId}`, {
              pipelineId: pipeline.id,
              team,
            });
          }
        } catch (pipelineErr) {
          logger.warn(`Failed to auto-create/join pipeline for ${agentId}`, {
            error: String(pipelineErr),
          });
        }
      }

      res.status(201).json(agent);
    } catch (err) {
      sendError(res, err);
    }
  });

  // GET /v1/fleet/agents/:agentId/config — get config for agent
  router.get('/v1/fleet/agents/:agentId/config', fleetAuth, async (req, res) => {
    try {
      const team = req.fleetTeam;
      if (!team) {
        throw badRequest('Fleet token team context missing');
      }

      const agent = await db.getFleetAgentByAgentId(team, req.params.agentId);
      if (!agent) {
        throw notFound('AGENT_NOT_FOUND', 'Agent not found');
      }

      // 1. Agent managed config takes priority
      const agentConfig = await db.getLatestManagedConfig('agent', agent.id);
      const pipelineConfigs: PipelineConfig[] = [];

      if (agentConfig) {
        pipelineConfigs.push({
          pipelineName: `agent:${agent.agent_id}`,
          vectorConfig: agentConfig.vector_config,
        });
      } else {
        // 2. Fall back to group configs
        const matchingGroups = await db.getGroupsMatchingAgent(team, agent.labels ?? {});
        for (const group of matchingGroups) {
          const groupConfig = await db.getLatestManagedConfig('group', group.id);
          if (groupConfig) {
            pipelineConfigs.push({
              pipelineName: `group:${group.name}`,
              vectorConfig: groupConfig.vector_config,
            });
          }
        }
      }

      // 3. Pipeline deployments (aggregators) always merge in
      const deployments = await db.getActiveDeploymentsForAgent(req.params.agentId, team);
      for (const d of deployments) {
        pipelineConfigs.push({
          pipelineName: (d as any).pipeline_name ?? d.pipeline_id,
          vectorConfig: (d as any).vector_config,
        });
      }

      if (pipelineConfigs.length === 0) {
        res.status(204).end();
        return;
      }

      const merged = mergeConfigs(pipelineConfigs);

      // ETag / If-None-Match for conditional responses
      const ifNoneMatch = req.headers['if-none-match'];
      if (ifNoneMatch && ifNoneMatch === merged.configHash) {
        res.status(304).end();
        return;
      }

      res.set('ETag', merged.configHash);
      res.json({
        configHash: merged.configHash,
        vectorConfig: merged.vectorConfig,
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  // POST /v1/fleet/agents/:agentId/heartbeat — heartbeat
  router.post('/v1/fleet/agents/:agentId/heartbeat', fleetAuth, async (req, res) => {
    try {
      const team = req.fleetTeam;
      if (!team) {
        throw badRequest('Fleet token team context missing');
      }

      const agent = await db.getFleetAgentByAgentId(team, req.params.agentId);
      if (!agent) {
        throw notFound('AGENT_NOT_FOUND', 'Agent not found');
      }

      const {
        status: _status,
        currentConfigHash,
        vectorVersion: _vectorVersion,
        uptime: _uptime,
        errors,
        labels,
        configSyncResult,
      } = req.body;

      const updateData: Parameters<typeof db.updateFleetAgent>[1] = {
        status: 'online',
        current_config_hash: currentConfigHash,
        config_sync_result: configSyncResult,
        last_heartbeat_at: new Date().toISOString(),
        errors,
      };

      if (labels !== undefined) {
        updateData.labels = labels;
      }

      await db.updateFleetAgent(agent.id, updateData);

      res.status(204).end();
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── Agent management routes (Backstage auth) ──────────────────────

  // GET /v1/fleet/agents — list team agents (or all in admin mode)
  router.get('/v1/fleet/agents', async (req, res) => {
    try {
      const pagination = parsePagination(req.query as Record<string, unknown>);
      const status =
        typeof req.query.status === 'string'
          ? (req.query.status as 'pending' | 'online' | 'offline' | 'stale')
          : undefined;
      const labelKey =
        typeof req.query.labelKey === 'string' ? req.query.labelKey : undefined;
      const labelValue =
        typeof req.query.labelValue === 'string'
          ? req.query.labelValue
          : undefined;

      const result = await db.listFleetAgents({
        team: req.activeTeam ?? undefined,
        status,
        labelKey,
        labelValue,
        cursor: pagination.cursor ?? undefined,
        limit: pagination.limit,
      });

      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  // GET /v1/fleet/agents/:id — get agent detail with groups + deployments
  router.get('/v1/fleet/agents/:id', async (req, res) => {
    try {
      const agent = await db.getFleetAgent(req.params.id);
      assertTeamAccess(agent, req.activeTeam);

      if (!agent) {
        throw notFound('AGENT_NOT_FOUND', 'Fleet agent not found');
      }

      // Enrich with matching groups, active deployments, and managed config
      const [matchingGroups, activeDeployments, managedConfig] = await Promise.all([
        db.getGroupsMatchingAgent(agent.team, agent.labels ?? {}),
        db.getActiveDeploymentsForAgent(agent.agent_id, agent.team),
        db.getLatestManagedConfig('agent', agent.id),
      ]);

      res.json({
        ...agent,
        matchingGroups: matchingGroups.map(g => ({
          id: g.id,
          name: g.name,
          description: g.description,
        })),
        activeDeployments: activeDeployments.map(d => ({
          id: d.id,
          pipeline_id: d.pipeline_id,
          pipeline_name: (d as any).pipeline_name,
          target_type: d.target_type,
          target_id: d.target_id,
          type: d.type,
          status: d.status,
          deployed_by: d.deployed_by,
          deployed_at: d.deployed_at,
        })),
        managedConfig: managedConfig ? {
          version: managedConfig.version,
          config_hash: managedConfig.config_hash,
          created_by: managedConfig.created_by,
          created_at: managedConfig.created_at,
        } : null,
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  // PATCH /v1/fleet/agents/:id — update agent labels
  router.patch('/v1/fleet/agents/:id', async (req, res) => {
    try {
      requireMinRole(req, 'operator');

      const agent = await db.getFleetAgent(req.params.id);
      assertTeamAccess(agent, req.activeTeam);

      if (!agent) {
        throw notFound('AGENT_NOT_FOUND', 'Fleet agent not found');
      }

      const { labels } = req.body;

      const updated = await db.updateFleetAgent(req.params.id, { labels });

      await db.writeAuditLog({
        team: req.activeTeam ?? agent.team,
        action: 'agent.update',
        entity_type: 'fleet_agent',
        entity_id: req.params.id,
        actor: req.pipelineUser?.email ?? 'unknown',
        details: { labels },
      });

      res.json(updated);
    } catch (err) {
      sendError(res, err);
    }
  });

  // DELETE /v1/fleet/agents/:id — deregister (admin+)
  router.delete('/v1/fleet/agents/:id', async (req, res) => {
    try {
      requireMinRole(req, 'admin');

      const agent = await db.getFleetAgent(req.params.id);
      assertTeamAccess(agent, req.activeTeam);

      if (!agent) {
        throw notFound('AGENT_NOT_FOUND', 'Fleet agent not found');
      }

      await db.deleteFleetAgent(req.params.id);

      await db.writeAuditLog({
        team: req.activeTeam ?? agent.team,
        action: 'agent.deregister',
        entity_type: 'fleet_agent',
        entity_id: req.params.id,
        actor: req.pipelineUser?.email ?? 'unknown',
        details: { agent_id: agent.agent_id, hostname: agent.hostname },
      });

      logger.info(`Fleet agent deregistered: ${agent.agent_id}`, {
        agentDbId: req.params.id,
        team: agent.team,
      });

      res.json({ id: req.params.id, deleted: true });
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}
