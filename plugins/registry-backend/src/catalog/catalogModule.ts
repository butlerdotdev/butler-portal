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
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node/alpha';
import { RegistryEntityProvider } from './RegistryEntityProvider';

/**
 * Catalog module that syncs Butler Registry artifacts into the Backstage catalog
 * as Component entities. Polls the registry HTTP API every 5 minutes.
 *
 * Register in backend: backend.add(import('@internal/plugin-registry-backend/catalog'));
 */
export const registryCatalogModule = createBackendModule({
  pluginId: 'catalog',
  moduleId: 'butler-registry-entity-provider',
  register(reg) {
    reg.registerInit({
      deps: {
        catalog: catalogProcessingExtensionPoint,
        logger: coreServices.logger,
        discovery: coreServices.discovery,
        auth: coreServices.auth,
        scheduler: coreServices.scheduler,
      },
      async init({ catalog, logger, discovery, auth, scheduler }) {
        const provider = new RegistryEntityProvider({
          logger,
          discovery,
          auth,
          scheduler,
        });
        catalog.addEntityProvider(provider);
        logger.info('Registered Butler Registry entity provider for catalog sync');
      },
    });
  },
});
