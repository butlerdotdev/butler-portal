/*
 * Copyright 2026 The Butler Authors.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createBackendPlugin, coreServices } from '@backstage/backend-plugin-api';
import { Router } from 'express';

// Minimal Backstage backend plugin that the portal's
// dynamicPluginsFeatureLoader loads at boot when this package is
// dropped into dynamicPlugins.rootDirectory. The boot test that
// gates 0.5.1+ asserts the /ping route below responds with the
// marker, proving the backend dynamic-plugin runtime is wired
// end-to-end through the released portal image.
export const helloDynamicBackendPlugin = createBackendPlugin({
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
          });
        });

        httpRouter.use(router);
        // The /ping route is the marker-assertion target for the boot
        // test and is intentionally unauthenticated. Production plugins
        // should not copy this pattern; Butler Portal's default-deny
        // auth policy is the right default for any plugin that touches
        // real data.
        httpRouter.addAuthPolicy({
          path: '/ping',
          allow: 'unauthenticated',
        });

        logger.info(
          '[hello-dynamic-backend] registered /api/hello-dynamic-backend/ping',
        );
      },
    });
  },
});
