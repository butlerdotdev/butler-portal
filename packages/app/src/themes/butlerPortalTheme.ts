import {
	createUnifiedTheme,
	genPageTheme,
	palettes,
	type UnifiedTheme,
} from '@backstage/theme';

// ── Theme factory types ─────────────────────────────────────────────
interface BrandColors {
	main: string;
	light: string;
	dark: string;
}

interface SurfaceColors {
	bgDefault: string;
	bgPaper: string;
	bgInput: string;
	bgNav: string;
	bgTabBar: string;
	bgContent: string;
	textPrimary: string;
	textSecondary: string;
	textVerySubtle: string;
	border: string;
	borderSubtle: string;
	hoverBg: string;
	scrollTrack: string;
	scrollThumb: string;
	scrollThumbHover: string;
}

interface ThemeOptions {
	variant: 'light' | 'dark';
	brand: BrandColors;
	surface: SurfaceColors;
}

// ── Palettes ────────────────────────────────────────────────────────

const darkSurface: SurfaceColors = {
	bgDefault: '#0a0a0a',
	bgPaper: '#171717',
	bgInput: '#0f0f0f',
	bgNav: '#0f0f0f',
	bgTabBar: '#0f0f0f',
	bgContent: '#0a0a0a',
	textPrimary: '#fafafa',
	textSecondary: '#a3a3a3',
	textVerySubtle: '#525252',
	border: '#262626',
	borderSubtle: '#1e1e1e',
	hoverBg: '#1a1a1a',
	scrollTrack: '#171717',
	scrollThumb: '#404040',
	scrollThumbHover: '#525252',
};

const lightSurface: SurfaceColors = {
	bgDefault: '#ffffff',
	bgPaper: '#fafafa',
	bgInput: '#ffffff',
	bgNav: '#fafafa',
	bgTabBar: '#f5f5f5',
	bgContent: '#ffffff',
	textPrimary: '#0a0a0a',
	textSecondary: '#525252',
	textVerySubtle: '#a3a3a3',
	border: '#e5e5e5',
	borderSubtle: '#e5e5e5',
	hoverBg: '#f5f5f5',
	scrollTrack: '#fafafa',
	scrollThumb: '#d4d4d4',
	scrollThumbHover: '#a3a3a3',
};

// Brand colors per color vision mode — dark and light variants
const brands = {
	default: {
		dark: { main: '#22c55e', light: '#4ade80', dark: '#16a34a' },
		light: { main: '#16a34a', light: '#22c55e', dark: '#15803d' },
	},
	deuteranopia: {
		dark: { main: '#3b82f6', light: '#60a5fa', dark: '#2563eb' },
		light: { main: '#2563eb', light: '#3b82f6', dark: '#1d4ed8' },
	},
	protanopia: {
		dark: { main: '#6366f1', light: '#818cf8', dark: '#4f46e5' },
		light: { main: '#4f46e5', light: '#6366f1', dark: '#4338ca' },
	},
	tritanopia: {
		dark: { main: '#f43f5e', light: '#fb7185', dark: '#e11d48' },
		light: { main: '#e11d48', light: '#f43f5e', dark: '#be123c' },
	},
};

// ── Factory ─────────────────────────────────────────────────────────

