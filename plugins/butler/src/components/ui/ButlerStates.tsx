// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { butlerTokens, rgb, rgba } from '../../theme';
import { ButlerCard } from './ButlerCard';
import { WarningIcon } from './icons';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  return {
    centered: {
      padding: 32,
      textAlign: 'center',
    },
    emptyTitle: {
      margin: 0,
      fontSize: 18,
      lineHeight: '28px',
      fontWeight: 500,
      color: rgb(p.neutral[200]),
    },
    emptyText: {
      margin: '8px 0 0',
      fontSize: 16,
      lineHeight: '24px',
      color: t.text.muted,
    },
    emptyPlain: {
      margin: 0,
      fontSize: 16,
      lineHeight: '24px',
      color: t.text.muted,
    },
    emptyAction: { marginTop: 16 },
    errorCard: {
      padding: 16,
      borderColor: rgba(p.red[500], 0.2),
    },
    errorText: {
      margin: 0,
      fontSize: 16,
      lineHeight: '24px',
      color: rgb(p.red[400]),
    },
    errorDetail: {
      margin: '4px 0 0',
      fontSize: 14,
      color: t.text.muted,
      overflowWrap: 'anywhere',
    },
    retry: {
      marginTop: 8,
      padding: 0,
      border: 'none',
      background: 'none',
      fontFamily: t.fontSans,
      fontSize: 14,
      color: rgb(p.red[400]),
      textDecoration: 'underline',
      cursor: 'pointer',
      '&:hover': { color: rgb(p.red[300]) },
    },
    loading: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: 256,
    },
    '@keyframes butlerSpin': {
      to: { transform: 'rotate(360deg)' },
    },
    spinner: {
      width: 32,
      height: 32,
      borderRadius: '50%',
      border: `2px solid ${rgb(p.neutral[700])}`,
      borderTopColor: rgb(p.green[500]),
      animation: '$butlerSpin 1s linear infinite',
    },
    spinnerSm: { width: 16, height: 16 },
    banner: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      padding: '12px 16px',
      borderRadius: t.radius.lg,
      border: `1px solid ${rgba(p.amber[500], 0.3)}`,
      backgroundColor: rgba(p.amber[500], 0.05),
      fontFamily: t.fontSans,
    },
    bannerDanger: {
      borderColor: rgba(p.red[500], 0.2),
      backgroundColor: rgba(p.red[500], 0.05),
    },
    bannerIcon: {
      color: rgb(p.amber[400]),
      marginTop: 2,
      flexShrink: 0,
    },
    bannerIconDanger: { color: rgb(p.red[400]) },
    bannerTitle: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      fontWeight: 500,
      color: rgb(p.amber[400]),
    },
    bannerTitleDanger: { color: rgb(p.red[400]) },
    bannerMessage: {
      margin: '4px 0 0',
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.muted,
    },
  };
});

export interface ButlerEmptyStateProps {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/**
 * Console `EmptyState`: centered card with title, copy, optional action.
 * With only a title it renders the console's single muted line.
 */
export const ButlerEmptyState = ({
  title,
  description,
  action,
  className,
}: ButlerEmptyStateProps) => {
  const classes = useStyles();
  return (
    <ButlerCard flush className={clsx(classes.centered, className)}>
      {description ? (
        <>
          <h3 className={classes.emptyTitle}>{title}</h3>
          <p className={classes.emptyText}>{description}</p>
        </>
      ) : (
        <p className={classes.emptyPlain}>{title}</p>
      )}
      {action && <div className={classes.emptyAction}>{action}</div>}
    </ButlerCard>
  );
};

export interface ButlerErrorStateProps {
  message: string;
  detail?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

/** Console inline error card: red-tinted border, red text, underlined retry. */
export const ButlerErrorState = ({
  message,
  detail,
  onRetry,
  retryLabel = 'Retry',
  className,
}: ButlerErrorStateProps) => {
  const classes = useStyles();
  return (
    <ButlerCard
      flush
      className={clsx(classes.errorCard, className)}
      role="alert"
    >
      <p className={classes.errorText}>{message}</p>
      {detail && <p className={classes.errorDetail}>{detail}</p>}
      {onRetry && (
        <button type="button" className={classes.retry} onClick={onRetry}>
          {retryLabel}
        </button>
      )}
    </ButlerCard>
  );
};

/** Console `Spinner` in the centered h-64 loading block. */
export const ButlerLoading = ({ className }: { className?: string }) => {
  const classes = useStyles();
  return (
    <div
      className={clsx(classes.loading, className)}
      role="progressbar"
      aria-label="Loading"
      aria-busy
    >
      <div className={classes.spinner} />
    </div>
  );
};

export const ButlerSpinner = ({ small }: { small?: boolean }) => {
  const classes = useStyles();
  return <div className={clsx(classes.spinner, small && classes.spinnerSm)} />;
};

export interface ButlerBannerProps {
  title: string;
  message?: ReactNode;
  severity?: 'warning' | 'danger';
  className?: string;
}

/** Console `WarningBanner`: amber tinted bar with icon, title and copy. */
export const ButlerBanner = ({
  title,
  message,
  severity = 'warning',
  className,
}: ButlerBannerProps) => {
  const classes = useStyles();
  const danger = severity === 'danger';
  return (
    <div
      className={clsx(
        classes.banner,
        danger && classes.bannerDanger,
        className,
      )}
      role="status"
    >
      <WarningIcon
        className={clsx(classes.bannerIcon, danger && classes.bannerIconDanger)}
      />
      <div>
        <p
          className={clsx(
            classes.bannerTitle,
            danger && classes.bannerTitleDanger,
          )}
        >
          {title}
        </p>
        {message && <p className={classes.bannerMessage}>{message}</p>}
      </div>
    </div>
  );
};
