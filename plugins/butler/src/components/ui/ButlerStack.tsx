// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { HTMLAttributes } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { butlerTokens } from '../../theme';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  return {
    stack: {
      display: 'flex',
      flexDirection: 'column',
      fontFamily: t.fontSans,
      color: t.text.primary,
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: '1fr',
      // Tailwind `lg` (1024px), not the MUI breakpoint (1280px).
      '@media (min-width: 1024px)': {
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      },
    },
    grid3: {
      display: 'grid',
      gridTemplateColumns: '1fr',
      '@media (min-width: 768px)': {
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      },
    },
  };
});

interface StackProps extends HTMLAttributes<HTMLDivElement> {
  gap?: number;
}

/** Console `space-y-*` vertical rhythm (page default 24px). */
export const ButlerStack = ({
  gap = 24,
  className,
  style,
  ...props
}: StackProps) => {
  const classes = useStyles();
  return (
    <div
      className={clsx(classes.stack, className)}
      style={{ gap, ...style }}
      {...props}
    />
  );
};

/** Console `grid lg:grid-cols-2 gap-6` card grid. */
export const ButlerGrid = ({
  gap = 24,
  columns = 2,
  className,
  style,
  ...props
}: StackProps & { columns?: 2 | 3 }) => {
  const classes = useStyles();
  return (
    <div
      className={clsx(columns === 3 ? classes.grid3 : classes.grid, className)}
      style={{ gap, ...style }}
      {...props}
    />
  );
};
