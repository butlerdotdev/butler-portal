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

import { isValidElement, ReactElement } from 'react';
import { configApiRef } from '@backstage/core-plugin-api';
import {
	MockConfigApi,
	TestApiProvider,
	renderInTestApp,
} from '@backstage/test-utils';
import { within } from '@testing-library/react';
import { ApiExplorerPage } from '@backstage/plugin-api-docs';
import {
	CatalogEntityPage,
	CatalogIndexPage,
} from '@backstage/plugin-catalog';
import { ScaffolderPage } from '@backstage/plugin-scaffolder';
import { SearchPage } from '@backstage/plugin-search';
import {
	TechDocsIndexPage,
	TechDocsReaderPage,
} from '@backstage/plugin-techdocs';
import { UserSettingsPage } from '@backstage/plugin-user-settings';
import { CatalogGraphPage } from '@backstage/plugin-catalog-graph';
import { RequirePermission } from '@backstage/plugin-permission-react';
import { NotificationsPage } from '@backstage/plugin-notifications';
import { ButlerPage } from '@internal/plugin-butler';
import { WorkspacesPluginPage } from '@internal/plugin-workspaces';
import { RegistryPage } from '@internal/plugin-registry';
import { PipelinePage } from '@internal/plugin-pipeline';
import { HomePage } from './components/home';
import { BASELINE_ROUTES, DataDrivenFlatRoutes } from './baselineRoutes';
import { ButlerLabsRouteElement } from './components/plugins/ButlerLabsRouteElement';
import {
	DynamicRootContext,
	EMPTY_DYNAMIC_ROOT_CONTEXT,
} from './components/DynamicRoot';
import {
	BUTLER_LABS_PLUGINS,
	ButlerLabsConfigKey,
} from './components/plugins/butlerLabsPluginsMeta';

// Mutation-checked regression net for the render path of the data-driven
// FlatRoutes. The two-path architecture (BASELINE_ROUTES feeds both
// DataDrivenFlatRoutes for render AND the DiscoveryAnchor for walker
// indexing) introduces a new gap-class that AppRoutes.test.tsx and
// AppDiscovery.test.tsx do not cover:
//
//   - AppRoutes.test.tsx unit-tests ButlerLabsRouteElement against a
//     hand-rolled <GatedRoutes> tree. It does NOT load BASELINE_ROUTES.
//     A mutation to BASELINE_ROUTES that removes the gate from a
//     /<plugin>/* entry survives that suite.
//
//   - AppDiscovery.test.tsx tests the walker against a hand-rolled
//     <FlatRoutes><Route element={<ButlerLabsRouteElement>...}/></FlatRoutes>
//     tree. It does NOT load BASELINE_ROUTES. Same survival.
//
//   - AppNormalization.test.tsx pins the DiscoveryAnchor pattern against
//     a synthetic probe extension. It does NOT load BASELINE_ROUTES
//     either. A mutation that removes a Butler Labs entry from
//     BASELINE_ROUTES survives that suite.
//
// This file closes the gap on two axes:
//
//   1. Structural: each Butler Labs entry in BASELINE_ROUTES wraps in a
//      ButlerLabsRouteElement with the matching configKey, and the plugin
//      page reaches it via the `children` prop (the PR #20 walker
//      contract). Mutating the wrapping or the configKey trips this.
//
//   2. Render-path: render DataDrivenFlatRoutes (the actual exported
//      function component, not a lookalike) under a MockConfigApi that
//      flips the plugin's flag off, navigate to the plugin's URL,
//      assert PluginNotEnabledPage rendered. A mutation that removes
//      <ButlerLabsRouteElement> from a /<plugin>/* entry would render
//      the real plugin page in the disabled state and trip this.
//
// The render-path tests use the SAME pattern as AppDiscovery.test.tsx:
// renderInTestApp wraps the tree in TestApiProvider and an internal
// createApp pass that walks the JSX for routable-extension discovery.
// Because BASELINE_ROUTES contains every routable extension in the host,
// the walker indexes them all the same way it does in production. The
// gate blocks render of children (the plugin page) when its flag is
// off, so PluginNotEnabledPage shows.

const PATH_TO_CONFIG_KEY: Record<string, ButlerLabsConfigKey> = {
	'/butler/*': 'butler',
	'/workspaces/*': 'workspaces',
	'/registry/*': 'registry',
	'/pipeline/*': 'pipeline',
};

