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

export { ScalprumRoot } from './ScalprumRoot';
export {
	DynamicRootContext,
	useDynamicRootContext,
} from './DynamicRootContext';
export { DynamicRouteSlot } from './DynamicRouteSlot';
export { DynamicMenuSlot } from './DynamicMenuSlot';
export { DynamicPluginsLoader } from './DynamicPluginsLoader';
export type {
	DynamicRoute,
	DynamicMenuItem,
	DynamicRootContextValue,
	Remote,
	RemotesResponse,
} from './types';
export { EMPTY_DYNAMIC_ROOT_CONTEXT, EMPTY_REMOTES } from './types';
