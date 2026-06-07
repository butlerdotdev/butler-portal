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
import { AuthManager } from './service/AuthManager';
import { createRouter } from './router';
import { validateButlerAuth } from './validation';

/**
 * butlerPlugin is a Backstage backend plugin that acts as a Backend-for-Frontend
 * (BFF) proxy to butler-server.
 *
 * It authenticates to butler-server on startup using configured credentials,
 * then proxies all incoming requests to butler-server with the appropriate
 * authorization headers.
 *
 * When a Backstage user is authenticated (e.g., via Google SSO), the user's
 * identity (email) is extracted from the Backstage credentials and forwarded
 * to butler-server via the X-Butler-User-Email header. This allows butler-server
 * to scope responses to the authenticated user.
 *
 * Configuration (app-config.yaml):
 *
 * ```yaml
 * butler:
 *   baseUrl: http://butler-server:8080
 *   auth:
 *     username: ${BUTLER_SERVICE_ACCOUNT_USER}
 *     password: ${BUTLER_SERVICE_ACCOUNT_PASSWORD}
 * ```
 *
 * Credentials must be provided explicitly. The plugin rejects empty values
 * and the literal "admin" at init time so prior insecure defaults cannot
 * silently re-emerge.
 */
export const butlerPlugin = createBackendPlugin({
  pluginId: 'butler',
  register(env) {
    env.registerInit({
      deps: {
        config: coreServices.rootConfig,
        logger: coreServices.logger,
        httpRouter: coreServices.httpRouter,
        httpAuth: coreServices.httpAuth,
        userInfo: coreServices.userInfo,
        auth: coreServices.auth,
        lifecycle: coreServices.lifecycle,
      },
      async init({ config, logger, httpRouter, httpAuth, userInfo, auth, lifecycle }) {
        // Read butler configuration. getString throws if any key is absent.
        const baseUrl = config.getString('butler.baseUrl');
        const username = config.getString('butler.auth.username');
        const password = config.getString('butler.auth.password');

        // Defense-in-depth on top of the chart's butlerAuth.existingSecret
        // enforcement: catch empty values and the prior insecure default for
        // any path that bypasses the chart (local dev overrides, manual
        // deployments, future code changes that re-introduce a default).
        // Operators may set BUTLER_ALLOW_INSECURE_ADMIN_CREDENTIALS=true to
        // accept admin/admin (warning logged); empty values always throw.
        validateButlerAuth(username, password, logger);

        logger.info('Initializing butler backend plugin', {
          baseUrl,
          username,
        });

        // Create the auth manager and authenticate to butler-server
        const authManager = new AuthManager({
          baseUrl,
          username,
          password,
          logger: logger.child({ service: 'butler-auth-manager' }),
        });

        // Attempt to authenticate on startup, but don't fail hard
        // so the rest of Backstage can still start without butler-server
        try {
          await authManager.login();
          logger.info('Authenticated to butler-server');
        } catch (err) {
          logger.warn(
            'Failed to authenticate to butler-server on startup. ' +
            'Butler API requests will fail until butler-server is available. ' +
            `Error: ${err instanceof Error ? err.message : String(err)}`,
          );
        }

        // Create the proxy router
        const router = await createRouter({
          baseUrl,
          authManager,
          httpAuth,
          userInfo,
          auth,
          logger: logger.child({ service: 'butler-router' }),
        });

        // Router is mounted under Backstage's default-deny auth gate.
        // All routes require an authenticated Backstage caller.
        httpRouter.use(router);

        // Clean up on shutdown
        lifecycle.addShutdownHook(() => {
          authManager.stop();
          logger.info('Butler backend plugin shut down');
        });

        logger.info('Butler backend plugin initialized successfully');
      },
    });
  },
});
