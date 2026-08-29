// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { butlerTokens, rgb } from '../../theme';

export const useRequestRowStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  return {
    list: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    },
    row: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      padding: 12,
      borderRadius: t.radius.lg,
      backgroundColor: t.inset,
    },
    name: {
      margin: 0,
      fontFamily: t.fontMono,
      fontSize: 14,
      lineHeight: '20px',
      color: rgb(t.palette.neutral[200]),
      overflowWrap: 'anywhere',
    },
    detail: {
      margin: '2px 0 0',
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.muted,
      whiteSpace: 'pre',
    },
  };
});

export interface RequestRowProps {
  name: string;
  detail?: string;
  trailing?: ReactNode;
}

/** Console inset request row (machine / load balancer requests). */
export const RequestRow = ({ name, detail, trailing }: RequestRowProps) => {
  const classes = useRequestRowStyles();
  return (
    <div className={classes.row}>
      <div>
        <p className={classes.name}>{name}</p>
        {detail && <p className={classes.detail}>{detail}</p>}
      </div>
      {trailing}
    </div>
  );
};
