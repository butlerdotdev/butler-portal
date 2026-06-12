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
		fontSize: '2.5rem',
		fontWeight: 700,
		color: theme.palette.text.primary,
		fontFamily: '"Inter", sans-serif',
		lineHeight: 1.1,
		letterSpacing: '-0.015em',
		[theme.breakpoints.down('xs')]: {
			fontSize: '1.75rem',
		},
	},
	welcomeSubtitle: {
		fontSize: '1.05rem',
		color: theme.palette.text.secondary,
		marginTop: theme.spacing(1),
		lineHeight: 1.5,
		maxWidth: 720,
	},
	'@keyframes borderShimmer': {
		'0%': { transform: 'rotate(0deg)' },
		'100%': { transform: 'rotate(360deg)' },
	},
	searchBarContainer: {
		maxWidth: 640,
		marginTop: theme.spacing(3),
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
	activitySectionHeader: {
		display: 'flex',
		alignItems: 'center',
		gap: theme.spacing(1.5),
		marginBottom: theme.spacing(1.5),
	},
	activitySectionLabel: {
		fontSize: '0.72rem',
		fontWeight: 700,
		letterSpacing: '0.14em',
		textTransform: 'uppercase',
		color: theme.palette.primary.main,
		opacity: 0.85,
	},
	activitySectionRule: {
		flex: 1,
		height: 1,
		background: `linear-gradient(to right, ${theme.palette.primary.main}40, transparent 70%)`,
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
							Your butlers are ready. Pick a chamber, summon a tool, or
							search the estate.
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

						{/* Activity. The Starred and Recently Visited Backstage widgets
							ship their own internal headings, so the outer chrome here is
							deliberately header-free to avoid the doubled-title visual. */}
						<div className={classes.activitySectionHeader}>
							<span className={classes.activitySectionLabel}>
								Your activity
							</span>
							<span className={classes.activitySectionRule} aria-hidden="true" />
						</div>
						<Box className={classes.section}>
							<Grid container spacing={2}>
								<Grid item xs={12} md={6}>
									<div className={classes.widgetCard}>
										<HomePageStarredEntities />
									</div>
								</Grid>
								<Grid item xs={12} md={6}>
									<div className={classes.widgetCard}>
										<HomePageRecentlyVisited />
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
