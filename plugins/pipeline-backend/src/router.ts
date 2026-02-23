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

import { Config } from '@backstage/config';
import {
  AuthService,
  HttpAuthService,
  LoggerService,
  PermissionsService,
  UserInfoService,
} from '@backstage/backend-plugin-api';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import type { BasicPermission } from '@backstage/plugin-permission-common';
import express from 'express';
import Router from 'express-promise-router';
import { PipelineDatabase } from './database/PipelineDatabase';
import { VrlExecutor } from './vrl/vrlExecutor';
import { resolveIdentity } from './auth/identityResolver';
import { sendError, forbidden } from './util/errors';
import { createPipelineRoutes } from './routes/pipelineRoutes';
import { createImportRoutes } from './routes/importRoutes';
import { createVrlRoutes } from './routes/vrlRoutes';
import { createComponentRoutes } from './routes/componentRoutes';
import { createTokenRoutes } from './routes/tokenRoutes';
import { createGroupRoutes } from './routes/groupRoutes';
import { createFleetRoutes } from './routes/fleetRoutes';
import { createDeploymentRoutes } from './routes/deploymentRoutes';
import { createManagedConfigRoutes } from './routes/managedConfigRoutes';
import { fleetTokenAuth } from './auth/fleetTokenAuth';
import {
  resolveTeamRole,
} from '@internal/plugin-pipeline-common';
import type { PipelineRole } from '@internal/plugin-pipeline-common';

declare global {
  namespace Express {
    interface Request {
      pipelineUser?: { email: string; userRef: string };
      activeTeam?: string;
      activeRole?: PipelineRole;
      ownershipRefs?: string[];
    }
  }
}

export interface RouterOptions {
  config: Config;
  logger: LoggerService;
  httpAuth: HttpAuthService;
  userInfo: UserInfoService;
  auth: AuthService;
  db: PipelineDatabase;
  vrlExecutor: VrlExecutor;
  permissions: PermissionsService;
}

export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const {
    config,
    logger,
    httpAuth,
    userInfo,
    auth,
    db,
    vrlExecutor,
    permissions,
  } = options;

  const router = Router();
  router.use(express.json({ limit: '2mb' }));

  // Resolve Backstage user identity for all requests
  router.use(async (req, _res, next) => {
    try {
      const identity = await resolveIdentity(req, httpAuth, userInfo, auth);
      if (identity) {
        req.pipelineUser = identity;
        req.ownershipRefs = identity.ownershipRefs;
      }
    } catch {
      // Not authenticated — continue without user context
    }
    next();
  });

  // Extract team context from X-Butler-Team header, resolve role
  router.use((req, _res, next) => {
    const team = req.headers['x-butler-team'] as string | undefined;
    if (team && req.ownershipRefs) {
      const teamRef = `group:default/${team}`;
      if (req.ownershipRefs.includes(teamRef)) {
        req.activeTeam = team;
      }
      req.activeRole = resolveTeamRole(team, req.ownershipRefs);
    } else if (team) {
      req.activeTeam = team;
      req.activeRole = 'viewer';
    } else if (req.ownershipRefs) {
      req.activeRole = resolveTeamRole(null, req.ownershipRefs);
    }
    next();
  });

  // ── Health Check ─────────────────────────────────────────────────────

  router.get('/health', async (_req, res) => {
    const dbHealthy = await db.healthCheck();
    if (dbHealthy) {
      res.json({
        status: 'ok',
        database: 'connected',
        vectorAvailable: vrlExecutor.isAvailable(),
      });
    } else {
      res.status(503).json({ status: 'error', database: 'disconnected' });
    }
  });

  // ── Mount sub-routers ────────────────────────────────────────────────

  const pipelineRouter = createPipelineRoutes({
    db,
    vrlExecutor,
    logger,
  });

  const importRouter = createImportRoutes({ db, logger });
  const vrlRouter = createVrlRoutes({ vrlExecutor });
  const componentRouter = createComponentRoutes();

  router.use(pipelineRouter);
  router.use(importRouter);
  router.use(vrlRouter);
  router.use(componentRouter);

  // ── Fleet management sub-routers ──────────────────────────────────

  const fleetAuth = fleetTokenAuth(db);

  const tokenRouter = createTokenRoutes({ db, logger });
  const groupRouter = createGroupRoutes({ db, logger });
  const fleetRouter = createFleetRoutes({ db, logger, fleetAuth });
  const deploymentRouter = createDeploymentRoutes({ db, vrlExecutor, logger });
  const managedConfigRouter = createManagedConfigRoutes({ db, logger });

  router.use(tokenRouter);
  router.use(groupRouter);
  router.use(fleetRouter);
  router.use(deploymentRouter);
  router.use(managedConfigRouter);

  // ── 404 catch-all ────────────────────────────────────────────────────

  router.use((_req, res) => {
    res.status(404).json({
      error: { message: 'Not found', code: 'PIPELINE_NOT_FOUND' },
    });
  });

  return router;
}
