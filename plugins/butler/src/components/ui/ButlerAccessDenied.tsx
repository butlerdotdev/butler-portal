// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useNavigate } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import { butlerTokens, rgb, rgba } from '../../theme';
import { ButlerButton } from './ButlerButton';
import { ButlerCard } from './ButlerCard';
import { ArrowLeftIcon, LockIcon } from './icons';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  return {
    wrap: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 400,
    },
    card: {
      width: '100%',
      maxWidth: 448,
      padding: 32,
      textAlign: 'center',
    },
    icon: {
      width: 64,
      height: 64,
      margin: '0 auto 24px',
      borderRadius: '50%',
      backgroundColor: rgba(p.red[500], 0.1),
      color: rgb(p.red[500]),
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      margin: '0 0 8px',
      fontSize: 20,
      lineHeight: '28px',
      fontWeight: 600,
      color: t.text.strong,
    },
    resource: {
      margin: '0 0 16px',
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.subtle,
      '& span': { color: rgb(p.neutral[300]) },
    },
    message: {
      margin: '0 0 24px',
      fontSize: 16,
      lineHeight: '24px',
      color: t.text.muted,
    },
    actions: {
      display: 'flex',
      justifyContent: 'center',
      gap: 12,
      flexWrap: 'wrap',
    },
    help: {
      margin: '24px 0 0',
      fontSize: 12,
      lineHeight: '16px',
      color: rgb(p.neutral[600]),
    },
  };
});

export interface ButlerAccessDeniedProps {
  message?: string;
  resourceType?: string;
  resourceName?: string;
  /** Target of the secondary "Go Home" action. */
  homeTo?: string;
}

/**
 * Console `AccessDenied` card: red lock tile, title, copy, Go Back and
 * Go Home actions.
 */
export const ButlerAccessDenied = ({
  message,
  resourceType = 'resource',
  resourceName,
  homeTo,
}: ButlerAccessDeniedProps) => {
  const classes = useStyles();
  const navigate = useNavigate();
  return (
    <div className={classes.wrap}>
      <ButlerCard flush className={classes.card} role="alert">
        <div className={classes.icon}>
          <LockIcon />
        </div>
        <h2 className={classes.title}>Access Denied</h2>
        {resourceName && (
          <p className={classes.resource}>
            {resourceType}: <span>{resourceName}</span>
          </p>
        )}
        <p className={classes.message}>
          {message || `You don't have permission to view this ${resourceType}.`}
        </p>
        <div className={classes.actions}>
          <ButlerButton
            variant="secondary"
            startIcon={<ArrowLeftIcon />}
            onClick={() => navigate(-1)}
          >
            Go Back
          </ButlerButton>
          {homeTo && (
            <ButlerButton variant="secondary" onClick={() => navigate(homeTo)}>
              Go Home
            </ButlerButton>
          )}
        </div>
        <p className={classes.help}>
          If you believe you should have access, contact your team
          administrator.
        </p>
      </ButlerCard>
    </div>
  );
};
