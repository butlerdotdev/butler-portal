/*
 * Copyright 2026 The Butler Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ReactNode } from 'react';
import { Box, Grid, Tooltip, Typography, makeStyles } from '@material-ui/core';
import { configApiRef, useApi } from '@backstage/core-plugin-api';
import AddCircleOutlineIcon from '@material-ui/icons/AddCircleOutline';
import ArrowForwardIcon from '@material-ui/icons/ArrowForward';
import CategoryIcon from '@material-ui/icons/Category';
import CloudIcon from '@material-ui/icons/Cloud';
import CodeIcon from '@material-ui/icons/Code';
import BookOutlinedIcon from '@material-ui/icons/MenuBook';
import MenuBookIcon from '@material-ui/icons/MenuBook';
import StorageIcon from '@material-ui/icons/Storage';
import TimelineIcon from '@material-ui/icons/Timeline';
import ViewQuiltIcon from '@material-ui/icons/ViewQuilt';
import {
	BUTLER_LABS_PLUGINS,
	ButlerLabsPluginMeta,
	pluginEnabledConfigKey,
} from '../plugins/butlerLabsPluginsMeta';
import { borderColor } from '../../themes/paletteAccess';

// The Butler Labs navigation cards on the homepage. Always render every card;
// the disabled state (greyed + tooltip + still-clickable to the branded
// PluginNotEnabledPage) is conditioned on plugins.<name>.enabled. Stays in a
// separate component from HomePage so it is unit-testable without needing
// mocks for the Search, Catalog, and Home plugins HomePage also depends on.

const useStyles = makeStyles(theme => ({
	section: {
		marginBottom: theme.spacing(4),
	},
	// Small uppercase brand-tinted label with a hairline rule. Anchors each
	// row visually and matches the typographic rhythm used on butlerlabs.dev
	// and butler-console.
	sectionHeader: {
		display: 'flex',
		alignItems: 'center',
		gap: theme.spacing(1.5),
		marginBottom: theme.spacing(1.5),
	},
	sectionLabel: {
		fontSize: '0.72rem',
		fontWeight: 700,
		letterSpacing: '0.14em',
		textTransform: 'uppercase',
		color: theme.palette.primary.main,
		opacity: 0.85,
	},
	sectionRule: {
		flex: 1,
		height: 1,
		background: `linear-gradient(to right, ${theme.palette.primary.main}40, transparent 70%)`,
	},
	navCard: {
		position: 'relative',
		overflow: 'hidden',
		backgroundColor: theme.palette.background.paper,
		borderRadius: 12,
		padding: theme.spacing(2.5),
		border: `1px solid ${borderColor(theme, '#262626')}`,
		cursor: 'pointer',
		transition: 'all 0.25s ease',
		height: '100%',
		minHeight: 110,
		display: 'flex',
		alignItems: 'flex-start',
		gap: theme.spacing(2),
		textDecoration: 'none',
		'&:hover': {
			borderColor: theme.palette.primary.main,
			transform: 'translateY(-2px)',
			boxShadow: `0 8px 24px ${
				theme.palette.type === 'dark'
					? 'rgba(34, 197, 94, 0.15)'
					: 'rgba(0, 0, 0, 0.10)'
			}`,
		},
		'&:hover $navArrow': {
			opacity: 1,
			color: theme.palette.primary.main,
		},
		'&:hover $navMascot': {
			opacity: 0.32,
			transform: 'translateY(-50%) translateX(-4px)',
		},
		'&:hover $navMascotGlow': {
			opacity: 0.9,
		},
	},
	navCardDisabled: {
		// Greyed but still clickable -- the link routes to the branded
		// PluginNotEnabledPage in App.tsx, not a dead URL. Hover affordance
		// is intentionally suppressed so the disabled state reads consistently.
		opacity: 0.6,
		cursor: 'not-allowed',
		// Suppress the standard hover lift / brand border / shadow on disabled
		// cards. Keep the border the same as the non-hover state so the only
		// hover affordance is the cursor (not-allowed) and the watermark
		// glow. borderColor takes a color, not a shorthand.
		'&:hover': {
			borderColor: borderColor(theme, '#262626'),
			transform: 'none',
			boxShadow: 'none',
		},
		'&:hover $navArrow': {
			opacity: 0,
		},
		'&:hover $navMascot': {
			opacity: 0.12,
			transform: 'translateY(-50%)',
		},
		'&:hover $navMascotGlow': {
			opacity: 0.3,
		},
	},
	// Brand-tinted radial glow behind the mascot. Subtle by default, lights
	// up on hover for the enabled cards.
	navMascotGlow: {
		position: 'absolute',
		right: -60,
		top: '50%',
		transform: 'translateY(-50%)',
		width: 160,
		height: 160,
		pointerEvents: 'none',
		background: `radial-gradient(circle at 50% 50%, ${theme.palette.primary.main}20 0%, ${theme.palette.primary.main}10 50%, transparent 80%)`,
		opacity: 0.5,
		transition: 'opacity 0.25s ease',
	},
	// The mascot reads as a watermark, not a sticker. Anchored to the right
	// edge, pushed mostly off-canvas so only the silhouette accent shows,
	// and faded to transparent on its left side via a mask gradient so the
	// description text always reads cleanly on top of the card background
	// rather than over the mascot's body.
	navMascot: {
		position: 'absolute',
		right: -28,
		// Push the mascot slightly below the card's top edge so the Lore
		// pill in the top-right corner has a clean background.
		top: 'calc(50% + 4px)',
		transform: 'translateY(-50%)',
		height: 'calc(100% - 4px)',
		maxHeight: 130,
		width: 'auto',
		objectFit: 'contain',
		opacity: 0.22,
		pointerEvents: 'none',
		userSelect: 'none',
		transition: 'opacity 0.25s ease, transform 0.25s ease',
		filter: 'drop-shadow(0 6px 12px rgba(0, 0, 0, 0.35))',
		// Fade the mascot to transparent on its left side so the description
		// always reads on the card background, not over the mascot's body.
		maskImage:
			'linear-gradient(to left, rgba(0,0,0,1) 58%, rgba(0,0,0,0) 100%)',
		WebkitMaskImage:
			'linear-gradient(to left, rgba(0,0,0,1) 58%, rgba(0,0,0,0) 100%)',
	},
	navIconBox: {
		position: 'relative',
		zIndex: 1,
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
		position: 'relative',
		zIndex: 1,
		flex: 1,
		minWidth: 0,
		overflow: 'hidden',
		display: 'flex',
		flexDirection: 'column',
	},
	navTitle: {
		fontSize: '1rem',
		fontWeight: 700,
		color: theme.palette.text.primary,
		lineHeight: 1.25,
		letterSpacing: '-0.005em',
	},
	navDesc: {
		fontSize: '0.8rem',
		color: theme.palette.text.secondary,
		lineHeight: 1.45,
		marginTop: 3,
		// The mascot's left-edge mask fade keeps it from running into text;
		// 48px of padding is enough breathing room without making short
		// two-clause descriptions wrap five lines deep.
		paddingRight: theme.spacing(6),
	},
	navArrow: {
		position: 'relative',
		zIndex: 1,
		fontSize: 16,
		color: theme.palette.text.secondary,
		opacity: 0,
		transition: 'all 0.2s ease',
		marginTop: 2,
		flexShrink: 0,
	},
	// Pill-shaped "Origin" lore badge matching butlerlabs.dev's products
	// page treatment. Subtle by default, brand-tinted on hover/focus. Click
	// is swallowed at the React level so reading the lore never navigates
	// the visitor away from where they are.
	// Small "Lore" pill that sits directly above the brand name -- inside
	// the content column, well clear of the mascot watermark on the right
	// of the card.
	navInfoButton: {
		alignSelf: 'flex-start',
		display: 'inline-flex',
		alignItems: 'center',
		gap: 3,
		marginBottom: theme.spacing(0.5),
		padding: '0px 7px 0px 6px',
		height: 18,
		borderRadius: 999,
		border: `1px solid ${theme.palette.divider}`,
		backgroundColor: `${theme.palette.background.default}99`,
		color: theme.palette.text.secondary,
		fontSize: '0.6rem',
		fontWeight: 700,
		letterSpacing: '0.08em',
		textTransform: 'uppercase',
		cursor: 'help',
		whiteSpace: 'nowrap',
		transition:
			'border-color 0.15s ease, color 0.15s ease, background-color 0.15s ease',
		'&:hover, &:focus': {
			outline: 'none',
			borderColor: theme.palette.primary.main,
			color: theme.palette.primary.main,
			backgroundColor: `${theme.palette.primary.main}1a`,
		},
	},
	navInfoIcon: {
		fontSize: 11,
	},
}));

const NavigationCard = ({
	icon,
	title,
	description,
	href,
	disabled,
	testId,
	mascotPath,
	mascotAlt,
	themedHint,
}: {
	icon: ReactNode;
	title: string;
	description: string;
	href: string;
	disabled?: boolean;
	testId?: string;
	mascotPath?: string;
	mascotAlt?: string;
	themedHint?: string;
}) => {
	const classes = useStyles();
	// The Origin pill is a passive visual badge, NOT a nested interactive
	// element. Anchors cannot contain another interactive control: an inner
	// role="button" inside an <a href> is invalid HTML and the WAI-ARIA spec
	// prohibits interactive descendants of role=link, so screen readers
	// announce ambiguously and keyboard activation collapses. The MUI Tooltip
	// wrapper still attaches its hover/focus handlers to the cloned child
	// span, so mousing over (or tabbing onto the parent link and hovering)
	// surfaces the themed lore copy. A click anywhere on the card -- pill
	// included -- routes to the plugin (or to PluginNotEnabledPage when off);
	// no swallow handler is needed.
	return (
		<a
			href={href}
			className={`${classes.navCard}${disabled ? ` ${classes.navCardDisabled}` : ''}`}
			aria-disabled={disabled ? true : undefined}
			data-testid={testId}
		>
			{mascotPath && (
				<>
					<span className={classes.navMascotGlow} aria-hidden="true" />
					<img
						className={classes.navMascot}
						src={mascotPath}
						alt={mascotAlt || ''}
						aria-hidden="true"
						loading="lazy"
					/>
				</>
			)}
			<div className={classes.navIconBox}>{icon}</div>
			<div className={classes.navContent}>
				{themedHint && (
					<Tooltip
						title={themedHint}
						placement="top"
						enterDelay={150}
						enterNextDelay={150}
					>
						<span
							className={classes.navInfoButton}
							aria-label={`${title} origin`}
						>
							<BookOutlinedIcon className={classes.navInfoIcon} />
							<span>Origin</span>
						</span>
					</Tooltip>
				)}
				<Typography className={classes.navTitle}>{title}</Typography>
				<Typography className={classes.navDesc}>{description}</Typography>
			</div>
			<ArrowForwardIcon className={classes.navArrow} />
		</a>
	);
};

// Homepage card copy. Description is the functional what-it-does so a new
// visitor immediately understands the tool; themedHint carries the
// butlerlabs.dev estate voice and surfaces via the info button. Kept inline
// because the metadata's long-form origin copy is too dense for a card.
const HOMEPAGE_CARD_COPY: Record<
	ButlerLabsPluginMeta['configKey'],
	{ icon: ReactNode; description: string; themedHint: string }
> = {
	butler: {
		icon: <CloudIcon />,
		description: 'Kubernetes cluster lifecycle, teams, and providers.',
		themedHint:
			'The Head Butler. Orchestrates the entire estate; everything flows through Butler.',
	},
	workspaces: {
		icon: <ViewQuiltIcon />,
		description: 'Pre-configured developer workspaces.',
		themedHint:
			"The Chamberlain's Domain. Private quarters prepared and equipped on request.",
	},
	registry: {
		icon: <StorageIcon />,
		description: 'IaC module registry, policy, and runs.',
		themedHint:
			'The Keeper of the Wardrobe. Secures, governs, and executes infrastructure code.',
	},
	pipeline: {
		icon: <TimelineIcon />,
		description: 'Telemetry routing for logs, metrics, and traces.',
		themedHint:
			'The Estate Herald. Carries signals across the realm to the right audience.',
	},
};

export const HomeNavigationCards = () => {
	const classes = useStyles();
	const config = useApi(configApiRef);
	const enabledByKey = Object.fromEntries(
		BUTLER_LABS_PLUGINS.map(meta => [
			meta.configKey,
			config.getOptionalBoolean(pluginEnabledConfigKey(meta)) ?? false,
		]),
	) as Record<ButlerLabsPluginMeta['configKey'], boolean>;

	return (
		<>
			<Box className={classes.section}>
				<div className={classes.sectionHeader}>
					<span className={classes.sectionLabel}>Butler Labs</span>
					<span className={classes.sectionRule} aria-hidden="true" />
				</div>
				<Grid container spacing={2}>
					{BUTLER_LABS_PLUGINS.map(meta => {
						const enabled = enabledByKey[meta.configKey];
						const copy = HOMEPAGE_CARD_COPY[meta.configKey];
						return (
							<Grid item xs={12} sm={6} lg={3} key={meta.configKey}>
								<NavigationCard
									icon={copy.icon}
									title={meta.brandName}
									description={copy.description}
									href={`/${meta.routePath}`}
									disabled={!enabled}
									testId={`homepage-card-${meta.configKey}${enabled ? '' : '-disabled'}`}
									mascotPath={meta.mascotPath}
									mascotAlt={`${meta.brandName} mascot`}
									themedHint={copy.themedHint}
								/>
							</Grid>
						);
					})}
				</Grid>
			</Box>

			<Box className={classes.section}>
				<div className={classes.sectionHeader}>
					<span className={classes.sectionLabel}>Platform</span>
					<span className={classes.sectionRule} aria-hidden="true" />
				</div>
				<Grid container spacing={2}>
					<Grid item xs={12} sm={6} lg={3}>
						<NavigationCard icon={<AddCircleOutlineIcon />} title="Create" description="Scaffold from golden-path templates." href="/create" />
					</Grid>
					<Grid item xs={12} sm={6} lg={3}>
						<NavigationCard icon={<CategoryIcon />} title="Catalog" description="Services, APIs, and infrastructure." href="/catalog" />
					</Grid>
					<Grid item xs={12} sm={6} lg={3}>
						<NavigationCard icon={<MenuBookIcon />} title="Documentation" description="Technical docs for platform components." href="/docs" />
					</Grid>
					<Grid item xs={12} sm={6} lg={3}>
						<NavigationCard icon={<CodeIcon />} title="APIs" description="API specifications and schemas." href="/api-docs" />
					</Grid>
				</Grid>
			</Box>
		</>
	);
};