function createButlerTheme({ variant, brand, surface }: ThemeOptions): UnifiedTheme {
	const s = surface;
	const b = brand;

	const flatPageTheme = genPageTheme({
		colors: [s.bgPaper, s.bgPaper],
		shape: '',
		options: { fontColor: s.textPrimary },
	});

	// Status colors don't change per theme
	const statusColors = {
		ok: '#22c55e',
		warning: '#f59e0b',
		error: '#ef4444',
		pending: '#f59e0b',
		running: '#3b82f6',
		aborted: '#737373',
	};

	// Alert colors adapt to surface
	const isDark = variant === 'dark';
	const alertBgOpacity = isDark ? 0.15 : 0.1;
	const errorAlertText = isDark ? '#fca5a5' : '#dc2626';
	const warningAlertText = isDark ? '#fcd34d' : '#d97706';
	const infoAlertText = isDark ? '#93c5fd' : '#2563eb';
	const successAlertText = isDark ? '#4ade80' : '#16a34a';

	// Chip, menu selected use brand with opacity
	const brandBgSubtle = isDark
		? `rgba(${hexToRgb(b.main)}, 0.15)`
		: `rgba(${hexToRgb(b.main)}, 0.1)`;
	const brandBgHover = isDark
		? `rgba(${hexToRgb(b.main)}, 0.25)`
		: `rgba(${hexToRgb(b.main)}, 0.15)`;
	const brandBgButton = isDark
		? `rgba(${hexToRgb(b.main)}, 0.1)`
		: `rgba(${hexToRgb(b.main)}, 0.08)`;

	return createUnifiedTheme({
		palette: {
			...(isDark ? palettes.dark : palettes.light),
			primary: { main: b.main, light: b.light, dark: b.dark },
			secondary: {
				main: isDark ? '#a3a3a3' : '#525252',
				light: isDark ? '#d4d4d4' : '#737373',
				dark: isDark ? '#737373' : '#404040',
			},
			background: { default: s.bgDefault, paper: s.bgPaper },
			navigation: {
				background: s.bgNav,
				indicator: b.main,
				color: s.textSecondary,
				selectedColor: s.textPrimary,
				navItem: { hoverBackground: s.hoverBg },
				submenu: { background: s.bgPaper },
			},
			text: { primary: s.textPrimary, secondary: s.textSecondary },
			status: statusColors,
			border: s.border,
			link: b.main,
			linkHover: b.light,
			textContrast: s.textPrimary,
			textSubtle: s.textSecondary,
			textVerySubtle: s.textVerySubtle,
			highlight: b.main,
			errorBackground: `rgba(239, 68, 68, ${alertBgOpacity})`,
			errorText: errorAlertText,
			warningBackground: `rgba(245, 158, 11, ${alertBgOpacity})`,
			warningText: warningAlertText,
			infoBackground: `rgba(59, 130, 246, ${alertBgOpacity})`,
			infoText: infoAlertText,
			tabbar: { indicator: b.main },
		},
		components: {
			// ─── Global CSS + structural overrides ────────────────────────
			MuiCssBaseline: {
				styleOverrides: {
					body: { backgroundColor: s.bgDefault },

					// Scrollbars
					'*::-webkit-scrollbar': { width: 8, height: 8 },
					'*::-webkit-scrollbar-track': { background: s.scrollTrack },
					'*::-webkit-scrollbar-thumb': { background: s.scrollThumb, borderRadius: 4 },
					'*::-webkit-scrollbar-thumb:hover': { background: s.scrollThumbHover },

					// Kill the Backstage wave header
					'.BackstageHeader-header': {
						backgroundImage: 'none !important',
						backgroundColor: `${s.bgPaper} !important`,
						backgroundSize: 'unset !important',
						borderBottom: `1px solid ${s.border} !important`,
						boxShadow: 'none !important',
						paddingTop: '20px !important',
						paddingBottom: '20px !important',
					},
					'.BackstageHeader-title': {
						fontSize: '1.5rem !important',
						fontWeight: '600 !important',
						color: `${s.textPrimary} !important`,
					},
					'.BackstageHeader-subtitle': {
						opacity: '0.6 !important',
						fontSize: '0.875rem !important',
					},
					'.BackstageHeader-type': { display: 'none !important' },

					// Sidebar border
					'nav[class*="BackstageSidebar"]': { borderRight: `1px solid ${s.borderSubtle}` },
					'div[class*="BackstageSidebar-drawer"]': { borderRight: `1px solid ${s.borderSubtle} !important` },

					// HeaderTabs
					'.BackstageHeaderTabs-tabsWrapper': {
						backgroundColor: `${s.bgTabBar} !important`,
						borderBottom: `1px solid ${s.border} !important`,
					},
					'.BackstageHeaderTabs-defaultTab': {
						textTransform: 'none !important',
						fontWeight: '500 !important',
						fontSize: '0.875rem !important',
						letterSpacing: '0 !important',
						color: `${s.textSecondary} !important`,
						padding: '12px 16px !important',
					},
					'.BackstageHeaderTabs-defaultTab.Mui-selected': {
						color: `${s.textPrimary} !important`,
					},
					'.MuiTabs-indicator': {
						backgroundColor: `${b.main} !important`,
						height: '2px !important',
					},

					// Global border-radius
					'.MuiOutlinedInput-root': { borderRadius: '8px !important' },
					'.MuiButton-root': { borderRadius: '8px !important' },
					'.MuiPaper-rounded': { borderRadius: '12px !important' },
					'.MuiCard-root': { borderRadius: '12px !important' },
					'.MuiDialog-paper': { borderRadius: '12px !important' },
					'.MuiChip-root': { borderRadius: '6px !important' },

					// Remove MUI elevation shadows
					'.MuiPaper-elevation1, .MuiPaper-elevation2, .MuiPaper-elevation3, .MuiPaper-elevation4, .MuiPaper-elevation8': {
						boxShadow: 'none !important',
					},

					// Backstage InfoCard / Table
					'.BackstageInfoCard-root': {
						border: `1px solid ${s.border} !important`,
						borderRadius: '12px !important',
					},
					'.BackstageTable-root': {
						borderRadius: '12px !important',
						border: `1px solid ${s.border} !important`,
						overflow: 'hidden !important',
					},

					// Content area
					'.BackstageContent-root': { backgroundColor: `${s.bgContent} !important` },

					// Sidebar active indicator
					'[class*="BackstageSidebarItem"][class*="selected"]': {
						borderLeft: `2px solid ${b.main}`,
					},

					// Sign-in page
					'.BackstageSignInPage-container': { backgroundColor: `${s.bgDefault} !important` },
				},
			},

			// ─── Surfaces ─────────────────────────────────────────────────
			MuiPaper: {
				styleOverrides: {
					root: { backgroundColor: s.bgPaper, backgroundImage: 'none' },
				},
			},
			MuiCard: {
				styleOverrides: {
					root: {
						backgroundColor: s.bgPaper,
						backgroundImage: 'none',
						border: `1px solid ${s.border}`,
						borderRadius: 12,
					},
				},
			},
			MuiCardContent: {
				styleOverrides: {
					root: { '&:last-child': { paddingBottom: 16 } },
				},
			},

			// ─── Buttons ──────────────────────────────────────────────────
			MuiButton: {
				styleOverrides: {
					root: {
						textTransform: 'none' as const,
						fontWeight: 500,
						borderRadius: 8,
						fontSize: '0.875rem',
					},
					containedPrimary: {
						backgroundColor: b.main,
						color: '#ffffff',
						'&:hover': { backgroundColor: b.dark },
					},
					outlinedPrimary: {
						borderColor: b.main,
						color: b.main,
						'&:hover': {
							borderColor: b.light,
							backgroundColor: brandBgButton,
						},
					},
					textPrimary: {
						color: b.main,
						'&:hover': { backgroundColor: brandBgButton },
					},
				},
			},
			MuiIconButton: {
				styleOverrides: {
					root: {
						color: s.textSecondary,
						'&:hover': { backgroundColor: isDark ? '#262626' : '#f0f0f0' },
					},
				},
			},

			// ─── Tables ───────────────────────────────────────────────────
			MuiTableCell: {
				styleOverrides: {
					root: { borderBottomColor: s.border },
					head: {
						backgroundColor: s.bgPaper,
						color: s.textSecondary,
						fontWeight: 600,
						fontSize: '0.75rem',
						textTransform: 'uppercase' as const,
						letterSpacing: '0.05em',
					},
				},
			},
			MuiTableRow: {
				styleOverrides: {
					root: { '&:hover': { backgroundColor: `${s.hoverBg} !important` } },
				},
			},

			// ─── Inputs ───────────────────────────────────────────────────
			MuiOutlinedInput: {
				styleOverrides: {
					root: {
						backgroundColor: s.bgInput,
						borderRadius: 8,
						'&:hover .MuiOutlinedInput-notchedOutline': {
							borderColor: isDark ? '#404040' : '#a3a3a3',
						},
						'&.Mui-focused .MuiOutlinedInput-notchedOutline': {
							borderColor: b.main,
							borderWidth: 1,
						},
					},
					notchedOutline: { borderColor: s.border },
					input: { color: s.textPrimary },
				},
			},
			MuiInputBase: {
				styleOverrides: {
					root: { borderRadius: 8 },
					input: {
						'&::placeholder': {
							color: s.textVerySubtle,
							opacity: 1,
						},
					},
				},
			},
			MuiInputLabel: {
				styleOverrides: {
					root: {
						color: s.textSecondary,
						'&.Mui-focused': { color: b.main },
					},
				},
			},
			MuiFilledInput: {
				styleOverrides: {
					root: {
						backgroundColor: s.bgInput,
						borderRadius: 8,
						'&:hover': { backgroundColor: s.bgPaper },
						'&.Mui-focused': { backgroundColor: s.bgPaper },
					},
				},
			},

			// ─── Selects and menus ────────────────────────────────────────
			MuiSelect: {
				styleOverrides: {
					icon: { color: s.textSecondary },
				},
			},
			MuiMenu: {
				styleOverrides: {
					paper: {
						backgroundColor: s.bgPaper,
						border: `1px solid ${s.border}`,
						borderRadius: 8,
					},
				},
			},
			MuiMenuItem: {
				styleOverrides: {
					root: {
						borderRadius: 4,
						margin: '2px 4px',
						'&:hover': { backgroundColor: s.hoverBg },
						'&.Mui-selected': {
							backgroundColor: brandBgSubtle,
							'&:hover': { backgroundColor: brandBgHover },
						},
					},
				},
			},
			MuiPopover: {
				styleOverrides: {
					paper: {
						backgroundColor: s.bgPaper,
						border: `1px solid ${s.border}`,
						borderRadius: 8,
					},
				},
			},

			// ─── Dialogs ──────────────────────────────────────────────────
			MuiDialog: {
				styleOverrides: {
					paper: {
						backgroundColor: s.bgPaper,
						backgroundImage: 'none',
						border: `1px solid ${s.border}`,
						borderRadius: 12,
					},
				},
			},
			MuiDialogTitle: {
				styleOverrides: {
					root: {
						borderBottom: `1px solid ${s.border}`,
						fontSize: '1.125rem',
						fontWeight: 600,
					},
				},
			},
			MuiDialogActions: {
				styleOverrides: {
					root: {
						borderTop: `1px solid ${s.border}`,
						padding: '12px 24px',
					},
				},
			},

			// ─── Chips ────────────────────────────────────────────────────
			MuiChip: {
				styleOverrides: {
					root: { borderRadius: 6, fontWeight: 500, fontSize: '0.75rem' },
					outlined: { borderColor: isDark ? '#404040' : '#d4d4d4' },
					colorPrimary: { backgroundColor: brandBgSubtle, color: b.light },
				},
			},

			// ─── Toggles and checks ───────────────────────────────────────
			MuiSwitch: {
				styleOverrides: {
					switchBase: {
						'&.Mui-checked': { color: b.main },
						'&.Mui-checked + .MuiSwitch-track': { backgroundColor: b.main },
					},
					track: { backgroundColor: isDark ? '#404040' : '#d4d4d4' },
				},
			},
			MuiCheckbox: {
				styleOverrides: {
					root: {
						color: s.textVerySubtle,
						'&.Mui-checked': { color: b.main },
					},
				},
			},
			MuiRadio: {
				styleOverrides: {
					root: {
						color: s.textVerySubtle,
						'&.Mui-checked': { color: b.main },
					},
				},
			},

			// ─── Progress ─────────────────────────────────────────────────
			MuiLinearProgress: {
				styleOverrides: {
					root: { backgroundColor: s.border, borderRadius: 4, height: 6 },
					barColorPrimary: { backgroundColor: b.main, borderRadius: 4 },
				},
			},
			MuiCircularProgress: {
				styleOverrides: {
					colorPrimary: { color: b.main },
				},
			},

			// ─── Lists ────────────────────────────────────────────────────
			MuiListItem: {
				styleOverrides: {
					root: { borderRadius: 8, '&:hover': { backgroundColor: s.hoverBg } },
				},
			},

			// ─── Links ────────────────────────────────────────────────────
			MuiLink: {
				styleOverrides: {
					root: {
						color: b.main,
						textDecorationColor: 'transparent',
						'&:hover': { color: b.light, textDecorationColor: b.light },
					},
				},
			},

			// ─── Tooltips ─────────────────────────────────────────────────
			MuiTooltip: {
				styleOverrides: {
					tooltip: {
						backgroundColor: isDark ? '#262626' : '#171717',
						color: isDark ? '#fafafa' : '#fafafa',
						border: isDark ? '1px solid #404040' : 'none',
						fontSize: '0.75rem',
						borderRadius: 6,
					},
					arrow: { color: isDark ? '#262626' : '#171717' },
				},
			},

			// ─── Dividers ─────────────────────────────────────────────────
			MuiDivider: {
				styleOverrides: { root: { borderColor: s.border } },
			},

			// ─── Alerts ───────────────────────────────────────────────────
			MuiAlert: {
				styleOverrides: {
					root: { borderRadius: 8 },
					standardError: {
						backgroundColor: `rgba(239, 68, 68, ${alertBgOpacity})`,
						color: errorAlertText,
					},
					standardWarning: {
						backgroundColor: `rgba(245, 158, 11, ${alertBgOpacity})`,
						color: warningAlertText,
					},
					standardInfo: {
						backgroundColor: `rgba(59, 130, 246, ${alertBgOpacity})`,
						color: infoAlertText,
					},
					standardSuccess: {
						backgroundColor: `rgba(${hexToRgb(b.main)}, ${alertBgOpacity})`,
						color: successAlertText,
					},
				},
			},

			// ─── Tabs ─────────────────────────────────────────────────────
			MuiTabs: {
				styleOverrides: {
					root: { minHeight: 40 },
					indicator: { backgroundColor: b.main, height: 2 },
				},
			},
			MuiTab: {
				styleOverrides: {
					root: {
						color: s.textSecondary,
						textTransform: 'none' as const,
						fontWeight: 500,
						fontSize: '0.875rem',
						minHeight: 40,
						padding: '8px 16px',
						'&:hover': {
							color: s.textPrimary,
							backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
						},
						'&.Mui-selected': { color: s.textPrimary },
					},
				},
			},

			// ─── Breadcrumbs ──────────────────────────────────────────────
			MuiBreadcrumbs: {
				styleOverrides: { separator: { color: s.textVerySubtle } },
			},

			// ─── Accordion ────────────────────────────────────────────────
			MuiAccordion: {
				styleOverrides: {
					root: {
						backgroundColor: s.bgPaper,
						borderRadius: '8px !important',
						border: `1px solid ${s.border}`,
						'&:before': { display: 'none' },
					},
				},
			},
			MuiAccordionSummary: {
				styleOverrides: { root: { borderRadius: 8 } },
			},

			// ─── Backstage components ─────────────────────────────────────
			BackstageHeader: {
				styleOverrides: {
					header: {
						backgroundImage: 'none !important',
						backgroundColor: s.bgPaper,
						backgroundSize: 'unset',
						borderBottom: `1px solid ${s.border}`,
						boxShadow: 'none',
						padding: '20px 24px',
					},
					title: { fontSize: '1.5rem', fontWeight: 600 },
					subtitle: { opacity: 0.6, fontSize: '0.875rem' },
				},
			},
			BackstageHeaderTabs: {
				styleOverrides: {
					tabsWrapper: {
						backgroundColor: s.bgTabBar,
						borderBottom: `1px solid ${s.border}`,
					},
					defaultTab: {
						textTransform: 'none' as const,
						fontWeight: 500,
						fontSize: '0.875rem',
						letterSpacing: 0,
						color: s.textSecondary,
						padding: '12px 16px',
					},
					selected: { color: s.textPrimary },
				},
			},
			BackstageContent: {
				styleOverrides: { root: { backgroundColor: s.bgContent } },
			},
			BackstageItemCardHeader: {
				styleOverrides: {
					root: {
						backgroundImage: 'none',
						backgroundColor: s.hoverBg,
						borderBottom: `1px solid ${s.border}`,
					},
				},
			},
			BackstageTableToolbar: {
				styleOverrides: { root: { backgroundColor: s.bgPaper } },
			},
			BackstageHeaderLabel: {
				styleOverrides: {
					label: { color: s.textSecondary },
					value: { color: s.textPrimary },
				},
			},
			},
		fontFamily: '"Inter", system-ui, sans-serif',
		defaultPageTheme: 'home',
		pageTheme: {
			home: flatPageTheme,
			documentation: flatPageTheme,
			tool: flatPageTheme,
			service: flatPageTheme,
			website: flatPageTheme,
			library: flatPageTheme,
			other: flatPageTheme,
			app: flatPageTheme,
		},
	});
}

