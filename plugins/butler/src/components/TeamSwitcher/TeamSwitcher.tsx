// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useRef, useEffect } from 'react';
import { Typography, Box } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import SecurityIcon from '@material-ui/icons/Security';
import BusinessIcon from '@material-ui/icons/Business';
import CheckIcon from '@material-ui/icons/Check';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import { useTeamContext } from '../../hooks/useTeamContext';

// Role color helpers
const getRoleBadgeStyle = (role: string) => {
  switch (role) {
    case 'admin':
      return {
        backgroundColor: 'rgba(139, 92, 246, 0.2)',
        color: '#a78bfa',
      };
    case 'operator':
      return {
        backgroundColor: 'rgba(20, 184, 166, 0.2)',
        color: '#2dd4bf',
      };
    default:
      return {
        backgroundColor: 'rgba(34, 197, 94, 0.2)',
        color: '#4ade80',
      };
  }
};

const useStyles = makeStyles(theme => ({
  container: {
    position: 'relative',
  },
  // Team mode trigger - neutral
  trigger: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    fontSize: '0.875rem',
    fontWeight: 500,
    borderRadius: 8,
    border: '1px solid #404040',
    backgroundColor: '#262626',
    color: '#e5e5e5',
    cursor: 'pointer',
    transition: 'background-color 150ms, border-color 150ms',
    outline: 'none',
    '&:hover': {
      backgroundColor: '#404040',
    },
  },
  // Platform admin mode trigger - violet
  triggerAdmin: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    fontSize: '0.875rem',
    fontWeight: 500,
    borderRadius: 8,
    border: '1px solid rgba(139, 92, 246, 0.3)',
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    color: '#c4b5fd',
    cursor: 'pointer',
    transition: 'background-color 150ms, border-color 150ms',
    outline: 'none',
    '&:hover': {
      backgroundColor: 'rgba(139, 92, 246, 0.3)',
    },
  },
  // Team admin mode trigger - teal
  triggerTeamAdmin: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    fontSize: '0.875rem',
    fontWeight: 500,
    borderRadius: 8,
    border: '1px solid rgba(20, 184, 166, 0.3)',
    backgroundColor: 'rgba(20, 184, 166, 0.2)',
    color: '#5eead4',
    cursor: 'pointer',
    transition: 'background-color 150ms, border-color 150ms',
    outline: 'none',
    '&:hover': {
      backgroundColor: 'rgba(20, 184, 166, 0.3)',
    },
  },
  triggerIcon: {
    fontSize: 16,
  },
  triggerLabel: {
    maxWidth: 160,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  expandIcon: {
    fontSize: 16,
    transition: 'transform 150ms',
  },
  expandIconOpen: {
    transform: 'rotate(180deg)',
  },
  // Dropdown
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    right: 0,
    width: 280,
    backgroundColor: '#171717',
    border: '1px solid #404040',
    borderRadius: 8,
    boxShadow:
      '0 20px 25px -5px rgba(0,0,0,0.5), 0 8px 10px -6px rgba(0,0,0,0.5)',
    overflow: 'hidden',
    zIndex: theme.zIndex.modal + 1,
  },
  // Admin section
  adminSection: {
    padding: 8,
    borderBottom: '1px solid #262626',
  },
  adminOption: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    padding: '8px 12px',
    border: 'none',
    borderRadius: 6,
    fontSize: '0.875rem',
    cursor: 'pointer',
    transition: 'background-color 150ms',
    outline: 'none',
    backgroundColor: 'transparent',
    color: '#d4d4d4',
    '&:hover': {
      backgroundColor: '#262626',
    },
  },
  adminOptionActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    color: '#c4b5fd',
    '&:hover': {
      backgroundColor: 'rgba(139, 92, 246, 0.25)',
    },
  },
  adminOptionIcon: {
    fontSize: 20,
    color: '#a78bfa',
  },
  adminOptionText: {
    flex: 1,
    textAlign: 'left',
  },
  adminOptionTitle: {
    fontWeight: 500,
    fontSize: '0.875rem',
  },
  adminOptionSubtitle: {
    fontSize: '0.75rem',
    color: '#737373',
    marginTop: 1,
  },
  adminCheckIcon: {
    fontSize: 16,
    color: '#a78bfa',
  },
  // Teams header
  teamsHeader: {
    padding: '8px 12px 4px',
    fontSize: '0.675rem',
    fontWeight: 600,
    color: '#525252',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  // Teams list
  teamsList: {
    maxHeight: 256,
    overflowY: 'auto',
    padding: '4px 8px 8px',
  },
  teamOption: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    padding: '8px 12px',
    border: 'none',
    borderRadius: 6,
    fontSize: '0.875rem',
    cursor: 'pointer',
    transition: 'background-color 150ms',
    outline: 'none',
    backgroundColor: 'transparent',
    color: '#d4d4d4',
    marginBottom: 2,
    '&:hover': {
      backgroundColor: '#262626',
    },
  },
  teamOptionActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    color: '#86efac',
    '&:hover': {
      backgroundColor: 'rgba(34, 197, 94, 0.2)',
    },
  },
  teamAvatar: {
    width: 32,
    height: 32,
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.75rem',
    fontWeight: 700,
    backgroundColor: '#404040',
    color: '#a3a3a3',
    flexShrink: 0,
  },
  teamAvatarActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.3)',
    color: '#86efac',
  },
  teamInfo: {
    flex: 1,
    minWidth: 0,
    textAlign: 'left',
  },
  teamNameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  teamName: {
    fontWeight: 500,
    fontSize: '0.875rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  roleBadge: {
    fontSize: '0.625rem',
    fontWeight: 600,
    padding: '1px 5px',
    borderRadius: 4,
    textTransform: 'uppercase',
    letterSpacing: '0.02em',
    flexShrink: 0,
  },
  teamSlug: {
    fontSize: '0.75rem',
    color: '#737373',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  teamCheckIcon: {
    fontSize: 16,
    color: '#4ade80',
    flexShrink: 0,
  },
  noTeams: {
    padding: '24px 16px',
    textAlign: 'center',
    fontSize: '0.875rem',
    color: '#737373',
  },
}));

