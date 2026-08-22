// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { butlerTokens, rgb, rgba } from '../../theme';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  return {
    bar: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 8,
      fontFamily: t.fontSans,
    },
    tabs: {
      gap: 8,
      paddingBottom: 8,
      borderBottom: `1px solid ${rgb(p.neutral[700])}`,
    },
    chip: {
      padding: '8px 12px',
      borderRadius: t.radius.lg,
      border: `1px solid ${rgb(p.neutral[700])}`,
      backgroundColor: rgb(p.neutral[800]),
      color: t.text.muted,
      fontFamily: t.fontSans,
      fontSize: 14,
      lineHeight: '20px',
      cursor: 'pointer',
      transition: 'background-color 150ms, color 150ms, border-color 150ms',
      '&:hover': { borderColor: rgb(p.neutral[600]) },
      '&:focus-visible': {
        outline: 'none',
        boxShadow: `0 0 0 2px ${t.surface}, 0 0 0 4px ${t.accent}`,
      },
    },
    chipActive: {
      backgroundColor: rgba(p.green[500], 0.2),
      borderColor: rgb(p.green[500]),
      color: rgb(p.green[400]),
      '&:hover': { borderColor: rgb(p.green[500]) },
    },
    tab: {
      padding: '4px 12px',
      borderRadius: t.radius.sm,
      border: 'none',
      backgroundColor: 'transparent',
      color: t.text.muted,
      fontFamily: t.fontSans,
      fontSize: 14,
      lineHeight: '20px',
      cursor: 'pointer',
      transition: 'background-color 150ms, color 150ms',
      '&:hover': { color: rgb(p.neutral[200]) },
      '&:focus-visible': {
        outline: 'none',
        boxShadow: `0 0 0 2px ${t.accent}`,
      },
    },
    tabActive: {
      backgroundColor: rgba(p.green[500], 0.2),
      color: rgb(p.green[400]),
    },
  };
});

export interface ButlerToggleOption<V extends string> {
  value: V;
  label: ReactNode;
}

export interface ButlerToggleBarProps<V extends string> {
  options: ReadonlyArray<ButlerToggleOption<V>>;
  value: V;
  onChange: (value: V) => void;
  /**
   * `chips` is the console category filter (bordered pills);
   * `tabs` is the Form / YAML switch with a bottom rule.
   */
  variant?: 'chips' | 'tabs';
  'aria-label'?: string;
  className?: string;
}

/** Console single-select toggle group (category filter, Form/YAML switch). */
export function ButlerToggleBar<V extends string>({
  options,
  value,
  onChange,
  variant = 'chips',
  'aria-label': ariaLabel,
  className,
}: ButlerToggleBarProps<V>) {
  const classes = useStyles();
  const tabs = variant === 'tabs';
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={clsx(classes.bar, tabs && classes.tabs, className)}
    >
      {options.map(opt => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={clsx(
              tabs ? classes.tab : classes.chip,
              active && (tabs ? classes.tabActive : classes.chipActive),
            )}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
