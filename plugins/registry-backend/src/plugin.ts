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
import { resolvePackagePath } from '@backstage/backend-plugin-api';
import { RegistryDatabase } from './database/RegistryDatabase';
import { createRouter } from './router';
import { PeaasExecutor } from './executor';

const migrationsDir = resolvePackagePath(
  '@internal/plugin-registry-backend',
  'migrations',
);

/**
 * Registry backend plugin — a private IaC artifact registry.
 *
 * Provides:
 * - Management API for artifact and version CRUD
 * - Terraform Registry Protocol v1
 * - Helm Repository Index
 * - OCI Distribution proxy/redirect
 * - Webhook endpoints for VCS integration
 * - API token authentication for CLI consumers
 *
 * Configuration (app-config.yaml):
 *
 * ```yaml
 * registry:
 *   baseUrl: https://portal.company.com
 *   storage:
 *     git:
 *       enabled: true
 *     oci:
 *       enabled: true
 *       registryUrl: https://zot.butler-system.svc:5000
 *       allowedRegistries:
 *         - zot.butler-system.svc:5000
 * ```
 */
export const registryPlugin = createBackendPlugin({
  pluginId: 'registry',
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
        logger.info('Initializing registry backend plugin');

        // Get database client and run migrations
        const knex = await database.getClient();

        if (!database.migrations?.skip) {
          logger.info('Running registry database migrations');
          await knex.migrate.latest({
            directory: migrationsDir,
          });
          logger.info('Registry database migrations complete');
        }

        const db = new RegistryDatabase(knex);

        // Create the router
        const router = await createRouter({
          config,
          logger: logger.child({ service: 'registry-router' }),
          httpAuth,
          userInfo,
          auth,
          db,
          permissions,
        });

        httpRouter.use(router);

        // Protocol, webhook, CI, and health endpoints bypass Backstage auth.
        // They use their own token auth or signature verification.
        httpRouter.addAuthPolicy({ path: '/.well-known', allow: 'unauthenticated' });
        httpRouter.addAuthPolicy({ path: '/v1/modules', allow: 'unauthenticated' });
        httpRouter.addAuthPolicy({ path: '/v1/providers', allow: 'unauthenticated' });
        httpRouter.addAuthPolicy({ path: '/helm', allow: 'unauthenticated' });
        httpRouter.addAuthPolicy({ path: '/oci', allow: 'unauthenticated' });
        httpRouter.addAuthPolicy({ path: '/webhooks', allow: 'unauthenticated' });
        httpRouter.addAuthPolicy({ path: '/v1/ci', allow: 'unauthenticated' });
        httpRouter.addAuthPolicy({ path: '/health', allow: 'unauthenticated' });
        // Management API routes go through Backstage auth (cookie for browser,
        // service token for backend-to-backend). Permission checks are handled
        // inside route handlers via the permissions service.
        httpRouter.addAuthPolicy({ path: '/_test', allow: 'unauthenticated' });

        // Initialize PeaaS executor if enabled
        const peaasEnabled = config.getOptionalBoolean('registry.iac.peaas.enabled') ?? false;
        const executor = new PeaasExecutor(db, {
          enabled: peaasEnabled,
          namespace: config.getOptionalString('registry.iac.peaas.namespace') ?? 'butler-registry-runs',
          serviceAccount: config.getOptionalString('registry.iac.peaas.serviceAccount'),
          defaultTerraformVersion: config.getOptionalString('registry.iac.peaas.defaultTerraformVersion') ?? '1.9.0',
          timeoutSeconds: config.getOptionalNumber('registry.iac.peaas.timeoutSeconds') ?? 1800,
          maxConcurrentRuns: config.getOptionalNumber('registry.iac.peaas.maxConcurrentRuns') ?? 10,
          confirmationTimeoutSeconds: config.getOptionalNumber('registry.iac.confirmationTimeoutSeconds') ?? 3600,
        }, logger.child({ service: 'peaas-executor' }));

        await executor.start();

        lifecycle.addShutdownHook(async () => {
          await executor.stop();
          logger.info('Registry backend plugin shut down');
        });

        logger.info('Registry backend plugin initialized successfully');
      },
    });
  },
});
