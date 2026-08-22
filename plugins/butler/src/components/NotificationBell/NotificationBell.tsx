// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { butlerTokens, rgb } from '../../theme';
import { useClusterWatch } from '../../hooks/useClusterWatch';
import { useButlerRoutes } from '../../hooks/useButlerRoutes';
import type { ButlerRoutes } from '../../hooks/useButlerRoutes';
import type {
  ButlerNotification,
  NotificationSeverity,
} from '../../api/types/ws';
import { BellIcon } from '../ui/ButlerDashboardIcons';

// Same resource-to-route map as the console bell, restricted to the
// routes the plugin registers.
function navigationPath(
  n: ButlerNotification,
  routes: ButlerRoutes,
): string | null {
  const ref = n.resourceRef;
  if (!ref) return null;
  switch (ref.kind) {
    case 'TenantCluster':
      if (ref.team && ref.namespace) {
        return routes.clusterDetail({
          team: ref.team,
          namespace: ref.namespace,
          name: ref.name,
        });
      }
      return routes.adminClusters();
    case 'Team':
      return routes.adminTeamDetail({ teamName: ref.name });
    case 'ProviderConfig':
      return routes.adminProviders();
    case 'User':
      return routes.adminUsers();
    default:
      return null;
  }
}

export function formatRelativeTime(
  timestamp: string,
  now = Date.now(),
): string {
  const then = new Date(timestamp).getTime();
  if (Number.isNaN(then)) return '';
  const diffSeconds = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSeconds < 60) return 'just now';
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
  return `${Math.floor(diffSeconds / 86400)}d ago`;
}

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  return {
    container: { position: 'relative', fontFamily: t.fontSans },
    trigger: {
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 8,
      border: 'none',
      borderRadius: t.radius.lg,
      backgroundColor: 'transparent',
      color: t.text.muted,
      cursor: 'pointer',
      transition: 'color 150ms, background-color 150ms',
      '&:hover': {
        color: t.text.strong,
        backgroundColor: rgb(p.neutral[800]),
      },
      '&:focus-visible': {
        outline: 'none',
        boxShadow: `0 0 0 2px ${t.surface}, 0 0 0 4px ${t.accent}`,
      },
    },
    badge: {
      position: 'absolute',
      top: -2,
      right: -2,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 18,
      height: 18,
      padding: '0 4px',
      borderRadius: t.radius.pill,
      backgroundColor: rgb(p.red[500]),
      color: '#fff',
      fontSize: 10,
      lineHeight: '12px',
      fontWeight: 700,
    },
    panel: {
      position: 'absolute',
      right: 0,
      top: '100%',
      marginTop: 8,
      width: 384,
      maxWidth: 'calc(100vw - 32px)',
      backgroundColor: t.surface,
      border: `1px solid ${t.borderStrong}`,
      borderRadius: t.radius.lg,
      boxShadow:
        '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
      overflow: 'hidden',
      zIndex: theme.zIndex.modal + 1,
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 16px',
      borderBottom: `1px solid ${t.borderStrong}`,
    },
    title: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      fontWeight: 600,
      color: t.text.strong,
    },
    headerActions: { display: 'flex', alignItems: 'center', gap: 8 },
    textButton: {
      padding: 0,
      border: 'none',
      background: 'none',
      fontFamily: t.fontSans,
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.muted,
      cursor: 'pointer',
      transition: 'color 150ms',
      '&:hover': { color: t.text.secondary },
      '&:focus-visible': {
        outline: `2px solid ${t.accent}`,
        outlineOffset: 2,
        borderRadius: t.radius.sm,
      },
    },
    divider: { color: rgb(p.neutral[600]) },
    list: {
      maxHeight: 384,
      overflowY: 'auto',
      '& > * + *': { borderTop: `1px solid ${t.border}` },
    },
    item: {
      display: 'block',
      width: '100%',
      padding: '12px 16px',
      border: 'none',
      background: 'none',
      textAlign: 'left',
      fontFamily: t.fontSans,
      cursor: 'pointer',
      transition: 'background-color 150ms',
      '&:hover': { backgroundColor: rgb(p.neutral[800]) },
      '&:focus-visible': {
        outline: 'none',
        boxShadow: `inset 0 0 0 2px ${t.accent}`,
      },
    },
    itemUnread: { backgroundColor: t.inset },
    itemRow: { display: 'flex', alignItems: 'flex-start', gap: 12 },
    dot: {
      marginTop: 6,
      width: 8,
      height: 8,
      borderRadius: '50%',
      flexShrink: 0,
    },
    success: { backgroundColor: rgb(p.green[500]) },
    warning: { backgroundColor: rgb(p.amber[500]) },
    error: { backgroundColor: rgb(p.red[500]) },
    info: { backgroundColor: rgb(p.blue[500]) },
    itemBody: { flex: 1, minWidth: 0 },
    itemTitle: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      fontWeight: 500,
      color: t.text.strong,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    itemMessage: {
      margin: '2px 0 0',
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.muted,
      display: '-webkit-box',
      WebkitLineClamp: 2,
      WebkitBoxOrient: 'vertical',
      overflow: 'hidden',
    },
    itemTime: {
      margin: '4px 0 0',
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.subtle,
    },
    empty: {
      padding: '48px 16px',
      textAlign: 'center',
    },
    emptyIcon: { color: rgb(p.neutral[600]), marginBottom: 12 },
    emptyText: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.subtle,
    },
  };
});

