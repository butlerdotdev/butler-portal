// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { butlerTokens, rgb, rgba } from '../../theme';
import { useTeamContext } from '../../hooks/useTeamContext';
import { useButlerRoutes } from '../../hooks/useButlerRoutes';
import {
  ClustersNavIcon,
  DashboardNavIcon,
  EnvironmentNavIcon,
  IdentityNavIcon,
  ManagementNavIcon,
  NetworkNavIcon,
  PoliciesNavIcon,
  ObservabilityNavIcon,
  ProvidersNavIcon,
  SettingsNavIcon,
  TeamsNavIcon,
  UsersNavIcon,
  UserGroupNavIcon,
  AuditNavIcon,
} from './icons';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  return {
    aside: {
      width: 256,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: t.surface,
      borderRight: `1px solid ${t.border}`,
      fontFamily: t.fontSans,
    },
    context: {
      padding: '12px 16px',
      borderBottom: `1px solid ${t.border}`,
    },
    contextLabel: {
      margin: '0 0 4px',
      fontSize: 12,
      lineHeight: '16px',
      fontWeight: 500,
      textTransform: 'uppercase',
      letterSpacing: '0.025em',
      color: t.text.subtle,
    },
    contextValue: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      fontWeight: 500,
      color: rgb(p.neutral[200]),
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    nav: {
      flex: 1,
      padding: '8px 12px',
      overflowY: 'auto',
    },
    section: {
      marginTop: 20,
      '&:first-child': { marginTop: 0 },
    },
    sectionLabel: {
      margin: '0 0 4px',
      padding: '0 12px',
      fontSize: 11,
      lineHeight: '16px',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      color: t.text.subtle,
    },
    items: {
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
    },
    link: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '8px 12px',
      borderRadius: t.radius.lg,
      fontSize: 14,
      lineHeight: '20px',
      fontWeight: 500,
      color: t.text.muted,
      textDecoration: 'none',
      transition: 'color 150ms, background-color 150ms',
      '&:hover': {
        color: t.text.strong,
        backgroundColor: rgb(p.neutral[800]),
      },
      '& svg': { width: 20, height: 20, flexShrink: 0 },
    },
    activeTeam: {
      backgroundColor: rgba(p.green[500], 0.1),
      color: rgb(p.green[400]),
      '&:hover': {
        backgroundColor: rgba(p.green[500], 0.1),
        color: rgb(p.green[400]),
      },
    },
    activeAdmin: {
      backgroundColor: rgba(p.violet[500], 0.1),
      color: rgb(p.violet[400]),
      '&:hover': {
        backgroundColor: rgba(p.violet[500], 0.1),
        color: rgb(p.violet[400]),
      },
    },
    footer: {
      padding: 12,
      borderTop: `1px solid ${t.border}`,
    },
  };
});

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

interface NavSection {
  label?: string;
  items: NavItem[];
}

/**
 * Butler navigation rail inside the Backstage shell, mirroring the
 * console sidebar: admin mode lists the platform areas, team mode the
 * team areas. Only destinations the plugin implements are listed;
 * console areas without a portal page yet are recorded as parity gaps
 * rather than rendered as dead links.
 */
