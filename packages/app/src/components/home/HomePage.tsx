import React from 'react';
import { makeStyles, Grid, Typography, Box } from '@material-ui/core';
import { Page, Content } from '@backstage/core-components';
import {
	HomePageStarredEntities,
	HomePageRecentlyVisited,
} from '@backstage/plugin-home';
import { SearchContextProvider } from '@backstage/plugin-search-react';
import { HomePageSearchBar } from '@backstage/plugin-search';
import AddCircleOutlineIcon from '@material-ui/icons/AddCircleOutline';
import CategoryIcon from '@material-ui/icons/Category';
import MenuBookIcon from '@material-ui/icons/MenuBook';
import CodeIcon from '@material-ui/icons/Code';
import CloudIcon from '@material-ui/icons/Cloud';
import ViewQuiltIcon from '@material-ui/icons/ViewQuilt';
import StorageIcon from '@material-ui/icons/Storage';
import TimelineIcon from '@material-ui/icons/Timeline';
import ArrowForwardIcon from '@material-ui/icons/ArrowForward';

const typewriterPrompts = [
	'Search for Kubernetes clusters...',
	'Find API documentation...',
	'Browse workspace templates...',
	'Explore registry artifacts...',
	'Discover pipeline configurations...',
	'Which teams have active clusters?',
	'How do I create a new workspace?',
];

function useTypewriter(
	prompts: string[],
	typingMs = 65,
	deletingMs = 30,
	pauseMs = 2500,
): string {
	const [text, setText] = React.useState('');
	const [promptIdx, setPromptIdx] = React.useState(0);
	const [phase, setPhase] = React.useState<
		'typing' | 'pausing' | 'deleting' | 'waiting'
	>('typing');

	React.useEffect(() => {
		const prompt = prompts[promptIdx];
		let timeout: ReturnType<typeof setTimeout>;

		switch (phase) {
			case 'typing':
				if (text.length < prompt.length) {
					timeout = setTimeout(
						() => setText(prompt.slice(0, text.length + 1)),
						typingMs + Math.random() * 40,
					);
				} else {
					setPhase('pausing');
				}
				break;
			case 'pausing':
				timeout = setTimeout(() => setPhase('deleting'), pauseMs);
				break;
			case 'deleting':
				if (text.length > 0) {
					timeout = setTimeout(
						() => setText(text.slice(0, -1)),
						deletingMs,
					);
				} else {
					setPhase('waiting');
				}
				break;
			case 'waiting':
				timeout = setTimeout(() => {
					setPromptIdx(prev => (prev + 1) % prompts.length);
					setPhase('typing');
				}, 400);
				break;
		}

		return () => clearTimeout(timeout!);
	}, [text, phase, promptIdx, prompts, typingMs, deletingMs, pauseMs]);

	return text;
}

const useStyles = makeStyles(theme => ({
	container: {
		padding: theme.spacing(4),
		maxWidth: 1400,
		margin: '0 auto',
		[theme.breakpoints.down('xs')]: {
			padding: theme.spacing(2),
		},
	},
	welcomeTitle: {
		fontSize: '2rem',
		fontWeight: 600,
		color: theme.palette.text.primary,
		fontFamily: '"Inter", sans-serif',
		[theme.breakpoints.down('xs')]: {
			fontSize: '1.5rem',
		},
	},
	welcomeSubtitle: {
		fontSize: '1rem',
		color: theme.palette.text.secondary,
		marginTop: 4,
	},
	'@keyframes borderShimmer': {
		'0%': { transform: 'rotate(0deg)' },
		'100%': { transform: 'rotate(360deg)' },
	},
	searchBarContainer: {
		maxWidth: 600,
		marginTop: theme.spacing(2.5),
		marginBottom: theme.spacing(5),
	},
	searchBarWrapper: {
		position: 'relative' as const,
		borderRadius: 10,
		padding: 1,
		overflow: 'hidden' as const,
		'&::before': {
			content: '""',
			position: 'absolute' as const,
			top: '-150%',
			left: '-150%',
			right: '-150%',
			bottom: '-150%',
			background: `conic-gradient(
				from 0deg,
				transparent 0%,
				transparent 55%,
				${theme.palette.primary.dark}80 65%,
				${theme.palette.primary.main} 73%,
				${theme.palette.primary.light} 77%,
				${theme.palette.primary.main} 85%,
				${theme.palette.primary.dark}80 93%,
				transparent 100%
			)`,
			animation: '$borderShimmer 4s linear infinite',
		},
	},
	searchBar: {
		position: 'relative' as const,
		zIndex: 1,
		backgroundColor: theme.palette.background.paper,
		borderRadius: 9,
		border: 'none',
		'& input': {
			color: theme.palette.text.primary,
		},
	},
	section: {
		marginBottom: theme.spacing(4),
	},
	navCard: {
		backgroundColor: theme.palette.background.paper,
		borderRadius: 12,
		padding: theme.spacing(2.5),
		border: `1px solid ${(theme.palette as any).border || '#262626'}`,
		cursor: 'pointer',
		transition: 'all 0.2s ease',
		height: '100%',
		display: 'flex',
		alignItems: 'flex-start',
		gap: theme.spacing(2),
		textDecoration: 'none',
		'&:hover': {
			borderColor: theme.palette.primary.main,
			transform: 'translateY(-1px)',
			boxShadow: `0 4px 16px ${theme.palette.type === 'dark' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(0, 0, 0, 0.08)'}`,
		},
		'&:hover $navArrow': {
			opacity: 1,
			color: theme.palette.primary.main,
		},
	},
	navIconBox: {
		width: 44,
		height: 44,
		borderRadius: 10,
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		flexShrink: 0,
		backgroundColor: `${theme.palette.primary.main}15`,
		color: theme.palette.primary.main,
		'& svg': {
			fontSize: 22,
		},
	},
	navContent: {
		flex: 1,
		minWidth: 0,
		overflow: 'hidden',
	},
	navTitle: {
		fontSize: '0.925rem',
		fontWeight: 600,
		color: theme.palette.text.primary,
		lineHeight: 1.3,
	},
	navDesc: {
		fontSize: '0.8rem',
		color: theme.palette.text.secondary,
		lineHeight: 1.4,
		marginTop: 2,
	},
	navArrow: {
		fontSize: 16,
		color: theme.palette.text.secondary,
		opacity: 0,
		transition: 'all 0.2s ease',
		marginTop: 2,
		flexShrink: 0,
	},
	widgetCard: {
		backgroundColor: theme.palette.background.paper,
		borderRadius: 12,
		border: `1px solid ${(theme.palette as any).border || '#262626'}`,
		overflow: 'hidden',
		height: '100%',
	},
	widgetHeader: {
		padding: theme.spacing(2, 2.5),
		borderBottom: `1px solid ${(theme.palette as any).border || '#262626'}`,
	},
	widgetTitle: {
		fontSize: '0.875rem',
		fontWeight: 600,
		color: theme.palette.text.secondary,
	},
	widgetContent: {
		padding: theme.spacing(1.5),
	},
}));

