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

// AppRoutes lives inside the React tree so useApi(configApiRef) is callable.
// Butler-Labs-branded plugins are always mounted at their route. The element
// rendered depends on the per-plugin flag:
//
//   plugins.<name>.enabled=true  -> the real plugin page (ButlerPage, ...)
//   plugins.<name>.enabled=false -> PluginNotEnabledPage (branded, with a
//                                   call to action). The backend gate stays
//                                   genuinely off either way -- see
//                                   packages/backend/src/butlerLabsPluginGates.ts.
//
// Always-mounting the route is the discoverability change: a deep link or
// shared URL to /registry/* now lands on a polished "not enabled here" page
// rather than Backstage's generic NotFound, uniformly across internal and
// external deployments.
export const AppRoutes = () => {
	const config = useApi(configApiRef);
	const butlerEnabled = config.getOptionalBoolean('plugins.butler.enabled') ?? false;
	const workspacesEnabled = config.getOptionalBoolean('plugins.workspaces.enabled') ?? false;
	const registryEnabled = config.getOptionalBoolean('plugins.registry.enabled') ?? false;
	const pipelineEnabled = config.getOptionalBoolean('plugins.pipeline.enabled') ?? false;
	const pluginMeta = Object.fromEntries(
		BUTLER_LABS_PLUGINS.map(p => [p.configKey, p]),
	);

	return (
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
					butlerEnabled ? (
						<ButlerPage />
					) : (
						<PluginNotEnabledPage meta={pluginMeta.butler} />
					)
				}
			/>
			<Route
				path="/workspaces/*"
				element={
					workspacesEnabled ? (
						<WorkspacesPluginPage />
					) : (
						<PluginNotEnabledPage meta={pluginMeta.workspaces} />
					)
				}
			/>
			<Route
				path="/registry/*"
				element={
					registryEnabled ? (
						<RegistryPage />
					) : (
						<PluginNotEnabledPage meta={pluginMeta.registry} />
					)
				}
			/>
			<Route
				path="/pipeline/*"
				element={
					pipelineEnabled ? (
						<PipelinePage />
					) : (
						<PluginNotEnabledPage meta={pluginMeta.pipeline} />
					)
				}
			/>
		</FlatRoutes>
	);
};

export default app.createRoot(
	<>
		<AlertDisplay />
		<OAuthRequestDialog />
		<SignalsDisplay />
		<AppRouter>
			<Root>
				<AppRoutes />
			</Root>
		</AppRouter>
	</>,
);
