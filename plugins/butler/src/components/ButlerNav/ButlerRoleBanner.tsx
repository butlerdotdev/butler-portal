// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { butlerTokens, rgb, rgba } from '../../theme';
import { useTeamContext } from '../../hooks/useTeamContext';

type Variant =
  | 'admin'
  | 'shadow'
  | 'team-admin'
  | 'team-operator'
  | 'team-viewer';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  const filled = (hue: Record<number, string>) => ({
    backgroundColor: rgba(hue[500], 0.2),
    borderBottom: `1px solid ${rgba(hue[500], 0.3)}`,
    '& $title': { color: rgb(hue[300]) },
    '& $subtitle': { color: rgba(hue[300], 0.8) },
    '& $separator': { color: rgba(hue[400], 0.6) },
    '& $icon': { color: rgb(hue[400]) },
  });
  return {
    root: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: '6px 16px',
      fontFamily: t.fontSans,
    },
    title: {
      margin: 0,
      fontSize: 12,
      lineHeight: '16px',
      fontWeight: 600,
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
    },
    subtitle: { margin: 0, fontSize: 12, lineHeight: '16px' },
    separator: { fontSize: 12 },
    icon: { width: 16, height: 16, flexShrink: 0 },
    admin: filled(p.violet as Record<number, string>),
    shadow: {
      backgroundColor: 'transparent',
      border: `1px solid ${rgba(p.violet[500], 0.4)}`,
      '& $title': { color: rgb(p.violet[400]) },
      '& $subtitle': { color: rgba(p.violet[400], 0.7) },
      '& $separator': { color: rgba(p.violet[400], 0.4) },
      '& $icon': { color: rgb(p.violet[400]) },
    },
    'team-admin': filled(p.teal as Record<number, string>),
    'team-operator': filled({
      300: p.orange[400],
      400: p.orange[400],
      500: p.orange[500],
    }),
    'team-viewer': {
      backgroundColor: 'transparent',
      border: `1px solid ${rgba(p.teal[500], 0.4)}`,
      '& $title': { color: rgb(p.teal[400]) },
      '& $subtitle': { color: rgba(p.teal[400], 0.7) },
      '& $separator': { color: rgba(p.teal[400], 0.4) },
      '& $icon': { color: rgb(p.teal[400]) },
    },
  };
});

const COPY: Record<
  Variant,
  { title: string; subtitle: (team: string) => string }
> = {
  admin: {
    title: 'Admin Mode',
    subtitle: () => 'Actions affect the entire platform',
  },
  shadow: {
    title: 'Shadow Mode',
    subtitle: () => 'Read-only view of the entire platform',
  },
  'team-admin': {
    title: 'Team Admin',
    subtitle: team => `Actions affect ${team}`,
  },
  'team-operator': {
    title: 'Team Operator',
    subtitle: team => `Operational access to ${team}`,
  },
  'team-viewer': {
    title: 'Team Viewer',
    subtitle: team => `Read-only view of ${team}`,
  },
};

const Icon = ({
  variant,
  className,
}: {
  variant: Variant;
  className: string;
}) => {
  const d =
    variant === 'admin'
      ? 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z'
      : variant === 'team-viewer' || variant === 'shadow'
      ? 'M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7zM15 12a3 3 0 11-6 0 3 3 0 016 0z'
      : variant === 'team-operator'
      ? 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z'
      : 'M20.618 5.984A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z';
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d={d}
      />
    </svg>
  );
};

/**
 * Console `RoleBanner`: a strip naming the active scope and the role the
 * caller holds in it, so the reach of any action is visible at a glance.
 */
export const ButlerRoleBanner = () => {
  const classes = useStyles();
  const {
    mode,
    isAdmin,
    canAccessAdmin,
    activeTeam,
    activeTeamDisplayName,
    activeTeamRole,
  } = useTeamContext();
  let variant: Variant | null = null;
  if (mode === 'admin' && isAdmin) variant = 'admin';
  else if (mode === 'admin' && canAccessAdmin) variant = 'shadow';
  // A platform role browsing a team it does not belong to still carries
  // platform reach, and was previously shown no scope at all there.
  else if (isAdmin) variant = 'admin';
  else if (canAccessAdmin && !activeTeamRole) variant = 'shadow';
  else if (activeTeam && activeTeamRole === 'admin') variant = 'team-admin';
  else if (activeTeam && activeTeamRole === 'operator')
    variant = 'team-operator';
  else if (activeTeam && activeTeamRole === 'viewer') variant = 'team-viewer';
  if (!variant) return null;
  const copy = COPY[variant];
  return (
    <div className={clsx(classes.root, classes[variant])} role="status">
      <Icon variant={variant} className={classes.icon} />
      <p className={classes.title}>{copy.title}</p>
      <span className={classes.separator} aria-hidden>
        |
      </span>
      <p className={classes.subtitle}>
        {copy.subtitle(activeTeamDisplayName || activeTeam || 'this team')}
      </p>
    </div>
  );
};
