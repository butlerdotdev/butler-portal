// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { butlerTokens, rgb, rgba } from '../../theme';
import { ButlerSpinner } from './ButlerStates';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  return {
    root: {
      border: `1px solid ${rgb(p.neutral[700])}`,
      borderRadius: t.radius.lg,
      overflow: 'hidden',
      fontFamily: t.fontSans,
    },
    header: {
      padding: '8px 12px',
      backgroundColor: rgb(p.neutral[800]),
      borderBottom: `1px solid ${rgb(p.neutral[700])}`,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.muted,
    },
    list: { maxHeight: 256, overflowY: 'auto' },
    details: {
      borderBottom: `1px solid ${t.border}`,
      '&:last-child': { borderBottom: 'none' },
    },
    summary: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      fontSize: 14,
      lineHeight: '20px',
      color: rgb(p.neutral[300]),
      cursor: 'pointer',
      listStyle: 'none',
      '&::-webkit-details-marker': { display: 'none' },
      '&:hover': { backgroundColor: t.inset },
    },
    fileIcon: { color: t.text.subtle, flexShrink: 0 },
    pre: {
      margin: 0,
      padding: '8px 12px',
      backgroundColor: t.surface,
      fontFamily: t.fontMono,
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.muted,
      overflowX: 'auto',
    },
    link: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      padding: 0,
      border: 'none',
      background: 'none',
      fontFamily: t.fontSans,
      fontSize: 14,
      lineHeight: '20px',
      color: rgb(p.green[400]),
      cursor: 'pointer',
      '&:hover': { color: rgb(p.green[300]) },
      '&:focus-visible': {
        outline: 'none',
        textDecoration: 'underline',
      },
      '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
    },
    linkMuted: {
      color: t.text.subtle,
      '&:hover': { color: rgb(p.neutral[300]) },
    },
    linkBlue: {
      color: rgb(p.blue[400]),
      '&:hover': { color: rgb(p.blue[300]) },
    },
    linkDanger: {
      color: rgb(p.red[400]),
      '&:hover': { color: rgb(p.red[300]) },
    },
    blob: {
      backgroundColor: rgba(p.neutral[950], 0.5),
    },
  };
});

const FileIcon = ({ className }: { className?: string }) => (
  <svg
    width={16}
    height={16}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    className={className}
    aria-hidden
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
    />
  </svg>
);

const EyeIcon = ({ off }: { off?: boolean }) => (
  <svg
    width={16}
    height={16}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    aria-hidden
  >
    {off ? (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
      />
    ) : (
      <>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
        />
      </>
    )}
  </svg>
);

export interface ButlerFilePreviewProps {
  files: Record<string, string>;
  title?: ReactNode;
  className?: string;
}

/** Console "Generated Files" block: bordered list of collapsible files. */
export const ButlerFilePreview = ({
  files,
  title = 'Generated Files',
  className,
}: ButlerFilePreviewProps) => {
  const classes = useStyles();
  return (
    <div className={clsx(classes.root, className)}>
      <div className={classes.header}>{title}</div>
      <div className={classes.list}>
        {Object.entries(files).map(([filename, content]) => (
          <details key={filename} className={classes.details}>
            <summary className={classes.summary}>
              <FileIcon className={classes.fileIcon} />
              {filename}
            </summary>
            <pre className={classes.pre}>{content}</pre>
          </details>
        ))}
      </div>
    </div>
  );
};

export interface ButlerPreviewToggleProps {
  open: boolean;
  loading?: boolean;
  disabled?: boolean;
  onToggle: () => void;
}

/** Console "Preview generated manifests" / "Hide generated manifests" link. */
export const ButlerPreviewToggle = ({
  open,
  loading,
  disabled,
  onToggle,
}: ButlerPreviewToggleProps) => {
  const classes = useStyles();
  return (
    <button
      type="button"
      className={classes.link}
      onClick={onToggle}
      disabled={loading || disabled}
    >
      {loading ? (
        <>
          <ButlerSpinner small />
          Loading preview...
        </>
      ) : (
        <>
          <EyeIcon off={open} />
          {open ? 'Hide generated manifests' : 'Preview generated manifests'}
        </>
      )}
    </button>
  );
};

export interface ButlerLinkButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: 'accent' | 'muted' | 'blue' | 'danger';
}

/** Console inline text button (`text-sm text-green-400 hover:text-green-300`). */
export const ButlerLinkButton = ({
  tone = 'accent',
  className,
  ...props
}: ButlerLinkButtonProps) => {
  const classes = useStyles();
  return (
    <button
      type="button"
      className={clsx(
        classes.link,
        tone === 'muted' && classes.linkMuted,
        tone === 'blue' && classes.linkBlue,
        tone === 'danger' && classes.linkDanger,
        className,
      )}
      {...props}
    />
  );
};

/** Console inset code block (`bg-neutral-900/50 rounded p-3`). */
export const ButlerCodeBlock = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => {
  const classes = useStyles();
  return (
    <pre className={clsx(classes.pre, classes.blob, className)}>{children}</pre>
  );
};
