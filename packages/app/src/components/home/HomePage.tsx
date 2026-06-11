import { useEffect, useState } from 'react';
import { makeStyles, Grid, Typography, Box } from '@material-ui/core';
import { Page, Content } from '@backstage/core-components';
import {
	HomePageStarredEntities,
	HomePageRecentlyVisited,
} from '@backstage/plugin-home';
import { SearchContextProvider } from '@backstage/plugin-search-react';
import { HomePageSearchBar } from '@backstage/plugin-search';
import { HomeNavigationCards } from './HomeNavigationCards';

const typewriterPrompts = [
	'Search for Kubernetes clusters...',
	'Find API documentation...',
	'Explore Chambers templates...',
	'Search the Keeper...',
	'Configure Herald pipelines...',
	'Which teams have active clusters?',
	'How do I create a new chamber?',
];

function useTypewriter(
	prompts: string[],
	typingMs = 65,
	deletingMs = 30,
	pauseMs = 2500,
): string {
	const [text, setText] = useState('');
	const [promptIdx, setPromptIdx] = useState(0);
	const [phase, setPhase] = useState<
		'typing' | 'pausing' | 'deleting' | 'waiting'
	>('typing');

	useEffect(() => {
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
			default:
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

						{/* Navigation. Butler Labs cards live in HomeNavigationCards so
							the gate logic is unit-testable without HomePage's Search,
							Catalog, and Home plugin API dependencies. */}
						<HomeNavigationCards />

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
