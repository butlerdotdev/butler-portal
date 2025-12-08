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
import { UserSettingsPage } from '@backstage/plugin-user-settings';
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
import { googleAuthApiRef } from '@backstage/core-plugin-api';
import { createApp } from '@backstage/app-defaults';
import { AppRouter, FlatRoutes } from '@backstage/core-app-api';
import { CatalogGraphPage } from '@backstage/plugin-catalog-graph';
import { RequirePermission } from '@backstage/plugin-permission-react';
import { catalogEntityCreatePermission } from '@backstage/plugin-catalog-common/alpha';
import { NotificationsPage } from '@backstage/plugin-notifications';
import { SignalsDisplay } from '@backstage/plugin-signals';
import { UnifiedThemeProvider } from '@backstage/theme';
import { butlerPortalTheme } from './themes/butlerPortalTheme';
import { HomePage } from './components/home';
import { ButlerPage } from '@internal/plugin-butler';

const app = createApp({
	apis,
	themes: [
		{
			id: 'butler-portal-dark',
			title: 'Butler Portal Dark',
			variant: 'dark',
			Provider: ({ children }) => (
				<UnifiedThemeProvider theme={butlerPortalTheme} children={children} />
			),
		},
	],
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

// ... rest stays the same

const routes = (
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
		<Route path="/settings" element={<UserSettingsPage />} />
		<Route path="/catalog-graph" element={<CatalogGraphPage />} />
		<Route path="/notifications" element={<NotificationsPage />} />
		<Route path="/butler/*" element={<ButlerPage />} />
	</FlatRoutes>
);

export default app.createRoot(
	<>
		<AlertDisplay />
		<OAuthRequestDialog />
		<SignalsDisplay />
		<AppRouter>
			<Root>{routes}</Root>
		</AppRouter>
	</>,
);
