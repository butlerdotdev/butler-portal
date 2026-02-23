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
import { validatePipelineName } from '../util/validation';
import {
  sendError,
  requireMinRole,
  badRequest,
} from '../util/errors';
import type { LoggerService } from '@backstage/backend-plugin-api';

export interface ImportRoutesOptions {
  db: PipelineDatabase;
  logger: LoggerService;
}

export function createImportRoutes(options: ImportRoutesOptions) {
  const { db, logger } = options;
  const router = Router();

  // POST /v1/pipelines/import — import config as new pipeline
  router.post('/v1/pipelines/import', async (req, res) => {
    try {
      requireMinRole(req, 'operator');

      const { config, name, description, format } = req.body;
      if (!config || typeof config !== 'string') {
        throw badRequest('config string is required');
      }
      if (!name) {
        throw badRequest('name is required');
      }
      validatePipelineName(name);

      if (!req.activeTeam) {
        throw badRequest('Team context required');
      }

      // Parse the config into a DAG
      const parsed = parseConfig(config, format);

      // Compile through standard compiler for deterministic output
      const compiled = compileConfig(parsed.dag, name, 1);

      // Create pipeline
      const pipeline = await db.createPipeline({
        name,
        description,
        team: req.activeTeam,
        created_by: req.pipelineUser?.email ?? 'unknown',
      });

      // Create first version with original config stored in metadata
      const version = await db.createVersion({
        pipeline_id: pipeline.id,
        dag: parsed.dag,
        vector_config: compiled.yaml,
        config_hash: compiled.hash,
        metadata: { originalConfig: parsed.originalConfig },
        change_summary: 'Imported from existing configuration',
        created_by: req.pipelineUser?.email ?? 'unknown',
      });

      await db.writeAuditLog({
        team: req.activeTeam,
        action: 'pipeline.import',
        entity_type: 'pipeline',
        entity_id: pipeline.id,
        actor: req.pipelineUser?.email ?? 'unknown',
        details: { name, config_hash: compiled.hash },
      });

      logger.info(`Pipeline imported: ${name}`, {
        pipelineId: pipeline.id,
        team: req.activeTeam,
      });
      res.status(201).json({ pipeline, version });
    } catch (err) {
      sendError(res, err);
    }
  });

  // POST /v1/pipelines/import/preview — preview import without saving
  router.post('/v1/pipelines/import/preview', async (req, res) => {
    try {
      const { config, format } = req.body;
      if (!config || typeof config !== 'string') {
        throw badRequest('config string is required');
      }

      const parsed = parseConfig(config, format);
      res.json({ dag: parsed.dag });
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}
