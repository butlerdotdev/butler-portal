// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { butlerTokens, rgb } from '../../theme';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  return {
    list: {
      margin: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    },
    dense: {
      gap: 4,
      fontSize: 14,
    },
    row: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 16,
      fontSize: 16,
      lineHeight: '24px',
    },
    denseRow: {
      fontSize: 14,
      lineHeight: '20px',
    },
    label: {
      color: t.text.muted,
      flexShrink: 0,
    },
    denseLabel: {
      color: t.text.subtle,
    },
    value: {
      margin: 0,
      color: t.text.primary,
      textAlign: 'right',
      minWidth: 0,
      overflowWrap: 'anywhere',
    },
    denseValue: {
      color: rgb(t.palette.neutral[300]),
    },
    mono: {
      fontFamily: t.fontMono,
    },
    truncate: {
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
  };
});

export interface ButlerKeyValueRowProps {
  label: ReactNode;
  children: ReactNode;
  /** Render the value in the monospace face (identifiers, ranges). */
  mono?: boolean;
  /** Single-line value with ellipsis; sets `title` for the full text. */
  truncate?: boolean;
  title?: string;
  dense?: boolean;
}

/**
 * Console `dl > div.flex.justify-between` row: muted label on the left,
 * primary value right-aligned.
 */
export const ButlerKeyValueRow = ({
  label,
  children,
  mono,
  truncate,
  title,
  dense,
}: ButlerKeyValueRowProps) => {
  const classes = useStyles();
  return (
    <div className={clsx(classes.row, dense && classes.denseRow)}>
      <dt className={clsx(classes.label, dense && classes.denseLabel)}>
        {label}
      </dt>
      <dd
        className={clsx(
          classes.value,
          dense && classes.denseValue,
          mono && classes.mono,
          truncate && classes.truncate,
        )}
        title={title}
      >
        {children}
      </dd>
    </div>
  );
};

export const ButlerKeyValueList = ({
  children,
  dense,
  className,
}: {
  children: ReactNode;
  dense?: boolean;
  className?: string;
}) => {
  const classes = useStyles();
  return (
    <dl className={clsx(classes.list, dense && classes.dense, className)}>
      {children}
    </dl>
  );
};
