// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from 'react';
import { Popover } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { butlerTokens, rgb, rgba } from '../../theme';
import { AlertTriangleIcon } from './icons';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  return {
    paper: {
      backgroundColor: rgb(p.neutral[800]),
      border: `1px solid ${rgb(p.neutral[700])}`,
      borderRadius: t.radius.lg,
      boxShadow:
        '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
      overflow: 'hidden',
      minWidth: 224,
      marginTop: 4,
      backgroundImage: 'none',
    },
    list: {
      margin: 0,
      padding: '4px 0',
      listStyle: 'none',
    },
    item: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '8px 16px',
      border: 'none',
      background: 'none',
      textAlign: 'left',
      cursor: 'pointer',
      fontFamily: t.fontSans,
      transition: 'background-color 150ms',
      '&:hover': { backgroundColor: rgba(p.neutral[700], 0.5) },
      '&:focus-visible': {
        outline: 'none',
        backgroundColor: rgba(p.neutral[700], 0.5),
      },
      '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
    },
    destructive: {
      '&:hover': { backgroundColor: rgba(p.red[500], 0.1) },
    },
    divided: { borderTop: `1px solid ${rgb(p.neutral[700])}` },
    icon: {
      width: 20,
      display: 'inline-flex',
      justifyContent: 'center',
      color: t.text.muted,
      flexShrink: 0,
    },
    text: { flex: 1, minWidth: 0 },
    labelRow: { display: 'flex', alignItems: 'center', gap: 8 },
    label: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      fontWeight: 500,
      color: rgb(p.neutral[200]),
    },
    labelDestructive: { color: rgb(p.red[400]) },
    description: {
      margin: 0,
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.subtle,
    },
    warning: { color: rgb(p.yellow[400]), flexShrink: 0 },
    note: {
      margin: '2px 0 0',
      fontSize: 12,
      color: rgb(p.red[400]),
    },
  };
});

export interface ButlerMenuProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Match the anchor width (console install split-button menus). */
  fullWidth?: boolean;
  align?: 'left' | 'right';
}

/**
 * Console dropdown (`bg-neutral-800 border-neutral-700 rounded-lg shadow-xl`)
 * on top of the MUI Popover for positioning and focus handling.
 */
export const ButlerMenu = ({
  anchorEl,
  open,
  onClose,
  children,
  fullWidth,
  align = 'right',
}: ButlerMenuProps) => {
  const classes = useStyles();
  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: align }}
      transformOrigin={{ vertical: 'top', horizontal: align }}
      PaperProps={{
        className: classes.paper,
        style: fullWidth && anchorEl ? { width: anchorEl.offsetWidth } : {},
      }}
    >
      <ul className={classes.list} role="menu">
        {children}
      </ul>
    </Popover>
  );
};

export interface ButlerMenuItemProps {
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  onClick: () => void;
  destructive?: boolean;
  /** Show the yellow warning glyph after the label. */
  warning?: boolean;
  /** Separator above the item (console puts CA rotation under a rule). */
  divided?: boolean;
  disabled?: boolean;
  /** Red note under the description (e.g. "Requires admin role"). */
  note?: ReactNode;
}

export const ButlerMenuItem = ({
  label,
  description,
  icon,
  onClick,
  destructive,
  warning,
  divided,
  disabled,
  note,
}: ButlerMenuItemProps) => {
  const classes = useStyles();
  return (
    <li role="none">
      <button
        type="button"
        role="menuitem"
        className={clsx(
          classes.item,
          destructive && classes.destructive,
          divided && classes.divided,
        )}
        onClick={onClick}
        disabled={disabled}
      >
        {icon && <span className={classes.icon}>{icon}</span>}
        <span className={classes.text}>
          <span className={classes.labelRow}>
            <p
              className={clsx(
                classes.label,
                destructive && classes.labelDestructive,
              )}
            >
              {label}
            </p>
            {warning && (
              <AlertTriangleIcon size={16} className={classes.warning} />
            )}
          </span>
          {description && <p className={classes.description}>{description}</p>}
          {note && <p className={classes.note}>{note}</p>}
        </span>
      </button>
    </li>
  );
};
