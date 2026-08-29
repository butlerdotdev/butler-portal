// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { Theme } from '@material-ui/core/styles';

/**
 * Butler visual tokens, ported from butler-console `src/index.css`.
 *
 * The console defines its palette as CSS custom properties (dark on
 * `:root`, light under `.light`). The plugin renders inside a Backstage
 * theme and selects the set from `theme.palette.type`, so the console is
 * the source of truth for the values but there is no runtime coupling.
 * Values are `r g b` triplets so callers can compose alpha tints the same
 * way the console does (`bg-green-500/10`).
 */
export interface ButlerPalette {
  neutral: Record<
    50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950,
    string
  >;
  green: Record<200 | 300 | 400 | 500 | 600 | 700, string>;
  red: Record<200 | 300 | 400 | 500 | 600, string>;
  blue: Record<200 | 300 | 400 | 500, string>;
  yellow: Record<200 | 300 | 400 | 500, string>;
  amber: Record<200 | 300 | 400 | 500, string>;
  orange: Record<400 | 500, string>;
  violet: Record<300 | 400 | 500, string>;
  teal: Record<300 | 400 | 500, string>;
}

const dark: ButlerPalette = {
  neutral: {
    50: '250 250 250',
    100: '245 245 245',
    200: '229 229 229',
    300: '212 212 212',
    400: '163 163 163',
    500: '115 115 115',
    600: '82 82 82',
    700: '64 64 64',
    800: '38 38 38',
    900: '23 23 23',
    950: '10 10 10',
  },
  green: {
    200: '187 247 208',
    300: '134 239 172',
    400: '74 222 128',
    500: '34 197 94',
    600: '22 163 74',
    700: '21 128 61',
  },
  red: {
    200: '254 202 202',
    300: '252 165 165',
    400: '248 113 113',
    500: '239 68 68',
    600: '220 38 38',
  },
  blue: {
    200: '191 219 254',
    300: '147 197 253',
    400: '96 165 250',
    500: '59 130 246',
  },
  yellow: {
    200: '254 240 138',
    300: '253 224 71',
    400: '250 204 21',
    500: '234 179 8',
  },
  amber: {
    200: '253 230 138',
    300: '252 211 77',
    400: '251 191 36',
    500: '245 158 11',
  },
  orange: { 400: '251 146 60', 500: '249 115 22' },
  violet: { 300: '196 181 253', 400: '167 139 250', 500: '139 92 246' },
  teal: { 300: '94 234 212', 400: '45 212 191', 500: '20 184 166' },
};

// Light mode keeps the console's remapping: neutral 50-300 are text
// shades, 400-600 muted text, 700-950 surfaces; accent 300+ shades darken
// for contrast on white while the 200 tints stay as subtle backgrounds.
// Deliberate deviation: the console never remaps orange-400 in light mode
// (Degraded text stays 251 146 60 on white, below AA); orange-600 is used
// here so the badge reads on a light surface.
const light: ButlerPalette = {
  neutral: {
    50: '9 9 11',
    100: '24 24 27',
    200: '39 39 42',
    300: '63 63 70',
    400: '63 63 70',
    500: '63 63 70',
    600: '113 113 122',
    700: '228 228 231',
    800: '244 244 245',
    900: '250 250 251',
    950: '255 255 255',
  },
  green: {
    200: '187 247 208',
    300: '22 163 74',
    400: '22 163 74',
    500: '21 128 61',
    600: '22 101 52',
    700: '20 83 45',
  },
  red: {
    200: '254 202 202',
    300: '220 38 38',
    400: '220 38 38',
    500: '185 28 28',
    600: '220 38 38',
  },
  blue: {
    200: '191 219 254',
    300: '37 99 235',
    400: '37 99 235',
    500: '29 78 216',
  },
  yellow: {
    200: '254 240 138',
    300: '202 138 4',
    400: '202 138 4',
    500: '234 179 8',
  },
  amber: {
    200: '253 230 138',
    300: '217 119 6',
    400: '217 119 6',
    500: '180 83 9',
  },
  orange: { 400: '234 88 12', 500: '249 115 22' },
  violet: { 300: '76 29 149', 400: '91 33 182', 500: '109 40 217' },
  teal: { 300: '17 94 89', 400: '15 118 110', 500: '13 148 136' },
};

/** Solid color from an `r g b` triplet. */
export const rgb = (triplet: string): string => `rgb(${triplet})`;

/** Tinted color from an `r g b` triplet, mirroring Tailwind `/N` alpha. */
export const rgba = (triplet: string, alpha: number): string =>
  `rgb(${triplet} / ${alpha})`;

export const BUTLER_FONT_SANS = 'Inter, system-ui, sans-serif';
export const BUTLER_FONT_MONO = '"JetBrains Mono", ui-monospace, monospace';

export interface ButlerTokens {
  mode: 'light' | 'dark';
  palette: ButlerPalette;
  /** Page background (console `bg-neutral-950`). */
  page: string;
  /** Card surface (console `bg-neutral-900`). */
  surface: string;
  /** Inset surface inside a card (console `bg-neutral-800/50`). */
  inset: string;
  /** Card and divider borders (console `border-neutral-800`). */
  border: string;
  /** Stronger border for inputs (console `border-neutral-700`). */
  borderStrong: string;
  text: {
    primary: string;
    strong: string;
    secondary: string;
    muted: string;
    subtle: string;
  };
  accent: string;
  accentHover: string;
  danger: string;
  dangerHover: string;
  radius: { sm: number; md: number; lg: number; xl: number; pill: number };
  fontSans: string;
  fontMono: string;
}

export function butlerTokens(theme: Theme): ButlerTokens {
  const mode = theme.palette.type === 'dark' ? 'dark' : 'light';
  const palette = mode === 'dark' ? dark : light;
  return {
    mode,
    palette,
    page: rgb(palette.neutral[950]),
    surface: rgb(palette.neutral[900]),
    inset: rgba(palette.neutral[800], 0.5),
    border: rgb(palette.neutral[800]),
    borderStrong: rgb(palette.neutral[700]),
    text: {
      primary: rgb(palette.neutral[50]),
      strong: rgb(palette.neutral[100]),
      secondary: rgb(palette.neutral[200]),
      muted: rgb(palette.neutral[400]),
      subtle: rgb(palette.neutral[500]),
    },
    accent: rgb(palette.green[500]),
    accentHover: rgb(palette.green[400]),
    danger: rgb(palette.red[600]),
    dangerHover: rgb(palette.red[500]),
    radius: { sm: 4, md: 6, lg: 8, xl: 12, pill: 9999 },
    fontSans: BUTLER_FONT_SANS,
    fontMono: BUTLER_FONT_MONO,
  };
}
