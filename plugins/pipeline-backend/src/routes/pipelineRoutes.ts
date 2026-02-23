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
import { diffLines } from 'diff';
import type { PipelineDatabase } from '../database/PipelineDatabase';
import type { VrlExecutor } from '../vrl/vrlExecutor';
import { compileConfig } from '../compiler/configCompiler';
import { previewPipeline } from '../preview/pipelinePreview';
import { validatePipelineName, validateDag } from '../util/validation';
import { parsePagination } from '../util/pagination';
import {
  sendError,
  assertTeamAccess,
  requireMinRole,
  badRequest,
  notFound,
} from '../util/errors';
import type { LoggerService } from '@backstage/backend-plugin-api';

export interface PipelineRoutesOptions {
  db: PipelineDatabase;
  vrlExecutor: VrlExecutor;
  logger: LoggerService;
}

export function createPipelineRoutes(options: PipelineRoutesOptions) {
  const { db, vrlExecutor, logger } = options;
  const router = Router();

  // GET /v1/pipelines — list pipelines
  router.get('/v1/pipelines', async (req, res) => {
    try {
      const pagination = parsePagination(req.query as Record<string, unknown>);
      const status =
        typeof req.query.status === 'string' ? req.query.status : undefined;
      const search =
        typeof req.query.search === 'string' ? req.query.search : undefined;

      const result = await db.listPipelines({
        ...pagination,
        team: req.activeTeam,
        status: status as 'active' | 'archived' | undefined,
        search,
      });
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  // POST /v1/pipelines — create pipeline
  router.post('/v1/pipelines', async (req, res) => {
    try {
      requireMinRole(req, 'operator');
      const { name, description } = req.body;
      validatePipelineName(name);

      if (!req.activeTeam) {
        throw badRequest('Team context required');
      }

      const pipeline = await db.createPipeline({
        name,
        description,
        team: req.activeTeam,
        created_by: req.pipelineUser?.email ?? 'unknown',
      });

      await db.writeAuditLog({
        team: req.activeTeam,
        action: 'pipeline.create',
        entity_type: 'pipeline',
        entity_id: pipeline.id,
        actor: req.pipelineUser?.email ?? 'unknown',
        details: { name },
      });

      logger.info(`Pipeline created: ${name}`, {
        pipelineId: pipeline.id,
        team: req.activeTeam,
      });
      res.status(201).json(pipeline);
    } catch (err) {
      sendError(res, err);
    }
  });

  // GET /v1/pipelines/:id — get pipeline with agents
  router.get('/v1/pipelines/:id', async (req, res) => {
    try {
      const pipeline = await db.getPipeline(req.params.id);
      assertTeamAccess(pipeline, req.activeTeam);

      if (!pipeline) {
        throw notFound('PIPELINE_NOT_FOUND', 'Pipeline not found');
      }

      // Enrich with linked aggregator agents
      const agents = await db.getPipelineAgents(req.params.id);

      res.json({
        ...pipeline,
        agents: agents.map(a => ({
          id: a.id,
          agent_id: a.agent_id,
          hostname: a.hostname,
          status: a.status,
          current_config_hash: a.current_config_hash,
          config_sync_result: a.config_sync_result,
          last_heartbeat_at: a.last_heartbeat_at,
          joined_at: a.joined_at,
        })),
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  // PATCH /v1/pipelines/:id — update pipeline
  router.patch('/v1/pipelines/:id', async (req, res) => {
    try {
      requireMinRole(req, 'operator');
      const pipeline = await db.getPipeline(req.params.id);
      assertTeamAccess(pipeline, req.activeTeam);

      const { name, description } = req.body;
      if (name !== undefined) {
        validatePipelineName(name);
      }

      const updated = await db.updatePipeline(req.params.id, {
        name,
        description,
      });

      await db.writeAuditLog({
        team: req.activeTeam ?? pipeline!.team,
        action: 'pipeline.update',
        entity_type: 'pipeline',
        entity_id: req.params.id,
        actor: req.pipelineUser?.email ?? 'unknown',
        details: { name, description },
      });

      res.json(updated);
    } catch (err) {
      sendError(res, err);
    }
  });

  // DELETE /v1/pipelines/:id — archive pipeline (soft delete)
  router.delete('/v1/pipelines/:id', async (req, res) => {
    try {
      requireMinRole(req, 'admin');
      const pipeline = await db.getPipeline(req.params.id);
      assertTeamAccess(pipeline, req.activeTeam);

      const archived = await db.archivePipeline(req.params.id);

      await db.writeAuditLog({
        team: req.activeTeam ?? pipeline!.team,
        action: 'pipeline.archive',
        entity_type: 'pipeline',
        entity_id: req.params.id,
        actor: req.pipelineUser?.email ?? 'unknown',
      });

      logger.info(`Pipeline archived: ${pipeline!.name}`, {
        pipelineId: req.params.id,
      });
      res.json(archived);
    } catch (err) {
      sendError(res, err);
    }
  });

  // GET /v1/pipelines/:id/versions — list versions
  router.get('/v1/pipelines/:id/versions', async (req, res) => {
    try {
      const pipeline = await db.getPipeline(req.params.id);
      assertTeamAccess(pipeline, req.activeTeam);

      const versions = await db.listVersions(req.params.id);
      res.json(versions);
    } catch (err) {
      sendError(res, err);
    }
  });

  // POST /v1/pipelines/:id/versions — create version
  router.post('/v1/pipelines/:id/versions', async (req, res) => {
    try {
      requireMinRole(req, 'operator');
      const pipeline = await db.getPipeline(req.params.id);
      assertTeamAccess(pipeline, req.activeTeam);

      const { dag, change_summary, metadata } = req.body;
      if (!dag) {
        throw badRequest('DAG is required');
      }
      validateDag(dag);

      // Get the next version number for the comment
      const latestVersion = await db.getLatestVersion(req.params.id);
      const nextVersionNum = (latestVersion?.version ?? 0) + 1;

      const compiled = compileConfig(dag, pipeline!.name, nextVersionNum);

      const version = await db.createVersion({
        pipeline_id: req.params.id,
        dag,
        vector_config: compiled.yaml,
        config_hash: compiled.hash,
        metadata,
        change_summary,
        created_by: req.pipelineUser?.email ?? 'unknown',
      });

      await db.writeAuditLog({
        team: req.activeTeam ?? pipeline!.team,
        action: 'version.create',
        entity_type: 'pipeline_version',
        entity_id: version.id,
        actor: req.pipelineUser?.email ?? 'unknown',
        details: {
          pipeline_id: req.params.id,
          version: version.version,
          config_hash: compiled.hash,
        },
      });

      res.status(201).json(version);
    } catch (err) {
      sendError(res, err);
    }
  });

  // GET /v1/pipelines/:id/versions/:v — get specific version
  router.get('/v1/pipelines/:id/versions/:v', async (req, res) => {
    try {
      const pipeline = await db.getPipeline(req.params.id);
      assertTeamAccess(pipeline, req.activeTeam);

      const version = await db.getVersion(
        req.params.id,
        parseInt(req.params.v, 10),
      );
      if (!version) {
        throw notFound('VERSION_NOT_FOUND', `Version ${req.params.v} not found`);
      }
      res.json(version);
    } catch (err) {
      sendError(res, err);
    }
  });

  // GET /v1/pipelines/:id/versions/:v/diff — diff with another version
  router.get('/v1/pipelines/:id/versions/:v/diff', async (req, res) => {
    try {
      const pipeline = await db.getPipeline(req.params.id);
      assertTeamAccess(pipeline, req.activeTeam);

      const versionA = await db.getVersion(
        req.params.id,
        parseInt(req.params.v, 10),
      );
      if (!versionA) {
        throw notFound('VERSION_NOT_FOUND', `Version ${req.params.v} not found`);
      }

      const compareParam = req.query.compare as string | undefined;
      if (!compareParam) {
        throw badRequest('compare query parameter is required');
      }
      const versionB = await db.getVersion(
        req.params.id,
        parseInt(compareParam, 10),
      );
      if (!versionB) {
        throw notFound(
          'VERSION_NOT_FOUND',
          `Version ${compareParam} not found`,
        );
      }

      const changes = diffLines(
        versionB.vector_config,
        versionA.vector_config,
      );

      res.json({
        versionA: {
          version: versionA.version,
          config: versionA.vector_config,
        },
        versionB: {
          version: versionB.version,
          config: versionB.vector_config,
        },
        diff: changes,
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  // POST /v1/pipelines/:id/validate — validate pipeline
  router.post('/v1/pipelines/:id/validate', async (req, res) => {
    try {
      const pipeline = await db.getPipeline(req.params.id);
      assertTeamAccess(pipeline, req.activeTeam);

      const { dag } = req.body;
      if (!dag) {
        throw badRequest('DAG is required');
      }

      // Structural validation (checks components, edges, required fields)
      validateDag(dag);

      // Compile to Vector YAML (proves the DAG compiles cleanly)
      const compiled = compileConfig(dag, pipeline!.name, 0);

      // Full Vector config validation happens agent-side when deployed.
      // Agents run `vector validate` with their local binary and report
      // results via heartbeat configSyncResult.
      res.json({
        valid: true,
        errors: [],
        warnings: [],
        compiledHash: compiled.hash,
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  // POST /v1/pipelines/:id/preview — preview transforms
  router.post('/v1/pipelines/:id/preview', async (req, res) => {
    try {
      const pipeline = await db.getPipeline(req.params.id);
      assertTeamAccess(pipeline, req.activeTeam);

      const { sampleEvents, targetNodeId, dag: providedDag } = req.body;
      if (
        !sampleEvents ||
        !Array.isArray(sampleEvents) ||
        sampleEvents.length === 0
      ) {
        throw badRequest('sampleEvents array is required');
      }

      // Use provided DAG or latest saved version's DAG
      let dag = providedDag;
      if (!dag) {
        const latestVersion = await db.getLatestVersion(req.params.id);
        if (!latestVersion) {
          throw badRequest('No saved version found and no DAG provided');
        }
        dag = latestVersion.dag;
      }

      const result = await previewPipeline(dag, sampleEvents, vrlExecutor, {
        targetNodeId,
      });

      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}
