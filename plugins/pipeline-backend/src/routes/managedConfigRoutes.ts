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
import type { PipelineDatabase } from '../database/PipelineDatabase';
import { parseConfig } from '../compiler/configParser';
import { compileConfig } from '../compiler/configCompiler';
import { validateDag } from '../util/validation';
import {
  sendError,
  assertTeamAccess,
  requireMinRole,
  badRequest,
  notFound,
} from '../util/errors';
import type { LoggerService } from '@backstage/backend-plugin-api';

export interface ManagedConfigRoutesOptions {
  db: PipelineDatabase;
  logger: LoggerService;
}

export function createManagedConfigRoutes(options: ManagedConfigRoutesOptions) {
  const { db, logger } = options;
  const router = Router();

  // ── Agent-scoped managed config routes ──────────────────────────────

  // GET /v1/fleet/agents/:id/managed-config — get latest managed config for agent
  router.get('/v1/fleet/agents/:id/managed-config', async (req, res) => {
    try {
      const agent = await db.getFleetAgent(req.params.id);
      assertTeamAccess(agent, req.activeTeam);

      if (!agent) {
        throw notFound('AGENT_NOT_FOUND', 'Fleet agent not found');
      }

      const config = await db.getLatestManagedConfig('agent', agent.id);
      if (!config) {
        throw notFound('CONFIG_NOT_FOUND' as any, 'No managed config found for this agent');
      }

      res.json(config);
    } catch (err) {
      sendError(res, err);
    }
  });

  // GET /v1/fleet/agents/:id/managed-config/versions — list all versions
  router.get('/v1/fleet/agents/:id/managed-config/versions', async (req, res) => {
    try {
      const agent = await db.getFleetAgent(req.params.id);
      assertTeamAccess(agent, req.activeTeam);

      if (!agent) {
        throw notFound('AGENT_NOT_FOUND', 'Fleet agent not found');
      }

      const versions = await db.listManagedConfigVersions('agent', agent.id);

      res.json({ items: versions });
    } catch (err) {
      sendError(res, err);
    }
  });

  // POST /v1/fleet/agents/:id/managed-config/versions — save new version
  router.post('/v1/fleet/agents/:id/managed-config/versions', async (req, res) => {
    try {
      requireMinRole(req, 'operator');

      const agent = await db.getFleetAgent(req.params.id);
      assertTeamAccess(agent, req.activeTeam);

      if (!agent) {
        throw notFound('AGENT_NOT_FOUND', 'Fleet agent not found');
      }

      const { dag, change_summary } = req.body;

      validateDag(dag);

      // Determine next version number from existing versions
      const latest = await db.getLatestManagedConfig('agent', agent.id);
      const nextVersion = (latest?.version ?? 0) + 1;

      const compiled = compileConfig(dag, agent.agent_id, nextVersion);

      const version = await db.createManagedConfigVersion({
        team: agent.team,
        scope_type: 'agent',
        scope_id: agent.id,
        dag,
        vector_config: compiled.yaml,
        config_hash: compiled.hash,
        change_summary,
        created_by: req.pipelineUser?.email ?? 'unknown',
      });

      await db.writeAuditLog({
        team: agent.team,
        action: 'agent.config.save',
        entity_type: 'managed_config',
        entity_id: version.id,
        actor: req.pipelineUser?.email ?? 'unknown',
        details: {
          agent_id: agent.agent_id,
          agent_db_id: agent.id,
          version: version.version,
          config_hash: compiled.hash,
        },
      });

      logger.info(`Managed config saved for agent ${agent.agent_id} v${version.version}`, {
        agentDbId: agent.id,
        team: agent.team,
        version: version.version,
      });

      res.status(201).json(version);
    } catch (err) {
      sendError(res, err);
    }
  });

  // POST /v1/fleet/agents/:id/managed-config/import — import from vector_config_content
  router.post('/v1/fleet/agents/:id/managed-config/import', async (req, res) => {
    try {
      requireMinRole(req, 'operator');

      const agent = await db.getFleetAgent(req.params.id);
      assertTeamAccess(agent, req.activeTeam);

      if (!agent) {
        throw notFound('AGENT_NOT_FOUND', 'Fleet agent not found');
      }

      if (!agent.vector_config_content) {
        throw badRequest(
          'Agent has no config content. The agent may not have reported its config on registration.',
        );
      }

      const parsed = parseConfig(agent.vector_config_content);
      const compiled = compileConfig(parsed.dag, agent.agent_id, 1);

      const version = await db.createManagedConfigVersion({
        team: agent.team,
        scope_type: 'agent',
        scope_id: agent.id,
        dag: parsed.dag,
        vector_config: compiled.yaml,
        config_hash: compiled.hash,
        metadata: { importedFromRegistration: true },
        change_summary: `Imported from agent registration config`,
        created_by: req.pipelineUser?.email ?? 'unknown',
      });

      await db.writeAuditLog({
        team: agent.team,
        action: 'agent.config.import',
        entity_type: 'managed_config',
        entity_id: version.id,
        actor: req.pipelineUser?.email ?? 'unknown',
        details: {
          agent_id: agent.agent_id,
          agent_db_id: agent.id,
          config_hash: compiled.hash,
        },
      });

      logger.info(`Managed config imported from agent ${agent.agent_id}`, {
        agentDbId: agent.id,
        team: agent.team,
      });

      res.status(201).json(version);
    } catch (err) {
      sendError(res, err);
    }
  });

  // DELETE /v1/fleet/agents/:id/managed-config — delete all versions
  router.delete('/v1/fleet/agents/:id/managed-config', async (req, res) => {
    try {
      requireMinRole(req, 'operator');

      const agent = await db.getFleetAgent(req.params.id);
      assertTeamAccess(agent, req.activeTeam);

      if (!agent) {
        throw notFound('AGENT_NOT_FOUND', 'Fleet agent not found');
      }

      await db.deleteManagedConfig('agent', agent.id);

      await db.writeAuditLog({
        team: agent.team,
        action: 'agent.config.delete',
        entity_type: 'managed_config',
        entity_id: agent.id,
        actor: req.pipelineUser?.email ?? 'unknown',
        details: {
          agent_id: agent.agent_id,
          agent_db_id: agent.id,
        },
      });

      logger.info(`Managed config deleted for agent ${agent.agent_id}`, {
        agentDbId: agent.id,
        team: agent.team,
      });

      res.json({ deleted: true });
    } catch (err) {
      sendError(res, err);
    }
  });

  // POST /v1/fleet/agents/:id/managed-config/promote — promote to group
  router.post('/v1/fleet/agents/:id/managed-config/promote', async (req, res) => {
    try {
      requireMinRole(req, 'operator');

      const agent = await db.getFleetAgent(req.params.id);
      assertTeamAccess(agent, req.activeTeam);

      if (!agent) {
        throw notFound('AGENT_NOT_FOUND', 'Fleet agent not found');
      }

      const { groupId } = req.body;
      if (!groupId) {
        throw badRequest('groupId is required');
      }

      const agentConfig = await db.getLatestManagedConfig('agent', agent.id);
      if (!agentConfig) {
        throw badRequest('Agent has no managed config to promote');
      }

      const group = await db.getFleetGroup(groupId);
      assertTeamAccess(group, req.activeTeam);

      if (!group) {
        throw notFound('GROUP_NOT_FOUND', 'Fleet group not found');
      }

      // Determine next version number for group config
      const latestGroupConfig = await db.getLatestManagedConfig('group', group.id);
      const nextGroupVersion = (latestGroupConfig?.version ?? 0) + 1;

      const compiled = compileConfig(agentConfig.dag, group.name, nextGroupVersion);

      const version = await db.createManagedConfigVersion({
        team: agent.team,
        scope_type: 'group',
        scope_id: group.id,
        dag: agentConfig.dag,
        vector_config: compiled.yaml,
        config_hash: compiled.hash,
        change_summary: `Promoted from agent ${agent.agent_id} config v${agentConfig.version}`,
        created_by: req.pipelineUser?.email ?? 'unknown',
      });

      await db.writeAuditLog({
        team: agent.team,
        action: 'agent.config.promote',
        entity_type: 'managed_config',
        entity_id: version.id,
        actor: req.pipelineUser?.email ?? 'unknown',
        details: {
          source_agent_id: agent.agent_id,
          source_agent_db_id: agent.id,
          source_version: agentConfig.version,
          target_group_id: group.id,
          target_group_name: group.name,
          config_hash: compiled.hash,
        },
      });

      logger.info(
        `Managed config promoted from agent ${agent.agent_id} to group ${group.name}`,
        {
          agentDbId: agent.id,
          groupId: group.id,
          team: agent.team,
          version: version.version,
        },
      );

      res.status(201).json(version);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── Group-scoped managed config routes ──────────────────────────────

  // GET /v1/fleet/groups/:id/managed-config — get latest group config
  router.get('/v1/fleet/groups/:id/managed-config', async (req, res) => {
    try {
      const group = await db.getFleetGroup(req.params.id);
      assertTeamAccess(group, req.activeTeam);

      if (!group) {
        throw notFound('GROUP_NOT_FOUND', 'Fleet group not found');
      }

      const config = await db.getLatestManagedConfig('group', group.id);
      if (!config) {
        throw notFound('CONFIG_NOT_FOUND' as any, 'No managed config found for this group');
      }

      res.json(config);
    } catch (err) {
      sendError(res, err);
    }
  });

  // GET /v1/fleet/groups/:id/managed-config/versions — list group config versions
  router.get('/v1/fleet/groups/:id/managed-config/versions', async (req, res) => {
    try {
      const group = await db.getFleetGroup(req.params.id);
      assertTeamAccess(group, req.activeTeam);

      if (!group) {
        throw notFound('GROUP_NOT_FOUND', 'Fleet group not found');
      }

      const versions = await db.listManagedConfigVersions('group', group.id);

      res.json({ items: versions });
    } catch (err) {
      sendError(res, err);
    }
  });

  // POST /v1/fleet/groups/:id/managed-config/versions — save new group config version
  router.post('/v1/fleet/groups/:id/managed-config/versions', async (req, res) => {
    try {
      requireMinRole(req, 'operator');

      const group = await db.getFleetGroup(req.params.id);
      assertTeamAccess(group, req.activeTeam);

      if (!group) {
        throw notFound('GROUP_NOT_FOUND', 'Fleet group not found');
      }

      const { dag, change_summary } = req.body;

      validateDag(dag);

      // Determine next version number from existing versions
      const latest = await db.getLatestManagedConfig('group', group.id);
      const nextVersion = (latest?.version ?? 0) + 1;

      const compiled = compileConfig(dag, group.name, nextVersion);

      const version = await db.createManagedConfigVersion({
        team: group.team,
        scope_type: 'group',
        scope_id: group.id,
        dag,
        vector_config: compiled.yaml,
        config_hash: compiled.hash,
        change_summary,
        created_by: req.pipelineUser?.email ?? 'unknown',
      });

      await db.writeAuditLog({
        team: group.team,
        action: 'group.config.save',
        entity_type: 'managed_config',
        entity_id: version.id,
        actor: req.pipelineUser?.email ?? 'unknown',
        details: {
          group_id: group.id,
          group_name: group.name,
          version: version.version,
          config_hash: compiled.hash,
        },
      });

      logger.info(`Managed config saved for group ${group.name} v${version.version}`, {
        groupId: group.id,
        team: group.team,
        version: version.version,
      });

      res.status(201).json(version);
    } catch (err) {
      sendError(res, err);
    }
  });

  // DELETE /v1/fleet/groups/:id/managed-config — delete all group config versions
  router.delete('/v1/fleet/groups/:id/managed-config', async (req, res) => {
    try {
      requireMinRole(req, 'operator');

      const group = await db.getFleetGroup(req.params.id);
      assertTeamAccess(group, req.activeTeam);

      if (!group) {
        throw notFound('GROUP_NOT_FOUND', 'Fleet group not found');
      }

      await db.deleteManagedConfig('group', group.id);

      await db.writeAuditLog({
        team: group.team,
        action: 'group.config.delete',
        entity_type: 'managed_config',
        entity_id: group.id,
        actor: req.pipelineUser?.email ?? 'unknown',
        details: {
          group_id: group.id,
          group_name: group.name,
        },
      });

      logger.info(`Managed config deleted for group ${group.name}`, {
        groupId: group.id,
        team: group.team,
      });

      res.json({ deleted: true });
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}
