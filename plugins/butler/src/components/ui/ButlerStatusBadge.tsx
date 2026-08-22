// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import React from 'react';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { butlerTokens, rgb, rgba } from '../../theme';

type Tone = 'green' | 'yellow' | 'blue' | 'orange' | 'red' | 'neutral';

interface StatusStyle {
  tone: Tone;
  pulse?: boolean;
}

// Same map as the console StatusBadge: tone and whether the phase is
// transitional (pulsing dot).
const STATUS_STYLES: Record<string, StatusStyle> = {
  ready: { tone: 'green' },
  running: { tone: 'green' },
  healthy: { tone: 'green' },
  installed: { tone: 'green' },
  active: { tone: 'green' },
  provisioning: { tone: 'yellow', pulse: true },
  pending: { tone: 'yellow', pulse: true },
  waiting: { tone: 'yellow', pulse: true },
  updating: { tone: 'blue', pulse: true },
  installing: { tone: 'blue', pulse: true },
  upgrading: { tone: 'blue', pulse: true },
  scaling: { tone: 'blue', pulse: true },
  rotating: { tone: 'blue', pulse: true },
  degraded: { tone: 'orange' },
  deleting: { tone: 'orange', pulse: true },
  terminating: { tone: 'orange', pulse: true },
  failed: { tone: 'red' },
  error: { tone: 'red' },
  notready: { tone: 'red' },
  unknown: { tone: 'neutral' },
};

export function statusStyle(status: string | undefined): StatusStyle {
  const key = (status || 'unknown').toLowerCase().replace(/\s+/g, '');
  return STATUS_STYLES[key] || STATUS_STYLES.unknown;
}

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  const tone = (bg: string, text: string) => ({
    backgroundColor: rgba(bg, 0.1),
    color: rgb(text),
  });
  return {
    '@keyframes butlerPing': {
      '75%, 100%': { transform: 'scale(2)', opacity: 0 },
    },
    badge: {
      display: 'inline-flex',
      alignItems: 'center',
      padding: '4px 10px',
      borderRadius: t.radius.pill,
      fontFamily: t.fontSans,
      fontSize: 12,
      lineHeight: '16px',
      fontWeight: 500,
      whiteSpace: 'nowrap',
    },
    green: tone(p.green[500], p.green[400]),
    yellow: tone(p.yellow[500], p.yellow[400]),
    blue: tone(p.blue[500], p.blue[400]),
    orange: tone(p.orange[500], p.orange[400]),
    red: tone(p.red[500], p.red[400]),
    neutral: tone(p.neutral[500], p.neutral[400]),
    dot: {
      position: 'relative',
      display: 'flex',
      width: 8,
      height: 8,
      marginRight: 6,
    },
    ping: {
      position: 'absolute',
      display: 'inline-flex',
      width: '100%',
      height: '100%',
      borderRadius: '50%',
      backgroundColor: 'currentColor',
      opacity: 0.75,
      animation: '$butlerPing 1s cubic-bezier(0, 0, 0.2, 1) infinite',
    },
    core: {
      position: 'relative',
      display: 'inline-flex',
      width: 8,
      height: 8,
      borderRadius: '50%',
      backgroundColor: 'currentColor',
    },
  };
});

export interface ButlerStatusBadgeProps {
  status: string | undefined;
  className?: string;
}

/**
 * Console `StatusBadge`: tinted pill with a pulsing dot for transitional
 * phases.
 */
export const ButlerStatusBadge = ({
  status,
  className,
}: ButlerStatusBadgeProps) => {
  const classes = useStyles();
  const style = statusStyle(status);
  return (
    <span className={clsx(classes.badge, classes[style.tone], className)}>
      {style.pulse && (
        <span className={classes.dot} aria-hidden>
          <span className={classes.ping} />
          <span className={classes.core} />
        </span>
      )}
      {status || 'Unknown'}
    </span>
  );
};

const useChipStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  const tone = (bg: string, text: string) => ({
    backgroundColor: rgba(bg, 0.1),
    color: rgb(text),
  });
  return {
    chip: {
      display: 'inline-flex',
      alignItems: 'center',
      padding: '4px 8px',
      borderRadius: t.radius.sm,
      fontFamily: t.fontSans,
      fontSize: 12,
      lineHeight: '16px',
      fontWeight: 500,
      whiteSpace: 'nowrap',
    },
    green: tone(p.green[500], p.green[400]),
    yellow: tone(p.yellow[500], p.yellow[400]),
    blue: tone(p.blue[500], p.blue[400]),
    orange: tone(p.orange[500], p.orange[400]),
    red: tone(p.red[500], p.red[400]),
    neutral: {
      backgroundColor: rgb(p.neutral[800]),
      color: rgb(p.neutral[400]),
    },
  };
});

export interface ButlerChipProps {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
  title?: string;
}

/** Console small square chip (event type, tags, node roles). */
export const ButlerChip = ({
  tone = 'neutral',
  children,
  className,
  title,
}: ButlerChipProps) => {
  const classes = useChipStyles();
  return (
    <span
      className={clsx(classes.chip, classes[tone], className)}
      title={title}
    >
      {children}
    </span>
  );
};