export const TeamSwitcher = () => {
  const classes = useStyles();
  const {
    teams,
    activeTeam,
    activeTeamDisplayName,
    isTeamAdmin,
    switchTeam,
    switchToAdmin,
    isAdmin,
    mode,
  } = useTeamContext();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentLabel =
    mode === 'admin'
      ? 'Admin View'
      : activeTeamDisplayName || 'Select Team';

  return (
    <div ref={containerRef} className={classes.container}>
      <button
        className={
          mode === 'admin'
            ? classes.triggerAdmin
            : isTeamAdmin
              ? classes.triggerTeamAdmin
              : classes.trigger
        }
        onClick={() => setOpen(prev => !prev)}
      >
        {mode === 'admin' ? (
          <SecurityIcon className={classes.triggerIcon} />
        ) : (
          <BusinessIcon className={classes.triggerIcon} />
        )}
        <span className={classes.triggerLabel}>{currentLabel}</span>
        <ExpandMoreIcon
          className={`${classes.expandIcon} ${open ? classes.expandIconOpen : ''}`}
        />
      </button>

      {open && (
        <div className={classes.dropdown}>
          {/* Admin View option */}
          {isAdmin && (
            <Box className={classes.adminSection}>
              <button
                className={`${classes.adminOption} ${mode === 'admin' ? classes.adminOptionActive : ''}`}
                onClick={() => {
                  switchToAdmin();
                  setOpen(false);
                }}
              >
                <SecurityIcon className={classes.adminOptionIcon} />
                <div className={classes.adminOptionText}>
                  <Typography className={classes.adminOptionTitle}>
                    Admin View
                  </Typography>
                  <Typography className={classes.adminOptionSubtitle}>
                    Manage platform
                  </Typography>
                </div>
                {mode === 'admin' && (
                  <CheckIcon className={classes.adminCheckIcon} />
                )}
              </button>
            </Box>
          )}

          {/* Teams header */}
          {teams.length > 0 && (
            <Typography className={classes.teamsHeader}>
              Teams
            </Typography>
          )}

          {/* Teams list */}
          <div className={classes.teamsList}>
            {teams.length === 0 ? (
              <Typography className={classes.noTeams}>
                No teams available
              </Typography>
            ) : (
              teams.map(team => {
                const isActive =
                  team.name === activeTeam && mode === 'team';
                const badgeStyle = getRoleBadgeStyle(team.role);
                return (
                  <button
                    key={team.name}
                    className={`${classes.teamOption} ${isActive ? classes.teamOptionActive : ''}`}
                    onClick={() => {
                      switchTeam(team.name);
                      setOpen(false);
                    }}
                  >
                    <div
                      className={`${classes.teamAvatar} ${isActive ? classes.teamAvatarActive : ''}`}
                    >
                      {(team.displayName || team.name)
                        .charAt(0)
                        .toUpperCase()}
                    </div>
                    <div className={classes.teamInfo}>
                      <div className={classes.teamNameRow}>
                        <Typography className={classes.teamName}>
                          {team.displayName || team.name}
                        </Typography>
                        <span
                          className={classes.roleBadge}
                          style={badgeStyle}
                        >
                          {team.role}
                        </span>
                      </div>
                      <Typography className={classes.teamSlug}>
                        @{team.name}
                      </Typography>
                    </div>
                    {isActive && (
                      <CheckIcon className={classes.teamCheckIcon} />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
