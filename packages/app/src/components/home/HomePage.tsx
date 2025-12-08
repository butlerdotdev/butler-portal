import React from 'react';
import { makeStyles, Grid, Typography } from '@material-ui/core';
import { Page, Content } from '@backstage/core-components';
import {
	HomePageStarredEntities,
	HomePageRecentlyVisited,
} from '@backstage/plugin-home';
import { SearchContextProvider } from '@backstage/plugin-search-react';
import { HomePageSearchBar } from '@backstage/plugin-search';
import AddIcon from '@material-ui/icons/Add';
import StorageIcon from '@material-ui/icons/Storage';
import MenuBookIcon from '@material-ui/icons/MenuBook';
import CodeIcon from '@material-ui/icons/Code';

const useStyles = makeStyles(theme => ({
	container: {
		padding: theme.spacing(4),
		maxWidth: 1400,
		margin: '0 auto',
	},
	hero: {
		background: 'linear-gradient(135deg, rgba(22, 163, 74, 0.15) 0%, rgba(34, 197, 94, 0.05) 100%)',
		borderRadius: 16,
		padding: theme.spacing(6),
		marginBottom: theme.spacing(4),
		border: '1px solid rgba(34, 197, 94, 0.2)',
	},
	heroTitle: {
		fontSize: '2.5rem',
		fontWeight: 700,
		color: '#fafafa',
		marginBottom: theme.spacing(1),
		fontFamily: '"Inter", sans-serif',
	},
	heroSubtitle: {
		fontSize: '1.1rem',
		color: '#a3a3a3',
		marginBottom: theme.spacing(3),
		maxWidth: 600,
	},
	searchBarContainer: {
		maxWidth: 600,
		marginTop: theme.spacing(3),
	},
	searchBar: {
		backgroundColor: '#171717',
		borderRadius: 8,
		border: '1px solid #262626',
		'& input': {
			color: '#fafafa',
		},
	},
	sectionTitle: {
		fontSize: '1.25rem',
		fontWeight: 600,
		color: '#fafafa',
		marginBottom: theme.spacing(2),
		fontFamily: '"Inter", sans-serif',
	},
	quickActionCard: {
		backgroundColor: '#171717',
		borderRadius: 12,
		padding: theme.spacing(3),
		border: '1px solid #262626',
		cursor: 'pointer',
		transition: 'all 0.2s ease',
		height: '100%',
		display: 'flex',
		flexDirection: 'column',
		'&:hover': {
			borderColor: '#8b5cf6',
			transform: 'translateY(-2px)',
			boxShadow: '0 4px 20px rgba(139, 92, 246, 0.15)',
		},
	},
	quickActionIcon: {
		width: 48,
		height: 48,
		borderRadius: 10,
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		marginBottom: theme.spacing(2),
	},
	quickActionTitle: {
		fontSize: '1rem',
		fontWeight: 600,
		color: '#fafafa',
		marginBottom: theme.spacing(0.5),
	},
	quickActionDesc: {
		fontSize: '0.875rem',
		color: '#737373',
		lineHeight: 1.5,
	},
	widgetCard: {
		backgroundColor: '#171717',
		borderRadius: 12,
		border: '1px solid #262626',
		overflow: 'hidden',
	},
	widgetHeader: {
		padding: theme.spacing(2, 3),
		borderBottom: '1px solid #262626',
	},
	widgetContent: {
		padding: theme.spacing(2),
	},
}));

const QuickActionCard = ({
	icon,
	title,
	description,
	color,
	href,
}: {
	icon: React.ReactNode;
	title: string;
	description: string;
	color: string;
	href: string;
}) => {
	const classes = useStyles();
	return (
		<a href={href} style={{ textDecoration: 'none' }}>
			<div className={classes.quickActionCard}>
				<div
					className={classes.quickActionIcon}
					style={{ backgroundColor: `${color}20`, color }}
				>
					{icon}
				</div>
				<Typography className={classes.quickActionTitle}>{title}</Typography>
				<Typography className={classes.quickActionDesc}>{description}</Typography>
			</div>
		</a>
	);
};

export const HomePage = () => {
	const classes = useStyles();

	return (
		<SearchContextProvider>
			<Page themeId="home">
				<Content>
					<div className={classes.container}>
						{/* Hero Section */}
						<div className={classes.hero}>
							<Typography className={classes.heroTitle}>
								Welcome to Butler Portal
							</Typography>
							<Typography className={classes.heroSubtitle}>
								Your internal developer platform. Discover services, create new
								components, and ship faster with golden paths.
							</Typography>
							<div className={classes.searchBarContainer}>
								<HomePageSearchBar
									placeholder="Search services, APIs, docs..."
									classes={{ root: classes.searchBar }}
								/>
							</div>
						</div>

						{/* Quick Actions */}
						<Typography className={classes.sectionTitle}>Quick Actions</Typography>
						<Grid container spacing={3} style={{ marginBottom: 32 }}>
							<Grid item xs={12} sm={6} md={3}>
								<QuickActionCard
									icon={<AddIcon />}
									title="Create Component"
									description="Scaffold a new service using golden path templates"
									color="#8b5cf6"
									href="/create"
								/>
							</Grid>
							<Grid item xs={12} sm={6} md={3}>
								<QuickActionCard
									icon={<StorageIcon />}
									title="View Catalog"
									description="Browse all services, APIs, and infrastructure"
									color="#3b82f6"
									href="/catalog"
								/>
							</Grid>
							<Grid item xs={12} sm={6} md={3}>
								<QuickActionCard
									icon={<MenuBookIcon />}
									title="Documentation"
									description="Technical docs for all platform components"
									color="#f59e0b"
									href="/docs"
								/>
							</Grid>
							<Grid item xs={12} sm={6} md={3}>
								<QuickActionCard
									icon={<CodeIcon />}
									title="APIs"
									description="Explore available APIs and their specifications"
									color="#8b5cf6"
									href="/api-docs"
								/>
							</Grid>
						</Grid>

						{/* Widgets Row */}
						<Grid container spacing={3}>
							<Grid item xs={12} md={6}>
								<div className={classes.widgetCard}>
									<div className={classes.widgetHeader}>
										<Typography className={classes.sectionTitle} style={{ margin: 0 }}>
											Starred
										</Typography>
									</div>
									<div className={classes.widgetContent}>
										<HomePageStarredEntities />
									</div>
								</div>
							</Grid>
							<Grid item xs={12} md={6}>
								<div className={classes.widgetCard}>
									<div className={classes.widgetHeader}>
										<Typography className={classes.sectionTitle} style={{ margin: 0 }}>
											Recently Visited
										</Typography>
									</div>
									<div className={classes.widgetContent}>
										<HomePageRecentlyVisited />
									</div>
								</div>
							</Grid>
						</Grid>
					</div>
				</Content>
			</Page>
		</SearchContextProvider>
	);
};
