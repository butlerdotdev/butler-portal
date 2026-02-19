import { PropsWithChildren } from 'react';
import { makeStyles } from '@material-ui/core';
import HomeIcon from '@material-ui/icons/Home';
import CategoryIcon from '@material-ui/icons/Category';
import ExtensionIcon from '@material-ui/icons/Extension';
import LibraryBooks from '@material-ui/icons/LibraryBooks';
import CreateComponentIcon from '@material-ui/icons/AddCircleOutline';
import StorageIcon from '@material-ui/icons/Storage';
import LogoFull from './LogoFull';
import LogoIcon from './LogoIcon';
import ButlerIcon from './ButlerIcon';
import WorkspacesIcon from './WorkspacesIcon';
import {
	Sidebar,
	sidebarConfig,
	SidebarDivider,
	SidebarGroup,
	SidebarItem,
	SidebarPage,
	SidebarSpace,
	SidebarScrollWrapper,
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

				{/* Catalog Section */}
				<SidebarItem icon={CategoryIcon} to="catalog" text="Catalog">
					<SidebarSubmenu title="Catalog">
						<SidebarSubmenuItem title="Components" to="catalog?filters[kind]=component" icon={ExtensionIcon} />
						<SidebarSubmenuItem title="Systems" to="catalog?filters[kind]=system" icon={StorageIcon} />
						<SidebarSubmenuItem title="APIs" to="catalog?filters[kind]=api" icon={ExtensionIcon} />
						<SidebarSubmenuItem title="Resources" to="catalog?filters[kind]=resource" icon={StorageIcon} />
					</SidebarSubmenu>
				</SidebarItem>

				<SidebarItem icon={ExtensionIcon} to="api-docs" text="APIs" />
				<SidebarItem icon={LibraryBooks} to="docs" text="Docs" />
				<SidebarItem icon={CreateComponentIcon} to="create" text="Create..." />

				<SidebarDivider />
				<SidebarScrollWrapper>
					<SidebarItem icon={ButlerIcon} to="butler" text="Butler" />
					<SidebarItem icon={WorkspacesIcon} to="workspaces" text="Workspaces" />
					<SidebarItem icon={StorageIcon} to="registry" text="Registry" />
				</SidebarScrollWrapper>
			</SidebarGroup>

			<SidebarSpace />
			<SidebarDivider />

			<SidebarGroup label="Settings" icon={<SettingsIcon />} to="/settings">
				<SidebarSettings />
			</SidebarGroup>
		</Sidebar>
		{children}
	</SidebarPage>
);
