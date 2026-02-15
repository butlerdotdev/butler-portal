// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import {
  createPlugin,
  createRoutableExtension,
} from '@backstage/core-plugin-api';
import { rootRouteRef } from './routes';

export const workspacesPlugin = createPlugin({
  id: 'workspaces',
  routes: {
    root: rootRouteRef,
  },
});

export const WorkspacesPluginPage = workspacesPlugin.provide(
  createRoutableExtension({
    name: 'WorkspacesPluginPage',
    component: () =>
      import('./components/WorkspacesPlugin/WorkspacesPlugin').then(
        m => m.WorkspacesPlugin,
      ),
    mountPoint: rootRouteRef,
  }),
);
