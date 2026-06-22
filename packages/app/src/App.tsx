import { ReactNode } from 'react';
import { Route } from 'react-router-dom';
import { apiDocsPlugin } from '@backstage/plugin-api-docs';
import { catalogPlugin } from '@backstage/plugin-catalog';
import { catalogImportPlugin } from '@backstage/plugin-catalog-import';
import { scaffolderPlugin } from '@backstage/plugin-scaffolder';
import { orgPlugin } from '@backstage/plugin-org';
import { techdocsPlugin } from '@backstage/plugin-techdocs';
import { apis } from './apis';
import { Root } from './components/Root';
import {
	AlertDisplay,
	OAuthRequestDialog,
	SignInPage,
} from '@backstage/core-components';
import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { buildSignInProviders } from './signInProviders';
import { createApp } from '@backstage/app-defaults';
import { AppRouter } from '@backstage/core-app-api';
import { SignalsDisplay } from '@backstage/plugin-signals';
import { UnifiedThemeProvider } from '@backstage/theme';
import { butlerThemes, type ButlerThemeId } from './themes/butlerPortalTheme';
import { BASELINE_ROUTES, DataDrivenFlatRoutes } from './baselineRoutes';

const app = createApp({
	apis,
	themes: (Object.keys(butlerThemes) as ButlerThemeId[]).map(id => ({
		id,
		title: id,
		variant: (id.includes('light') ? 'light' : 'dark') as 'light' | 'dark',
		Provider: ({ children }: { children: React.ReactNode }) => (
			<UnifiedThemeProvider theme={butlerThemes[id]} children={children} />
		),
	})),
	bindRoutes({ bind }) {
		bind(catalogPlugin.externalRoutes, {
			createComponent: scaffolderPlugin.routes.root,
			viewTechDoc: techdocsPlugin.routes.docRoot,
			createFromTemplate: scaffolderPlugin.routes.selectedTemplate,
		});
		bind(apiDocsPlugin.externalRoutes, {
			registerApi: catalogImportPlugin.routes.importPage,
		});
		bind(scaffolderPlugin.externalRoutes, {
			registerComponent: catalogImportPlugin.routes.importPage,
			viewTechDoc: techdocsPlugin.routes.docRoot,
		});
		bind(orgPlugin.externalRoutes, {
			catalogIndex: catalogPlugin.routes.catalogIndex,
		});
	},
	components: {
		SignInPage: props => {
			const config = useApi(configApiRef);
			return (
				<SignInPage
					{...props}
					auto
					providers={buildSignInProviders(config)}
				/>
			);
		},
	},
});

// Walker carrier. Returns null at render time so it produces no visible
// DOM, but its declared JSX children are walked by Backstage's
// plugin-discovery pass at createApp time. childDiscoverer in
// @backstage/core-app-api/dist/extensions/traversal.esm.js returns
// element.props?.children for any element type including function
// components, so the Routes carried below are indexed even though
// DiscoveryAnchor never renders them.
//
// Why this is necessary: DataDrivenFlatRoutes is a function component
// the walker treats as a leaf (its render output is invisible to
// traverseElementTree). Without this anchor, the walker would never
// reach the Butler Labs and stock routable extensions through the
// AppRouter path, useRouteRef would return undefined for every plugin
// route, and the portal would crash on first navigation.
//
// AppNormalization.test.tsx empirically pins the anchor contract; the
// render-path gating tests in BaselineRoutes.test.tsx pin that the
// rendered FlatRoutes ALSO carries the gate (mutation in the render path
// goes red).
const DiscoveryAnchor = (_props: { children?: ReactNode }) => null;

export default app.createRoot(
	<>
		<AlertDisplay />
		<OAuthRequestDialog />
		<SignalsDisplay />
		<AppRouter>
			<Root>
				<DataDrivenFlatRoutes />
			</Root>
		</AppRouter>
		<DiscoveryAnchor>
			{BASELINE_ROUTES.map(r => (
				<Route key={r.path} path={r.path} element={r.element}>
					{r.children}
				</Route>
			))}
		</DiscoveryAnchor>
	</>,
);
