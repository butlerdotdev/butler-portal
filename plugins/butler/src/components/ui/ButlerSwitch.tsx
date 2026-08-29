// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useId } from 'react';
import type { ReactNode } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { butlerTokens, rgb } from '../../theme';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  return {
    row: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      fontFamily: t.fontSans,
    },
    track: {
      position: 'relative',
      flexShrink: 0,
      width: 36,
      height: 20,
      marginTop: 2,
      padding: 0,
      border: 'none',
      borderRadius: t.radius.pill,
      backgroundColor: rgb(p.neutral[700]),
      cursor: 'pointer',
      transition: 'background-color 150ms',
      '&[aria-checked="true"]': { backgroundColor: rgb(p.green[600]) },
      '&:focus-visible': {
        outline: 'none',
        boxShadow: `0 0 0 2px ${t.surface}, 0 0 0 4px ${t.accent}`,
      },
      '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
    },
    thumb: {
      position: 'absolute',
      top: 2,
      left: 2,
      width: 16,
      height: 16,
      borderRadius: '50%',
      backgroundColor: rgb(p.neutral[50]),
      transition: 'transform 150ms',
      '[aria-checked="true"] > &': { transform: 'translateX(16px)' },
    },
    label: {
      fontSize: 14,
      lineHeight: '20px',
      color: rgb(p.neutral[300]),
      cursor: 'pointer',
    },
    help: {
      margin: '4px 0 0',
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.subtle,
    },
  };
});

export interface ButlerSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  help?: ReactNode;
  disabled?: boolean;
  className?: string;
}

/** Accessible toggle (`role="switch"`) in the console green/neutral tints. */
export const ButlerSwitch = ({
  checked,
  onChange,
  label,
  help,
  disabled,
  className,
}: ButlerSwitchProps) => {
  const classes = useStyles();
  const id = useId();
  return (
    <div className={clsx(classes.row, className)}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        className={classes.track}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span className={classes.thumb} />
      </button>
      <div>
        <label className={classes.label} htmlFor={id}>
          {label}
        </label>
        {help && <p className={classes.help}>{help}</p>}
      </div>
    </div>
  );
};
