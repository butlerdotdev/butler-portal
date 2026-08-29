// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useRef, useEffect } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { butlerTokens, rgb, rgba } from '../../theme';
import { useTeamContext } from '../../hooks/useTeamContext';
import {
  BuildingIcon,
  ButlerAvatarTile,
  CheckIcon,
  ChevronDownIcon,
  ShieldCheckIcon,
} from '../ui';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  return {
    container: {
      position: 'relative',
      fontFamily: t.fontSans,
    },
    trigger: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      fontFamily: t.fontSans,
      fontSize: 14,
      lineHeight: '20px',
      fontWeight: 500,
      borderRadius: t.radius.lg,
      border: `1px solid ${t.borderStrong}`,
      backgroundColor: rgb(p.neutral[800]),
      color: t.text.secondary,
      cursor: 'pointer',
      transition: 'background-color 150ms, border-color 150ms',
      '&:hover': { backgroundColor: rgb(p.neutral[700]) },
      '&:focus-visible': {
        outline: 'none',
        boxShadow: `0 0 0 2px ${t.surface}, 0 0 0 4px ${t.accent}`,
      },
    },
    triggerAdmin: {
      border: `1px solid ${rgba(p.violet[500], 0.3)}`,
      backgroundColor: rgba(p.violet[500], 0.2),
      color: rgb(p.violet[300]),
      '&:hover': { backgroundColor: rgba(p.violet[500], 0.3) },
      '&:focus-visible': {
        boxShadow: `0 0 0 2px ${t.surface}, 0 0 0 4px ${rgb(p.violet[500])}`,
      },
    },
    triggerLabel: {
      maxWidth: 160,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    chevron: {
      transition: 'transform 150ms',
    },
    chevronOpen: { transform: 'rotate(180deg)' },
    dropdown: {
      position: 'absolute',
      top: '100%',
      right: 0,
      marginTop: 8,
      width: 256,
      backgroundColor: t.surface,
      border: `1px solid ${t.borderStrong}`,
      borderRadius: t.radius.lg,
      boxShadow:
        '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
      overflow: 'hidden',
      zIndex: theme.zIndex.modal + 1,
    },
    adminSection: {
      padding: 8,
      borderBottom: `1px solid ${t.border}`,
    },
    option: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      width: '100%',
      padding: '8px 12px',
      border: 'none',
      borderRadius: t.radius.md,
      backgroundColor: 'transparent',
      fontFamily: t.fontSans,
      fontSize: 14,
      lineHeight: '20px',
      color: rgb(p.neutral[300]),
      cursor: 'pointer',
      textAlign: 'left',
      transition: 'background-color 150ms',
      '&:hover': { backgroundColor: rgb(p.neutral[800]) },
      '&:focus-visible': {
        outline: 'none',
        boxShadow: `inset 0 0 0 2px ${t.accent}`,
      },
    },
    optionAdminActive: {
      backgroundColor: rgba(p.violet[500], 0.2),
      color: rgb(p.violet[300]),
      '&:hover': { backgroundColor: rgba(p.violet[500], 0.2) },
    },
    optionTeamActive: {
      backgroundColor: rgba(p.green[500], 0.2),
      color: rgb(p.green[300]),
      '&:hover': { backgroundColor: rgba(p.green[500], 0.2) },
    },
    shield: { color: rgb(p.violet[400]), flexShrink: 0 },
    optionText: { flex: 1, minWidth: 0 },
    optionTitle: {
      margin: 0,
      fontWeight: 500,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    optionSubtitle: {
      margin: 0,
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.subtle,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    checkAdmin: { color: rgb(p.violet[400]), flexShrink: 0 },
    checkTeam: { color: rgb(p.green[400]), flexShrink: 0 },
    teamsList: {
      maxHeight: 256,
      overflowY: 'auto',
      padding: 8,
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    },
    noTeams: {
      padding: '24px 16px',
      textAlign: 'center',
      fontSize: 14,
      color: t.text.subtle,
    },
  };
});

/** Console header `TeamSwitcher`: team picker with the Admin View entry. */
export const TeamSwitcher = () => {
  const classes = useStyles();
  const {
    teams,
    activeTeam,
    activeTeamDisplayName,
    switchTeam,
    switchToAdmin,
    isAdmin,
    mode,
  } = useTeamContext();
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

  const adminMode = mode === 'admin';
  const currentLabel = adminMode
    ? 'Admin View'
    : activeTeamDisplayName || 'Select Team';

  return (
    <div ref={containerRef} className={classes.container}>
      <button
        type="button"
        className={clsx(classes.trigger, adminMode && classes.triggerAdmin)}
        onClick={() => setOpen(prev => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Switch context, currently ${currentLabel}`}
      >
        {adminMode ? <ShieldCheckIcon /> : <BuildingIcon />}
        <span className={classes.triggerLabel}>{currentLabel}</span>
        <ChevronDownIcon
          className={clsx(classes.chevron, open && classes.chevronOpen)}
        />
      </button>

      {open && (
        <div className={classes.dropdown} role="menu">
          {isAdmin && (
            <div className={classes.adminSection}>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={adminMode}
                className={clsx(
                  classes.option,
                  adminMode && classes.optionAdminActive,
                )}
                onClick={() => {
                  switchToAdmin();
                  setOpen(false);
                }}
              >
                <ShieldCheckIcon size={20} className={classes.shield} />
                <div className={classes.optionText}>
                  <p className={classes.optionTitle}>Admin View</p>
                  <p className={classes.optionSubtitle}>Manage platform</p>
                </div>
                {adminMode && <CheckIcon className={classes.checkAdmin} />}
              </button>
            </div>
          )}

          <div className={classes.teamsList}>
            {teams.length === 0 ? (
              <div className={classes.noTeams}>No teams available</div>
            ) : (
              teams.map(team => {
                const isActive = team.name === activeTeam && mode === 'team';
                const displayName = team.displayName || team.name;
                return (
                  <button
                    type="button"
                    key={team.name}
                    role="menuitemradio"
                    aria-checked={isActive}
                    className={clsx(
                      classes.option,
                      isActive && classes.optionTeamActive,
                    )}
                    onClick={() => {
                      switchTeam(team.name);
                      setOpen(false);
                    }}
                  >
                    <ButlerAvatarTile
                      name={displayName}
                      size={32}
                      tone={isActive ? 'greenStrong' : 'neutral'}
                    />
                    <div className={classes.optionText}>
                      <p className={classes.optionTitle}>{displayName}</p>
                      <p className={classes.optionSubtitle}>@{team.name}</p>
                    </div>
                    {isActive && <CheckIcon className={classes.checkTeam} />}
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
