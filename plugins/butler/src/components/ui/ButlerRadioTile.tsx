// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { butlerTokens, rgb, rgba } from '../../theme';
import { ChevronRightIcon } from './icons';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  return {
    group: {
      display: 'grid',
      gap: 12,
    },
    tile: {
      padding: 16,
      borderRadius: t.radius.lg,
      border: `2px solid ${rgb(p.neutral[700])}`,
      backgroundColor: 'transparent',
      cursor: 'pointer',
      textAlign: 'center',
      fontFamily: t.fontSans,
      transition: 'background-color 150ms, border-color 150ms',
      '&:hover': { borderColor: rgb(p.neutral[600]) },
      '&:focus-visible': {
        outline: 'none',
        boxShadow: `0 0 0 2px ${t.surface}, 0 0 0 4px ${t.accent}`,
      },
    },
    tileSelected: {
      borderColor: rgb(p.green[500]),
      backgroundColor: rgba(p.green[500], 0.1),
      '&:hover': { borderColor: rgb(p.green[500]) },
    },
    tileIcon: {
      width: 32,
      height: 32,
      margin: '0 auto 8px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      '& > svg': { width: '100%', height: '100%' },
    },
    tileLabel: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      fontWeight: 500,
      color: t.text.secondary,
    },
    row: {
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      width: '100%',
      padding: 16,
      borderRadius: t.radius.xl,
      border: `1px solid ${t.border}`,
      backgroundColor: t.surface,
      cursor: 'pointer',
      textAlign: 'left',
      fontFamily: t.fontSans,
      transition: 'background-color 150ms, border-color 150ms',
      '&:hover': {
        borderColor: rgba(p.violet[500], 0.5),
        backgroundColor: t.inset,
      },
      '&:focus-visible': {
        outline: 'none',
        boxShadow: `0 0 0 2px ${t.surface}, 0 0 0 4px ${rgb(p.violet[500])}`,
      },
    },
    rowIcon: {
      width: 48,
      height: 48,
      borderRadius: t.radius.lg,
      backgroundColor: rgb(p.neutral[800]),
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      '& > svg': { width: 24, height: 24 },
    },
    rowText: { minWidth: 0, flex: 1 },
    rowTitle: {
      margin: 0,
      fontSize: 16,
      lineHeight: '24px',
      fontWeight: 500,
      color: t.text.strong,
    },
    rowDescription: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.subtle,
    },
    rowChevron: {
      color: rgb(p.neutral[600]),
      flexShrink: 0,
    },
  };
});

export interface ButlerRadioTileProps {
  selected: boolean;
  onSelect: () => void;
  icon?: ReactNode;
  label: ReactNode;
  className?: string;
}

/**
 * Console provider type tile: centered icon over a 14px label, 2px
 * border that turns green with a green tint when selected. Render
 * inside a `ButlerRadioTileGroup` (or any `role="radiogroup"`).
 */
export const ButlerRadioTile = ({
  selected,
  onSelect,
  icon,
  label,
  className,
}: ButlerRadioTileProps) => {
  const classes = useStyles();
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={clsx(
        classes.tile,
        selected && classes.tileSelected,
        className,
      )}
      onClick={onSelect}
    >
      {icon && <div className={classes.tileIcon}>{icon}</div>}
      <p className={classes.tileLabel}>{label}</p>
    </button>
  );
};

export const ButlerRadioTileGroup = ({
  children,
  columns = 3,
  className,
  ...props
}: {
  children: ReactNode;
  columns?: number;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}) => {
  const classes = useStyles();
  return (
    <div
      role="radiogroup"
      className={clsx(classes.group, className)}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      {...props}
    >
      {children}
    </div>
  );
};

export interface ButlerOptionRowProps {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  onClick: () => void;
  className?: string;
}

/**
 * Console preset chooser row (IdP create step 1): 48px icon tile, title
 * and description, trailing chevron; card surface with a violet hover.
 */
export const ButlerOptionRow = ({
  icon,
  title,
  description,
  onClick,
  className,
}: ButlerOptionRowProps) => {
  const classes = useStyles();
  return (
    <button
      type="button"
      className={clsx(classes.row, className)}
      onClick={onClick}
    >
      <div className={classes.rowIcon}>{icon}</div>
      <div className={classes.rowText}>
        <p className={classes.rowTitle}>{title}</p>
        {description && <p className={classes.rowDescription}>{description}</p>}
      </div>
      <ChevronRightIcon size={20} className={classes.rowChevron} />
    </button>
  );
};
