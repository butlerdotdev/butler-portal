/*
 * Copyright 2026 The Butler Authors.
 * SPDX-License-Identifier: Apache-2.0
 */

export { helloDynamicPlugin, HelloDynamicPluginPage } from './plugin';

// The runtime contract the Butler Portal dynamic-plugins loader looks for.
// rhdh-cli bundles the whole plugin as a single Module Federation remote
// with `.` as the only exposed module, so the host loads `.` and reads
// named exports off the resulting module. dynamicPluginsExports declares
// the routes/menu items the plugin contributes; the host resolves each
// route's importName (e.g. "HelloPage") against the same module's named
// exports.
export { dynamicPluginsExports } from './dynamic/PluginRoot';
export { HelloPage } from './components/HelloPage';
