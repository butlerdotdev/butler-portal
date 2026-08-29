// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { HTMLAttributes, ReactNode } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { butlerTokens, rgb, rgba } from '../../theme';
import { ButlerCard } from './ButlerCard';

/** Tone shared by the stat tiles, the dot row and the metric tiles. */
export type ButlerStatTone =
  | 'neutral'
  | 'green'
  | 'yellow'
  | 'red'
  | 'blue'
  | 'violet';

const useDashboardStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  return {
    grid: {
      display: 'grid',
      gridTemplateColumns: '1fr',
      gap: 16,
      '@media (min-width: 768px)': {
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      },
      '@media (min-width: 1024px)': {
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
      },
    },
    row: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
    },
    label: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.muted,
    },
    value: {
      margin: '4px 0 0',
      fontSize: 30,
      lineHeight: '36px',
      fontWeight: 700,
      fontVariantNumeric: 'tabular-nums',
    },
    neutral: { color: t.text.strong },
    green: { color: rgb(p.green[400]) },
    yellow: { color: rgb(p.yellow[400]) },
    red: { color: rgb(p.red[400]) },
    blue: { color: rgb(p.blue[400]) },
    violet: { color: rgb(p.violet[400]) },
    icon: {
      width: 48,
      height: 48,
      borderRadius: t.radius.lg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    iconNeutral: { backgroundColor: rgb(p.neutral[800]), color: t.text.muted },
    iconGreen: {
      backgroundColor: rgba(p.green[500], 0.2),
      color: rgb(p.green[400]),
    },
    iconYellow: {
      backgroundColor: rgba(p.yellow[500], 0.2),
      color: rgb(p.yellow[400]),
    },
    iconRed: { backgroundColor: rgba(p.red[500], 0.2), color: rgb(p.red[400]) },
    iconBlue: {
      backgroundColor: rgba(p.blue[500], 0.2),
      color: rgb(p.blue[400]),
    },
    iconViolet: {
      backgroundColor: rgba(p.violet[500], 0.2),
      color: rgb(p.violet[400]),
    },
    dots: {
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      marginTop: 12,
    },
    dotItem: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 18,
      lineHeight: '28px',
      fontWeight: 700,
      fontVariantNumeric: 'tabular-nums',
    },
    dot: {
      width: 12,
      height: 12,
      borderRadius: '50%',
      flexShrink: 0,
    },
    dotGreen: { backgroundColor: rgb(p.green[500]) },
    dotYellow: { backgroundColor: rgb(p.yellow[500]) },
    dotRed: { backgroundColor: rgb(p.red[500]) },
    dotNeutral: { backgroundColor: rgb(p.neutral[500]) },
    dotBlue: { backgroundColor: rgb(p.blue[500]) },
    dotViolet: { backgroundColor: rgb(p.violet[500]) },
  };
});

type Classes = ReturnType<typeof useDashboardStyles>;

const iconClass: Record<ButlerStatTone, keyof Classes> = {
  neutral: 'iconNeutral',
  green: 'iconGreen',
  yellow: 'iconYellow',
  red: 'iconRed',
  blue: 'iconBlue',
  violet: 'iconViolet',
};

const dotClass: Record<ButlerStatTone, keyof Classes> = {
  neutral: 'dotNeutral',
  green: 'dotGreen',
  yellow: 'dotYellow',
  red: 'dotRed',
  blue: 'dotBlue',
  violet: 'dotViolet',
};

export interface ButlerDashboardStatProps {
  label: string;
  value: ReactNode;
  /** Colour of the 30px value (console dashboard stat tiles). */
  tone?: ButlerStatTone;
  /** Optional 48px tinted icon tile on the right (console admin tiles). */
  icon?: ReactNode;
  iconTone?: ButlerStatTone;
  className?: string;
}

/**
 * Console dashboard stat tile (`Card p-5`): muted 14px label over a 30px
 * bold value, optionally with a tinted icon tile on the right.
 */
