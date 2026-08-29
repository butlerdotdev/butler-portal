// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { butlerTokens, rgb } from '../../theme';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  return {
    root: {
      border: `1px solid ${t.border}`,
      borderRadius: t.radius.lg,
      overflow: 'hidden',
      fontFamily: t.fontSans,
      backgroundColor: t.surface,
    },
    strong: { borderColor: rgb(p.neutral[700]) },
    header: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      padding: 16,
      border: 'none',
      backgroundColor: t.inset,
      color: t.text.strong,
      fontFamily: t.fontSans,
      fontSize: 16,
      lineHeight: '24px',
      fontWeight: 500,
      textAlign: 'left',
      cursor: 'pointer',
      transition: 'background-color 150ms',
      '&:hover': { backgroundColor: rgb(p.neutral[800]) },
      '&:focus-visible': {
        outline: 'none',
        boxShadow: `inset 0 0 0 2px ${t.accent}`,
      },
    },
    headerPlain: {
      backgroundColor: 'transparent',
      padding: '12px 16px',
      '&:hover': { backgroundColor: t.inset },
    },
    left: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
    chevron: {
      color: t.text.subtle,
      flexShrink: 0,
      transition: 'transform 150ms',
    },
    open: { transform: 'rotate(90deg)' },
    count: {
      fontSize: 14,
      fontWeight: 400,
      color: t.text.subtle,
    },
    body: { padding: 16 },
  };
});

const Chevron = ({ className }: { className?: string }) => (
  <svg
    width={20}
    height={20}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    className={className}
    aria-hidden
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);

export interface ButlerDisclosureProps {
  title: ReactNode;
  count?: number;
  /** Rendered on the right of the header (badges, chips). */
  adornment?: ReactNode;
  defaultOpen?: boolean;
  /** Inset header band (certificate categories) vs plain (form sections). */
  variant?: 'band' | 'plain';
  children: ReactNode;
  className?: string;
}

/**
 * Console collapsible section: full-width header button with a rotating
 * chevron, optional count and right adornment, 16px padded body.
 */
export const ButlerDisclosure = ({
  title,
  count,
  adornment,
  defaultOpen = false,
  variant = 'band',
  children,
  className,
}: ButlerDisclosureProps) => {
  const classes = useStyles();
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  return (
    <div
      className={clsx(
        classes.root,
        variant === 'plain' && classes.strong,
        className,
      )}
    >
      <button
        type="button"
        className={clsx(
          classes.header,
          variant === 'plain' && classes.headerPlain,
        )}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
      >
        <span className={classes.left}>
          <Chevron className={clsx(classes.chevron, open && classes.open)} />
          <span>{title}</span>
          {count !== undefined && (
            <span className={classes.count}>({count})</span>
          )}
        </span>
        {adornment}
      </button>
      {open && (
        <div id={bodyId} className={classes.body}>
          {children}
        </div>
      )}
    </div>
  );
};
