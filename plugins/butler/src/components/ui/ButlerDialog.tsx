// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from 'react';
import { Dialog } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { butlerTokens, rgb, rgba } from '../../theme';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  return {
    backdrop: {
      backgroundColor: 'rgb(0 0 0 / 0.6)',
      backdropFilter: 'blur(4px)',
    },
    paper: {
      backgroundColor: t.surface,
      border: `1px solid ${t.border}`,
      borderRadius: t.radius.xl,
      boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)',
      color: t.text.primary,
      fontFamily: t.fontSans,
      backgroundImage: 'none',
    },
    header: {
      padding: '16px 24px',
      borderBottom: `1px solid ${t.border}`,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    iconDanger: {
      backgroundColor: rgba(p.red[500], 0.1),
      color: rgb(p.red[500]),
    },
    iconNeutral: {
      backgroundColor: rgba(p.green[500], 0.1),
      color: rgb(p.green[500]),
    },
    title: {
      margin: 0,
      fontSize: 18,
      lineHeight: '28px',
      fontWeight: 600,
      color: t.text.strong,
    },
    subtitle: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.muted,
    },
    body: {
      padding: '16px 24px',
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      fontSize: 14,
      lineHeight: '20px',
    },
    footer: {
      padding: '16px 24px',
      borderTop: `1px solid ${t.border}`,
      display: 'flex',
      justifyContent: 'flex-end',
      gap: 12,
    },
  };
});

export interface ButlerDialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  iconTone?: 'danger' | 'neutral';
  footer?: ReactNode;
  children?: ReactNode;
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg';
  /** Block backdrop and escape dismissal while an action is in flight. */
  busy?: boolean;
  'aria-labelledby'?: string;
}

/**
 * Console `Modal` composition (header / body / footer) on top of the MUI
 * `Dialog` for focus management and portal handling.
 */
export const ButlerDialog = ({
  open,
  onClose,
  title,
  subtitle,
  icon,
  iconTone = 'neutral',
  footer,
  children,
  maxWidth = 'sm',
  busy = false,
}: ButlerDialogProps) => {
  const classes = useStyles();
  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      maxWidth={maxWidth}
      fullWidth
      BackdropProps={{ className: classes.backdrop }}
      PaperProps={{ className: classes.paper }}
      disableEscapeKeyDown={busy}
    >
      <div className={classes.header}>
        {icon && (
          <div
            className={clsx(
              classes.iconWrap,
              iconTone === 'danger' ? classes.iconDanger : classes.iconNeutral,
            )}
          >
            {icon}
          </div>
        )}
        <div>
          <h2 className={classes.title}>{title}</h2>
          {subtitle && <p className={classes.subtitle}>{subtitle}</p>}
        </div>
      </div>
      <div className={classes.body}>{children}</div>
      {footer && <div className={classes.footer}>{footer}</div>}
    </Dialog>
  );
};
