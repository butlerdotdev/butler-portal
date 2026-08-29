// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { Link as RouterLink, Navigate } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import { butlerTokens, rgb, rgba } from '../../theme';
import { useTeamContext } from '../../hooks/useTeamContext';
import { useButlerRoutes } from '../../hooks/useButlerRoutes';
import {
  ButlerAvatarTile,
  ButlerCard,
  ButlerEmptyState,
  ButlerLoading,
  ButlerPageHeader,
  ButlerStack,
} from '../ui';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  return {
    grid: {
      display: 'grid',
      gridTemplateColumns: '1fr',
      gap: 16,
      '@media (min-width: 768px)': {
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      },
      '@media (min-width: 1024px)': {
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      },
    },
    link: {
      display: 'block',
      textDecoration: 'none',
      color: 'inherit',
      height: '100%',
      '&:focus-visible': {
        outline: `2px solid ${t.accent}`,
        outlineOffset: 2,
        borderRadius: t.radius.lg,
      },
    },
    card: { height: '100%' },
    row: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 16,
    },
    text: { minWidth: 0 },
    nameRow: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
    name: {
      margin: 0,
      fontSize: 16,
      lineHeight: '24px',
      fontWeight: 500,
      color: t.text.strong,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    adminChip: {
      flexShrink: 0,
      padding: '2px 8px',
      borderRadius: t.radius.sm,
      fontSize: 12,
      lineHeight: '16px',
      fontWeight: 500,
      backgroundColor: rgba(p.violet[500], 0.1),
      color: rgb(p.violet[400]),
    },
    slug: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.subtle,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
  };
});

/**
 * Console `/overview`: the team picker landing. Platform operators with
 * no memberships are sent to the platform overview instead.
 */
export const OverviewPage = () => {
  const classes = useStyles();
  const routes = useButlerRoutes();
  const { teams, isAdmin, loading } = useTeamContext();

  if (loading) {
    return <ButlerLoading />;
  }

  // A platform operator without team memberships has nothing to do on the
  // team landing; the console sends them to the platform overview.
  if (isAdmin && teams.length === 0) {
    return <Navigate to={routes.admin()} replace />;
  }

  return (
    <ButlerStack>
      <ButlerPageHeader
        title="Overview"
        subtitle="Welcome back! Select a team to get started."
      />

      {teams.length === 0 ? (
        <ButlerEmptyState
          title="No teams yet"
          description="You're not a member of any teams. Contact an administrator to get access."
        />
      ) : (
        <div className={classes.grid} role="list" aria-label="Your teams">
          {teams.map(team => {
            const displayName = team.displayName || team.name;
            const count = team.clusterCount ?? 0;
            return (
              <div role="listitem" key={team.name}>
                <RouterLink
                  to={routes.team({ team: team.name })}
                  className={classes.link}
                >
                  <ButlerCard hoverable className={classes.card}>
                    <div className={classes.row}>
                      <ButlerAvatarTile name={displayName} size={48} />
                      <div className={classes.text}>
                        <div className={classes.nameRow}>
                          <p className={classes.name}>{displayName}</p>
                          {team.role === 'admin' && (
                            <span className={classes.adminChip}>Admin</span>
                          )}
                        </div>
                        <p className={classes.slug}>
                          @{team.name} &bull; {count}{' '}
                          {count === 1 ? 'cluster' : 'clusters'}
                        </p>
                      </div>
                    </div>
                  </ButlerCard>
                </RouterLink>
              </div>
            );
          })}
        </div>
      )}
    </ButlerStack>
  );
};
