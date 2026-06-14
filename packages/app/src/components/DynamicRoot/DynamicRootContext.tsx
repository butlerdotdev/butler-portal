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

import { createContext, useContext } from 'react';
import {
	DynamicRootContextValue,
	EMPTY_DYNAMIC_ROOT_CONTEXT,
} from './types';

// React context the host's FlatRoutes and Sidebar read to mount dynamic
// plugin routes and menu items alongside the static hardcoded ones.
//
// The default value is the empty state: { dynamicRoutes: [], dynamicMenuItems: [] }.
// When NO Provider wraps the tree (the chart 0.5.0 default state, before
// any customer enables dynamicPlugins), useDynamicRootContext returns this
// empty default, the Slot components render no JSX, and the host's
// rendered output is identical to chart 0.4.0.
//
// This is the additive transparency guarantee in code: the empty default
// IS the no-op for non-adopters.
export const DynamicRootContext = createContext<DynamicRootContextValue>(
	EMPTY_DYNAMIC_ROOT_CONTEXT,
);

export function useDynamicRootContext(): DynamicRootContextValue {
	return useContext(DynamicRootContext);
}
