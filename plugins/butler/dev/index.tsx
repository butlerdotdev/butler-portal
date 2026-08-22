// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * Standalone dev harness for the Butler plugin.
 *
 * Runs the plugin against MockButlerApi so every page can be exercised
 * without butler-server. Start it with:
 *
 *   yarn workspace @internal/plugin-butler start
 */

import { createDevApp } from '@backstage/dev-utils';
import { MockPermissionApi } from '@backstage/test-utils';
import { permissionApiRef } from '@backstage/plugin-permission-react';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import { butlerPlugin, ButlerPage } from '../src/plugin';
import { butlerApiRef } from '../src/api/ButlerApi';
import { MockButlerApi } from '../src/api/MockButlerApi';

createDevApp()
  .registerPlugin(butlerPlugin)
  .registerApi({
    api: butlerApiRef,
    deps: {},
    factory: () => new MockButlerApi({ latencyMs: 150 }),
  })
  .registerApi({
    api: permissionApiRef,
    deps: {},
    factory: () => new MockPermissionApi(() => AuthorizeResult.ALLOW),
  })
  .addPage({
    element: <ButlerPage />,
    title: 'Butler',
    path: '/butler',
  })
  .render();