export const ButlerDashboardStat = ({
  label,
  value,
  tone = 'neutral',
  icon,
  iconTone = 'neutral',
  className,
}: ButlerDashboardStatProps) => {
  const classes = useDashboardStyles();
  const body = (
    <div>
      <p className={classes.label}>{label}</p>
      <p className={clsx(classes.value, classes[tone])}>{value}</p>
    </div>
  );
  return (
    <ButlerCard className={className}>
      {icon ? (
        <div className={classes.row}>
          {body}
          <div className={clsx(classes.icon, classes[iconClass[iconTone]])}>
            {icon}
          </div>
        </div>
      ) : (
        body
      )}
    </ButlerCard>
  );
};

export interface ButlerStatDotsProps {
  label: string;
  items: Array<{
    tone: ButlerStatTone;
    value: number;
    title: string;
  }>;
  className?: string;
}

/**
 * Console "Cluster Health" tile: label over a row of coloured dot + count
 * pairs.
 */
export const ButlerStatDots = ({
  label,
  items,
  className,
}: ButlerStatDotsProps) => {
  const classes = useDashboardStyles();
  return (
    <ButlerCard className={className}>
      <p className={classes.label}>{label}</p>
      <div className={classes.dots}>
        {items.map(item => (
          <span
            key={item.title}
            className={clsx(classes.dotItem, classes[item.tone])}
            title={item.title}
            aria-label={`${item.value} ${item.title}`}
          >
            <span
              className={clsx(classes.dot, classes[dotClass[item.tone]])}
              aria-hidden
            />
            {item.value}
          </span>
        ))}
      </div>
    </ButlerCard>
  );
};

const useTileStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  const tone = (hue: string, text: string) => ({
    backgroundColor: rgba(hue, 0.1),
    '& $label, & $value': { color: rgb(text) },
  });
  return {
    tile: {
      padding: 16,
      borderRadius: t.radius.lg,
      fontFamily: t.fontSans,
      minWidth: 0,
    },
    label: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.muted,
    },
    value: {
      margin: 0,
      fontSize: 24,
      lineHeight: '32px',
      fontWeight: 700,
      color: t.text.strong,
    },
    valueSm: {
      fontSize: 18,
      lineHeight: '28px',
      fontWeight: 600,
    },
    detail: {
      margin: 0,
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.subtle,
    },
    neutral: { backgroundColor: t.inset },
    green: tone(p.green[500], p.green[400]),
    yellow: tone(p.yellow[500], p.yellow[400]),
    red: tone(p.red[500], p.red[400]),
    blue: tone(p.blue[500], p.blue[400]),
    violet: tone(p.violet[500], p.violet[400]),
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: 16,
      '@media (min-width: 768px)': {
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
      },
    },
  };
});

export interface ButlerStatTileProps {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  tone?: ButlerStatTone;
  /** Smaller value face for dates and text values. */
  small?: boolean;
  className?: string;
}

/**
 * Console health metric tile: tinted block with a 14px label and a bold
 * count. Tokenized port of `CertificateHealthOverview` (the console's own
 * tiles use untokenized light tints).
 */
export const ButlerStatTile = ({
  label,
  value,
  detail,
  tone = 'neutral',
  small,
  className,
}: ButlerStatTileProps) => {
  const classes = useTileStyles();
  return (
    <div className={clsx(classes.tile, classes[tone], className)}>
      <p className={classes.label}>{label}</p>
      <p className={clsx(classes.value, small && classes.valueSm)}>{value}</p>
      {detail && <p className={classes.detail}>{detail}</p>}
    </div>
  );
};

export interface ButlerStatGridProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * `dashboard` is the console's `grid md:grid-cols-2 lg:grid-cols-4
   * gap-4` card row; `metrics` its `grid grid-cols-2 md:grid-cols-4
   * gap-4` health row.
   */
  variant?: 'dashboard' | 'metrics';
}

/** Grid for a row of stat cards or metric tiles. */
export const ButlerStatGrid = ({
  variant = 'dashboard',
  className,
  ...props
}: ButlerStatGridProps) => {
  const dashboard = useDashboardStyles();
  const tiles = useTileStyles();
  return (
    <div
      className={clsx(
        variant === 'metrics' ? tiles.grid : dashboard.grid,
        className,
      )}
      {...props}
    />
  );
};
