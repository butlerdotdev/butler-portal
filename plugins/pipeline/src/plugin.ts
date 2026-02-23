// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import {
  createPlugin,
  createApiFactory,
  discoveryApiRef,
  fetchApiRef,
  createRoutableExtension,
} from '@backstage/core-plugin-api';
import { pipelineApiRef } from './api/PipelineApi';
import { PipelineApiClient } from './api/PipelineApiClient';
import { rootRouteRef } from './routes';

export const pipelinePlugin = createPlugin({
  id: 'pipeline',
  routes: {
    root: rootRouteRef,
  },
  apis: [
    createApiFactory({
      api: pipelineApiRef,
      deps: { discoveryApi: discoveryApiRef, fetchApi: fetchApiRef },
      factory: ({ discoveryApi, fetchApi }) =>
        new PipelineApiClient({ discoveryApi, fetchApi }),
    }),
  ],
});

export const PipelinePage = pipelinePlugin.provide(
  createRoutableExtension({
    name: 'PipelinePage',
    component: () =>
      import('./components/PipelinePage/PipelinePage').then(
        m => m.PipelinePage,
      ),
    mountPoint: rootRouteRef,
  }),
);
