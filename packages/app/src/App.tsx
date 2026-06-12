import { Route } from 'react-router-dom';
import { apiDocsPlugin, ApiExplorerPage } from '@backstage/plugin-api-docs';
import {
	CatalogEntityPage,
	CatalogIndexPage,
	catalogPlugin,
} from '@backstage/plugin-catalog';
import {
	CatalogImportPage,
	catalogImportPlugin,
} from '@backstage/plugin-catalog-import';
import { ScaffolderPage, scaffolderPlugin } from '@backstage/plugin-scaffolder';
import { orgPlugin } from '@backstage/plugin-org';
import { SearchPage } from '@backstage/plugin-search';
import {
	TechDocsIndexPage,
	techdocsPlugin,
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
import { apis } from './apis';
import { entityPage } from './components/catalog/EntityPage';
import { searchPage } from './components/search/SearchPage';
import { Root } from './components/Root';
import {
	AlertDisplay,
	OAuthRequestDialog,
	SignInPage,
	type SignInProviderConfig,
} from '@backstage/core-components';
import { configApiRef, googleAuthApiRef, useApi } from '@backstage/core-plugin-api';
import { createApp } from '@backstage/app-defaults';
import { AppRouter, FlatRoutes } from '@backstage/core-app-api';
import { CatalogGraphPage } from '@backstage/plugin-catalog-graph';
import { RequirePermission } from '@backstage/plugin-permission-react';
import { catalogEntityCreatePermission } from '@backstage/plugin-catalog-common/alpha';
import { NotificationsPage } from '@backstage/plugin-notifications';
import { SignalsDisplay } from '@backstage/plugin-signals';
import { UnifiedThemeProvider } from '@backstage/theme';
import Grid from '@material-ui/core/Grid';
import { butlerThemes, type ButlerThemeId } from './themes/butlerPortalTheme';
import { HomePage } from './components/home';
import { ButlerPage } from '@internal/plugin-butler';
import { WorkspacesPluginPage } from '@internal/plugin-workspaces';
import { RegistryPage } from '@internal/plugin-registry';
import { PipelinePage } from '@internal/plugin-pipeline';
import { AppearanceSettings } from './components/settings/AppearanceSettings';
import { BUTLER_LABS_PLUGINS } from './components/plugins/butlerLabsPluginsMeta';
import { PluginNotEnabledPage } from './components/plugins/PluginNotEnabledPage';

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
			const googleProvider: SignInProviderConfig = {
				id: 'google-auth-provider',
				title: 'Google',
				message: 'Sign in with your Butler Labs Google account',
				apiRef: googleAuthApiRef,
			};
			return (
				<SignInPage
					{...props}
					auto
					providers={['guest', googleProvider]}
				/>
			);
		},
	},
});

// Per-plugin route element switcher. Reads plugins.<configKey>.enabled and
// renders either the real plugin page (an enabled deployment runs the real
// plugin code, passed in as children so createApp's plugin discovery sees
// the routable extension at module-evaluation time) or PluginNotEnabledPage
// (a disabled deployment shows the branded "available but not enabled"
// page).
//
// The routable extension MUST come in via `children`, not an arbitrary
// prop. Backstage's discovery walker recurses into props.children and
// props.element; it does not introspect custom-component props. Passing
// <WorkspacesPluginPage /> as e.g. `enabledElement={...}` would make the
// element invisible to discovery, and the moment the flag flipped to true
// React would try to mount a routable extension whose rootRouteRef was
// never indexed -- the "was not discovered in the app element tree" crash.
const ButlerLabsRouteElement = ({
	configKey,
	children,
}: {
	configKey: 'butler' | 'workspaces' | 'registry' | 'pipeline';
	children: React.ReactNode;
}) => {
	const config = useApi(configApiRef);
	const enabled =
		config.getOptionalBoolean(`plugins.${configKey}.enabled`) ?? false;
	const meta =
		BUTLER_LABS_PLUGINS.find(p => p.configKey === configKey) ??
		BUTLER_LABS_PLUGINS[0];
	return enabled ? <>{children}</> : <PluginNotEnabledPage meta={meta} />;
};

export default app.createRoot(
	<>
		<AlertDisplay />
		<OAuthRequestDialog />
		<SignalsDisplay />
		<AppRouter>
			<Root>
				<FlatRoutes>
					<Route path="/" element={<HomePage />} />
					<Route path="/catalog" element={<CatalogIndexPage />} />
					<Route
						path="/catalog/:namespace/:kind/:name"
						element={<CatalogEntityPage />}
					>
						{entityPage}
					</Route>
					<Route path="/docs" element={<TechDocsIndexPage />} />
					<Route
						path="/docs/:namespace/:kind/:name/*"
						element={<TechDocsReaderPage />}
					>
						<TechDocsAddons>
							<ReportIssue />
						</TechDocsAddons>
					</Route>
					<Route path="/create" element={<ScaffolderPage />} />
					<Route path="/api-docs" element={<ApiExplorerPage />} />
					<Route
						path="/catalog-import"
						element={
							<RequirePermission permission={catalogEntityCreatePermission}>
								<CatalogImportPage />
							</RequirePermission>
						}
					/>
					<Route path="/search" element={<SearchPage />}>
						{searchPage}
					</Route>
					<Route path="/settings" element={<UserSettingsPage />}>
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
					</Route>
					<Route path="/catalog-graph" element={<CatalogGraphPage />} />
					<Route path="/notifications" element={<NotificationsPage />} />
					<Route
						path="/butler/*"
						element={
							<ButlerLabsRouteElement configKey="butler">
								<ButlerPage />
							</ButlerLabsRouteElement>
						}
					/>
					<Route
						path="/workspaces/*"
						element={
							<ButlerLabsRouteElement configKey="workspaces">
								<WorkspacesPluginPage />
							</ButlerLabsRouteElement>
						}
					/>
					<Route
						path="/registry/*"
						element={
							<ButlerLabsRouteElement configKey="registry">
								<RegistryPage />
							</ButlerLabsRouteElement>
						}
					/>
					<Route
						path="/pipeline/*"
						element={
							<ButlerLabsRouteElement configKey="pipeline">
								<PipelinePage />
							</ButlerLabsRouteElement>
						}
					/>
				</FlatRoutes>
			</Root>
		</AppRouter>
	</>,
);
