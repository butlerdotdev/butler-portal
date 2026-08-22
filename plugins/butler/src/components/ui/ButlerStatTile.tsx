// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { butlerTokens, rgb, rgba } from '../../theme';

export type ButlerStatTone = 'neutral' | 'green' | 'yellow' | 'red' | 'blue';

const useStyles = makeStyles(theme => {
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
  const classes = useStyles();
  return (
    <div className={clsx(classes.tile, classes[tone], className)}>
      <p className={classes.label}>{label}</p>
      <p className={clsx(classes.value, small && classes.valueSm)}>{value}</p>
      {detail && <p className={classes.detail}>{detail}</p>}
    </div>
  );
};

/** Console `grid grid-cols-2 md:grid-cols-4 gap-4` metric row. */
export const ButlerStatGrid = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => {
  const classes = useStyles();
  return <div className={clsx(classes.grid, className)}>{children}</div>;
};
