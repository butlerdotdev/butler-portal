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
import { FlatRoutes } from '@backstage/core-app-api';
import { ApiExplorerPage } from '@backstage/plugin-api-docs';
import {
	CatalogEntityPage,
	CatalogIndexPage,
} from '@backstage/plugin-catalog';
import { CatalogImportPage } from '@backstage/plugin-catalog-import';
import { ScaffolderPage } from '@backstage/plugin-scaffolder';
import { SearchPage } from '@backstage/plugin-search';
import {
	TechDocsIndexPage,
	TechDocsReaderPage,
} from '@backstage/plugin-techdocs';
import { TechDocsAddons } from '@backstage/plugin-techdocs-react';
import { ReportIssue } from '@backstage/plugin-techdocs-module-addons-contrib';
import {
	UserSettingsPage,
	UserSettingsProfileCard,
	UserSettingsIdentityCard,
	SettingsLayout,
} from '@backstage/plugin-user-settings';
import { CatalogGraphPage } from '@backstage/plugin-catalog-graph';
import { RequirePermission } from '@backstage/plugin-permission-react';
import { catalogEntityCreatePermission } from '@backstage/plugin-catalog-common/alpha';
import { NotificationsPage } from '@backstage/plugin-notifications';
import { RbacPage } from '@backstage-community/plugin-rbac';
import Grid from '@material-ui/core/Grid';
import { ButlerPage } from '@internal/plugin-butler';
import { WorkspacesPluginPage } from '@internal/plugin-workspaces';
import { RegistryPage } from '@internal/plugin-registry';
import { PipelinePage } from '@internal/plugin-pipeline';
import { entityPage } from './components/catalog/EntityPage';
import { searchPage } from './components/search/SearchPage';
import { HomePage } from './components/home';
import { AppearanceSettings } from './components/settings/AppearanceSettings';
import { ButlerLabsRouteElement } from './components/plugins/ButlerLabsRouteElement';
import { useDynamicRootContext } from './components/DynamicRoot';

// Baseline route entry. Each element matches a hardcoded <Route> from the
// 0.4.0 FlatRoutes tree. The shape carries everything react-router needs
// for a Route plus the optional nested-children prop used by the
// catalog/:entity, docs/:entity, search, and settings routes.
export type BaselineRoute = {
	path: string;
	element: ReactNode;
	children?: ReactNode;
};

