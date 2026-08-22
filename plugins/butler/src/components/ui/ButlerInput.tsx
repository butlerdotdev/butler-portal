// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { butlerTokens, rgb } from '../../theme';
import { SearchIcon } from './icons';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  return {
    field: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      fontFamily: t.fontSans,
    },
    label: {
      fontSize: 14,
      lineHeight: '20px',
      fontWeight: 500,
      color: t.text.muted,
    },
    input: {
      width: '100%',
      boxSizing: 'border-box',
      padding: '8px 12px',
      backgroundColor: rgb(p.neutral[800]),
      border: `1px solid ${rgb(p.neutral[700])}`,
      borderRadius: t.radius.lg,
      fontFamily: t.fontSans,
      fontSize: 14,
      lineHeight: '20px',
      color: rgb(p.neutral[200]),
      '&::placeholder': { color: rgb(p.neutral[600]) },
      '&:focus': {
        outline: 'none',
        borderColor: 'transparent',
        boxShadow: `0 0 0 2px ${t.accent}`,
      },
      '&:disabled': { opacity: 0.5 },
    },
    danger: {
      '&:focus': { boxShadow: `0 0 0 2px ${rgb(p.red[500])}` },
    },
    mono: { fontFamily: t.fontMono },
    searchWrap: {
      position: 'relative',
      flex: 1,
    },
    searchIcon: {
      position: 'absolute',
      left: 12,
      top: '50%',
      transform: 'translateY(-50%)',
      color: t.text.subtle,
      pointerEvents: 'none',
    },
    search: {
      paddingLeft: 40,
      backgroundColor: t.surface,
      border: `1px solid ${t.border}`,
      color: t.text.strong,
      '&::placeholder': { color: t.text.subtle },
      '&:focus': {
        outline: 'none',
        boxShadow: 'none',
        borderColor: rgb(p.neutral[600]),
      },
    },
    help: {
      fontSize: 12,
      color: t.text.subtle,
    },
  };
});

export interface ButlerInputProps
  extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  help?: ReactNode;
  tone?: 'default' | 'danger';
  mono?: boolean;
}

/** Console text input: neutral-800 field, neutral-700 border, focus ring. */
export const ButlerInput = ({
  label,
  help,
  tone = 'default',
  mono,
  className,
  id: givenId,
  ...props
}: ButlerInputProps) => {
  const classes = useStyles();
  const generatedId = useId();
  const id = givenId ?? generatedId;
  const input = (
    <input
      id={id}
      className={clsx(
        classes.input,
        tone === 'danger' && classes.danger,
        mono && classes.mono,
        className,
      )}
      {...props}
    />
  );
  if (!label && !help) return input;
  return (
    <div className={classes.field}>
      {label && (
        <label className={classes.label} htmlFor={id}>
          {label}
        </label>
      )}
      {input}
      {help && <span className={classes.help}>{help}</span>}
    </div>
  );
};

/** Console list search box with the leading magnifier icon. */
export const ButlerSearchInput = ({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) => {
  const classes = useStyles();
  return (
    <div className={clsx(classes.searchWrap, className)}>
      <SearchIcon className={classes.searchIcon} />
      <input
        type="search"
        className={clsx(classes.input, classes.search)}
        {...props}
      />
    </div>
  );
};
