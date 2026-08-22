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
    selectWrap: { position: 'relative', width: '100%' },
    select: {
      ...control,
      appearance: 'none',
      paddingRight: 36,
      cursor: 'pointer',
      '& option': {
        backgroundColor: rgb(p.neutral[800]),
        color: rgb(p.neutral[200]),
      },
    },
    selectIcon: {
      position: 'absolute',
      right: 12,
      top: '50%',
      transform: 'translateY(-50%)',
      color: t.text.subtle,
      pointerEvents: 'none',
    },
    textarea: {
      ...control,
      resize: 'vertical',
      display: 'block',
    },
    mono: { fontFamily: t.fontMono },
    noResize: { resize: 'none' },
    checkboxLabel: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      cursor: 'pointer',
      fontFamily: t.fontSans,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.muted,
    },
    checkbox: {
      width: 16,
      height: 16,
      margin: 0,
      accentColor: t.accent,
      cursor: 'pointer',
      '&:focus-visible': {
        outline: 'none',
        boxShadow: `0 0 0 2px ${t.surface}, 0 0 0 4px ${t.accent}`,
        borderRadius: t.radius.sm,
      },
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

export interface ButlerSelectOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

export interface ButlerSelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  options: ButlerSelectOption[];
  placeholder?: string;
}

/**
 * Console native select (`bg-neutral-800 border-neutral-700 rounded-lg`
 * with the green focus ring) and a chevron drawn over the control.
 */
export const ButlerSelect = ({
  options,
  placeholder,
  className,
  ...props
}: ButlerSelectProps) => {
  const classes = useStyles();
  return (
    <div className={clsx(classes.selectWrap, className)}>
      <select className={classes.select} {...props}>
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
      </select>
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
};

export interface ButlerTextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Monospace face for kubeconfig / PEM / JSON content. */
  mono?: boolean;
  /** Disable the vertical resize handle (console `resize-none`). */
  fixed?: boolean;
}

/** Console textarea with the same surface and focus ring as inputs. */
export const ButlerTextarea = ({
  mono,
  fixed,
  className,
  ...props
}: ButlerTextareaProps) => {
  const classes = useStyles();
  return (
    <textarea
      className={clsx(
        classes.textarea,
        mono && classes.mono,
        fixed && classes.noResize,
        className,
      )}
      {...props}
    />
  );
};

export interface ButlerCheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
}

/** Console checkbox row: 16px box with a 14px muted label. */
export const ButlerCheckbox = ({
  label,
  className,
  id: givenId,
  ...props
}: ButlerCheckboxProps) => {
  const classes = useStyles();
  const generatedId = useId();
  const id = givenId ?? generatedId;
  return (
    <label className={clsx(classes.checkboxLabel, className)} htmlFor={id}>
      <input id={id} type="checkbox" className={classes.checkbox} {...props} />
      <span>{label}</span>
    </label>
  );
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
