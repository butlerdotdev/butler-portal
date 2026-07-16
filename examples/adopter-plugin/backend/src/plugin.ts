import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import Router from 'express-promise-router';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import { isThingOwnerRule, thingResourceRef, Thing } from './rule';
import { thingReadPermission } from './permissions';

const FIXTURES: Record<string, Thing> = {
  'thing-1': { id: 'thing-1', owner: 'user:default/alice' },
  'thing-2': { id: 'thing-2', owner: 'user:default/bob' },
};

export const exampleAdopterPlugin = createBackendPlugin({
  pluginId: 'example',
  register(env) {
    env.registerInit({
      deps: {
        logger: coreServices.logger,
        httpRouter: coreServices.httpRouter,
        httpAuth: coreServices.httpAuth,
        permissions: coreServices.permissions,
        permissionsRegistry: coreServices.permissionsRegistry,
      },
      async init({
        logger,
        httpRouter,
        httpAuth,
        permissions,
        permissionsRegistry,
      }) {
        permissionsRegistry.addResourceType({
          resourceRef: thingResourceRef,
          permissions: [thingReadPermission],
          rules: [isThingOwnerRule],
          getResources: async refs => refs.map(r => FIXTURES[r]),
        });

        const router = Router();
        router.get('/things/:id', async (req, res) => {
          const credentials = await httpAuth.credentials(req);
          const resourceRef = req.params.id;
          const decision = (
            await permissions.authorize(
              [{ permission: thingReadPermission, resourceRef }],
              { credentials },
            )
          )[0];

          if (decision.result === AuthorizeResult.DENY) {
            res.status(403).json({ id: resourceRef, decision: 'DENY' });
            return;
          }
          const resource = FIXTURES[resourceRef];
          if (!resource) {
            res.status(404).json({ id: resourceRef, error: 'not found' });
            return;
          }
          res.json({ id: resourceRef, resource, decision: decision.result });
        });

        httpRouter.use(router);
        httpRouter.addAuthPolicy({ path: '/things/:id', allow: 'user-cookie' });

        logger.info('example adopter plugin ready; permission + rule registered');
      },
    });
  },
});
