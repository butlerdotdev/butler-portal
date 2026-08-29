// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { butlerTokens } from '../../theme';
import { ButlerIconButton } from './ButlerButton';
import { ChevronLeftIcon } from './icons';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  return {
    root: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      flexWrap: 'wrap',
      fontFamily: t.fontSans,
    },
    left: {
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      minWidth: 0,
    },
    titleRow: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      minWidth: 0,
    },
    title: {
      margin: 0,
      fontSize: 24,
      lineHeight: '32px',
      fontWeight: 600,
      color: t.text.primary,
      overflowWrap: 'anywhere',
    },
    subtitle: {
      margin: '4px 0 0',
      fontSize: 16,
      lineHeight: '24px',
      color: t.text.muted,
    },
    actions: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap',
    },
  };
});

export interface ButlerPageHeaderProps {
  title: ReactNode;
  /** Rendered inline after the title (typically a status badge). */
  titleAdornment?: ReactNode;
  subtitle?: ReactNode;
  /** Shows the console back chevron and calls this on click. */
  onBack?: () => void;
  actions?: ReactNode;
  className?: string;
}

/**
 * Console page header: optional back chevron, 24px semibold title with
 * an inline badge, muted subtitle, and a right-aligned action row.
 */
export const ButlerPageHeader = ({
  title,
  titleAdornment,
  subtitle,
  onBack,
  actions,
  className,
}: ButlerPageHeaderProps) => {
  const classes = useStyles();
  return (
    <div className={clsx(classes.root, className)}>
      <div className={classes.left}>
        {onBack && (
          <ButlerIconButton aria-label="Back" onClick={onBack}>
            <ChevronLeftIcon />
          </ButlerIconButton>
        )}
        <div>
          <div className={classes.titleRow}>
            <h1 className={classes.title}>{title}</h1>
            {titleAdornment}
          </div>
          {subtitle && <p className={classes.subtitle}>{subtitle}</p>}
        </div>
      </div>
      {actions && <div className={classes.actions}>{actions}</div>}
    </div>
  );
};
