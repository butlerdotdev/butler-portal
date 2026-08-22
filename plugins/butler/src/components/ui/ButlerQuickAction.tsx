// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { butlerTokens, rgb, rgba } from '../../theme';

export type ButlerQuickActionTone = 'green' | 'blue' | 'violet';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  return {
    tile: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: 16,
      backgroundColor: t.surface,
      border: `1px solid ${t.border}`,
      borderRadius: t.radius.xl,
      textDecoration: 'none',
      color: 'inherit',
      fontFamily: t.fontSans,
      transition: 'border-color 150ms',
      '&:hover': { borderColor: rgba(p.violet[500], 0.5) },
      '&:focus-visible': {
        outline: 'none',
        borderColor: rgba(p.violet[500], 0.5),
        boxShadow: `0 0 0 2px ${rgba(p.violet[500], 0.4)}`,
      },
    },
    icon: {
      width: 40,
      height: 40,
      borderRadius: t.radius.lg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    green: {
      backgroundColor: rgba(p.green[500], 0.2),
      color: rgb(p.green[400]),
    },
    blue: { backgroundColor: rgba(p.blue[500], 0.2), color: rgb(p.blue[400]) },
    violet: {
      backgroundColor: rgba(p.violet[500], 0.2),
      color: rgb(p.violet[400]),
    },
    title: {
      margin: 0,
      fontSize: 16,
      lineHeight: '24px',
      fontWeight: 500,
      color: t.text.secondary,
    },
    description: {
      margin: 0,
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.subtle,
    },
  };
});

export interface ButlerQuickActionProps {
  to: string;
  title: string;
  description: string;
  icon: ReactNode;
  tone?: ButlerQuickActionTone;
  className?: string;
}

/**
 * Console admin quick-action tile: 40px tinted icon, title and one-line
 * description, violet border on hover.
 */
export const ButlerQuickAction = ({
  to,
  title,
  description,
  icon,
  tone = 'green',
  className,
}: ButlerQuickActionProps) => {
  const classes = useStyles();
  return (
    <Link to={to} className={clsx(classes.tile, className)}>
      <div className={clsx(classes.icon, classes[tone])}>{icon}</div>
      <div>
        <p className={classes.title}>{title}</p>
        <p className={classes.description}>{description}</p>
      </div>
    </Link>
  );
};
