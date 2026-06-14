/*
 * Copyright 2026 The Butler Authors.
 * SPDX-License-Identifier: Apache-2.0
 */

// The PluginRoot module the Butler Portal dynamic-plugins runtime
// (packages/app/src/components/DynamicRoot/DynamicPluginsLoader.tsx)
// loads first for each remote, then reads dynamicPluginsExports from
// to discover what routes + menu items the plugin contributes.
//
// The contract is RHDH-compatible -- a plugin authored for RHDH
// renders on Butler Portal without changes, and vice versa.
//
// importName values reference sibling exposed modules in the same
// federation manifest (declared in package.json's scalprum.exposedModules
// block). The host loads each importName via getModule.

export const dynamicPluginsExports = {
  dynamicRoutes: [
    {
      path: '/hello-dynamic-plugin',
      importName: 'HelloPage',
      menuItem: {
        text: 'Hello (Dynamic)',
      },
    },
  ],
};
