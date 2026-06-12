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
import { useEffect, useRef } from 'react';
import { SidebarSubmenuItem } from '@backstage/core-components';
import { makeStyles, Tooltip } from '@material-ui/core';
import {
	ButlerLabsPluginMeta,
	pluginEnabledConfigKey,
} from '../plugins/butlerLabsPluginsMeta';

const useBrandIconStyles = makeStyles(theme => ({
	brand: { color: theme.palette.primary.main },
}));

const brandIcon = (Icon: any) => (props: any) => {
	const classes = useBrandIconStyles();
	return <Icon {...props} className={classes.brand} />;
};

// SidebarSubmenuItem has no disabled prop, no className, no style escape.
// The disabled affordance is composed at the wrapper level: a Material-UI
// Tooltip carries the descriptive copy on hover and keyboard focus, and a
// span with reduced opacity plus a not-allowed cursor makes the disabled
// state visually unambiguous. The route target (`to`) stays the same as the
// enabled item -- the route element in App.tsx renders the branded
// PluginNotEnabledPage when the flag is off, so clicking still feels like a
// well-formed action rather than a dead link.
const useItemStyles = makeStyles(theme => ({
	wrapper: {
		display: 'block',
	},
	disabledWrapper: {
		opacity: 0.45,
		cursor: 'not-allowed',
		display: 'block',
		'& a, & a:hover': {
			cursor: 'not-allowed',
			textDecoration: 'none',
		},
	},
	tip: {
		backgroundColor: theme.palette.background.paper,
		border: `1px solid ${theme.palette.divider}`,
		color: theme.palette.text.primary,
		padding: theme.spacing(1.25, 1.5),
		maxWidth: 280,
		boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
	},
	tipRole: {
		fontStyle: 'italic',
		fontWeight: 600,
		color: theme.palette.primary.main,
		fontSize: '0.85rem',
		marginBottom: theme.spacing(0.5),
	},
	tipDesc: {
		fontSize: '0.85rem',
		lineHeight: 1.5,
		opacity: 0.92,
	},
	tipDisabled: {
		marginTop: theme.spacing(1),
		paddingTop: theme.spacing(1),
		borderTop: `1px solid ${theme.palette.divider}`,
		fontSize: '0.78rem',
		opacity: 0.85,
		lineHeight: 1.5,
	},
	tipKey: {
		fontFamily:
			'"JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, monospace',
		fontSize: '0.78rem',
		backgroundColor: theme.palette.background.default,
		border: `1px solid ${theme.palette.divider}`,
		padding: '0 4px',
		borderRadius: 3,
	},
}));

export const ButlerLabsSubmenuItem = ({
	meta,
	enabled,
}: {
	meta: ButlerLabsPluginMeta;
	enabled: boolean;
}) => {
	const classes = useItemStyles();
	const BrandedIcon = brandIcon(meta.icon);
	const configKey = pluginEnabledConfigKey(meta);
	const wrapperRef = useRef<HTMLSpanElement>(null);

	// SidebarSubmenuItem renders a react-router NavLink (an <a>) we cannot
	// reach via props. Many AT pairs (NVDA + Firefox, JAWS + Edge) announce
	// disabled state from the FOCUSED element's own aria-disabled, not from
	// an ancestor span's. After mount, mirror the disabled state onto the
	// inner anchor so screen readers announce it on the same element they
	// announce the link name on. The wrapper still carries aria-disabled for
	// AT pairs that DO traverse ancestors, plus aria-label for ones that
	// need an independently-readable disabled-state name.
	useEffect(() => {
		const wrapper = wrapperRef.current;
		if (!wrapper) return;
		const anchor = wrapper.querySelector('a');
		if (!anchor) return;
		if (enabled) {
			anchor.removeAttribute('aria-disabled');
		} else {
			anchor.setAttribute('aria-disabled', 'true');
		}
	}, [enabled]);

	const item = (
		<SidebarSubmenuItem
			title={meta.brandName}
			to={meta.routePath}
			icon={BrandedIcon}
		/>
	);

	const tooltipContent = (
		<>
			<div className={classes.tipRole}>{meta.role}</div>
			<div className={classes.tipDesc}>{meta.shortDescription}</div>
			{!enabled && (
				<div className={classes.tipDisabled}>
					Available, not enabled for this deployment. Ask your administrator
					to set <span className={classes.tipKey}>{configKey}</span> to{' '}
					<span className={classes.tipKey}>true</span>.
				</div>
			)}
		</>
	);

	// Material-UI v4 Tooltip attaches aria-describedby to the cloned child
	// element while open. SidebarSubmenuItem does not accept aria props for
	// pass-through, so the cloned child is the wrapping span. The aria-label
	// on the disabled wrapper gives the disabled state its own
	// screen-reader-readable name independent of the describedby.
	return (
		<Tooltip
			title={tooltipContent}
			placement="right"
			enterDelay={250}
			enterNextDelay={250}
			classes={{ tooltip: classes.tip }}
		>
			<span
				ref={wrapperRef}
				className={enabled ? classes.wrapper : classes.disabledWrapper}
				aria-disabled={enabled ? undefined : true}
				aria-label={
					enabled
						? undefined
						: `${meta.brandName}: available but not enabled for this deployment.`
				}
				data-testid={
					enabled
						? undefined
						: `butler-labs-submenu-item-disabled-${meta.configKey}`
				}
			>
				{item}
			</span>
		</Tooltip>
	);
};