const severityClass: Record<NotificationSeverity, string> = {
  success: 'success',
  warning: 'warning',
  error: 'error',
  info: 'info',
};

/** Console header `NotificationBell`: badge trigger and dropdown panel. */
export const NotificationBell = () => {
  const classes = useStyles();
  const {
    connected,
    notifications,
    unreadCount,
    markAllRead,
    clearNotifications,
  } = useClusterWatch();
  const routes = useButlerRoutes();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const handleItemClick = (n: ButlerNotification) => {
    const path = navigationPath(n, routes);
    if (path) navigate(path);
    setOpen(false);
  };

  const badgeLabel = unreadCount > 99 ? '99+' : String(unreadCount);
  const title = connected ? 'Notifications' : 'Notifications (disconnected)';

  return (
    <div ref={containerRef} className={classes.container}>
      <button
        type="button"
        className={classes.trigger}
        onClick={() => setOpen(prev => !prev)}
        title={title}
        aria-label={
          unreadCount > 0 ? `Notifications, ${unreadCount} unread` : title
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="notification-bell"
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className={classes.badge} data-testid="notification-badge">
            {badgeLabel}
          </span>
        )}
      </button>

      {open && (
        <div className={classes.panel} role="dialog" aria-label="Notifications">
          <div className={classes.header}>
            <h3 className={classes.title}>Notifications</h3>
            <div className={classes.headerActions}>
              {unreadCount > 0 && (
                <button
                  type="button"
                  className={classes.textButton}
                  onClick={markAllRead}
                >
                  Mark all read
                </button>
              )}
              {notifications.length > 0 && (
                <>
                  {unreadCount > 0 && (
                    <span className={classes.divider} aria-hidden>
                      |
                    </span>
                  )}
                  <button
                    type="button"
                    className={classes.textButton}
                    onClick={clearNotifications}
                  >
                    Clear
                  </button>
                </>
              )}
            </div>
          </div>

          {notifications.length > 0 ? (
            <div className={classes.list}>
              {notifications.map(n => (
                <button
                  type="button"
                  key={n.id}
                  className={clsx(classes.item, !n.read && classes.itemUnread)}
                  onClick={() => handleItemClick(n)}
                >
                  <div className={classes.itemRow}>
                    <span
                      className={clsx(
                        classes.dot,
                        classes[
                          severityClass[n.severity] as keyof typeof classes
                        ],
                      )}
                      aria-hidden
                    />
                    <div className={classes.itemBody}>
                      <p className={classes.itemTitle}>{n.title}</p>
                      <p className={classes.itemMessage}>{n.message}</p>
                      <p className={classes.itemTime}>
                        {formatRelativeTime(n.timestamp)}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className={classes.empty}>
              <BellIcon
                size={32}
                strokeWidth={1.5}
                className={classes.emptyIcon}
              />
              <p className={classes.emptyText}>No notifications</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
