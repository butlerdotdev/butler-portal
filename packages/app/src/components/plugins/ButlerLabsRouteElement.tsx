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

import { ReactNode } from 'react';
import { configApiRef, useApi } from '@backstage/core-plugin-api';
import {
  BUTLER_LABS_PLUGINS,
  ButlerLabsConfigKey,
  ButlerLabsPluginMeta,
  pluginEnabledConfigKey,
} from './butlerLabsPluginsMeta';
import { PluginNotEnabledPage } from './PluginNotEnabledPage';

// Per-plugin route element switcher. Reads plugins.<configKey>.enabled (and
// the dependency's flag if the plugin has one) and renders one of three
// outcomes:
//
//   1. enabled, deps satisfied  -> children (the real plugin page)
//   2. enabled, deps NOT satisfied -> PluginNotEnabledPage with the
//      dependency-missing copy variant (e.g. "Chambers requires Butler")
//   3. not enabled               -> PluginNotEnabledPage with the standard
//      "available but not enabled" copy
//
// The real plugin page MUST come in via `children`, not via an arbitrary
// prop. Backstage's discovery walker (childDiscoverer +
// routeElementDiscoverer in @backstage/core-app-api) recurses into
// props.children and props.element; it does not introspect custom-
// component props. Passing the routable extension as e.g.
// `enabledElement={<WorkspacesPluginPage />}` would make the extension's
// rootRouteRef invisible to the discovery pass and React would throw
// "Routable extension component with mount point routeRef was not
// discovered in the app element tree" the first time a flag flipped to
// true. See AppDiscovery.test.tsx for the regression net over this layer.
//
// Lives in its own module (not inline in App.tsx) so AppRoutes.test.tsx
// can import and exercise the real component instead of a hand-rolled
// stand-in.
export const ButlerLabsRouteElement = ({
  configKey,
  children,
}: {
  configKey: ButlerLabsConfigKey;
  children: ReactNode;
}) => {
  const config = useApi(configApiRef);
  const meta = BUTLER_LABS_PLUGINS.find(
    (p): p is ButlerLabsPluginMeta => p.configKey === configKey,
  )!;
  const enabled =
    config.getOptionalBoolean(pluginEnabledConfigKey(meta)) ?? false;

  if (!enabled) {
    return <PluginNotEnabledPage meta={meta} />;
  }

  // Plugin is on. If it has a runtime dependency on another Butler Labs
  // plugin, check that too. Chambers (workspaces) depends on Butler at the
  // backend layer because every page proxies through butlerApiRef -> the
  // butler-backend feature loader. workspaces=true with butler=false is a
  // genuinely broken state, so we render the dependency-missing variant
  // rather than letting the plugin silently 404 on every API call.
  if (meta.dependsOn) {
    const depMeta = BUTLER_LABS_PLUGINS.find(
      (p): p is ButlerLabsPluginMeta => p.configKey === meta.dependsOn,
    )!;
    const depEnabled =
      config.getOptionalBoolean(pluginEnabledConfigKey(depMeta)) ?? false;
    if (!depEnabled) {
      return <PluginNotEnabledPage meta={meta} dependencyMeta={depMeta} />;
    }
  }

  return <>{children}</>;
};
