// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useId, useState } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { butlerTokens, rgb, rgba } from '../../theme';
import { ChevronRightIcon } from './formIcons';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  return {
    section: {
      fontFamily: t.fontSans,
      color: t.text.primary,
    },
    heading: {
      margin: '0 0 16px',
      fontSize: 18,
      lineHeight: '28px',
      fontWeight: 500,
      color: t.text.primary,
    },
    headingUppercase: {
      fontSize: 14,
      lineHeight: '20px',
      letterSpacing: '0.025em',
      textTransform: 'uppercase',
      color: t.text.muted,
    },
    headingRow: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 16,
      '& > $heading': { margin: 0 },
    },
    toggle: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      width: '100%',
      padding: 0,
      border: 'none',
      background: 'none',
      textAlign: 'left',
      cursor: 'pointer',
      fontFamily: t.fontSans,
      color: t.text.primary,
      '& > $heading': { margin: 0 },
      '&:focus-visible': {
        outline: 'none',
        borderRadius: t.radius.sm,
        boxShadow: `0 0 0 2px ${t.accent}`,
      },
    },
    chevron: {
      color: t.text.muted,
      transition: 'transform 150ms',
      flexShrink: 0,
    },
    chevronOpen: { transform: 'rotate(90deg)' },
    optional: {
      marginLeft: 8,
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.subtle,
    },
    description: {
      margin: '-8px 0 16px',
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.muted,
    },
    body: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
    },
    bodyIndented: {
      marginTop: 16,
      paddingLeft: 24,
    },
    bodyBordered: {
      borderLeft: `1px solid ${t.border}`,
    },
    field: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      minWidth: 0,
      fontFamily: t.fontSans,
    },
    label: {
      fontSize: 14,
      lineHeight: '20px',
      fontWeight: 500,
      color: t.text.muted,
    },
    labelRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    help: {
      margin: 0,
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.subtle,
    },
    helpBefore: { marginBottom: 4 },
    error: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: rgb(p.red[400]),
    },
    footer: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: 12,
      paddingTop: 16,
      borderTop: `1px solid ${t.border}`,
    },
    footerStart: { justifyContent: 'flex-start' },
    message: {
      margin: 0,
      padding: 12,
      borderRadius: t.radius.lg,
      fontFamily: t.fontSans,
      fontSize: 14,
      lineHeight: '20px',
      border: '1px solid transparent',
      overflowWrap: 'anywhere',
    },
    messageDanger: {
      backgroundColor: rgba(p.red[500], 0.1),
      borderColor: rgba(p.red[500], 0.2),
      color: rgb(p.red[400]),
    },
    messageSuccess: {
      backgroundColor: rgba(p.green[500], 0.1),
      borderColor: rgba(p.green[500], 0.2),
      color: rgb(p.green[400]),
    },
    messageInfo: {
      padding: 16,
      backgroundColor: rgba(p.blue[500], 0.05),
      borderColor: rgba(p.blue[500], 0.2),
      color: rgb(p.blue[400]),
    },
    messageRow: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      '& > svg': { flexShrink: 0 },
    },
    inset: {
      padding: 16,
      borderRadius: t.radius.lg,
      border: `1px solid ${t.borderStrong}`,
      backgroundColor: t.inset,
      fontFamily: t.fontSans,
    },
    insetRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
    },
    insetTitle: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      fontWeight: 500,
      color: t.text.secondary,
    },
    insetText: {
      margin: 0,
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.subtle,
    },
    insetChildren: { marginTop: 12 },
  };
});

export interface ButlerFormSectionProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Section heading. Console form cards use 18px/500 primary text. */
  title: ReactNode;
  /** Uppercase tracked 14px variant (console IdP create form). */
  uppercase?: boolean;
  description?: ReactNode;
  /** Render the heading as a disclosure toggle; body hidden until opened. */
  collapsible?: boolean;
  defaultOpen?: boolean;
  /** Small "Optional" suffix after the heading. */
  optional?: boolean;
  /** Draw the console's 1px left border on the indented body. */
  bordered?: boolean;
  /** Vertical gap between children (default 16). */
  gap?: number;
}

/**
 * Console create-form section: heading followed by a 16px stack of
 * fields. Collapsible sections mirror the "Network Configuration /
 * Scope / Limits" disclosure pattern (chevron rotates, body indents).
 */
