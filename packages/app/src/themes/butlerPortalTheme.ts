import {
	createUnifiedTheme,
	genPageTheme,
	palettes,
	shapes,
} from '@backstage/theme';

export const butlerPortalTheme = createUnifiedTheme({
	palette: {
		...palettes.dark,
		primary: {
			main: '#a78bfa',
			light: '#c4b5fd',
			dark: '#8b5cf6',
		},
		secondary: {
			main: '#14b8a6',
			light: '#2dd4bf',
			dark: '#0d9488',
		},
		background: {
			default: '#0a0a0a',
			paper: '#171717',
		},
		navigation: {
			background: '#171717',
			indicator: '#8b5cf6',
			color: '#fafafa',
			selectedColor: '#ffffff',
			navItem: {
				hoverBackground: '#262626',
			},
		},
		text: {
			primary: '#fafafa',
			secondary: '#a3a3a3',
		},
	},
	components: {
		MuiCssBaseline: {
			styleOverrides: {
				body: {
					backgroundColor: '#0a0a0a',
				},
			},
		},
		MuiPaper: {
			styleOverrides: {
				root: {
					backgroundColor: '#171717',
				},
			},
		},
		MuiCard: {
			styleOverrides: {
				root: {
					backgroundColor: '#171717',
				},
			},
		},
		MuiButton: {
			styleOverrides: {
				containedPrimary: {
					backgroundColor: '#22c55e',
					color: '#ffffff',
					'&:hover': {
						backgroundColor: '#16a34a',
					},
				},
			},
		},
		MuiTableCell: {
			styleOverrides: {
				root: {
					borderBottomColor: '#262626',
				},
				head: {
					backgroundColor: '#171717',
				},
			},
		},
		MuiTableRow: {
			styleOverrides: {
				root: {
					'&:hover': {
						backgroundColor: '#262626 !important',
					},
				},
			},
		},
		BackstageHeader: {
			styleOverrides: {
				header: {
					backgroundImage:
						'linear-gradient(135deg, #130d1f 0%, #141018 40%, #171717 100%)',
					borderBottom: '1px solid rgba(139, 92, 246, 0.15)',
					boxShadow: 'none',
				},
			},
		},
		BackstageHeaderTabs: {
			styleOverrides: {
				defaultTab: {
					color: '#a3a3a3',
				},
			},
		},
		BackstageContent: {
			styleOverrides: {
				root: {
					backgroundColor: '#0a0a0a',
				},
			},
		},
	},
	fontFamily: '"Inter", system-ui, sans-serif',
	defaultPageTheme: 'home',
	pageTheme: {
		home: genPageTheme({
			colors: ['#171717', '#171717'],
			shape: shapes.wave,
		}),
		documentation: genPageTheme({
			colors: ['#171717', '#171717'],
			shape: shapes.wave2,
		}),
		tool: genPageTheme({
			colors: ['#171717', '#171717'],
			shape: shapes.round,
		}),
		service: genPageTheme({
			colors: ['#171717', '#171717'],
			shape: shapes.wave,
		}),
		website: genPageTheme({
			colors: ['#171717', '#171717'],
			shape: shapes.wave,
		}),
		library: genPageTheme({
			colors: ['#171717', '#171717'],
			shape: shapes.wave,
		}),
		other: genPageTheme({
			colors: ['#171717', '#171717'],
			shape: shapes.wave,
		}),
		app: genPageTheme({
			colors: ['#171717', '#171717'],
			shape: shapes.wave,
		}),
	},
});
