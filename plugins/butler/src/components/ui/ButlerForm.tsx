// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useId } from 'react';
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { butlerTokens, rgb, rgba } from '../../theme';
import { ButlerSpinner } from './ButlerStates';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  const control = {
    width: '100%',
    boxSizing: 'border-box' as const,
    padding: '8px 12px',
    backgroundColor: rgb(p.neutral[800]),
    border: `1px solid ${rgb(p.neutral[700])}`,
    borderRadius: t.radius.lg,
    fontFamily: t.fontSans,
    fontSize: 14,
    lineHeight: '20px',
    color: rgb(p.neutral[200]),
    '&::placeholder': { color: rgb(p.neutral[500]) },
    '&:focus': {
      outline: 'none',
      borderColor: 'transparent',
      boxShadow: `0 0 0 2px ${t.accent}`,
    },
    '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
  };
  return {
    field: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      fontFamily: t.fontSans,
      minWidth: 0,
    },
    label: {
      fontSize: 14,
      lineHeight: '20px',
      fontWeight: 500,
      color: rgb(p.neutral[300]),
    },
    optional: {
      marginLeft: 4,
      fontWeight: 400,
      color: t.text.subtle,
    },
    help: {
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.subtle,
    },
    error: {
      fontSize: 12,
      lineHeight: '16px',
      color: rgb(p.red[400]),
    },
    select: {
      ...control,
      appearance: 'none',
      paddingRight: 32,
      cursor: 'pointer',
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23737373' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E\")",
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'right 10px center',
      backgroundSize: 16,
    },
    selectWrap: { position: 'relative' },
    selectSpinner: {
      position: 'absolute',
      right: 32,
      top: '50%',
      transform: 'translateY(-50%)',
    },
    textarea: {
      ...control,
      resize: 'vertical',
      minHeight: 120,
    },
    mono: { fontFamily: t.fontMono, fontSize: 13 },
    invalid: {
      borderColor: rgb(p.red[500]),
      '&:focus': { boxShadow: `0 0 0 2px ${rgb(p.red[500])}` },
    },
    checkRow: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      cursor: 'pointer',
      fontFamily: t.fontSans,
    },
    checkBox: {
      appearance: 'none',
      width: 16,
      height: 16,
      flexShrink: 0,
      marginTop: 2,
      borderRadius: 4,
      border: `1px solid ${rgb(p.neutral[600])}`,
      backgroundColor: rgb(p.neutral[800]),
      cursor: 'pointer',
      display: 'inline-grid',
      placeContent: 'center',
      '&:checked': {
        backgroundColor: rgb(p.green[500]),
        borderColor: rgb(p.green[500]),
      },
      '&:checked::after': {
        content: '""',
        width: 5,
        height: 9,
        border: 'solid #fff',
        borderWidth: '0 2px 2px 0',
        transform: 'translateY(-1px) rotate(45deg)',
      },
      '&:focus-visible': {
        outline: 'none',
        boxShadow: `0 0 0 2px ${t.surface}, 0 0 0 4px ${t.accent}`,
      },
      '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
    },
    checkLabel: {
      fontSize: 14,
      lineHeight: '20px',
      color: rgb(p.neutral[200]),
    },
    checkDesc: {
      margin: 0,
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.subtle,
    },
    checkCard: {
      padding: 12,
      borderRadius: t.radius.lg,
      border: `1px solid ${rgb(p.neutral[700])}`,
      backgroundColor: rgba(p.neutral[800], 0.3),
      transition: 'border-color 150ms, background-color 150ms',
      '&:hover': { borderColor: rgb(p.neutral[600]) },
    },
    checkCardChecked: {
      borderColor: rgba(p.green[500], 0.5),
      backgroundColor: rgba(p.green[500], 0.05),
    },
    grid2: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: 16,
    },
  };
});

export interface ButlerFieldProps {
  label?: ReactNode;
  optional?: boolean;
  help?: ReactNode;
  error?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}

/** Console form field: 14px/500 label, control, 12px help or error. */
export const ButlerField = ({
  label,
  optional,
  help,
  error,
  htmlFor,
  children,
  className,
}: ButlerFieldProps) => {
  const classes = useStyles();
  return (
    <div className={clsx(classes.field, className)}>
      {label && (
        <label className={classes.label} htmlFor={htmlFor}>
          {label}
          {optional && <span className={classes.optional}>(optional)</span>}
        </label>
      )}
      {children}
      {error ? (
        <span className={classes.error} role="alert">
          {error}
        </span>
      ) : (
        help && <span className={classes.help}>{help}</span>
      )}
    </div>
  );
};

export interface ButlerSelectProps
  extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  loading?: boolean;
}

/** Console native select on the neutral-800 field recipe. */
export const ButlerSelect = ({
  label,
  help,
  error,
  loading,
  className,
  id: givenId,
  children,
  ...props
}: ButlerSelectProps) => {
  const classes = useStyles();
  const generatedId = useId();
  const id = givenId ?? generatedId;
  const select = (
    <div className={classes.selectWrap}>
      <select
        id={id}
        className={clsx(classes.select, error && classes.invalid, className)}
        {...props}
      >
        {children}
      </select>
      {loading && (
        <span className={classes.selectSpinner}>
          <ButlerSpinner small />
        </span>
      )}
    </div>
  );
  if (!label && !help && !error) return select;
  return (
    <ButlerField label={label} help={help} error={error} htmlFor={id}>
      {select}
    </ButlerField>
  );
};

export interface ButlerTextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  mono?: boolean;
}

/** Console textarea (YAML editors use the mono face). */
export const ButlerTextarea = ({
  label,
  help,
  error,
  mono,
  className,
  id: givenId,
  ...props
}: ButlerTextareaProps) => {
  const classes = useStyles();
  const generatedId = useId();
  const id = givenId ?? generatedId;
  const area = (
    <textarea
      id={id}
      className={clsx(
        classes.textarea,
        mono && classes.mono,
        error && classes.invalid,
        className,
      )}
      {...props}
    />
  );
  if (!label && !help && !error) return area;
  return (
    <ButlerField label={label} help={help} error={error} htmlFor={id}>
      {area}
    </ButlerField>
  );
};

export interface ButlerCheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  description?: ReactNode;
  /** Console option-card variant (bordered, green tint when checked). */
  card?: boolean;
}

/** Console checkbox with label and 12px description. */
export const ButlerCheckbox = ({
  label,
  description,
  card,
  className,
  checked,
  ...props
}: ButlerCheckboxProps) => {
  const classes = useStyles();
  return (
    <label
      className={clsx(
        classes.checkRow,
        card && classes.checkCard,
        card && checked && classes.checkCardChecked,
        className,
      )}
    >
      <input
        type="checkbox"
        className={classes.checkBox}
        checked={checked}
        {...props}
      />
      <span>
        <span className={classes.checkLabel}>{label}</span>
        {description && <p className={classes.checkDesc}>{description}</p>}
      </span>
    </label>
  );
};

/** Console `grid grid-cols-2 gap-4` form row. */
export const ButlerFormRow = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => {
  const classes = useStyles();
  return <div className={clsx(classes.grid2, className)}>{children}</div>;
};
