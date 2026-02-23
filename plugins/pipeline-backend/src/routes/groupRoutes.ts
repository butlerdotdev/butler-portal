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
import {
  sendError,
  assertTeamAccess,
  requireMinRole,
  badRequest,
  notFound,
  conflict,
} from '../util/errors';
import type { LoggerService } from '@backstage/backend-plugin-api';

export interface GroupRoutesOptions {
  db: PipelineDatabase;
  logger: LoggerService;
}

/**
 * Check whether an agent's labels match a group's label selector.
 * All selector entries must be present in agent labels (AND logic).
 */
function matchesLabelSelector(
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

export function createGroupRoutes(options: GroupRoutesOptions) {
  const { db, logger } = options;
  const router = Router();

  // GET /v1/fleet/groups — list team groups (with agent count)
  router.get('/v1/fleet/groups', async (req, res) => {
    try {
      requireMinRole(req, 'operator');

      const team = req.activeTeam ?? undefined;
      const groups = await db.listFleetGroups({ team });

      // Count matching agents for each group
      const agentsResult = await db.listFleetAgents({
        team,
        limit: 200,
      });
      const agents = agentsResult.items;

      const groupsWithCount = groups.map(group => ({
        ...group,
        agentCount: agents.filter(agent =>
          matchesLabelSelector(agent.labels, group.label_selector),
        ).length,
      }));

      res.json({ items: groupsWithCount });
    } catch (err) {
      sendError(res, err);
    }
  });

  // POST /v1/fleet/groups — create group
  router.post('/v1/fleet/groups', async (req, res) => {
    try {
      requireMinRole(req, 'operator');

      const team = req.activeTeam ?? req.body.team;
      if (!team) {
        throw badRequest('Team context required. In admin mode, include "team" in the request body.');
      }

      const { name, description, label_selector } = req.body;
      if (!name) {
        throw badRequest('Group name is required');
      }

      const group = await db.createFleetGroup({
        team,
        name,
        description,
        label_selector,
        created_by: req.pipelineUser?.email ?? 'unknown',
      });

      await db.writeAuditLog({
        team,
        action: 'group.create',
        entity_type: 'fleet_group',
        entity_id: group.id,
        actor: req.pipelineUser?.email ?? 'unknown',
        details: { name, label_selector },
      });

      logger.info(`Fleet group created: ${name}`, {
        groupId: group.id,
        team,
      });

      res.status(201).json(group);
    } catch (err) {
      sendError(res, err);
    }
  });

  // GET /v1/fleet/groups/:id — get group with matched agents
  router.get('/v1/fleet/groups/:id', async (req, res) => {
    try {
      requireMinRole(req, 'operator');

      const group = await db.getFleetGroup(req.params.id);
      assertTeamAccess(group, req.activeTeam);

      if (!group) {
        throw notFound('GROUP_NOT_FOUND', 'Fleet group not found');
      }

      // Find agents matching this group's label selector and managed config
      const [agentsResult, managedConfig] = await Promise.all([
        db.listFleetAgents({
          team: group.team,
          limit: 200,
        }),
        db.getLatestManagedConfig('group', group.id),
      ]);
      const matchedAgents = agentsResult.items.filter(agent =>
        matchesLabelSelector(agent.labels, group.label_selector),
      );

      res.json({
        ...group,
        agents: matchedAgents,
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

  // PATCH /v1/fleet/groups/:id — update group
  router.patch('/v1/fleet/groups/:id', async (req, res) => {
    try {
      requireMinRole(req, 'operator');

      const group = await db.getFleetGroup(req.params.id);
      assertTeamAccess(group, req.activeTeam);

      if (!group) {
        throw notFound('GROUP_NOT_FOUND', 'Fleet group not found');
      }

      const { name, description, label_selector } = req.body;

      const updated = await db.updateFleetGroup(req.params.id, {
        name,
        description,
        label_selector,
      });

      await db.writeAuditLog({
        team: req.activeTeam ?? group.team,
        action: 'group.update',
        entity_type: 'fleet_group',
        entity_id: req.params.id,
        actor: req.pipelineUser?.email ?? 'unknown',
        details: { name, description, label_selector },
      });

      res.json(updated);
    } catch (err) {
      sendError(res, err);
    }
  });

  // DELETE /v1/fleet/groups/:id — 409 if active deployments target it
  router.delete('/v1/fleet/groups/:id', async (req, res) => {
    try {
      requireMinRole(req, 'operator');

      const group = await db.getFleetGroup(req.params.id);
      assertTeamAccess(group, req.activeTeam);

      if (!group) {
        throw notFound('GROUP_NOT_FOUND', 'Fleet group not found');
      }

      // Check for active deployments targeting this group
      const activeDeployments = await db.getActiveDeploymentsForTarget(
        'group',
        req.params.id,
      );
      if (activeDeployments.length > 0) {
        throw conflict(
          'GROUP_HAS_DEPLOYMENTS',
          `Cannot delete group "${group.name}": ${activeDeployments.length} active deployment(s) target it`,
        );
      }

      await db.deleteFleetGroup(req.params.id);

      await db.writeAuditLog({
        team: req.activeTeam ?? group.team,
        action: 'group.delete',
        entity_type: 'fleet_group',
        entity_id: req.params.id,
        actor: req.pipelineUser?.email ?? 'unknown',
        details: { name: group.name },
      });

      logger.info(`Fleet group deleted: ${group.name}`, {
        groupId: req.params.id,
        team: group.team,
      });

      res.json({ id: req.params.id, deleted: true });
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}
