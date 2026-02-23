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

import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import type { PipelineDatabase } from '../database/PipelineDatabase';
import type { FleetTokenRow } from '../database/types';
import { PipelineError, sendError } from '../util/errors';

// Extend Express Request for fleet auth
declare global {
  namespace Express {
    interface Request {
      fleetToken?: FleetTokenRow;
      fleetTeam?: string;
    }
  }
}

/**
 * Express middleware factory that authenticates requests using fleet tokens.
 *
 * Expects a Bearer token in the Authorization header (format: `Bearer bft_...`).
 * The raw token is SHA-256 hashed and looked up in the fleet_tokens table.
 * On success, attaches the token row and team to the request object.
 */
export function fleetTokenAuth(db: PipelineDatabase) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      sendError(
        res,
        new PipelineError(401, 'UNAUTHORIZED', 'Missing or invalid Authorization header'),
      );
      return;
    }

    const rawToken = authHeader.slice('Bearer '.length);
    if (!rawToken) {
      sendError(
        res,
        new PipelineError(401, 'UNAUTHORIZED', 'Missing bearer token'),
      );
      return;
    }

    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    let token: FleetTokenRow | null;
    try {
      token = await db.getFleetTokenByHash(tokenHash);
    } catch {
      sendError(
        res,
        new PipelineError(500, 'INTERNAL_ERROR', 'Failed to validate token'),
      );
      return;
    }

    if (!token) {
      sendError(
        res,
        new PipelineError(401, 'UNAUTHORIZED', 'Invalid fleet token'),
      );
      return;
    }

    // Check if token has been revoked
    if (token.revoked_at !== null) {
      sendError(
        res,
        new PipelineError(401, 'TOKEN_REVOKED', 'Fleet token has been revoked'),
      );
      return;
    }

    // Check if token has expired
    if (token.expires_at !== null && new Date(token.expires_at) <= new Date()) {
      sendError(
        res,
        new PipelineError(401, 'TOKEN_EXPIRED', 'Fleet token has expired'),
      );
      return;
    }

    req.fleetToken = token;
    req.fleetTeam = token.team;
    next();
  };
}
