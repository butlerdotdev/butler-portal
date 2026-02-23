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
import { getComponentSchemas, getComponentSchema } from '../components';
import { sendError, notFound } from '../util/errors';

export function createComponentRoutes() {
  const router = Router();

  // GET /v1/components — list all component schemas
  router.get('/v1/components', async (_req, res) => {
    try {
      const schemas = getComponentSchemas();
      res.json(schemas);
    } catch (err) {
      sendError(res, err);
    }
  });

  // GET /v1/components/:type — get specific schema by vectorType
  router.get('/v1/components/:type', async (req, res) => {
    try {
      const schema = getComponentSchema(req.params.type);
      if (!schema) {
        throw notFound(
          'PIPELINE_NOT_FOUND',
          `Component type "${req.params.type}" not found`,
        );
      }
      res.json(schema);
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}
