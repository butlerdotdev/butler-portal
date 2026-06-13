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
import { Route } from 'react-router-dom';
import {
	configApiRef,
	createPlugin,
	createRoutableExtension,
	createRouteRef,
} from '@backstage/core-plugin-api';
import { FlatRoutes } from '@backstage/core-app-api';
import {
	MockConfigApi,
	TestApiProvider,
	renderInTestApp,
} from '@backstage/test-utils';
import { ButlerLabsRouteElement } from './components/plugins/ButlerLabsRouteElement';

// Pre-refactor probe for Option 3 (full normalization). The new shape:
//
//   <DataDrivenFlatRoutes/>  -- function component rendering FlatRoutes
//                               from a shared ROUTE_TABLE constant + dynamic
//                               routes from DynamicRootContext. Walker
//                               cannot recurse into a function component's
//                               render output, so it does not see the
//                               Butler Labs routable extensions here.
//
//   <DiscoveryAnchor>        -- a function component that returns null at
//     {ROUTE_TABLE.map(...)}    render time but declares the same Route
//   </DiscoveryAnchor>          JSX as direct children. The walker recurses
//                               into element.props.children (per the
//                               childDiscoverer rule in core-app-api's
//                               traversal.esm.js), so it sees every Route,
//                               recurses into element prop via
//                               routeElementDiscoverer, finds each
//                               ButlerLabsRouteElement, recurses into
//                               children, finds the routable extension,
//                               and registers its routeRef -> path.
//
// This probe asserts the walker reaches the extension through the
// DiscoveryAnchor path and the extension renders without the
// "Routable extension component with mount point routeRef was not
// discovered in the app element tree" error. Mirrors AppDiscovery.test.tsx
// but with the new module-shape: the visible FlatRoutes and the hidden
// DiscoveryAnchor carry separate copies of the same Route JSX.

const ref = createRouteRef({ id: 'app-normalization-probe' });
const plugin = createPlugin({
	id: 'app-normalization-probe',
	routes: { root: ref },
});
const ProbeExtension = plugin.provide(
	createRoutableExtension({
		name: 'NormalizationProbeExtension',
		component: () =>
			Promise.resolve(() => (
				<div data-testid="normalization-probe-rendered">probe</div>
			)),
		mountPoint: ref,
	}),
);

// The DiscoveryAnchor shape under test: returns null at render time so the
// Routes inside never reach react-router (the visible FlatRoutes is the
// only render path), but the walker still sees the props.children at
// construction time.
const DiscoveryAnchor = (_: { children?: ReactNode }) => null;

// Mirror of App.tsx's DataDrivenFlatRoutes shape: a function component
// that renders the FlatRoutes. The walker treats this as a leaf (its
// render-time output is invisible to traverseElementTree), so the
// routable extension inside is NOT indexed via this path. Without an
// equivalent walker-visible path, useRouteRef for the probe's routeRef
// throws "was not discovered." This is the contract Option 3 depends on
// and that the DiscoveryAnchor below resolves.
//
// IMPORTANT: this must remain a function component (not inline JSX in
// the renderInTestApp tree). If it is inlined as JSX, the walker walks
// the FlatRoutes' Route children directly and the DiscoveryAnchor
// becomes redundant -- the test would stay green even with the anchor
// emptied. The function-component wrapping is what makes the anchor
// load-bearing here, matching App.tsx's production shape.
const VisibleRenderRoutes = ({ routeTable }: { routeTable: Array<{ path: string; element: ReactNode }> }) => (
	<FlatRoutes>
		{routeTable.map(r => (
			<Route key={r.path} path={r.path} element={r.element} />
		))}
	</FlatRoutes>
);

const renderWithDualPath = async (butler: boolean, workspaces: boolean) => {
	const config = new MockConfigApi({
		plugins: {
			butler: { enabled: butler },
			workspaces: { enabled: workspaces },
			registry: { enabled: false },
			pipeline: { enabled: false },
		},
	});

	const ROUTE_TABLE = [
		{
			path: '/probe/*',
			element: (
				<ButlerLabsRouteElement configKey="workspaces">
					<ProbeExtension />
				</ButlerLabsRouteElement>
			),
		},
	];

	return renderInTestApp(
		<TestApiProvider apis={[[configApiRef, config]]}>
			<>
				<VisibleRenderRoutes routeTable={ROUTE_TABLE} />
				<DiscoveryAnchor>
					{ROUTE_TABLE.map(r => (
						<Route key={r.path} path={r.path} element={r.element} />
					))}
				</DiscoveryAnchor>
			</>
		</TestApiProvider>,
		{ routeEntries: ['/probe'] },
	);
};

describe('Option 3 viability: DiscoveryAnchor pattern with shared ROUTE_TABLE', () => {
	it('renders the probe routable extension when the gate passes (walker indexes it via the DiscoveryAnchor path)', async () => {
		const r = await renderWithDualPath(true, true);
		expect(r.queryByTestId('normalization-probe-rendered')).not.toBeNull();
	});

	it('renders PluginNotEnabledPage when the gate fails (extension still discovered, but the gated render branch is the PluginNotEnabledPage one)', async () => {
		const r = await renderWithDualPath(false, true);
		expect(r.queryByTestId('normalization-probe-rendered')).toBeNull();
		const status = r.queryByTestId('plugin-not-enabled-status');
		expect(status?.textContent).toMatch(/requires Butler/i);
	});
});
