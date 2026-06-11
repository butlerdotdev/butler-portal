import { PropsWithChildren } from 'react';
import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core';
import HomeIcon from '@material-ui/icons/Home';
import CategoryIcon from '@material-ui/icons/Category';
import ExtensionIcon from '@material-ui/icons/Extension';
import LibraryBooks from '@material-ui/icons/LibraryBooks';
import CreateComponentIcon from '@material-ui/icons/AddCircleOutline';
import StorageIcon from '@material-ui/icons/Storage';
import TimelineIcon from '@material-ui/icons/Timeline';
import CloudIcon from '@material-ui/icons/Cloud';
import ViewQuiltIcon from '@material-ui/icons/ViewQuilt';
import LogoFull from './LogoFull';
import LogoIcon from './LogoIcon';
import ButlerLabsIcon from './ButlerLabsIcon';
import { GitHubIcon, DiscordIcon, DocsIcon, WebsiteIcon } from './ExternalLinkIcons';
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
const BrandCloudIcon = brandIcon(CloudIcon);
const BrandViewQuiltIcon = brandIcon(ViewQuiltIcon);
const BrandTimelineIcon = brandIcon(TimelineIcon);

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
	const butler = config.getOptionalBoolean('plugins.butler.enabled') ?? false;
	const workspaces = config.getOptionalBoolean('plugins.workspaces.enabled') ?? false;
	const registry = config.getOptionalBoolean('plugins.registry.enabled') ?? false;
	const pipeline = config.getOptionalBoolean('plugins.pipeline.enabled') ?? false;
	const anyButlerLabs = butler || workspaces || registry || pipeline;
	// Parent group click target picks the first enabled plugin (sidebar
	// order: butler > workspaces > registry > pipeline) so the click never
	// lands on a disabled-route 404. Assignments run lowest-priority first
	// so the highest-priority truthy match overwrites last. Falls back to
	// 'butler' when all four are off; the parent SidebarItem is hidden in
	// that case so the target is never followed.
	let butlerLabsTarget = 'butler';
	if (pipeline) butlerLabsTarget = 'pipeline';
	if (registry) butlerLabsTarget = 'registry';
	if (workspaces) butlerLabsTarget = 'workspaces';
	if (butler) butlerLabsTarget = 'butler';

	return (
		<SidebarPage>
			<Sidebar>
				<SidebarLogo />
				<SidebarGroup label="Search" icon={<SearchIcon />} to="/search">
					<SidebarSearchModal />
				</SidebarGroup>
				<SidebarDivider />

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

					{anyButlerLabs && (
						<>
							<SidebarDivider />
							<SidebarItem icon={ButlerLabsIcon} to={butlerLabsTarget} text="Butler Labs">
								<SidebarSubmenu title="Butler Labs">
									{butler && <SidebarSubmenuItem title="Butler" to="butler" icon={BrandCloudIcon} />}
									{workspaces && <SidebarSubmenuItem title="Chambers" to="workspaces" icon={BrandViewQuiltIcon} />}
									{registry && <SidebarSubmenuItem title="Keeper" to="registry" icon={BrandStorageIcon} />}
									{pipeline && <SidebarSubmenuItem title="Herald" to="pipeline" icon={BrandTimelineIcon} />}
								</SidebarSubmenu>
							</SidebarItem>
						</>
					)}
				</SidebarGroup>

				<SidebarSpace />
				<SidebarDivider />

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

				<SidebarDivider />

				<SidebarGroup label="Settings" icon={<SettingsIcon />} to="/settings">
					<SidebarSettings />
				</SidebarGroup>
			</Sidebar>
			{children}
		</SidebarPage>
	);
};
