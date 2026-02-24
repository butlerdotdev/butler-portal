import { PropsWithChildren } from 'react';
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

export const Root = ({ children }: PropsWithChildren<{}>) => (
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

				<SidebarDivider />
				<SidebarItem icon={ButlerLabsIcon} to="butler" text="Butler Labs">
					<SidebarSubmenu title="Butler Labs">
						<SidebarSubmenuItem title="Butler" to="butler" icon={BrandCloudIcon} />
						<SidebarSubmenuItem title="Chambers" to="workspaces" icon={BrandViewQuiltIcon} />
						<SidebarSubmenuItem title="Keeper" to="registry" icon={BrandStorageIcon} />
						<SidebarSubmenuItem title="Herald" to="pipeline" icon={BrandTimelineIcon} />
					</SidebarSubmenu>
				</SidebarItem>
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
