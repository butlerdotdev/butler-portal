/*
 * Copyright 2026 The Butler Authors.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BackendFeature,
  createBackendPlugin,
  coreServices,
} from '@backstage/backend-plugin-api';
import { Router } from 'express';
import * as os from 'os';

// Backend dynamic plugin paired with examples/dynamic-plugin-hello. The
// portal's dynamicPluginsFeatureLoader loads this package at boot when
// it lands in dynamicPlugins.rootDirectory and registers the /ping
// route below at /api/hello-dynamic-backend/ping. The 0.5.1 release-
// boot-test asserts that the route returns the marker substring on the
// released amd64 image; the showcase frontend at
// examples/dynamic-plugin-hello/src/components/HelloPage.tsx renders
// the full JSON payload for visitors.

const PLUGIN_NAME = 'butler-hello-dynamic-backend';
const PLUGIN_VERSION = '0.1.0';
const BACKEND_STARTED_AT = new Date().toISOString();

// Explicit BackendFeature annotation. Without it, the inferred type
// of createBackendPlugin's return references an internal Backstage
// declaration file whose portable path cannot be resolved during
// out-of-tree tsc, causing TS2742. The annotation pins the public
// return type so the example builds cleanly out of the workspace.
export const helloDynamicBackendPlugin: BackendFeature = createBackendPlugin({
  pluginId: 'hello-dynamic-backend',
  register(env) {
    env.registerInit({
      deps: {
        httpRouter: coreServices.httpRouter,
        logger: coreServices.logger,
      },
      async init({ httpRouter, logger }) {
        const router = Router();
        router.get('/ping', (_req, res) => {
          res.json({
            ok: true,
            marker:
              'Hello from the Butler Portal dynamic-plugins runtime (backend)',
            pluginName: PLUGIN_NAME,
            pluginVersion: PLUGIN_VERSION,
            backendStartedAt: BACKEND_STARTED_AT,
            receivedAt: new Date().toISOString(),
            podHostname: os.hostname(),
            nodeVersion: process.version,
            note:
              'This payload is rendered by the bundled showcase frontend (examples/dynamic-plugin-hello). The portal loaded both plugins at boot from dynamicPlugins.plugins[].',
          });
        });

        httpRouter.use(router);
        // The /ping route is the marker-assertion target for the boot
        // test and the showcase round-trip target for the frontend.
        // It is intentionally unauthenticated. Production plugins
        // should not copy this pattern; Butler Portal's default-deny
        // auth policy is the right default for any plugin that touches
        // real data.
        httpRouter.addAuthPolicy({
          path: '/ping',
          allow: 'unauthenticated',
        });

        logger.info(
          `[${PLUGIN_NAME}] registered /api/hello-dynamic-backend/ping`,
        );
      },
    });
  },
});
