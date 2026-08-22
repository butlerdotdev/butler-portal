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
import { butlerPermissions } from '@internal/plugin-butler-common';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import { AuthManager } from './service/AuthManager';
import { IdentityResolver } from './service/IdentityResolver';
import { loadPortalSigner } from './service/PortalSigner';
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
        permissions: coreServices.permissions,
        permissionsRegistry: coreServices.permissionsRegistry,
        catalog: catalogServiceRef,
      },
      async init({
        config,
        logger,
        httpRouter,
        httpAuth,
        userInfo,
        auth,
        lifecycle,
        permissions,
        permissionsRegistry,
        catalog,
      }) {
        // Registering the permissions publishes them on the plugin's
        // permission metadata endpoint, which is how RBAC discovers them
        // and how the pluginsWithPermission audit sees this plugin.
        permissionsRegistry.addPermissions(butlerPermissions);

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

        // Authenticate to butler-server. Failure propagates out of init so
        // Backstage marks the butler plugin as failed and butler routes
        // return 503 instead of attempting (and failing) the proxy call.
        // Global health endpoints stay 200; the IDP shell, catalog, and
        // TechDocs continue to work. Operators wanting butler-specific
        // alerting should monitor /api/butler/_health independently.
        await authManager.login();
        logger.info('Authenticated to butler-server');

        // Stage 2 signing-proof carrier: optional. When both
        // butler.signing.keyPath and butler.signing.kid are configured AND
        // the key file is present at the path, a PortalSigner is
        // constructed and the proxy + WS relay use it to mint Ed25519
        // proofs that butler-server's portal-JWT verifier accepts. When
        // either config is unset or the key file is absent, the signer is
        // null and the legacy admin Bearer + X-Butler-User-Email carrier
        // is preserved byte-identically. This is the dormant-until-mounted
        // shape that keeps Stage 2's deploy a no-op until Stage 3 lands
        // the SealedSecret and configures butler-server's pubkey.
        const portalSigner = loadPortalSigner({
          keyPath: config.getOptionalString('butler.signing.keyPath'),
          kid: config.getOptionalString('butler.signing.kid'),
          logger: logger.child({ service: 'butler-portal-signer' }),
        });

        // Identity mapping from Backstage user to butler-server email. The
        // catalog User entity's profile email is preferred; the configured
        // domain covers sign-in resolvers that issue local-part-only refs.
        const identityResolver = new IdentityResolver({
          userInfo,
          auth,
          catalog,
          emailDomain: config.getOptionalString('butler.identity.emailDomain'),
          logger: logger.child({ service: 'butler-identity' }),
        });

        // Create the proxy router
        const router = await createRouter({
          baseUrl,
          authManager,
          httpAuth,
          userInfo,
          auth,
          logger: logger.child({ service: 'butler-router' }),
          portalSigner,
          permissions,
          allowUnmappedRoutes:
            config.getOptionalBoolean('butler.authorization.allowUnmappedRoutes') ??
            false,
          identityResolver,
        });

        // Router is mounted under Backstage's default-deny auth gate.
        // All routes require an authenticated Backstage caller EXCEPT
        // /_health, which is intentionally unauthenticated so external
        // monitoring tools (Prometheus blackbox, Pingdom, etc.) can poll
        // it without a Backstage session. The endpoint exposes only the
        // current auth state and (on degraded) a non-sensitive error
        // message; no credentials or tokens are returned.
        //
        // Path-matching note: Backstage's createCredentialsBarrier uses
        // pathToRegexp(policyPath, { end: false }), which is PREFIX
        // matching. The current router only registers GET /_health, so
        // this exception matches exactly one route today. If a future
        // commit adds any /_health/<sub> route, that sub-path will be
        // unauthenticated by default. Either add explicit per-route auth
        // there or restructure this policy when /_health/* routes are
        // introduced. Tracked in the followup queue.
        httpRouter.addAuthPolicy({
          path: '/_health',
          allow: 'unauthenticated',
        });
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