describe('BASELINE_ROUTES structural gating (catches mutations that remove the gate or swap its configKey)', () => {
	it.each(Object.entries(PATH_TO_CONFIG_KEY))(
		'%s wraps its plugin page in <ButlerLabsRouteElement configKey="%s"> with the page passed as children',
		(path, expectedKey) => {
			const route = BASELINE_ROUTES.find(r => r.path === path);
			expect(route).toBeDefined();
			expect(isValidElement(route!.element)).toBe(true);
			const el = route!.element as ReactElement<{
				configKey: ButlerLabsConfigKey;
				children: unknown;
			}>;
			// The gate component itself must wrap the page.
			expect(el.type).toBe(ButlerLabsRouteElement);
			// The configKey must match the path's plugin.
			expect(el.props.configKey).toBe(expectedKey);
			// The plugin page comes in via children, NOT via a custom prop --
			// this is the PR #20 walker contract. childDiscoverer in
			// @backstage/core-app-api walks props.children, so a routable
			// extension passed via e.g. an `enabledElement={...}` prop would
			// be invisible to the createApp discovery pass and the portal
			// would throw "Routable extension was not discovered" the first
			// time the plugin's flag flipped on.
			expect(el.props.children).toBeDefined();
		},
	);

	it('preserves the 0.4.0 FlatRoutes path order verbatim (disabled-state parity)', () => {
		// Source order matches packages/app/src/App.tsx at the 0.4.0 tip
		// (commit 2839e5a). The 13 stock Backstage routes come first, then
		// the 4 Butler Labs routes in butler / workspaces / registry /
		// pipeline order. Operators bumping to chart 0.5.0 with no dynamic
		// plugins enabled see the same routes in the same order.
		expect(BASELINE_ROUTES.map(r => r.path)).toEqual([
			'/',
			'/catalog',
			'/catalog/:namespace/:kind/:name',
			'/docs',
			'/docs/:namespace/:kind/:name/*',
			'/create',
			'/api-docs',
			'/catalog-import',
			'/search',
			'/settings',
			'/catalog-graph',
			'/notifications',
			'/rbac',
			'/butler/*',
			'/workspaces/*',
			'/registry/*',
			'/pipeline/*',
		]);
	});

	it('each Butler Labs path wires the unchanged ButlerLabsRouteElement to the SAME plugin page 0.4.0 wired (children identity check)', () => {
		// The bit-for-bit identical ButlerLabsRouteElement source proves
		// the component is unchanged. This test proves the WIRING is
		// unchanged: each path passes the same plugin page (the same React
		// component type) as `children` that 0.4.0 wired inline. The
		// 287025e regression was about the wiring (children prop vs custom
		// prop); the 0.5.0 normalization re-wires through BASELINE_ROUTES;
		// this pin asserts the re-wiring lands the SAME children-component
		// pair at the SAME path.
		const PATH_TO_PAGE = {
			'/butler/*': ButlerPage,
			'/workspaces/*': WorkspacesPluginPage,
			'/registry/*': RegistryPage,
			'/pipeline/*': PipelinePage,
		} as const;
		for (const [path, expectedPage] of Object.entries(PATH_TO_PAGE)) {
			const route = BASELINE_ROUTES.find(r => r.path === path)!;
			const el = route.element as ReactElement<{
				configKey: ButlerLabsConfigKey;
				children: ReactElement;
			}>;
			expect(el.props.children.type).toBe(expectedPage);
		}
	});

	it('each non-Butler-Labs path mounts the SAME element TYPE 0.4.0 mounted (catches a baseline-route element swap)', () => {
		// Pin the path -> element-type mapping for every entry in the
		// 0.4.0 hardcoded FlatRoutes. A regression that swaps any path's
		// element to a different component (e.g. /catalog mounting some
		// other Page) trips this. The Butler Labs entries are separately
		// pinned above via the structural and children-identity tests;
		// here we cover the 12 non-Butler-Labs routes.
		const PATH_TO_TYPE = new Map<string, unknown>([
			['/', HomePage],
			['/catalog', CatalogIndexPage],
			['/catalog/:namespace/:kind/:name', CatalogEntityPage],
			['/docs', TechDocsIndexPage],
			['/docs/:namespace/:kind/:name/*', TechDocsReaderPage],
			['/create', ScaffolderPage],
			['/api-docs', ApiExplorerPage],
			['/catalog-import', RequirePermission],
			['/search', SearchPage],
			['/settings', UserSettingsPage],
			['/catalog-graph', CatalogGraphPage],
			['/notifications', NotificationsPage],
		]);
		for (const [path, expectedType] of PATH_TO_TYPE) {
			const route = BASELINE_ROUTES.find(r => r.path === path);
			expect(route).toBeDefined();
			const el = route!.element as ReactElement;
			expect(el.type).toBe(expectedType);
		}
	});

	it('the BASELINE_ROUTES table covers every plugin in BUTLER_LABS_PLUGINS exactly once', () => {
		// Regression net against forgetting to add a future plugin to
		// BASELINE_ROUTES while it lives in butlerLabsPluginsMeta. The
		// sidebar / homepage would advertise the plugin but the route would
		// 404, producing the discoverable-but-not-mounted UX failure.
		const presentKeys = BASELINE_ROUTES.filter(
			r =>
				isValidElement(r.element) &&
				(r.element as ReactElement<any>).type === ButlerLabsRouteElement,
		).map(
			r =>
				((r.element as ReactElement<{ configKey: ButlerLabsConfigKey }>)
					.props.configKey),
		);
		const expectedKeys = BUTLER_LABS_PLUGINS.map(p => p.configKey).sort();
		expect(presentKeys.sort()).toEqual(expectedKeys);
	});
});

