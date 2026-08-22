// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import React, { useState } from 'react';
import {
  Badge,
  Box,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import NotificationsIcon from '@material-ui/icons/Notifications';
import { useClusterWatch } from '../../hooks/useClusterWatch';
import type { NotificationSeverity } from '../../api/types/ws';

const useStyles = makeStyles(theme => ({
  menuPaper: {
    width: 360,
    maxHeight: 480,
  },
  menuHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing(1, 2),
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  item: {
    display: 'block',
    whiteSpace: 'normal',
    borderLeft: '3px solid transparent',
    padding: theme.spacing(1, 2),
  },
  unread: {
    backgroundColor: theme.palette.action.hover,
  },
  itemTitle: {
    fontWeight: 600,
  },
  itemTime: {
    color: theme.palette.text.secondary,
    fontSize: '0.7rem',
  },
  empty: {
    padding: theme.spacing(3, 2),
    textAlign: 'center',
    color: theme.palette.text.secondary,
  },
  bell: {
    color: 'inherit',
  },
}));

const severityColor = (severity: NotificationSeverity): string => {
  switch (severity) {
    case 'success':
      return '#4caf50';
    case 'warning':
      return '#ff9800';
    case 'error':
      return '#f44336';
    case 'info':
    default:
      return '#2196f3';
  }
};

const formatTime = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export const NotificationBell = () => {
  const classes = useStyles();
  const { connected, notifications, unreadCount, markAllRead, clearNotifications } =
    useClusterWatch();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const handleOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => setAnchorEl(null);

  return (
    <>
      <Tooltip title={connected ? 'Notifications' : 'Notifications (disconnected)'}>
        <IconButton
          aria-label="notifications"
          className={classes.bell}
          onClick={handleOpen}
          data-testid="notification-bell"
        >
          <Badge
            badgeContent={unreadCount}
            color="secondary"
            invisible={unreadCount === 0}
            data-testid="notification-badge"
          >
            <NotificationsIcon />
          </Badge>
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        classes={{ paper: classes.menuPaper }}
        getContentAnchorEl={null}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box className={classes.menuHeader}>
          <Typography variant="subtitle2">Notifications</Typography>
          <Box>
            <Button
              size="small"
              onClick={markAllRead}
              disabled={unreadCount === 0}
            >
              Mark all read
            </Button>
            <Button
              size="small"
              onClick={clearNotifications}
              disabled={notifications.length === 0}
            >
              Clear
            </Button>
          </Box>
        </Box>
        {notifications.length === 0 && (
          <Typography variant="body2" className={classes.empty}>
            No notifications yet
          </Typography>
        )}
        {notifications.map(n => (
          <MenuItem
            key={n.id}
            className={`${classes.item} ${n.read ? '' : classes.unread}`}
            style={{ borderLeftColor: severityColor(n.severity) }}
            disableRipple
          >
            <Typography variant="body2" className={classes.itemTitle}>
              {n.title}
            </Typography>
            <Typography variant="body2">{n.message}</Typography>
            <Typography className={classes.itemTime}>
              {formatTime(n.timestamp)}
            </Typography>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};
