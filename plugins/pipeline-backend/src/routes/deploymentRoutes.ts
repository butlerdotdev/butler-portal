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
import type { VrlExecutor } from '../vrl/vrlExecutor';
import {
  detectCollisions,
  mergeConfigs,
} from '../compiler/configMerger';
import type { PipelineConfig } from '../compiler/configMerger';
import { parsePagination } from '../util/pagination';
import {
  sendError,
  assertTeamAccess,
  requireMinRole,
  badRequest,
  notFound,
  PipelineError,
} from '../util/errors';
import type { LoggerService } from '@backstage/backend-plugin-api';

export interface DeploymentRoutesOptions {
  db: PipelineDatabase;
  vrlExecutor: VrlExecutor;
  logger: LoggerService;
}

export function createDeploymentRoutes(options: DeploymentRoutesOptions) {
  const { db, vrlExecutor, logger } = options;
  const router = Router();

  // POST /v1/pipelines/:id/deploy — deploy to targets
  router.post('/v1/pipelines/:id/deploy', async (req, res) => {
    try {
      requireMinRole(req, 'operator');

      const pipeline = await db.getPipeline(req.params.id);
      assertTeamAccess(pipeline, req.activeTeam);

      if (!pipeline) {
        throw notFound('PIPELINE_NOT_FOUND', 'Pipeline not found');
      }

      const { targets: explicitTargets, version: requestedVersion } = req.body;

      // Auto-resolve targets from pipeline_agents if none provided
      let targets = explicitTargets;
      if (!targets || !Array.isArray(targets) || targets.length === 0) {
        const pipelineAgents = await db.getPipelineAgents(req.params.id);
        if (pipelineAgents.length === 0) {
          throw badRequest(
            'No targets specified and no agents linked to this pipeline',
          );
        }
        targets = pipelineAgents.map(a => ({ type: 'agent', id: a.id }));
      }

      // Resolve version (specific or latest)
      let versionRow;
      if (requestedVersion) {
        versionRow = await db.getVersion(req.params.id, requestedVersion);
        if (!versionRow) {
          throw notFound(
            'VERSION_NOT_FOUND',
            `Version ${requestedVersion} not found`,
          );
        }
      } else {
        versionRow = await db.getLatestVersion(req.params.id);
        if (!versionRow) {
          throw badRequest('No versions exist for this pipeline');
        }
      }

      const deployments = [];

      for (const target of targets) {
        const { type: targetType, id: targetId } = target;

        if (!targetType || !targetId) {
          throw badRequest('Each target must have type and id');
        }

        if (targetType !== 'agent' && targetType !== 'group') {
          throw badRequest('Target type must be "agent" or "group"');
        }

        // Collect all pipeline configs that will be active on affected agents
        const pipelineConfigs: PipelineConfig[] = [];

        if (targetType === 'agent') {
          const agent = await db.getFleetAgent(targetId);
          if (!agent) {
            throw notFound('AGENT_NOT_FOUND', `Agent ${targetId} not found`);
          }
          assertTeamAccess(agent, req.activeTeam);

          // Get existing active deployments for this agent
          const existingDeployments = await db.getActiveDeploymentsForAgent(
            agent.agent_id,
            agent.team,
          );

          // Add existing configs (excluding current pipeline if already deployed)
          for (const dep of existingDeployments) {
            if (dep.pipeline_id !== req.params.id) {
              pipelineConfigs.push({
                pipelineName: dep.pipeline_name,
                vectorConfig: dep.vector_config,
              });
            }
          }

          // Add the new pipeline config
          pipelineConfigs.push({
            pipelineName: pipeline.name,
            vectorConfig: versionRow.vector_config,
          });
        } else {
          // group target
          const group = await db.getFleetGroup(targetId);
          if (!group) {
            throw notFound('GROUP_NOT_FOUND', `Group ${targetId} not found`);
          }
          assertTeamAccess(group, req.activeTeam);

          // Get all agents matching this group's label selector
          const agentsResult = await db.listFleetAgents({
            team: group.team,
            limit: 200,
          });
          const matchedAgents = agentsResult.items.filter(agent => {
            if (
              !group.label_selector ||
              Object.keys(group.label_selector).length === 0
            ) {
              return true;
            }
            return Object.entries(group.label_selector).every(
              ([key, value]) => agent.labels[key] === value,
            );
          });

          // For each matched agent, check for collisions
          for (const agent of matchedAgents) {
            const agentConfigs: PipelineConfig[] = [];
            const existingDeployments = await db.getActiveDeploymentsForAgent(
              agent.agent_id,
              agent.team,
            );

            for (const dep of existingDeployments) {
              if (dep.pipeline_id !== req.params.id) {
                agentConfigs.push({
                  pipelineName: dep.pipeline_name,
                  vectorConfig: dep.vector_config,
                });
              }
            }

            agentConfigs.push({
              pipelineName: pipeline.name,
              vectorConfig: versionRow.vector_config,
            });

            // Check collisions per agent
            const collisions = detectCollisions(agentConfigs);
            if (collisions.length > 0) {
              throw new PipelineError(
                409,
                'CONFIG_COLLISION',
                `Config collision on agent "${agent.agent_id}": ${collisions.length} component ID collision(s)`,
                { collisions, agentId: agent.agent_id },
              );
            }
          }

          // Also add new pipeline for the top-level collision check
          pipelineConfigs.push({
            pipelineName: pipeline.name,
            vectorConfig: versionRow.vector_config,
          });
        }

        // Check collisions for agent targets
        if (targetType === 'agent') {
          const collisions = detectCollisions(pipelineConfigs);
          if (collisions.length > 0) {
            throw new PipelineError(
              409,
              'CONFIG_COLLISION',
              `Config collision: ${collisions.length} component ID collision(s)`,
              { collisions },
            );
          }
        }

        // Optional validation if VRL executor is available
        if (vrlExecutor.isAvailable() && pipelineConfigs.length > 0) {
          try {
            mergeConfigs(pipelineConfigs);
          } catch (err) {
            if (err instanceof PipelineError && err.code === 'CONFIG_COLLISION') {
              throw err;
            }
            // Non-collision merge errors are logged but not blocking
            logger.warn('Config merge validation warning', {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        // Supersede existing deployment of this pipeline to this target
        const existingTargetDeployments = await db.getActiveDeploymentsForTarget(
          targetType,
          targetId,
        );
        for (const dep of existingTargetDeployments) {
          if (dep.pipeline_id === req.params.id) {
            await db.supersedeDeployment(dep.id);
          }
        }

        // Create new deployment
        const deployment = await db.createDeployment({
          pipeline_id: req.params.id,
          pipeline_version_id: versionRow.id,
          target_type: targetType,
          target_id: targetId,
          type: 'deploy',
          deployed_by: req.pipelineUser?.email ?? 'unknown',
        });

        deployments.push(deployment);
      }

      await db.writeAuditLog({
        team: req.activeTeam ?? pipeline.team,
        action: 'deployment.create',
        entity_type: 'pipeline_deployment',
        entity_id: deployments.map(d => d.id).join(','),
        actor: req.pipelineUser?.email ?? 'unknown',
        details: {
          pipeline_id: req.params.id,
          version: versionRow.version,
          targets,
        },
      });

      logger.info(`Pipeline deployed: ${pipeline.name} v${versionRow.version}`, {
        pipelineId: req.params.id,
        deploymentCount: deployments.length,
        team: pipeline.team,
      });

      res.status(201).json({ deployments });
    } catch (err) {
      sendError(res, err);
    }
  });

  // GET /v1/pipelines/:id/deployments — list deployments
  router.get('/v1/pipelines/:id/deployments', async (req, res) => {
    try {
      const pipeline = await db.getPipeline(req.params.id);
      assertTeamAccess(pipeline, req.activeTeam);

      const pagination = parsePagination(req.query as Record<string, unknown>);
      const status =
        typeof req.query.status === 'string'
          ? (req.query.status as 'active' | 'superseded')
          : undefined;

      const result = await db.listDeployments({
        pipelineId: req.params.id,
        status,
        cursor: pagination.cursor ?? undefined,
        limit: pagination.limit,
      });

      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  // POST /v1/pipelines/:id/deployments/:did/rollback — rollback
  router.post(
    '/v1/pipelines/:id/deployments/:did/rollback',
    async (req, res) => {
      try {
        requireMinRole(req, 'operator');

        const pipeline = await db.getPipeline(req.params.id);
        assertTeamAccess(pipeline, req.activeTeam);

        if (!pipeline) {
          throw notFound('PIPELINE_NOT_FOUND', 'Pipeline not found');
        }

        const deployment = await db.getDeployment(req.params.did);
        if (!deployment || deployment.pipeline_id !== req.params.id) {
          throw notFound(
            'DEPLOYMENT_NOT_FOUND',
            'Deployment not found for this pipeline',
          );
        }

        // Find most recent superseded deployment for same pipeline + target
        const previousDeployment = await db.getMostRecentSupersededDeployment(
          req.params.id,
          deployment.target_type,
          deployment.target_id,
        );

        if (!previousDeployment) {
          throw badRequest('No previous deployment to rollback to');
        }

        // Get the version of the previous deployment for validation
        const previousVersion = await db.getVersionById(
          previousDeployment.pipeline_version_id,
        );
        if (!previousVersion) {
          throw notFound(
            'VERSION_NOT_FOUND',
            'Previous deployment version not found',
          );
        }

        // Pre-validate merged config with rollback version
        if (deployment.target_type === 'agent') {
          const agent = await db.getFleetAgent(deployment.target_id);
          if (agent) {
            const existingDeployments = await db.getActiveDeploymentsForAgent(
              agent.agent_id,
              agent.team,
            );

            const pipelineConfigs: PipelineConfig[] = [];
            for (const dep of existingDeployments) {
              if (dep.pipeline_id !== req.params.id) {
                pipelineConfigs.push({
                  pipelineName: dep.pipeline_name,
                  vectorConfig: dep.vector_config,
                });
              }
            }
            pipelineConfigs.push({
              pipelineName: pipeline.name,
              vectorConfig: previousVersion.vector_config,
            });

            const collisions = detectCollisions(pipelineConfigs);
            if (collisions.length > 0) {
              throw new PipelineError(
                409,
                'CONFIG_COLLISION',
                `Rollback would cause config collision: ${collisions.length} component ID collision(s)`,
                { collisions },
              );
            }
          }
        }

        // Supersede current deployment
        await db.supersedeDeployment(deployment.id);

        // Create new deployment pointing to previous version with type 'rollback'
        const rollbackDeployment = await db.createDeployment({
          pipeline_id: req.params.id,
          pipeline_version_id: previousDeployment.pipeline_version_id,
          target_type: deployment.target_type,
          target_id: deployment.target_id,
          type: 'rollback',
          deployed_by: req.pipelineUser?.email ?? 'unknown',
        });

        await db.writeAuditLog({
          team: req.activeTeam ?? pipeline.team,
          action: 'deployment.rollback',
          entity_type: 'pipeline_deployment',
          entity_id: rollbackDeployment.id,
          actor: req.pipelineUser?.email ?? 'unknown',
          details: {
            pipeline_id: req.params.id,
            rolled_back_deployment_id: deployment.id,
            previous_version_id: previousDeployment.pipeline_version_id,
          },
        });

        logger.info(`Pipeline rolled back: ${pipeline.name}`, {
          pipelineId: req.params.id,
          deploymentId: rollbackDeployment.id,
          team: pipeline.team,
        });

        res.status(201).json(rollbackDeployment);
      } catch (err) {
        sendError(res, err);
      }
    },
  );

  return router;
}
