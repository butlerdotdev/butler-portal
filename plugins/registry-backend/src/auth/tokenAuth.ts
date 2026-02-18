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
import crypto from 'crypto';
import { RegistryDatabase } from '../database/RegistryDatabase';
import { TokenRow, TokenScope } from '../database/types';
import { LoggerService } from '@backstage/backend-plugin-api';

declare global {
  namespace Express {
    interface Request {
      registryToken?: TokenRow;
    }
  }
}

/**
 * Middleware that authenticates protocol endpoints using Bearer API tokens.
 *
 * Extracts token from Authorization header, SHA256-hashes it,
 * looks up in api_tokens, verifies not expired/revoked, and checks scope.
 */
export function createTokenAuth(options: {
  db: RegistryDatabase;
  logger: LoggerService;
  requiredScope: TokenScope;
}) {
  const { db, logger, requiredScope } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({
        errors: ['Authentication required'],
      });
      // Add WWW-Authenticate for OCI spec compliance
      if (req.path.startsWith('/oci/')) {
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        res.setHeader(
          'WWW-Authenticate',
          `Bearer realm="${baseUrl}/api/registry/oci/token",service="butler-registry"`,
        );
      }
      return;
    }

    const tokenValue = authHeader.slice(7);

    // Reject callback ephemeral tokens on management/protocol endpoints
    if (tokenValue.startsWith('brce_')) {
      res.status(401).json({ errors: ['Callback tokens cannot be used on this endpoint'] });
      return;
    }

    const tokenHash = crypto
      .createHash('sha256')
      .update(tokenValue)
      .digest('hex');

    try {
      const token = await db.getTokenByHash(tokenHash);

      if (!token) {
        res.status(401).json({ errors: ['Invalid token'] });
        return;
      }

      if (token.revoked_at) {
        res.status(401).json({ errors: ['Token has been revoked'] });
        return;
      }

      if (token.expires_at && new Date(token.expires_at) < new Date()) {
        res.status(401).json({ errors: ['Token has expired'] });
        return;
      }

      const scopes = (token.scopes as TokenScope[]) || [];
      if (!scopes.includes(requiredScope) && !scopes.includes('admin')) {
        res.status(403).json({
          errors: [`Token requires '${requiredScope}' scope`],
        });
        return;
      }

      // Update last_used_at asynchronously — don't block the request
      db.updateTokenLastUsed(token.id).catch(err => {
        logger.warn('Failed to update token last_used_at', { error: err });
      });

      req.registryToken = token;
      next();
    } catch (err) {
      logger.error('Token auth error', { error: String(err) });
      res.status(500).json({ errors: ['Internal server error'] });
    }
  };
}
