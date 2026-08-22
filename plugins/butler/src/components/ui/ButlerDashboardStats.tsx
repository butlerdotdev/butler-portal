// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { HTMLAttributes, ReactNode } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { butlerTokens, rgb, rgba } from '../../theme';
import { ButlerCard } from './ButlerCard';

export type ButlerDashboardStatTone =
  | 'neutral'
  | 'green'
  | 'yellow'
  | 'red'
  | 'blue'
  | 'violet';

const useStyles = makeStyles(theme => {
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

type Classes = ReturnType<typeof useStyles>;

const iconClass: Record<ButlerDashboardStatTone, keyof Classes> = {
  neutral: 'iconNeutral',
  green: 'iconGreen',
  yellow: 'iconYellow',
  red: 'iconRed',
  blue: 'iconBlue',
  violet: 'iconViolet',
};

const dotClass: Record<ButlerDashboardStatTone, keyof Classes> = {
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
  tone?: ButlerDashboardStatTone;
  /** Optional 48px tinted icon tile on the right (console admin tiles). */
  icon?: ReactNode;
  iconTone?: ButlerDashboardStatTone;
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
  const classes = useStyles();
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
    tone: ButlerDashboardStatTone;
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
  const classes = useStyles();
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

/** Console `grid md:grid-cols-2 lg:grid-cols-4 gap-4` stat grid. */
export const ButlerStatGrid = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => {
  const classes = useStyles();
  return <div className={clsx(classes.grid, className)} {...props} />;
};
