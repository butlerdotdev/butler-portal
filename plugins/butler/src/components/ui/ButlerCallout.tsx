// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { HTMLAttributes, ReactNode } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { butlerTokens, rgb, rgba } from '../../theme';

export type ButlerCalloutTone =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'amber'
  | 'danger'
  | 'violet';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  const tint = (hue: string, text: string, border = 0.2, bg = 0.1) => ({
    backgroundColor: rgba(hue, bg),
    borderColor: rgba(hue, border),
    '& $title': { color: rgb(text) },
  });
  return {
    root: {
      padding: 16,
      borderRadius: t.radius.lg,
      border: '1px solid transparent',
      fontFamily: t.fontSans,
      fontSize: 14,
      lineHeight: '20px',
      color: rgb(p.neutral[300]),
    },
    compact: { padding: 12 },
    title: {
      margin: '0 0 4px',
      fontSize: 14,
      lineHeight: '20px',
      fontWeight: 500,
    },
    body: {
      '& p': { margin: 0 },
      '& p + p': { marginTop: 4 },
      '& code': { fontFamily: t.fontMono, fontSize: 13 },
    },
    neutral: {
      backgroundColor: t.inset,
      borderColor: rgb(p.neutral[700]),
      '& $title': { color: t.text.strong },
    },
    info: tint(p.blue[500], p.blue[300], 0.3),
    success: tint(p.green[500], p.green[300], 0.3),
    warning: tint(p.yellow[500], p.yellow[300], 0.3),
    amber: tint(p.amber[500], p.amber[300], 0.3),
    danger: tint(p.red[500], p.red[300], 0.3),
    violet: tint(p.violet[500], p.violet[300], 0.3),
  };
});

export interface ButlerCalloutProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: ButlerCalloutTone;
  title?: ReactNode;
  compact?: boolean;
  children?: ReactNode;
}

/**
 * Console tinted callout box (`p-4 bg-{hue}-500/10 border border-{hue}-500/30
 * rounded-lg`) used inside modals and as inline notices.
 */
export const ButlerCallout = ({
  tone = 'neutral',
  title,
  compact,
  className,
  children,
  ...props
}: ButlerCalloutProps) => {
  const classes = useStyles();
  return (
    <div
      className={clsx(
        classes.root,
        classes[tone],
        compact && classes.compact,
        className,
      )}
      {...props}
    >
      {title && <p className={classes.title}>{title}</p>}
      <div className={classes.body}>{children}</div>
    </div>
  );
};