export const ButlerFormSection = ({
  title,
  uppercase = false,
  description,
  collapsible = false,
  defaultOpen = false,
  optional = false,
  bordered = false,
  gap = 16,
  className,
  children,
  ...props
}: ButlerFormSectionProps) => {
  const classes = useStyles();
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const headingClass = clsx(
    classes.heading,
    uppercase && classes.headingUppercase,
  );

  if (collapsible) {
    return (
      <section className={clsx(classes.section, className)} {...props}>
        <button
          type="button"
          className={classes.toggle}
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen(o => !o)}
        >
          <ChevronRightIcon
            className={clsx(classes.chevron, open && classes.chevronOpen)}
          />
          <h3 className={headingClass}>{title}</h3>
          {optional && <span className={classes.optional}>Optional</span>}
        </button>
        {open && (
          <div
            id={bodyId}
            className={clsx(
              classes.body,
              classes.bodyIndented,
              bordered && classes.bodyBordered,
            )}
            style={{ gap }}
          >
            {children}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className={clsx(classes.section, className)} {...props}>
      {optional ? (
        <div className={classes.headingRow}>
          <h3 className={headingClass}>{title}</h3>
          <span className={classes.optional}>Optional</span>
        </div>
      ) : (
        <h3 className={headingClass}>{title}</h3>
      )}
      {description && <p className={classes.description}>{description}</p>}
      <div className={classes.body} style={{ gap }}>
        {children}
      </div>
    </section>
  );
};

export interface ButlerFieldProps {
  label: ReactNode;
  /** The control. Pass `htmlFor` so the label targets it. */
  children: ReactNode;
  htmlFor?: string;
  required?: boolean;
  /** 12px subtle copy under the control (console `text-xs neutral-500`). */
  help?: ReactNode;
  /** Place the help copy between the label and the control. */
  helpAbove?: boolean;
  /** 14px red-400 error copy, replaces help when set. */
  error?: ReactNode;
  /** Rendered at the right edge of the label row (e.g. "+ Add"). */
  labelAction?: ReactNode;
  className?: string;
}

/**
 * Console form field: 14px/500 muted label, control, 12px help, red error.
 * Required fields get the console's trailing asterisk.
 */
export const ButlerField = ({
  label,
  children,
  htmlFor,
  required,
  help,
  helpAbove = false,
  error,
  labelAction,
  className,
}: ButlerFieldProps) => {
  const classes = useStyles();
  const labelEl = (
    <label className={classes.label} htmlFor={htmlFor}>
      {label}
      {required && ' *'}
    </label>
  );
  return (
    <div className={clsx(classes.field, className)}>
      {labelAction ? (
        <div className={classes.labelRow}>
          {labelEl}
          {labelAction}
        </div>
      ) : (
        labelEl
      )}
      {help && helpAbove && !error && (
        <p className={clsx(classes.help, classes.helpBefore)}>{help}</p>
      )}
      {children}
      {error ? (
        <p className={classes.error} role="alert">
          {error}
        </p>
      ) : (
        help && !helpAbove && <p className={classes.help}>{help}</p>
      )}
    </div>
  );
};

/** Console form footer: right-aligned buttons above a top border. */
export const ButlerFormFooter = ({
  children,
  align = 'end',
  className,
}: {
  children: ReactNode;
  align?: 'start' | 'end';
  className?: string;
}) => {
  const classes = useStyles();
  return (
    <div
      className={clsx(
        classes.footer,
        align === 'start' && classes.footerStart,
        className,
      )}
    >
      {children}
    </div>
  );
};

export interface ButlerFormMessageProps {
  tone?: 'danger' | 'success' | 'info';
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Console tinted message block: red error (`bg-red-500/10`), green
 * success, or the blue "Note" info box used on create forms.
 */
export const ButlerFormMessage = ({
  tone = 'danger',
  icon,
  children,
  className,
}: ButlerFormMessageProps) => {
  const classes = useStyles();
  const toneClass = {
    danger: classes.messageDanger,
    success: classes.messageSuccess,
    info: classes.messageInfo,
  }[tone];
  return (
    <div
      className={clsx(classes.message, toneClass, className)}
      role={
        tone === 'danger' ? 'alert' : tone === 'success' ? 'status' : 'note'
      }
    >
      {icon ? (
        <div className={classes.messageRow}>
          {icon}
          <span>{children}</span>
        </div>
      ) : (
        children
      )}
    </div>
  );
};

export interface ButlerInsetPanelProps {
  title: ReactNode;
  description?: ReactNode;
  /** Right-aligned control (console "Test Connection" button). */
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/**
 * Console `p-4 bg-neutral-800/50 border border-neutral-700 rounded-lg`
 * block with a title/description on the left and an action on the right.
 */
export const ButlerInsetPanel = ({
  title,
  description,
  action,
  children,
  className,
}: ButlerInsetPanelProps) => {
  const classes = useStyles();
  return (
    <div className={clsx(classes.inset, className)}>
      <div className={classes.insetRow}>
        <div>
          <p className={classes.insetTitle}>{title}</p>
          {description && <p className={classes.insetText}>{description}</p>}
        </div>
        {action}
      </div>
      {children && <div className={classes.insetChildren}>{children}</div>}
    </div>
  );
};
