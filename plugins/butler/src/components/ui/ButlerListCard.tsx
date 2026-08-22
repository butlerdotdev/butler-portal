// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { butlerTokens, rgb } from '../../theme';
import { ButlerCard } from './ButlerCard';
import { ChevronRightIcon } from './ButlerDashboardIcons';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  return {
    card: { overflow: 'hidden' },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      padding: '16px 20px',
      borderBottom: `1px solid ${t.border}`,
    },
    title: {
      margin: 0,
      fontSize: 18,
      lineHeight: '28px',
      fontWeight: 500,
      color: t.text.strong,
    },
    viewAll: {
      fontSize: 14,
      lineHeight: '20px',
      textDecoration: 'none',
      color: rgb(p.green[500]),
      transition: 'color 150ms',
      '&:hover': { color: rgb(p.green[400]) },
      '&:focus-visible': {
        outline: `2px solid ${t.accent}`,
        outlineOffset: 2,
        borderRadius: t.radius.sm,
      },
    },
    viewAllViolet: {
      color: rgb(p.violet[400]),
      '&:hover': { color: rgb(p.violet[300]) },
    },
    list: {
      listStyle: 'none',
      margin: 0,
      padding: 0,
      '& > li + li': { borderTop: `1px solid ${t.border}` },
    },
    row: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      padding: '16px 20px',
      textDecoration: 'none',
      color: 'inherit',
      transition: 'background-color 150ms',
      '&:hover': { backgroundColor: t.inset },
      '&:focus-visible': {
        outline: `2px solid ${t.accent}`,
        outlineOffset: -2,
      },
    },
    leading: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      minWidth: 0,
    },
    primary: {
      margin: 0,
      fontSize: 16,
      lineHeight: '24px',
      fontWeight: 500,
      color: t.text.secondary,
      overflowWrap: 'anywhere',
    },
    secondary: {
      margin: 0,
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.subtle,
    },
    trailing: {
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      flexShrink: 0,
    },
    chevron: { color: rgb(p.neutral[600]) },
    empty: {
      padding: '32px 20px',
      textAlign: 'center',
      fontSize: 16,
      lineHeight: '24px',
      color: t.text.subtle,
    },
  };
});

export interface ButlerListCardProps {
  title: string;
  /** Target of the console "View all" link in the card header. */
  viewAllTo?: string;
  viewAllTone?: 'green' | 'violet';
  className?: string;
  children: ReactNode;
}

/**
 * Console list card ("Recent Clusters", "Teams"): 18px title row with a
 * "View all" link, then divided rows that fill the card width.
 */
export const ButlerListCard = ({
  title,
  viewAllTo,
  viewAllTone = 'green',
  className,
  children,
}: ButlerListCardProps) => {
  const classes = useStyles();
  return (
    <ButlerCard flush className={clsx(classes.card, className)}>
      <div className={classes.header}>
        <h2 className={classes.title}>{title}</h2>
        {viewAllTo && (
          <Link
            to={viewAllTo}
            className={clsx(
              classes.viewAll,
              viewAllTone === 'violet' && classes.viewAllViolet,
            )}
          >
            View all &rarr;
          </Link>
        )}
      </div>
      {children}
    </ButlerCard>
  );
};

export const ButlerList = ({
  children,
  ...props
}: {
  children: ReactNode;
  'aria-label'?: string;
}) => {
  const classes = useStyles();
  return (
    <ul className={classes.list} {...props}>
      {children}
    </ul>
  );
};

export interface ButlerListRowProps {
  to: string;
  /** Status dot, avatar tile or icon shown before the text. */
  leading?: ReactNode;
  primary: ReactNode;
  secondary?: ReactNode;
  /** Badge or stat rendered before the chevron. */
  trailing?: ReactNode;
}

/** Console list-card row: leading element, two-line text, trailing badge, chevron. */
export const ButlerListRow = ({
  to,
  leading,
  primary,
  secondary,
  trailing,
}: ButlerListRowProps) => {
  const classes = useStyles();
  return (
    <li>
      <Link to={to} className={classes.row}>
        <div className={classes.leading}>
          {leading}
          <div style={{ minWidth: 0 }}>
            <p className={classes.primary}>{primary}</p>
            {secondary && <p className={classes.secondary}>{secondary}</p>}
          </div>
        </div>
        <div className={classes.trailing}>
          {trailing}
          <ChevronRightIcon className={classes.chevron} />
        </div>
      </Link>
    </li>
  );
};

/** Console single muted line inside a list card with no rows. */
export const ButlerListEmpty = ({ children }: { children: ReactNode }) => {
  const classes = useStyles();
  return <div className={classes.empty}>{children}</div>;
};
