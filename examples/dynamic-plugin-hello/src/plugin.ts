/*
 * Copyright 2026 The Butler Authors.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  createPlugin,
  createRoutableExtension,
} from '@backstage/core-plugin-api';
import { rootRouteRef } from './routes';

export const helloDynamicPlugin = createPlugin({
  id: 'hello-dynamic-plugin',
  routes: {
    root: rootRouteRef,
  },
});

export const HelloDynamicPluginPage = helloDynamicPlugin.provide(
  createRoutableExtension({
    name: 'HelloDynamicPluginPage',
    component: () =>
      import('./components/HelloPage').then(m => m.HelloPage),
    mountPoint: rootRouteRef,
  }),
);
