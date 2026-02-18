// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import {
  createPlugin,
  createApiFactory,
  discoveryApiRef,
  fetchApiRef,
  createRoutableExtension,
} from '@backstage/core-plugin-api';
import { registryApiRef } from './api/RegistryApi';
import { RegistryApiClient } from './api/RegistryApiClient';
import { rootRouteRef } from './routes';

export const registryPlugin = createPlugin({
  id: 'registry',
  routes: {
    root: rootRouteRef,
  },
  apis: [
    createApiFactory({
      api: registryApiRef,
      deps: { discoveryApi: discoveryApiRef, fetchApi: fetchApiRef },
      factory: ({ discoveryApi, fetchApi }) =>
        new RegistryApiClient({ discoveryApi, fetchApi }),
    }),
  ],
});

export const RegistryPage = registryPlugin.provide(
  createRoutableExtension({
    name: 'RegistryPage',
    component: () =>
      import('./components/RegistryPage/RegistryPage').then(
        m => m.RegistryPage,
      ),
    mountPoint: rootRouteRef,
  }),
);
