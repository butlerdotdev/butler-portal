import { useApi, appThemeApiRef } from '@backstage/core-plugin-api';
import { InfoCard } from '@backstage/core-components';
import {
	List,
	ListItem,
	ListItemText,
	ListItemSecondaryAction,
	makeStyles,
} from '@material-ui/core';
import ToggleButton from '@material-ui/lab/ToggleButton';
import ToggleButtonGroup from '@material-ui/lab/ToggleButtonGroup';
import useObservable from 'react-use/esm/useObservable';
import type { ColorVisionMode } from '../../themes/butlerPortalTheme';

const useStyles = makeStyles(theme => ({
	container: {
		display: 'flex',
		flexWrap: 'wrap' as const,
		width: '100%',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingBottom: 8,
		paddingRight: 16,
	},
	list: {
		width: 'initial',
		[theme.breakpoints.down('xs')]: {
			width: '100%',
			padding: '0 0 12px',
		},
	},
	listItemText: {
		paddingRight: 0,
		paddingLeft: 0,
	},
	listItemSecondaryAction: {
		position: 'relative' as const,
		transform: 'unset',
		top: 'auto',
		right: 'auto',
		paddingLeft: 16,
		overflowX: 'auto' as const,
		maxWidth: '100%',
		[theme.breakpoints.down('xs')]: {
			paddingLeft: 0,
		},
	},
	toggleGroup: {
		flexWrap: 'nowrap' as const,
	},
	colorDot: {
		display: 'inline-block',
		width: 10,
		height: 10,
		borderRadius: 3,
		marginRight: 6,
		verticalAlign: 'middle',
	},
}));

type BaseMode = 'dark' | 'light';

const COLOR_VISION_OPTIONS: {
	value: ColorVisionMode;
	label: string;
	color: string;
}[] = [
	{ value: 'default', label: 'Default', color: '#22c55e' },
	{ value: 'deuteranopia', label: 'Deuteranopia', color: '#3b82f6' },
	{ value: 'protanopia', label: 'Protanopia', color: '#6366f1' },
	{ value: 'tritanopia', label: 'Tritanopia', color: '#f43f5e' },
];

function parseThemeId(themeId: string | undefined): {
	mode: BaseMode;
	colorVision: ColorVisionMode;
} {
	if (!themeId) return { mode: 'dark', colorVision: 'default' };
	const mode: BaseMode = themeId.includes('light') ? 'light' : 'dark';
	if (themeId.endsWith('-deuteranopia')) return { mode, colorVision: 'deuteranopia' };
	if (themeId.endsWith('-protanopia')) return { mode, colorVision: 'protanopia' };
	if (themeId.endsWith('-tritanopia')) return { mode, colorVision: 'tritanopia' };
	return { mode, colorVision: 'default' };
}

function buildThemeId(mode: BaseMode, colorVision: ColorVisionMode): string {
	const base = `butler-${mode}`;
	return colorVision === 'default' ? base : `${base}-${colorVision}`;
}

export function AppearanceSettings() {
	const classes = useStyles();
	const themeApi = useApi(appThemeApiRef);
	const activeThemeId = useObservable(
		themeApi.activeThemeId$(),
		themeApi.getActiveThemeId(),
	);

	const { mode, colorVision } = parseThemeId(activeThemeId);

	const handleModeChange = (_: React.MouseEvent<HTMLElement>, newMode: string | null) => {
		if (newMode) {
			themeApi.setActiveThemeId(buildThemeId(newMode as BaseMode, colorVision));
		}
	};

	const handleColorVisionChange = (_: React.MouseEvent<HTMLElement>, newCV: string | null) => {
		if (newCV) {
			themeApi.setActiveThemeId(buildThemeId(mode, newCV as ColorVisionMode));
		}
	};

	return (
		<InfoCard title="Appearance" variant="gridItem">
			<List dense>
				<ListItem
					className={classes.list}
					classes={{ container: classes.container }}
				>
					<ListItemText
						className={classes.listItemText}
						primary="Theme"
						secondary="Choose your preferred color scheme"
					/>
					<ListItemSecondaryAction className={classes.listItemSecondaryAction}>
						<ToggleButtonGroup
							exclusive
							size="small"
							value={mode}
							onChange={handleModeChange}
							className={classes.toggleGroup}
						>
							<ToggleButton value="dark">Dark</ToggleButton>
							<ToggleButton value="light">Light</ToggleButton>
						</ToggleButtonGroup>
					</ListItemSecondaryAction>
				</ListItem>
				<ListItem
					className={classes.list}
					classes={{ container: classes.container }}
				>
					<ListItemText
						className={classes.listItemText}
						primary="Color vision"
						secondary="Optimize accent colors for color vision accessibility"
					/>
					<ListItemSecondaryAction className={classes.listItemSecondaryAction}>
						<ToggleButtonGroup
							exclusive
							size="small"
							value={colorVision}
							onChange={handleColorVisionChange}
							className={classes.toggleGroup}
						>
							{COLOR_VISION_OPTIONS.map(opt => (
								<ToggleButton key={opt.value} value={opt.value}>
									<span
										className={classes.colorDot}
										style={{ backgroundColor: opt.color }}
									/>
									{opt.label}
								</ToggleButton>
							))}
						</ToggleButtonGroup>
					</ListItemSecondaryAction>
				</ListItem>
			</List>
		</InfoCard>
	);
}
