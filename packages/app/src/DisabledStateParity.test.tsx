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

import { renderInTestApp } from '@backstage/test-utils';
import {
	DynamicRootContext,
	EMPTY_DYNAMIC_ROOT_CONTEXT,
	DynamicMenuSlot,
} from './components/DynamicRoot';

// Rendered-UI parity with chart 0.4.0 in the disabled-dynamic-plugins
// state. The guarantee: an operator on chart 0.4.0 bumps to chart 0.5.0
// WITHOUT setting dynamicPlugins.enabled (the default), and the portal's
// rendered UI is identical to what they had at 0.4.0.
//
// The Phase 2 chart snapshot pins byte-identical pod templates at the
// chart layer. This file pins identical rendered output at the React
// layer. The two together cover the full deployment-bump contract.
//
// The mechanism: BASELINE_ROUTES is structurally identical to the 0.4.0
// hardcoded FlatRoutes children (asserted in BaselineRoutes.test.tsx via
// the path-order test). DataDrivenFlatRoutes with an empty
// dynamicRoutes (the chart 0.5.0 default state) emits exactly those 16
// Routes in exactly that order. Sidebar similarly: the only Root.tsx
// addition is a single <DynamicMenuSlot /> inside the Menu SidebarGroup.
// This file pins that the Slot renders ZERO DOM nodes when its context
// is empty -- closing the rendered-UI parity contract.

describe('DynamicMenuSlot under empty context (chart 0.5.0 default)', () => {
	it('renders ZERO DOM nodes when dynamicMenuItems is empty (the disabled-state contract)', async () => {
		const r = await renderInTestApp(
			<DynamicRootContext.Provider value={EMPTY_DYNAMIC_ROOT_CONTEXT}>
				<div data-testid="parent">
					<DynamicMenuSlot />
				</div>
			</DynamicRootContext.Provider>,
		);
		const parent = r.getByTestId('parent');
		// The Slot's render for an empty menuItems array is a React
		// Fragment with zero children, which materializes as zero DOM
		// nodes inside the parent. The parent therefore has zero child
		// nodes and an empty innerHTML, proving the Slot contributes
		// NOTHING to the sidebar in the disabled state. A regression that
		// emits a SidebarItem placeholder, a section header, or even a
		// single empty <span> would flip the childNodes length non-zero
		// and trip this assertion.
		//
		// This is the load-bearing test for sidebar disabled-state
		// parity: Root.tsx's only material change vs 0.4.0 is the
		// insertion of <DynamicMenuSlot /> inside the Menu SidebarGroup.
		// If this Slot contributes zero DOM nodes when the context is
		// empty (the chart 0.5.0 default state), the rendered sidebar
		// for the 4 deployed clusters is byte-identical to 0.4.0.
		expect(parent.childNodes.length).toBe(0);
		expect(parent.innerHTML).toBe('');
	});

});
