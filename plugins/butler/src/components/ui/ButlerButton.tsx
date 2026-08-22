// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { ButtonHTMLAttributes, ElementType, ReactNode } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { butlerTokens, rgb, rgba } from '../../theme';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  return {
    root: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      border: 'none',
      borderRadius: t.radius.lg,
      fontFamily: t.fontSans,
      fontWeight: 500,
      fontSize: 14,
      lineHeight: '20px',
      cursor: 'pointer',
      textDecoration: 'none',
      transition: 'background-color 150ms, color 150ms, border-color 150ms',
      '&:focus-visible': {
        outline: 'none',
        boxShadow: `0 0 0 2px ${t.surface}, 0 0 0 4px ${t.accent}`,
      },
      '&:disabled, &[aria-disabled="true"]': {
        opacity: 0.5,
        cursor: 'not-allowed',
        pointerEvents: 'none',
      },
    },
    sm: { padding: '6px 12px' },
    md: { padding: '8px 16px' },
    lg: { padding: '12px 24px', fontSize: 16, lineHeight: '24px' },
    primary: {
      backgroundColor: rgb(p.green[600]),
      color: '#fff',
      '&:hover': { backgroundColor: rgb(p.green[500]) },
    },
    secondary: {
      backgroundColor: rgb(p.neutral[800]),
      color: t.text.strong,
      '&:hover': { backgroundColor: rgb(p.neutral[700]) },
    },
    danger: {
      backgroundColor: rgb(p.red[600]),
      color: '#fff',
      '&:hover': { backgroundColor: rgb(p.red[500]) },
      '&:focus-visible': {
        boxShadow: `0 0 0 2px ${t.surface}, 0 0 0 4px ${rgb(p.red[500])}`,
      },
    },
    ghost: {
      backgroundColor: 'transparent',
      color: rgb(p.neutral[300]),
      '&:hover': { backgroundColor: rgb(p.neutral[800]) },
    },
    outline: {
      backgroundColor: 'transparent',
      color: rgb(p.neutral[300]),
      border: `1px solid ${rgb(p.neutral[800])}`,
      '&:hover': {
        borderColor: rgb(p.neutral[700]),
        color: t.text.strong,
      },
    },
    icon: {
      padding: 8,
      borderRadius: t.radius.lg,
      color: t.text.muted,
      backgroundColor: 'transparent',
      '&:hover': { backgroundColor: rgba(p.neutral[800], 1) },
    },
  };
});

export type ButlerButtonVariant =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'ghost'
  | 'outline';

export interface ButlerButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButlerButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  /** Render as another element (for example a router `Link`). */
  component?: ElementType;
  to?: string;
  href?: string;
  startIcon?: ReactNode;
  children?: ReactNode;
}

/**
 * Console `Button`: green primary, neutral secondary, red danger, ghost.
 */
export const ButlerButton = ({
  variant = 'primary',
  size = 'md',
  component: Component = 'button',
  className,
  startIcon,
  children,
  disabled,
  ...props
}: ButlerButtonProps) => {
  const classes = useStyles();
  const extra =
    Component === 'button'
      ? { type: 'button' as const, disabled }
      : { 'aria-disabled': disabled || undefined };
  return (
    <Component
      className={clsx(classes.root, classes[size], classes[variant], className)}
      {...extra}
      {...props}
    >
      {startIcon}
      {children}
    </Component>
  );
};

/** Square icon-only button (console back chevron, close controls). */
export const ButlerIconButton = ({
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) => {
  const classes = useStyles();
  return (
    <button
      type="button"
      className={clsx(classes.root, classes.icon, className)}
      {...props}
    >
      {children}
    </button>
  );
};
