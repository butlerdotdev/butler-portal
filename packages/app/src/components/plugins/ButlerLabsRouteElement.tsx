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
  ButlerLabsConfigKey,
  getButlerLabsPluginRuntimeState,
  getPluginMeta,
} from './butlerLabsPluginsMeta';
import { PluginNotEnabledPage } from './PluginNotEnabledPage';

// Per-plugin route element switcher. Reads the plugin's runtime state
// (plugin flag plus, if applicable, its dependency's flag) and renders
// one of three outcomes:
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
// The runtime-state check is delegated to
// getButlerLabsPluginRuntimeState so this component, HomeNavigationCards,
// and Root.tsx (sidebar) all gate identically. A surface drift (sidebar
// reads as enabled while the route lands on PluginNotEnabledPage) is
// what that helper is here to prevent.
export const ButlerLabsRouteElement = ({
  configKey,
  children,
}: {
  configKey: ButlerLabsConfigKey;
  children: ReactNode;
}) => {
  const config = useApi(configApiRef);
  const meta = getPluginMeta(configKey);
  const state = getButlerLabsPluginRuntimeState(config, meta);

  if (!state.enabled) {
    return (
      <PluginNotEnabledPage
        meta={meta}
        dependencyMeta={state.missingDependency}
      />
    );
  }
  return <>{children}</>;
};