// ── Helper ──────────────────────────────────────────────────────────
function hexToRgb(hex: string): string {
	const h = hex.replace('#', '');
	const r = parseInt(h.substring(0, 2), 16);
	const g = parseInt(h.substring(2, 4), 16);
	const b = parseInt(h.substring(4, 6), 16);
	return `${r}, ${g}, ${b}`;
}

// ── Exported themes ─────────────────────────────────────────────────
// 8 combinations: (dark | light) × (default | deuteranopia | protanopia | tritanopia)
// Theme IDs follow the pattern: butler-{dark|light}[-{colorMode}]

export type ColorVisionMode = 'default' | 'deuteranopia' | 'protanopia' | 'tritanopia';

export const butlerThemes = {
	'butler-dark': createButlerTheme({ variant: 'dark', brand: brands.default.dark, surface: darkSurface }),
	'butler-light': createButlerTheme({ variant: 'light', brand: brands.default.light, surface: lightSurface }),
	'butler-dark-deuteranopia': createButlerTheme({ variant: 'dark', brand: brands.deuteranopia.dark, surface: darkSurface }),
	'butler-light-deuteranopia': createButlerTheme({ variant: 'light', brand: brands.deuteranopia.light, surface: lightSurface }),
	'butler-dark-protanopia': createButlerTheme({ variant: 'dark', brand: brands.protanopia.dark, surface: darkSurface }),
	'butler-light-protanopia': createButlerTheme({ variant: 'light', brand: brands.protanopia.light, surface: lightSurface }),
	'butler-dark-tritanopia': createButlerTheme({ variant: 'dark', brand: brands.tritanopia.dark, surface: darkSurface }),
	'butler-light-tritanopia': createButlerTheme({ variant: 'light', brand: brands.tritanopia.light, surface: lightSurface }),
} as const;

export type ButlerThemeId = keyof typeof butlerThemes;

// Convenience aliases
export const butlerDarkTheme = butlerThemes['butler-dark'];
export const butlerLightTheme = butlerThemes['butler-light'];

// Backwards compat
export const butlerPortalTheme = butlerDarkTheme;
