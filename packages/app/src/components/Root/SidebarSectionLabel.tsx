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
import { useSidebarOpenState } from '@backstage/core-components';
import { makeStyles } from '@material-ui/core';

// Small uppercase brand-tinted label that lives between sidebar items to
// give grouped navigation a sense of hierarchy. Matches the section labels
// on the homepage (BUTLER LABS / PLATFORM / YOUR ACTIVITY) so the portal
// reads as one designed surface across the top-level chrome.
//
// Renders only when the sidebar is open: a 9px label inside a 64px
// collapsed sidebar would just be noise.
const useStyles = makeStyles(theme => ({
	root: {
		padding: theme.spacing(1.75, 3, 0.5, 3),
		fontSize: '0.65rem',
		fontWeight: 700,
		letterSpacing: '0.14em',
		textTransform: 'uppercase',
		color: theme.palette.primary.main,
		opacity: 0.85,
		pointerEvents: 'none',
		userSelect: 'none',
	},
}));

export const SidebarSectionLabel = ({ label }: { label: string }) => {
	const classes = useStyles();
	const { isOpen } = useSidebarOpenState();
	if (!isOpen) return null;
	return (
		<div className={classes.root} aria-hidden="true">
			{label}
		</div>
	);
};
