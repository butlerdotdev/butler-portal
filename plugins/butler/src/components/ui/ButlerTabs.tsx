// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import React from 'react';
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
  /** Prefix for the tab and panel ids; pair with `ButlerTabPanel`. */
  idPrefix?: string;
  className?: string;
  'aria-label'?: string;
}

export const tabId = (prefix: string, id: string) => `${prefix}-tab-${id}`;
export const tabPanelId = (prefix: string, id: string) =>
  `${prefix}-panel-${id}`;

/**
 * Console tab strip: text tabs with a green underline on the active tab.
 */
export function ButlerTabs<T extends string>({
  tabs,
  value,
  onChange,
  idPrefix = 'butler',
  className,
  'aria-label': ariaLabel,
}: ButlerTabsProps<T>) {
  const classes = useStyles();
  // Roving tabindex: only the active tab is in the tab order, arrows move
  // between enabled tabs and activate them (WAI-ARIA tabs pattern).
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const enabled = tabs.filter(t => !t.disabled);
    const index = enabled.findIndex(t => t.id === value);
    if (index < 0) return;
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const next = enabled[(index + step + enabled.length) % enabled.length];
    event.preventDefault();
    onChange(next.id);
    const el = (event.currentTarget as HTMLElement).querySelector<HTMLElement>(
      `#${tabId(idPrefix, next.id)}`,
    );
    el?.focus();
  };
  return (
    <div className={clsx(classes.bar, className)}>
      <div
        className={classes.nav}
        role="tablist"
        aria-label={ariaLabel}
        onKeyDown={onKeyDown}
      >
        {tabs.map(tab => (
          <button
            key={tab.id}
            id={tabId(idPrefix, tab.id)}
            type="button"
            role="tab"
            aria-selected={value === tab.id}
            aria-controls={tabPanelId(idPrefix, tab.id)}
            tabIndex={value === tab.id ? 0 : -1}
            disabled={tab.disabled}
            className={clsx(classes.tab, value === tab.id && classes.active)}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export interface ButlerTabPanelProps {
  idPrefix?: string;
  id: string;
  children: React.ReactNode;
}

export const ButlerTabPanel = ({
  idPrefix = 'butler',
  id,
  children,
}: ButlerTabPanelProps) => (
  <div
    role="tabpanel"
    id={tabPanelId(idPrefix, id)}
    aria-labelledby={tabId(idPrefix, id)}
  >
    {children}
  </div>
);
