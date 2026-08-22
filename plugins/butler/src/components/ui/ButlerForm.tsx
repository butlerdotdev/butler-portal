// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useId } from 'react';
import type {
  ChangeEvent,
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
    labelRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    optional: {
      marginLeft: 4,
      fontWeight: 400,
      color: t.text.subtle,
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
    select: {
      ...control,
      appearance: 'none',
      paddingRight: 32,
      cursor: 'pointer',
      '& option': {
        backgroundColor: rgb(p.neutral[800]),
        color: rgb(p.neutral[200]),
      },
    },
    selectWrap: { position: 'relative' },
    selectIcon: {
      position: 'absolute',
      right: 10,
      top: '50%',
      transform: 'translateY(-50%)',
      color: t.text.subtle,
      pointerEvents: 'none',
    },
    selectSpinner: {
      position: 'absolute',
      right: 32,
      top: '50%',
      transform: 'translateY(-50%)',
    },
    textarea: {
      ...control,
      resize: 'vertical',
      display: 'block',
      minHeight: 120,
    },
    // Console mono controls are `font-mono text-sm`.
    mono: { fontFamily: t.fontMono, fontSize: 14 },
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
    segmented: {
      display: 'flex',
      gap: 8,
    },
    segment: {
      flex: 1,
      padding: '8px 16px',
      borderRadius: t.radius.lg,
      border: `1px solid ${rgb(p.neutral[700])}`,
      backgroundColor: rgb(p.neutral[800]),
      color: t.text.muted,
      fontFamily: t.fontSans,
      fontSize: 14,
      lineHeight: '20px',
      fontWeight: 500,
      cursor: 'pointer',
      transition: 'background-color 150ms, color 150ms, border-color 150ms',
      '&:hover': { borderColor: rgb(p.neutral[600]) },
      '&:focus-visible': {
        outline: 'none',
        boxShadow: `0 0 0 2px ${t.surface}, 0 0 0 4px ${t.accent}`,
      },
    },
    segmentActive: {
      backgroundColor: rgba(p.green[500], 0.2),
      color: rgb(p.green[400]),
      borderColor: rgb(p.green[500]),
      '&:hover': { borderColor: rgb(p.green[500]) },
    },
    upload: {
      display: 'block',
      width: '100%',
      boxSizing: 'border-box',
      padding: '8px 16px',
      borderRadius: t.radius.lg,
      backgroundColor: rgb(p.neutral[700]),
      color: t.text.secondary,
      fontFamily: t.fontSans,
      fontSize: 14,
      lineHeight: '20px',
      textAlign: 'center',
      cursor: 'pointer',
      transition: 'background-color 150ms',
      '&:hover': { backgroundColor: rgb(p.neutral[600]) },
      '&:focus-within': {
        boxShadow: `0 0 0 2px ${t.surface}, 0 0 0 4px ${t.accent}`,
      },
    },
    uploadLink: {
      display: 'inline-block',
      marginTop: 4,
      fontFamily: t.fontSans,
      fontSize: 12,
      lineHeight: '16px',
      color: rgb(p.green[400]),
      cursor: 'pointer',
      '&:hover': { color: rgb(p.green[300]) },
    },
    hiddenInput: {
      position: 'absolute',
      width: 1,
      height: 1,
      opacity: 0,
      overflow: 'hidden',
      pointerEvents: 'none',
    },
  };
});

export interface ButlerFieldProps {
  /** 14px/500 neutral-300 label above the control. */
  label?: ReactNode;
  /** The control. Pass `htmlFor` so the label targets it. */
  children: ReactNode;
  htmlFor?: string;
  /** Console's trailing asterisk on required fields. */
  required?: boolean;
  /** Console's "(optional)" suffix. */
  optional?: boolean;
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
 * Console form field: 14px/500 label, control, 12px help or 14px red
 * error. Required fields get the console's trailing asterisk, optional
 * ones its "(optional)" marker.
 */
export const ButlerField = ({
  label,
  children,
  htmlFor,
  required,
  optional,
  help,
  helpAbove = false,
  error,
  labelAction,
  className,
}: ButlerFieldProps) => {
  const classes = useStyles();
  const labelEl = label && (
    <label className={classes.label} htmlFor={htmlFor}>
      {label}
      {required && ' *'}
      {optional && <span className={classes.optional}>(optional)</span>}
    </label>
  );
  return (
    <div className={clsx(classes.field, className)}>
      {labelEl &&
        (labelAction ? (
          <div className={classes.labelRow}>
            {labelEl}
            {labelAction}
          </div>
        ) : (
          labelEl
        ))}
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

export interface ButlerSelectOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

export interface ButlerSelectProps
  extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  loading?: boolean;
  /** Options to render. Omit and pass `children` to build them by hand. */
  options?: ButlerSelectOption[];
  /** Leading disabled option, only with `options`. */
  placeholder?: string;
}

/**
 * Console native select on the neutral-800 field recipe, with a chevron
 * drawn over the control. Takes either an `options` array or `children`.
 */
export const ButlerSelect = ({
  label,
  help,
  error,
  loading,
  options,
  placeholder,
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
        {options ? (
          <>
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map(o => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ))}
          </>
        ) : (
          children
        )}
      </select>
      {loading && (
        <span className={classes.selectSpinner}>
          <ButlerSpinner small />
        </span>
      )}
      <svg
        className={classes.selectIcon}
        width={16}
        height={16}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 9l-7 7-7-7"
        />
      </svg>
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
  /** Monospace face for kubeconfig / PEM / YAML / JSON content. */
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

export interface ButlerSegmentedOption<V extends string> {
  value: V;
  label: ReactNode;
}

export interface ButlerSegmentedProps<V extends string> {
  value: V;
  onChange: (value: V) => void;
  options: ButlerSegmentedOption<V>[];
  'aria-label'?: string;
  className?: string;
}

/**
 * Console toggle group (Proxmox auth method, network mode): equal-width
 * buttons, active one tinted green with a green border.
 */
export function ButlerSegmented<V extends string>({
  value,
  onChange,
  options,
  className,
  ...props
}: ButlerSegmentedProps<V>) {
  const classes = useStyles();
  return (
    <div
      role="radiogroup"
      aria-label={props['aria-label']}
      className={clsx(classes.segmented, className)}
    >
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={clsx(
            classes.segment,
            o.value === value && classes.segmentActive,
          )}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export interface ButlerFileButtonProps {
  /** Called with the file's text content once read. */
  onText: (text: string) => void;
  accept?: string;
  children: ReactNode;
  /** `button` is the full-width neutral-700 block; `link` the green text. */
  variant?: 'button' | 'link';
  className?: string;
}

/**
 * Console file upload trigger: a hidden `<input type="file">` read as
 * text, styled either as the "Upload kubeconfig file" block or the
 * "Upload .pem or .crt file" green link.
 */
export const ButlerFileButton = ({
  onText,
  accept,
  children,
  variant = 'button',
  className,
}: ButlerFileButtonProps) => {
  const classes = useStyles();
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => onText(String(ev.target?.result ?? ''));
    reader.readAsText(file);
    e.target.value = '';
  };
  return (
    <label
      className={clsx(
        variant === 'button' ? classes.upload : classes.uploadLink,
        className,
      )}
    >
      <input
        type="file"
        accept={accept}
        className={classes.hiddenInput}
        onChange={handleChange}
      />
      {children}
    </label>
  );
};