const NavigationCard = ({
	icon,
	title,
	description,
	href,
}: {
	icon: React.ReactNode;
	title: string;
	description: string;
	href: string;
}) => {
	const classes = useStyles();
	return (
		<a href={href} className={classes.navCard}>
			<div className={classes.navIconBox}>
				{icon}
			</div>
			<div className={classes.navContent}>
				<Typography className={classes.navTitle}>{title}</Typography>
				<Typography className={classes.navDesc}>{description}</Typography>
			</div>
			<ArrowForwardIcon className={classes.navArrow} />
		</a>
	);
};

export const HomePage = () => {
	const classes = useStyles();
	const placeholder = useTypewriter(typewriterPrompts);

	return (
		<SearchContextProvider>
			<Page themeId="home">
				<Content>
					<div className={classes.container}>
						{/* Welcome */}
						<Typography className={classes.welcomeTitle}>
							Welcome to Butler Portal
						</Typography>
						<Typography className={classes.welcomeSubtitle}>
							Your internal developer platform. Discover services, manage
							infrastructure, and ship faster.
						</Typography>
						<div className={classes.searchBarContainer}>
							<div className={classes.searchBarWrapper}>
								<HomePageSearchBar
									placeholder={placeholder || ' '}
									classes={{ root: classes.searchBar }}
								/>
							</div>
						</div>

						{/* Navigation */}
						<Box className={classes.section}>
							<Grid container spacing={2}>
								<Grid item xs={12} sm={6} lg={3}>
									<NavigationCard icon={<CloudIcon />} title="Butler" description="Kubernetes clusters, teams, and infrastructure" href="/butler" />
								</Grid>
								<Grid item xs={12} sm={6} lg={3}>
									<NavigationCard icon={<ViewQuiltIcon />} title="Workspaces" description="Development environments and collaboration" href="/workspaces" />
								</Grid>
								<Grid item xs={12} sm={6} lg={3}>
									<NavigationCard icon={<StorageIcon />} title="Registry" description="Private IaC artifact registry and governance" href="/registry" />
								</Grid>
								<Grid item xs={12} sm={6} lg={3}>
									<NavigationCard icon={<TimelineIcon />} title="Pipelines" description="Observability pipeline builder and fleet" href="/pipeline" />
								</Grid>
								<Grid item xs={12} sm={6} lg={3}>
									<NavigationCard icon={<AddCircleOutlineIcon />} title="Create" description="Scaffold services with golden path templates" href="/create" />
								</Grid>
								<Grid item xs={12} sm={6} lg={3}>
									<NavigationCard icon={<CategoryIcon />} title="Catalog" description="Browse services, APIs, and infrastructure" href="/catalog" />
								</Grid>
								<Grid item xs={12} sm={6} lg={3}>
									<NavigationCard icon={<MenuBookIcon />} title="Documentation" description="Technical docs for platform components" href="/docs" />
								</Grid>
								<Grid item xs={12} sm={6} lg={3}>
									<NavigationCard icon={<CodeIcon />} title="APIs" description="Explore API specifications and schemas" href="/api-docs" />
								</Grid>
							</Grid>
						</Box>

						{/* Activity */}
						<Box className={classes.section}>
							<Grid container spacing={2}>
								<Grid item xs={12} md={6}>
									<div className={classes.widgetCard}>
										<div className={classes.widgetHeader}>
											<Typography className={classes.widgetTitle}>
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
											<Typography className={classes.widgetTitle}>
												Recently Visited
											</Typography>
										</div>
										<div className={classes.widgetContent}>
											<HomePageRecentlyVisited />
										</div>
									</div>
								</Grid>
							</Grid>
						</Box>
					</div>
				</Content>
			</Page>
		</SearchContextProvider>
	);
};
