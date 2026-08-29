// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { butlerTokens, rgb, rgba } from '../../theme';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  return {
    tile: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      fontFamily: t.fontSans,
      fontWeight: 700,
      textTransform: 'uppercase',
    },
    green: {
      backgroundColor: rgba(p.green[500], 0.2),
      color: rgb(p.green[400]),
    },
    greenStrong: {
      backgroundColor: rgba(p.green[500], 0.3),
      color: rgb(p.green[300]),
    },
    neutral: {
      backgroundColor: rgb(p.neutral[700]),
      color: t.text.muted,
    },
  };
});

export interface ButlerAvatarTileProps {
  /** Text whose first character is shown. */
  name: string;
  size?: 32 | 40 | 48;
  tone?: 'green' | 'greenStrong' | 'neutral';
  className?: string;
}

/**
 * Console team avatar: rounded square with the first letter of the name
 * (overview cards, admin team rows, team switcher).
 */
export const ButlerAvatarTile = ({
  name,
  size = 40,
  tone = 'green',
  className,
}: ButlerAvatarTileProps) => {
  const classes = useStyles();
  const fontSize = size === 48 ? 18 : size === 40 ? 16 : 12;
  return (
    <div
      className={clsx(classes.tile, classes[tone], className)}
      style={{
        width: size,
        height: size,
        borderRadius: size === 32 ? 6 : 8,
        fontSize,
      }}
      aria-hidden
    >
      {name.charAt(0)}
    </div>
  );
};
