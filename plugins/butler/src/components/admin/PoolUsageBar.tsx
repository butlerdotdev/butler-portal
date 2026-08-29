// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { makeStyles } from '@material-ui/core/styles';
import { butlerTokens, rgb } from '../../theme';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  return {
    wrap: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 140 },
    track: {
      flex: 1,
      height: 6,
      borderRadius: 9999,
      backgroundColor: rgb(p.neutral[800]),
      overflow: 'hidden',
    },
    fill: { height: '100%', borderRadius: 9999 },
    ok: { backgroundColor: rgb(p.green[500]) },
    warn: { backgroundColor: rgb(p.amber[500]) },
    full: { backgroundColor: rgb(p.red[500]) },
    label: {
      fontFamily: t.fontMono,
      fontSize: 12,
      color: t.text.muted,
      whiteSpace: 'nowrap',
    },
  };
});

export interface PoolUsageBarProps {
  allocated?: number;
  total?: number;
}

/** Console's pool usage bar: green, amber at 80 percent, red at 90. */
export const PoolUsageBar = ({ allocated, total }: PoolUsageBarProps) => {
  const classes = useStyles();
  if (allocated === undefined || !total) {
    return <span className={classes.label}>-</span>;
  }
  const percent = Math.min(100, Math.round((allocated / total) * 100));
  const tone =
    percent >= 90 ? classes.full : percent >= 80 ? classes.warn : classes.ok;
  return (
    <span className={classes.wrap}>
      <span className={classes.track}>
        <span
          className={`${classes.fill} ${tone}`}
          style={{ width: `${percent}%` }}
        />
      </span>
      <span className={classes.label}>{percent}%</span>
    </span>
  );
};
