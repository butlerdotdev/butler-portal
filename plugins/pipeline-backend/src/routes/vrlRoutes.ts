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
import type { VrlExecutor } from '../vrl/vrlExecutor';
import { sendError, badRequest } from '../util/errors';

export interface VrlRoutesOptions {
  vrlExecutor: VrlExecutor;
}

export function createVrlRoutes(options: VrlRoutesOptions) {
  const { vrlExecutor } = options;
  const router = Router();

  // POST /v1/vrl/validate — validate VRL program syntax (viewer+)
  router.post('/v1/vrl/validate', async (req, res) => {
    try {
      const { program } = req.body;
      if (!program || typeof program !== 'string') {
        throw badRequest('program string is required');
      }

      const result = await vrlExecutor.validate(program);
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  // POST /v1/vrl/execute — execute VRL on sample events (viewer+)
  router.post('/v1/vrl/execute', async (req, res) => {
    try {
      const { program, events } = req.body;
      if (!program || typeof program !== 'string') {
        throw badRequest('program string is required');
      }
      if (!events || !Array.isArray(events) || events.length === 0) {
        throw badRequest('events array is required');
      }

      const result = await vrlExecutor.execute(program, events);
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}