// The baseline route table. Source of truth for the static (Butler-Labs-
// shipped) routes the host renders.
//
// Two consumers reference this same array, and the consistency between
// them is load-bearing:
//
//   1. DataDrivenFlatRoutes (below): the render-time route table
//      react-router dispatches against when a user navigates the portal.
//      THIS is the path users actually hit; a gate missing here is
//      user-visible regardless of what the walker indexed.
//
//   2. The DiscoveryAnchor inside App.tsx: a hidden carrier that returns
//      null at render time but declares these same Route entries as JSX
//      children so the Backstage plugin-discovery walker indexes the
//      routable extensions at createApp time. Without the anchor, the
//      walker never reaches the routable extensions through App.tsx's
//      render tree (DataDrivenFlatRoutes is a function-component leaf
//      the walker cannot recurse into).
//
// Both paths read from this constant -- there is no separate
// BASELINE_ROUTES_RENDER vs BASELINE_ROUTES_ANCHOR. If a developer ever
// splits them, the BaselineRoutes.test.tsx render-path tests catch a
// divergence in the rendered path, and the DiscoveryAnchor structural
// pin (also in that file) catches a divergence in the anchor path.
//
// Ordering preserves the 0.4.0 FlatRoutes child order verbatim. FlatRoutes
// sorts by path internally, but stable ordering in the source keeps diffs
// reviewable when a dynamic-route insert lands between two static entries.
//
// PR #20 contract preserved: each Butler Labs entry wraps its plugin page
// in <ButlerLabsRouteElement> with the page passed as `children`.
// childDiscoverer in @backstage/core-app-api walks props.children, so the
// routable extension stays discoverable when the walker reaches the
// anchor at createApp time. Mutating any of the 4 entries to pass the
// page via a custom prop instead of children breaks the walker exactly
// as 287025e demonstrated; AppDiscovery.test.tsx pins that contract.
export const BASELINE_ROUTES: BaselineRoute[] = [
	{ path: '/', element: <HomePage /> },
	{ path: '/catalog', element: <CatalogIndexPage /> },
	{
		path: '/catalog/:namespace/:kind/:name',
		element: <CatalogEntityPage />,
		children: entityPage,
	},
	{ path: '/docs', element: <TechDocsIndexPage /> },
	{
		path: '/docs/:namespace/:kind/:name/*',
		element: <TechDocsReaderPage />,
		children: (
			<TechDocsAddons>
				<ReportIssue />
			</TechDocsAddons>
		),
	},
	{ path: '/create', element: <ScaffolderPage /> },
	{ path: '/api-docs', element: <ApiExplorerPage /> },
	{
		path: '/catalog-import',
		element: (
			<RequirePermission permission={catalogEntityCreatePermission}>
				<CatalogImportPage />
			</RequirePermission>
		),
	},
	{ path: '/search', element: <SearchPage />, children: searchPage },
	{
		path: '/settings',
		element: <UserSettingsPage />,
		children: (
			<SettingsLayout>
				<SettingsLayout.Route path="general" title="General">
					<Grid container direction="row" spacing={3}>
						<Grid item xs={12} md={6}>
							<UserSettingsProfileCard />
						</Grid>
						<Grid item xs={12} md={6}>
							<AppearanceSettings />
						</Grid>
						<Grid item xs={12} md={6}>
							<UserSettingsIdentityCard />
						</Grid>
					</Grid>
				</SettingsLayout.Route>
			</SettingsLayout>
		),
	},
	{ path: '/catalog-graph', element: <CatalogGraphPage /> },
	{ path: '/notifications', element: <NotificationsPage /> },
	{ path: '/rbac', element: <RbacPage /> },
	{
		path: '/butler/*',
		element: (
			<ButlerLabsRouteElement configKey="butler">
				<ButlerPage />
			</ButlerLabsRouteElement>
		),
	},
	{
		path: '/workspaces/*',
		element: (
			<ButlerLabsRouteElement configKey="workspaces">
				<WorkspacesPluginPage />
			</ButlerLabsRouteElement>
		),
	},
	{
		path: '/registry/*',
		element: (
			<ButlerLabsRouteElement configKey="registry">
				<RegistryPage />
			</ButlerLabsRouteElement>
		),
	},
	{
		path: '/pipeline/*',
		element: (
			<ButlerLabsRouteElement configKey="pipeline">
				<PipelinePage />
			</ButlerLabsRouteElement>
		),
	},
];

// The data-driven render path. AppRouter -> Root renders this; react-
// router matches the URL against the merged BASELINE + dynamic table.
// When no dynamic plugins are loaded (the chart 0.5.0 default and the
// state every existing Butler Labs deployment is in) dynamicRoutes is []
// and FlatRoutes receives the same 17 Route entries the 0.4.0 hardcoded
// tree provided. The output is identical to 0.4.0 in the disabled state.
//
// Exported so BaselineRoutes.test.tsx can render the actual render-path
// component, not a hand-rolled lookalike. A test that exercises a
// hand-rolled FlatRoutes built from BASELINE_ROUTES would miss a
// regression where DataDrivenFlatRoutes diverges from BASELINE_ROUTES
// (e.g., somebody hard-codes the JSX inline instead of mapping the
// constant); the render-path test pins this contract.
export const DataDrivenFlatRoutes = () => {
	const { dynamicRoutes } = useDynamicRootContext();
	return (
		<FlatRoutes>
			{BASELINE_ROUTES.map(r => (
				<Route key={r.path} path={r.path} element={r.element}>
					{r.children}
				</Route>
			))}
			{dynamicRoutes.map(r => (
				<Route key={r.key ?? r.path} path={r.path} element={r.element} />
			))}
		</FlatRoutes>
	);
};
