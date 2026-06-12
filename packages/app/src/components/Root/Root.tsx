import { PropsWithChildren } from 'react';
import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core';
import HomeIcon from '@material-ui/icons/Home';
import CategoryIcon from '@material-ui/icons/Category';
import ExtensionIcon from '@material-ui/icons/Extension';
import LibraryBooks from '@material-ui/icons/LibraryBooks';
import CreateComponentIcon from '@material-ui/icons/AddCircleOutline';
import StorageIcon from '@material-ui/icons/Storage';
import LogoFull from './LogoFull';
import LogoIcon from './LogoIcon';
import ButlerLabsIcon from './ButlerLabsIcon';
import { GitHubIcon, DiscordIcon, DocsIcon, WebsiteIcon } from './ExternalLinkIcons';
import {
	BUTLER_LABS_PLUGINS,
	ButlerLabsConfigKey,
	getButlerLabsPluginRuntimeState,
} from '../plugins/butlerLabsPluginsMeta';
import { ButlerLabsSubmenuItem } from './ButlerLabsSubmenuItem';
import { SidebarSectionLabel } from './SidebarSectionLabel';
import {
	Sidebar,
	sidebarConfig,
	SidebarDivider,
	SidebarGroup,
	SidebarItem,
	SidebarPage,
	SidebarSpace,
	useSidebarOpenState,
	Link,
	SidebarSubmenu,
	SidebarSubmenuItem,
} from '@backstage/core-components';
import MenuIcon from '@material-ui/icons/Menu';
import SearchIcon from '@material-ui/icons/Search';
import SettingsIcon from '@material-ui/icons/Settings';
import { SidebarSearchModal } from '@backstage/plugin-search';
import { Settings as SidebarSettings } from '@backstage/plugin-user-settings';

// Brand-colored icon wrappers for submenu items
const useBrandIconStyles = makeStyles(theme => ({
	brand: { color: theme.palette.primary.main },
}));

const brandIcon = (Icon: any) => (props: any) => {
	const classes = useBrandIconStyles();
	return <Icon {...props} className={classes.brand} />;
};

const BrandExtensionIcon = brandIcon(ExtensionIcon);
const BrandStorageIcon = brandIcon(StorageIcon);

const useSidebarLogoStyles = makeStyles({
	root: {
		width: sidebarConfig.drawerWidthClosed,
		height: 3 * sidebarConfig.logoHeight,
		display: 'flex',
		flexFlow: 'row nowrap',
		alignItems: 'center',
		marginBottom: -14,
	},
	link: {
		width: sidebarConfig.drawerWidthClosed,
		marginLeft: 24,
	},
});

const SidebarLogo = () => {
	const classes = useSidebarLogoStyles();
	const { isOpen } = useSidebarOpenState();

	return (
		<div className={classes.root}>
			<Link to="/" underline="none" className={classes.link} aria-label="Home">
				{isOpen ? <LogoFull /> : <LogoIcon />}
			</Link>
		</div>
	);
};

export const Root = ({ children }: PropsWithChildren<{}>) => {
	const config = useApi(configApiRef);
	// Runtime state per plugin: own flag plus its dependsOn chain. Chambers
	// reads as disabled in the sidebar when plugins.workspaces.enabled is
	// true but plugins.butler.enabled is false, matching what the
	// homepage card and the route element will render. Single source of
	// truth for "is this plugin available" across all three surfaces.
	const stateByKey = Object.fromEntries(
		BUTLER_LABS_PLUGINS.map(p => [
			p.configKey,
			getButlerLabsPluginRuntimeState(config, p),
		]),
	) as Record<
		ButlerLabsConfigKey,
		ReturnType<typeof getButlerLabsPluginRuntimeState>
	>;

	// The parent "Butler Labs" group is always visible -- discoverability is
	// uniform across internal and external deployments. The group's click
	// target is the first runtime-enabled plugin's route so a click never
	// lands on a disabled-route page; if all four are disabled the target
	// falls back to the first plugin (Butler) whose route renders the
	// branded PluginNotEnabledPage rather than Backstage's NotFound.
	const firstEnabled = BUTLER_LABS_PLUGINS.find(
		p => stateByKey[p.configKey].enabled,
	);
	const butlerLabsTarget = (firstEnabled ?? BUTLER_LABS_PLUGINS[0]).routePath;

	return (
		<SidebarPage>
			<Sidebar>
				<SidebarLogo />
				<SidebarGroup label="Search" icon={<SearchIcon />} to="/search">
					<SidebarSearchModal />
				</SidebarGroup>
				<SidebarDivider />

				<SidebarSectionLabel label="Platform" />
				<SidebarGroup label="Menu" icon={<MenuIcon />}>
					<SidebarItem icon={HomeIcon} to="/" text="Home" />

					<SidebarItem icon={CategoryIcon} to="catalog" text="Catalog">
						<SidebarSubmenu title="Catalog">
							<SidebarSubmenuItem title="Components" to="catalog?filters[kind]=component" icon={BrandExtensionIcon} />
							<SidebarSubmenuItem title="Systems" to="catalog?filters[kind]=system" icon={BrandStorageIcon} />
							<SidebarSubmenuItem title="APIs" to="catalog?filters[kind]=api" icon={BrandExtensionIcon} />
							<SidebarSubmenuItem title="Resources" to="catalog?filters[kind]=resource" icon={BrandStorageIcon} />
						</SidebarSubmenu>
					</SidebarItem>

					<SidebarItem icon={ExtensionIcon} to="api-docs" text="APIs" />
					<SidebarItem icon={LibraryBooks} to="docs" text="Docs" />
					<SidebarItem icon={CreateComponentIcon} to="create" text="Create..." />

					<SidebarSectionLabel label="Butler Labs" />
					<SidebarItem icon={ButlerLabsIcon} to={butlerLabsTarget} text="Butler Labs">
						<SidebarSubmenu title="Butler Labs">
							{BUTLER_LABS_PLUGINS.map(meta => {
								const state = stateByKey[meta.configKey];
								return (
									<ButlerLabsSubmenuItem
										key={meta.configKey}
										meta={meta}
										enabled={state.enabled}
										missingDependency={state.missingDependency}
									/>
								);
							})}
						</SidebarSubmenu>
					</SidebarItem>
				</SidebarGroup>

				<SidebarSpace />
				<SidebarDivider />

				<SidebarSectionLabel label="Connect" />
				<SidebarItem icon={WebsiteIcon} text="Butler Labs" onClick={() => window.open('https://butlerlabs.dev', '_blank')}>
					<div />
				</SidebarItem>
				<SidebarItem icon={DocsIcon} text="Docs" onClick={() => window.open('https://docs.butlerlabs.dev', '_blank')}>
					<div />
				</SidebarItem>
				<SidebarItem icon={GitHubIcon} text="GitHub" onClick={() => window.open('https://github.com/butlerdotdev', '_blank')}>
					<div />
				</SidebarItem>
				<SidebarItem icon={DiscordIcon} text="Discord" onClick={() => window.open('https://discord.gg/cAzWG9qz3K', '_blank')}>
					<div />
				</SidebarItem>

				<SidebarSectionLabel label="Account" />
				<SidebarGroup label="Settings" icon={<SettingsIcon />} to="/settings">
					<SidebarSettings />
				</SidebarGroup>
			</Sidebar>
			{children}
		</SidebarPage>
	);
};
