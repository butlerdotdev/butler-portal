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
 *     username: admin
 *     password: ${BUTLER_ADMIN_PASSWORD}
 * ```
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
        // Read butler configuration
        const baseUrl = config.getString('butler.baseUrl');
        const username = config.getString('butler.auth.username');
        const password = config.getString('butler.auth.password');

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

        // Register the router with Backstage's HTTP router
        httpRouter.use(router);

        // Allow unauthenticated access from the Backstage frontend.
        // The butler backend plugin handles its own authentication to
        // butler-server; Backstage auth is not required for these proxy routes.
        httpRouter.addAuthPolicy({
          path: '/',
          allow: 'unauthenticated',
        });

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
