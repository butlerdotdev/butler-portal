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

import { Route } from 'react-router-dom';
import { useDynamicRootContext } from './DynamicRootContext';

// Slot component the host's FlatRoutes (App.tsx) renders alongside the
// hardcoded routes. When no dynamic plugins are loaded (the chart 0.5.0
// default), useDynamicRootContext returns the empty default and this
// produces an empty Fragment -- no Route elements emitted, no change to
// the rendered tree vs chart 0.4.0.
//
// When plugins ARE loaded, this emits one <Route> per dynamic route.
// Backstage's discovery walker doesn't recurse into function components,
// so it doesn't index these -- which is correct: dynamic plugins register
// their routeRefs at runtime via their own createPlugin call, not via
// createApp's compile-time walker. The static hardcoded routes above
// continue to register their refs at createApp time as they do today.
export const DynamicRouteSlot = () => {
	const { dynamicRoutes } = useDynamicRootContext();
	return (
		<>
			{dynamicRoutes.map(route => (
				<Route
					key={route.key ?? route.path}
					path={route.path}
					element={route.element}
				/>
			))}
		</>
	);
};