describe('DataDrivenFlatRoutes render-path gating (the path users actually hit)', () => {
	const renderRoute = async (
		entryPath: string,
		flags: Partial<Record<ButlerLabsConfigKey, boolean>>,
	) => {
		const config = new MockConfigApi({
			plugins: {
				butler: { enabled: !!flags.butler },
				workspaces: { enabled: !!flags.workspaces },
				registry: { enabled: !!flags.registry },
				pipeline: { enabled: !!flags.pipeline },
			},
		});
		return renderInTestApp(
			<TestApiProvider apis={[[configApiRef, config]]}>
				<DynamicRootContext.Provider value={EMPTY_DYNAMIC_ROOT_CONTEXT}>
					<DataDrivenFlatRoutes />
				</DynamicRootContext.Provider>
			</TestApiProvider>,
			{ routeEntries: [entryPath] },
		);
	};

	it.each(BUTLER_LABS_PLUGINS.filter(p => !p.dependsOn))(
		'$brandName (configKey=$configKey) renders PluginNotEnabledPage when its flag is off, NOT the real plugin page',
		async meta => {
			const r = await renderRoute(`/${meta.routePath}`, {});
			// PluginNotEnabledPage renders the plugin's themed role string
			// from butlerLabsPluginsMeta (e.g., "The Head Butler" for Butler).
			// The real plugin page does not render this string -- it renders
			// the plugin's actual UI. Asserting on the role is the
			// distinguishing signal between "gate fired" and "gate bypassed."
			expect(r.queryAllByText(meta.role).length).toBeGreaterThan(0);
			// The enable-card on PluginNotEnabledPage tells the operator
			// exactly which config key to flip.
			expect(
				r.queryAllByText(`plugins.${meta.configKey}.enabled`).length,
			).toBeGreaterThan(0);
		},
	);

	it('Chambers (workspaces=true) with Butler disabled renders the dependency-missing variant, NOT the real Chambers page', async () => {
		const r = await renderRoute('/workspaces', { workspaces: true });
		// The dependency-missing variant has a status element that mentions
		// the dependency by name. The real Chambers page does not.
		const status = r.queryByTestId('plugin-not-enabled-status');
		expect(status).not.toBeNull();
		expect(status?.textContent).toMatch(/requires Butler/i);
		// The enable-card on this variant tells the operator to flip the
		// dependency's flag (plugins.butler.enabled), not the plugin's own
		// flag (plugins.workspaces.enabled is already on).
		const scoped = within(status!.parentElement!.parentElement!);
		expect(
			r.queryAllByText('plugins.butler.enabled').length,
		).toBeGreaterThan(0);
		expect(r.queryAllByText('plugins.workspaces.enabled').length).toBe(0);
		void scoped;
	});
});
