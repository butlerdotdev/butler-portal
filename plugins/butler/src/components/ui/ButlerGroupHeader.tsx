// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { butlerTokens, rgba } from '../../theme';
import { ChevronDownIcon } from './icons';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  return {
    section: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    },
    header: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '8px 12px',
      borderRadius: t.radius.lg,
      border: `1px solid ${t.border}`,
      backgroundColor: rgba(t.palette.neutral[900], 0.9),
      backdropFilter: 'blur(8px)',
      fontFamily: t.fontSans,
      textAlign: 'left',
      cursor: 'pointer',
      transition: 'background-color 150ms',
      '&:hover': { backgroundColor: t.surface },
      '&:focus-visible': {
        outline: `2px solid ${t.accent}`,
        outlineOffset: 2,
      },
    },
    sticky: {
      position: 'sticky',
      top: 0,
      zIndex: 10,
    },
    chevron: {
      color: t.text.subtle,
      transition: 'transform 150ms',
      flexShrink: 0,
    },
    collapsed: { transform: 'rotate(-90deg)' },
    dot: {
      width: 10,
      height: 10,
      borderRadius: '50%',
      flexShrink: 0,
    },
    label: {
      fontSize: 14,
      lineHeight: '20px',
      fontWeight: 600,
      color: t.text.strong,
    },
    sublabel: {
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.subtle,
    },
    nested: {
      marginLeft: 12,
      paddingLeft: 24,
      borderLeft: `1px solid ${t.border}`,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    },
    empty: {
      margin: 0,
      paddingLeft: 4,
      fontSize: 14,
      lineHeight: '20px',
      fontStyle: 'italic',
      color: t.text.subtle,
    },
  };
});

export interface ButlerGroupSectionProps {
  label: ReactNode;
  sublabel?: ReactNode;
  /** Solid dot color (env accent or violet for teams). */
  accentDot: string;
  /** Subtle header background tint. */
  tint?: string;
  collapsed: boolean;
  onToggle: () => void;
  /** Nested sections sit inside an outer group, so they are not sticky. */
  nested?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Console `AdminGroupSection`: sticky collapsible header (chevron, accent
 * dot, label, muted sublabel) followed by its rows.
 */
export const ButlerGroupSection = ({
  label,
  sublabel,
  accentDot,
  tint,
  collapsed,
  onToggle,
  nested = false,
  children,
  className,
}: ButlerGroupSectionProps) => {
  const classes = useStyles();
  return (
    <section className={clsx(classes.section, className)}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className={clsx(classes.header, !nested && classes.sticky)}
        style={tint ? { backgroundColor: tint } : undefined}
      >
        <ChevronDownIcon
          className={clsx(classes.chevron, collapsed && classes.collapsed)}
        />
        <span
          className={classes.dot}
          style={{ backgroundColor: accentDot }}
          aria-hidden
        />
        <span className={classes.label}>{label}</span>
        {sublabel && <span className={classes.sublabel}>{sublabel}</span>}
      </button>
      {!collapsed && children}
    </section>
  );
};

/** Indented container for env sections nested under a team section. */
export const ButlerGroupNested = ({ children }: { children: ReactNode }) => {
  const classes = useStyles();
  return <div className={classes.nested}>{children}</div>;
};

export const ButlerGroupEmpty = ({ children }: { children: ReactNode }) => {
  const classes = useStyles();
  return <p className={classes.empty}>{children}</p>;
};
