// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import {
  createPlugin,
  createApiFactory,
  discoveryApiRef,
  fetchApiRef,
  createRoutableExtension,
} from '@backstage/core-plugin-api';
import { butlerApiRef } from './api/ButlerApi';
import { ButlerApiClient } from './api/ButlerApiClient';
import { rootRouteRef } from './routes';

export const butlerPlugin = createPlugin({
  id: 'butler',
  routes: {
    root: rootRouteRef,
  },
  apis: [
    createApiFactory({
      api: butlerApiRef,
      deps: { discoveryApi: discoveryApiRef, fetchApi: fetchApiRef },
      factory: ({ discoveryApi, fetchApi }) =>
        new ButlerApiClient({ discoveryApi, fetchApi }),
    }),
  ],
});

export const ButlerPage = butlerPlugin.provide(
  createRoutableExtension({
    name: 'ButlerPage',
    component: () =>
      import('./components/ButlerPage/ButlerPage').then(m => m.ButlerPage),
    mountPoint: rootRouteRef,
  }),
);
