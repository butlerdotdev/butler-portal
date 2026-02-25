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

import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { resolvePackagePath } from '@backstage/backend-common';
import { PipelineDatabase } from './database/PipelineDatabase';
import { VrlExecutor } from './vrl/vrlExecutor';
import { createRouter } from './router';

const migrationsDir = resolvePackagePath(
  '@internal/plugin-pipeline-backend',
  'migrations',
);

export const pipelinePlugin = createBackendPlugin({
  pluginId: 'pipeline',
  register(env) {
    env.registerInit({
      deps: {
        config: coreServices.rootConfig,
        logger: coreServices.logger,
        httpRouter: coreServices.httpRouter,
        httpAuth: coreServices.httpAuth,
        userInfo: coreServices.userInfo,
        auth: coreServices.auth,
        database: coreServices.database,
        lifecycle: coreServices.lifecycle,
        permissions: coreServices.permissions,
      },
      async init({
        config,
        logger,
        httpRouter,
        httpAuth,
        userInfo,
        auth,
        database,
        lifecycle,
        permissions,
      }) {
        // Run migrations
        const knex = await database.getClient();
        if (!database.migrations?.skip) {
          await knex.migrate.latest({
            directory: migrationsDir,
          });
        }

        const db = new PipelineDatabase(knex);

        // Initialize VRL executor
        const vectorBinaryPath =
          config.getOptionalString('pipeline.vectorBinaryPath') ?? undefined;
        const vrlTimeoutMs =
          config.getOptionalNumber('pipeline.vrl.timeoutMs') ?? undefined;
        const vrlExecutor = new VrlExecutor(
          {
            vectorBinaryPath,
            timeoutMs: vrlTimeoutMs,
          },
          logger,
        );
        await vrlExecutor.initialize();

        // Create and mount router
        const router = await createRouter({
          config,
          logger,
          httpAuth,
          userInfo,
          auth,
          db,
          vrlExecutor,
          permissions,
        });

        httpRouter.use(router);

        httpRouter.addAuthPolicy({
          path: '/health',
          allow: 'unauthenticated',
        });

        httpRouter.addAuthPolicy({
          path: '/v1/fleet/agents',
          allow: 'unauthenticated',
        });

        lifecycle.addShutdownHook(() => {
          logger.info('Pipeline plugin shutting down');
        });

        logger.info('Pipeline plugin initialized');
      },
    });
  },
});
