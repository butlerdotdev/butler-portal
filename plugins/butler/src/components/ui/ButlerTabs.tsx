// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { butlerTokens, rgb } from '../../theme';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  return {
    bar: {
      borderBottom: `1px solid ${t.border}`,
    },
    nav: {
      display: 'flex',
      gap: 24,
      overflowX: 'auto',
    },
    tab: {
      appearance: 'none',
      background: 'none',
      border: 'none',
      borderBottom: '2px solid transparent',
      padding: '0 0 12px',
      marginBottom: -1,
      fontFamily: t.fontSans,
      fontSize: 14,
      lineHeight: '20px',
      fontWeight: 500,
      color: t.text.muted,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      transition: 'color 150ms',
      '&:hover': { color: t.text.secondary },
      '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
      '&:focus-visible': {
        outline: `2px solid ${t.accent}`,
        outlineOffset: 2,
        borderRadius: 2,
      },
    },
    active: {
      color: rgb(t.palette.green[500]),
      borderBottomColor: rgb(t.palette.green[500]),
      '&:hover': { color: rgb(t.palette.green[500]) },
    },
  };
});

export interface ButlerTabItem<T extends string = string> {
  id: T;
  label: string;
  disabled?: boolean;
}

export interface ButlerTabsProps<T extends string> {
  tabs: ReadonlyArray<ButlerTabItem<T>>;
  value: T;
  onChange: (id: T) => void;
  className?: string;
  'aria-label'?: string;
}

/**
 * Console tab strip: text tabs with a green underline on the active tab.
 */
export function ButlerTabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
  'aria-label': ariaLabel,
}: ButlerTabsProps<T>) {
  const classes = useStyles();
  return (
    <div className={clsx(classes.bar, className)}>
      <nav className={classes.nav} role="tablist" aria-label={ariaLabel}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={value === tab.id}
            disabled={tab.disabled}
            className={clsx(classes.tab, value === tab.id && classes.active)}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
