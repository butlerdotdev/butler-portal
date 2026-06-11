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
import MenuBookIcon from '@material-ui/icons/MenuBook';
import StorageIcon from '@material-ui/icons/Storage';
import TimelineIcon from '@material-ui/icons/Timeline';
import ViewQuiltIcon from '@material-ui/icons/ViewQuilt';
import {
	BUTLER_LABS_PLUGINS,
	ButlerLabsPluginMeta,
	pluginEnabledConfigKey,
} from '../plugins/butlerLabsPluginsMeta';

// The Butler Labs navigation cards on the homepage. Always render every card;
// the disabled state (greyed + tooltip + still-clickable to the branded
// PluginNotEnabledPage) is conditioned on plugins.<name>.enabled. Stays in a
// separate component from HomePage so it is unit-testable without needing
// mocks for the Search, Catalog, and Home plugins HomePage also depends on.

const useStyles = makeStyles(theme => ({
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
	navCardDisabled: {
		// Greyed but still clickable -- the link routes to the branded
		// PluginNotEnabledPage in App.tsx, not a dead URL. Hover affordance
		// is intentionally suppressed so the disabled state reads consistently.
		opacity: 0.45,
		cursor: 'not-allowed',
		'&:hover': {
			borderColor: `1px solid ${(theme.palette as any).border || '#262626'}`,
			transform: 'none',
			boxShadow: 'none',
		},
		'&:hover $navArrow': {
			opacity: 0,
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
}));

const NavigationCard = ({
	icon,
	title,
	description,
	href,
	disabled,
	tooltipBody,
	testId,
}: {
	icon: ReactNode;
	title: string;
	description: string;
	href: string;
	disabled?: boolean;
	tooltipBody?: string;
	testId?: string;
}) => {
	const classes = useStyles();
	const card = (
		<a
			href={href}
			className={`${classes.navCard}${disabled ? ` ${classes.navCardDisabled}` : ''}`}
			aria-disabled={disabled ? 'true' : undefined}
			data-testid={testId}
		>
			<div className={classes.navIconBox}>{icon}</div>
			<div className={classes.navContent}>
				<Typography className={classes.navTitle}>{title}</Typography>
				<Typography className={classes.navDesc}>{description}</Typography>
			</div>
			<ArrowForwardIcon className={classes.navArrow} />
		</a>
	);
	if (disabled && tooltipBody) {
		return (
			<Tooltip
				title={tooltipBody}
				placement="top"
				enterDelay={250}
				enterNextDelay={250}
			>
				{card}
			</Tooltip>
		);
	}
	return card;
};

// Pull the homepage card copy off the brand metadata so the front-door
// description stays close to the marketing tone the homepage already uses
// (the metadata's longDescription is more functional -- it powers the
// not-enabled page where operators read why and how to enable).
const HOMEPAGE_CARD_COPY: Record<
	ButlerLabsPluginMeta['configKey'],
	{ icon: ReactNode; description: string }
> = {
	butler: {
		icon: <CloudIcon />,
		description: 'Kubernetes clusters, teams, and infrastructure',
	},
	workspaces: {
		icon: <ViewQuiltIcon />,
		description: 'Private development environments, prepared and ready',
	},
	registry: {
		icon: <StorageIcon />,
		description: 'Governed stores for infrastructure code',
	},
	pipeline: {
		icon: <TimelineIcon />,
		description: 'Telemetry routing at fleet scale',
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
		<Box className={classes.section}>
			<Grid container spacing={2}>
				{BUTLER_LABS_PLUGINS.map(meta => {
					const enabled = enabledByKey[meta.configKey];
					const copy = HOMEPAGE_CARD_COPY[meta.configKey];
					const tooltipBody = !enabled
						? `${meta.brandName} -- ${meta.shortDescription} Available but not enabled for this deployment. Ask your administrator to set ${pluginEnabledConfigKey(meta)} to true.`
						: undefined;
					return (
						<Grid item xs={12} sm={6} lg={3} key={meta.configKey}>
							<NavigationCard
								icon={copy.icon}
								title={meta.brandName}
								description={copy.description}
								href={`/${meta.routePath}`}
								disabled={!enabled}
								tooltipBody={tooltipBody}
								testId={`homepage-card-${meta.configKey}${enabled ? '' : '-disabled'}`}
							/>
						</Grid>
					);
				})}
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
	);
};
