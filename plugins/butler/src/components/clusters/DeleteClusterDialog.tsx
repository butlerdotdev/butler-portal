// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { butlerTokens, rgb, rgba } from '../../theme';
import {
  AlertTriangleIcon,
  ButlerButton,
  ButlerDialog,
  ButlerInput,
} from '../ui';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  return {
    callout: {
      padding: 16,
      borderRadius: t.radius.lg,
      border: `1px solid ${rgba(p.red[500], 0.2)}`,
      backgroundColor: rgba(p.red[500], 0.05),
    },
    text: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: rgb(p.neutral[300]),
    },
    name: {
      fontFamily: t.fontMono,
      fontWeight: 600,
      color: rgb(p.red[400]),
    },
    namespace: {
      fontFamily: t.fontMono,
      color: t.text.muted,
    },
    list: {
      margin: '12px 0 0',
      padding: 0,
      listStyle: 'none',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.muted,
    },
    item: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      backgroundColor: rgb(p.red[500]),
      flexShrink: 0,
    },
    confirmName: {
      fontFamily: t.fontMono,
      color: rgb(p.neutral[200]),
    },
    error: {
      margin: 0,
      padding: 12,
      borderRadius: t.radius.lg,
      border: `1px solid ${rgba(p.red[500], 0.2)}`,
      backgroundColor: rgba(p.red[500], 0.1),
      fontSize: 14,
      color: rgb(p.red[400]),
    },
  };
});

export interface DeleteClusterDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  clusterName: string;
  clusterNamespace: string;
  workerCount: number;
}

/**
 * Console `DeleteClusterModal`: destructive callout, consequences list,
 * type-to-confirm, Enter submits.
 */
export const DeleteClusterDialog = ({
  open,
  onClose,
  onConfirm,
  clusterName,
  clusterNamespace,
  workerCount,
}: DeleteClusterDialogProps) => {
  const classes = useStyles();
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = confirmText === clusterName;

  const close = () => {
    setConfirmText('');
    setError(null);
    setDeleting(false);
    onClose();
  };

  const confirm = async () => {
    if (!confirmed || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await onConfirm();
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete cluster');
      setDeleting(false);
    }
  };

  return (
    <ButlerDialog
      open={open}
      onClose={close}
      busy={deleting}
      maxWidth="xs"
      title="Delete Cluster"
      subtitle="This action cannot be undone"
      icon={<AlertTriangleIcon />}
      iconTone="danger"
      footer={
        <>
          <ButlerButton variant="secondary" onClick={close} disabled={deleting}>
            Cancel
          </ButlerButton>
          <ButlerButton
            variant="danger"
            onClick={confirm}
            disabled={!confirmed || deleting}
          >
            {deleting ? 'Deleting...' : 'Delete Cluster'}
          </ButlerButton>
        </>
      }
    >
      <div className={classes.callout}>
        <p className={classes.text}>
          You are about to delete cluster{' '}
          <span className={classes.name}>{clusterName}</span> from namespace{' '}
          <span className={classes.namespace}>{clusterNamespace}</span>.
        </p>
        <ul className={classes.list}>
          <li className={classes.item}>
            <span className={classes.dot} />
            {workerCount} worker node{workerCount === 1 ? '' : 's'} will be
            terminated
          </li>
          <li className={classes.item}>
            <span className={classes.dot} />
            All workloads will be destroyed
          </li>
          <li className={classes.item}>
            <span className={classes.dot} />
            Persistent volumes will be deleted
          </li>
        </ul>
      </div>
      <ButlerInput
        id="delete-cluster-confirm"
        label={
          <>
            Type <span className={classes.confirmName}>{clusterName}</span> to
            confirm
          </>
        }
        tone="danger"
        value={confirmText}
        onChange={e => setConfirmText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') confirm();
        }}
        placeholder={clusterName}
        disabled={deleting}
        autoFocus
        autoComplete="off"
      />
      {error && (
        <p className={classes.error} role="alert">
          {error}
        </p>
      )}
    </ButlerDialog>
  );
};
