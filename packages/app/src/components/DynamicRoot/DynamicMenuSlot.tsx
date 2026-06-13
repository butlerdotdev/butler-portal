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

import { SidebarItem } from '@backstage/core-components';
import ExtensionIcon from '@material-ui/icons/Extension';
import { useDynamicRootContext } from './DynamicRootContext';

// Slot component the host's Sidebar (Root.tsx) renders alongside the
// hardcoded sidebar items. When no dynamic plugins are loaded (the
// chart 0.5.0 default), useDynamicRootContext returns the empty default
// and this produces an empty Fragment -- no SidebarItem elements
// emitted, no change to the rendered sidebar vs chart 0.4.0.
//
// When plugins ARE loaded, this emits one SidebarItem per dynamic menu
// item, sorted by priority (handled in extractDynamicConfig).
export const DynamicMenuSlot = () => {
	const { dynamicMenuItems } = useDynamicRootContext();
	return (
		<>
			{dynamicMenuItems.map(item => (
				<SidebarItem
					key={item.key}
					to={item.to}
					text={item.text}
					// Fallback to the generic Extension icon when the customer
					// plugin did not declare an icon in its appIcons block.
					// The full appIcons-resolution path ships with Phase 5.
					icon={item.icon ? () => <>{item.icon}</> : ExtensionIcon}
				/>
			))}
		</>
	);
};