export const ButlerNav = () => {
  const classes = useStyles();
  const routes = useButlerRoutes();
  const {
    mode,
    activeTeam,
    activeTeamDisplayName,
    isAdmin,
    canAccessAdmin,
    teams,
  } = useTeamContext();
  const activeTeamRole = teams.find(t => t.name === activeTeam)?.role;

  let sections: NavSection[];
  let context: { label: string; value: string } | null = null;
  if (mode === 'admin' && canAccessAdmin) {
    sections = [
      {
        items: [
          {
            to: routes.admin(),
            label: 'Overview',
            icon: <DashboardNavIcon />,
            end: true,
          },
          {
            to: routes.adminClusters(),
            label: 'All Clusters',
            icon: <ClustersNavIcon />,
          },
          {
            to: routes.adminManagement(),
            label: 'Management Cluster',
            icon: <ManagementNavIcon />,
          },
        ],
      },
      {
        label: 'Organization',
        items: [
          { to: routes.adminTeams(), label: 'Teams', icon: <TeamsNavIcon /> },
          { to: routes.adminUsers(), label: 'Users', icon: <UsersNavIcon /> },
          {
            to: routes.adminAccess(),
            label: 'Access',
            icon: <UserGroupNavIcon />,
          },
        ],
      },
      {
        label: 'Infrastructure',
        items: [
          {
            to: routes.adminProviders(),
            label: 'Providers',
            icon: <ProvidersNavIcon />,
          },
          {
            to: routes.adminNetworks(),
            label: 'Network Pools',
            icon: <NetworkNavIcon />,
          },
        ],
      },
      {
        label: 'Platform',
        items: [
          {
            to: routes.adminPolicies(),
            label: 'Policies',
            icon: <PoliciesNavIcon />,
          },
          {
            to: routes.adminObservability(),
            label: 'Observability',
            icon: <ObservabilityNavIcon />,
          },
          {
            to: routes.adminIdentityProviders(),
            label: 'Identity Providers',
            icon: <IdentityNavIcon />,
          },
          {
            to: routes.adminAudit(),
            label: 'Audit Log',
            icon: <AuditNavIcon />,
          },
        ],
      },
    ];
    context = {
      label: 'Mode',
      value: isAdmin ? 'Platform administration' : 'Platform (read only)',
    };
    // Teams, Users, Management and Settings still answer a platform viewer
    // with the admin-required card, so listing them would offer a
    // destination that only refuses. They return here as each is made
    // genuinely read-only.
    if (!isAdmin) {
      sections = [
        {
          items: [
            {
              to: routes.admin(),
              label: 'Overview',
              icon: <DashboardNavIcon />,
              end: true,
            },
            {
              to: routes.adminClusters(),
              label: 'All Clusters',
              icon: <ClustersNavIcon />,
            },
          ],
        },
        {
          label: 'Organization',
          items: [
            {
              to: routes.adminAccess(),
              label: 'Access',
              icon: <UserGroupNavIcon />,
            },
          ],
        },
        {
          label: 'Infrastructure',
          items: [
            {
              to: routes.adminProviders(),
              label: 'Providers',
              icon: <ProvidersNavIcon />,
            },
            {
              to: routes.adminNetworks(),
              label: 'Network Pools',
              icon: <NetworkNavIcon />,
            },
          ],
        },
        {
          label: 'Platform',
          items: [
            {
              to: routes.adminPolicies(),
              label: 'Policies',
              icon: <PoliciesNavIcon />,
            },
            {
              to: routes.adminObservability(),
              label: 'Observability',
              icon: <ObservabilityNavIcon />,
            },
            {
              to: routes.adminIdentityProviders(),
              label: 'Identity Providers',
              icon: <IdentityNavIcon />,
            },
            {
              to: routes.adminAudit(),
              label: 'Audit Log',
              icon: <AuditNavIcon />,
            },
          ],
        },
      ];
    }
  } else if (activeTeam) {
    const team = activeTeam;
    sections = [
      {
        items: [
          {
            to: routes.team({ team }),
            label: 'Dashboard',
            icon: <DashboardNavIcon />,
            end: true,
          },
        ],
      },
      {
        label: 'Workloads',
        items: [
          {
            to: routes.clusters({ team }),
            label: 'Clusters',
            icon: <ClustersNavIcon />,
          },
        ],
      },
      {
        label: 'Team',
        items: [
          {
            to: routes.teamEnvironments({ team }),
            label: 'Environments',
            icon: <EnvironmentNavIcon />,
          },
          {
            to: routes.teamMembers({ team }),
            label: 'Members',
            icon: <UsersNavIcon />,
          },
          {
            to: routes.teamProviders({ team }),
            label: 'Providers',
            icon: <ProvidersNavIcon />,
          },
          // The server serves a team's audit to its admins and to platform
          // roles; operators and viewers are refused, so it is not offered.
          ...(activeTeamRole === 'admin' || canAccessAdmin
            ? [
                {
                  to: routes.teamAudit({ team }),
                  label: 'Activity',
                  icon: <AuditNavIcon />,
                },
              ]
            : []),
        ],
      },
    ];
    context = { label: 'Team', value: activeTeamDisplayName || team };
  } else {
    return null;
  }

  const active = mode === 'admin' ? classes.activeAdmin : classes.activeTeam;
  const footer =
    mode === 'admin' && isAdmin
      ? { to: routes.adminSettings(), label: 'Settings' }
      : activeTeam
      ? { to: routes.teamSettings({ team: activeTeam }), label: 'Settings' }
      : null;

  const link = (item: NavItem) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      className={({ isActive }) => clsx(classes.link, isActive && active)}
    >
      {item.icon}
      {item.label}
    </NavLink>
  );

  return (
    <aside className={classes.aside} aria-label="Butler navigation">
      {context && (
        <div className={classes.context}>
          <p className={classes.contextLabel}>{context.label}</p>
          <p className={classes.contextValue}>{context.value}</p>
        </div>
      )}
      <nav className={classes.nav}>
        {sections.map((section, i) => (
          <div key={section.label || i} className={classes.section}>
            {section.label && (
              <p className={classes.sectionLabel}>{section.label}</p>
            )}
            <div className={classes.items}>{section.items.map(link)}</div>
          </div>
        ))}
      </nav>
      {footer && (
        <div className={classes.footer}>
          {link({ ...footer, icon: <SettingsNavIcon /> })}
        </div>
      )}
    </aside>
  );
};
