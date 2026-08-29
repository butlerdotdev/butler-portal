// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { HTMLAttributes, ReactNode } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { butlerTokens } from '../../theme';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  return {
    card: {
      backgroundColor: t.surface,
      border: `1px solid ${t.border}`,
      borderRadius: t.radius.lg,
      fontFamily: t.fontSans,
      color: t.text.primary,
    },
    padded: {
      padding: 20,
    },
    hoverable: {
      cursor: 'pointer',
      transition: 'background-color 150ms',
      '&:hover': {
        backgroundColor: t.inset,
      },
    },
    title: {
      margin: '0 0 16px',
      fontSize: 14,
      fontWeight: 500,
      lineHeight: '20px',
      letterSpacing: '0.025em',
      textTransform: 'uppercase',
      color: t.text.muted,
    },
    titleRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
      '& > $title': { marginBottom: 0 },
    },
  };
});

export interface ButlerCardProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Uppercase tracked section title, as in the console `h3` pattern. */
  title?: ReactNode;
  /** Rendered on the right of the title row. */
  titleAction?: ReactNode;
  /** Remove the 20px inner padding (for tables that fill the card). */
  flush?: boolean;
  hoverable?: boolean;
}

/**
 * Console `Card`: neutral-900 surface, neutral-800 border, 8px radius.
 */
export const ButlerCard = ({
  title,
  titleAction,
  flush = false,
  hoverable = false,
  className,
  children,
  ...props
}: ButlerCardProps) => {
  const classes = useStyles();
  return (
    <div
      className={clsx(
        classes.card,
        !flush && classes.padded,
        hoverable && classes.hoverable,
        className,
      )}
      {...props}
    >
      {title !== undefined &&
        (titleAction ? (
          <div className={classes.titleRow}>
            <h3 className={classes.title}>{title}</h3>
            {titleAction}
          </div>
        ) : (
          <h3 className={classes.title}>{title}</h3>
        ))}
      {children}
    </div>
  );
};

/** Standalone uppercase section title for use outside a card. */
export const ButlerSectionTitle = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => {
  const classes = useStyles();
  return <h3 className={clsx(classes.title, className)}>{children}</h3>;
};
