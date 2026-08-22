// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { butlerTokens, rgb, rgba } from '../../theme';
import { ButlerCard, ButlerStatusBadge, ServerIcon } from '../ui';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  return {
    link: {
      display: 'block',
      textDecoration: 'none',
      color: 'inherit',
      '&:focus-visible': {
        outline: `2px solid ${t.accent}`,
        outlineOffset: 2,
        borderRadius: t.radius.lg,
      },
    },
    row: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
    },
    identity: {
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      minWidth: 0,
    },
    icon: {
      width: 40,
      height: 40,
      borderRadius: t.radius.lg,
      backgroundColor: rgba(t.palette.green[500], 0.1),
      color: rgb(t.palette.green[500]),
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    iconViolet: {
      backgroundColor: rgba(t.palette.violet[500], 0.1),
      color: rgb(t.palette.violet[500]),
    },
    cardViolet: {
      borderColor: rgba(t.palette.violet[500], 0.2),
    },
    accent: {
      borderLeftWidth: 4,
      borderLeftStyle: 'solid',
    },
    nameRow: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    tag: {
      padding: '2px 8px',
      borderRadius: t.radius.sm,
      fontSize: 12,
      lineHeight: '16px',
      fontWeight: 500,
      backgroundColor: rgba(t.palette.violet[500], 0.1),
      color: rgb(t.palette.violet[400]),
    },
    name: {
      margin: 0,
      fontSize: 16,
      lineHeight: '24px',
      fontWeight: 500,
      color: t.text.primary,
      overflowWrap: 'anywhere',
    },
    namespace: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.muted,
    },
    stats: {
      display: 'flex',
      alignItems: 'center',
      gap: 32,
      flexShrink: 0,
    },
    stat: {
      textAlign: 'right',
    },
    statLabel: {
      margin: 0,
      fontSize: 12,
      lineHeight: '16px',
      textTransform: 'uppercase',
      letterSpacing: '0.025em',
      color: t.text.subtle,
    },
    statValue: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.secondary,
    },
    '@media (max-width: 767px)': {
      row: { flexDirection: 'column', alignItems: 'flex-start' },
      stats: { flexWrap: 'wrap', gap: 16 },
      stat: { textAlign: 'left' },
    },
  };
});

export interface ClusterListRowStat {
  label: string;
  value: string;
}

export interface ClusterListRowProps {
  to: string;
  name: string;
  namespace: string;
  phase: string;
  stats: ClusterListRowStat[];
  /** Violet tile and border for the console management cluster card. */
  tone?: 'green' | 'violet';
  /** Small tag after the name (console "Management"). */
  tag?: ReactNode;
  /** Left accent border color (console env-grouped rows). */
  accentBorder?: string;
}

/**
 * Console `ClusterCard` list row: icon tile, name and namespace, then
 * right-aligned uppercase stat columns and the phase badge.
 */
export const ClusterListRow = ({
  to,
  name,
  namespace,
  phase,
  stats,
  tone = 'green',
  tag,
  accentBorder,
}: ClusterListRowProps) => {
  const classes = useStyles();
  return (
    <Link to={to} className={classes.link}>
      <ButlerCard
        hoverable
        className={clsx(
          tone === 'violet' && classes.cardViolet,
          accentBorder && classes.accent,
        )}
        style={accentBorder ? { borderLeftColor: accentBorder } : undefined}
      >
        <div className={classes.row}>
          <div className={classes.identity}>
            <div
              className={clsx(classes.icon, tone === 'violet' && classes.iconViolet)}
            >
              <ServerIcon />
            </div>
            <div>
              {tag ? (
                <div className={classes.nameRow}>
                  <p className={classes.name}>{name}</p>
                  <span className={classes.tag}>{tag}</span>
                </div>
              ) : (
                <p className={classes.name}>{name}</p>
              )}
              <p className={classes.namespace}>{namespace}</p>
            </div>
          </div>
          <div className={classes.stats}>
            {stats.map(stat => (
              <div key={stat.label} className={classes.stat}>
                <p className={classes.statLabel}>{stat.label}</p>
                <p className={classes.statValue}>{stat.value}</p>
              </div>
            ))}
            <ButlerStatusBadge status={phase} />
          </div>
        </div>
      </ButlerCard>
    </Link>
  );
};
