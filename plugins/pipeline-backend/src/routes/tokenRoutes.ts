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

import crypto from 'crypto';
import Router from 'express-promise-router';
import type { PipelineDatabase } from '../database/PipelineDatabase';
import {
  sendError,
  requireMinRole,
  badRequest,
  notFound,
} from '../util/errors';
import type { LoggerService } from '@backstage/backend-plugin-api';

export interface TokenRoutesOptions {
  db: PipelineDatabase;
  logger: LoggerService;
}

export function createTokenRoutes(options: TokenRoutesOptions) {
  const { db, logger } = options;
  const router = Router();

  // GET /v1/fleet/tokens — list team tokens (prefix only, NOT full token)
  router.get('/v1/fleet/tokens', async (req, res) => {
    try {
      requireMinRole(req, 'admin');

      const rows = await db.listFleetTokens({ team: req.activeTeam ?? undefined });

      // Strip token_hash from response — only return prefix
      const tokens = rows.map(({ token_hash: _hash, ...rest }) => rest);

      res.json({ items: tokens });
    } catch (err) {
      sendError(res, err);
    }
  });

  // POST /v1/fleet/tokens — create token (returns full token ONCE)
  router.post('/v1/fleet/tokens', async (req, res) => {
    try {
      requireMinRole(req, 'admin');

      const team = req.activeTeam ?? req.body.team;
      if (!team) {
        throw badRequest('Team context required. In admin mode, include "team" in the request body.');
      }

      const { name, expires_at } = req.body;
      if (!name) {
        throw badRequest('Token name is required');
      }

      // Generate raw token with bft_ prefix
      const rawToken = `bft_${crypto.randomBytes(32).toString('base64url')}`;
      const tokenHash = crypto
        .createHash('sha256')
        .update(rawToken)
        .digest('hex');
      const tokenPrefix = rawToken.slice(0, 8);

      const row = await db.createFleetToken({
        team,
        name,
        token_prefix: tokenPrefix,
        token_hash: tokenHash,
        created_by: req.pipelineUser?.email ?? 'unknown',
        expires_at,
      });

      await db.writeAuditLog({
        team,
        action: 'token.create',
        entity_type: 'fleet_token',
        entity_id: row.id,
        actor: req.pipelineUser?.email ?? 'unknown',
        details: { name },
      });

      logger.info(`Fleet token created: ${name}`, {
        tokenId: row.id,
        team,
      });

      // Return full token — shown ONCE
      const { token_hash: _hash, ...safeRow } = row;
      res.status(201).json({ ...safeRow, token: rawToken });
    } catch (err) {
      sendError(res, err);
    }
  });

  // DELETE /v1/fleet/tokens/:id — revoke token
  router.delete('/v1/fleet/tokens/:id', async (req, res) => {
    try {
      requireMinRole(req, 'admin');

      const row = await db.revokeFleetToken(req.params.id);
      if (!row) {
        throw notFound('TOKEN_NOT_FOUND', 'Fleet token not found');
      }

      await db.writeAuditLog({
        team: req.activeTeam ?? row.team,
        action: 'token.revoke',
        entity_type: 'fleet_token',
        entity_id: req.params.id,
        actor: req.pipelineUser?.email ?? 'unknown',
      });

      logger.info(`Fleet token revoked: ${row.name}`, {
        tokenId: req.params.id,
        team: row.team,
      });

      res.json({ id: row.id, revoked: true });
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}
