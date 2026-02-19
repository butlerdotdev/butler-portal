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
import {
  HttpAuthService,
  UserInfoService,
  AuthService,
  LoggerService,
} from '@backstage/backend-plugin-api';
import { resolveIdentity } from './identityResolver';

declare global {
  namespace Express {
    interface Request {
      registryUser?: { email: string; userRef: string };
    }
  }
}

/**
 * Middleware that resolves Backstage user identity for management API routes.
 *
 * Sets req.registryUser with the resolved email and entity ref.
 * Returns 401 if the user is not authenticated.
 *
 * RBAC enforcement (team membership checks) will be added when butler-server
 * team membership API is integrated. For now, any authenticated user can
 * access the management API.
 */
export function createRbacMiddleware(options: {
  httpAuth: HttpAuthService;
  userInfo: UserInfoService;
  auth: AuthService;
  logger: LoggerService;
}) {
  const { httpAuth, userInfo, auth, logger } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const identity = await resolveIdentity(req, httpAuth, userInfo, auth);

      if (!identity) {
        res.status(401).json({
          error: {
            message: 'Authentication required',
            code: 'UNAUTHORIZED',
          },
        });
        return;
      }

      req.registryUser = identity;
      next();
    } catch (err) {
      logger.error('RBAC middleware error', { error: String(err) });
      res.status(500).json({
        error: {
          message: 'Internal server error',
          code: 'INTERNAL_ERROR',
        },
      });
    }
  };
}
