// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';

import { butlerApiRef } from '../../api/ButlerApi';
import type {
  GroupSyncResponse,
  TeamMemberResponse,
  UserListEntry,
} from '../../api/types/teams';
import { useButlerRoutes } from '../../hooks/useButlerRoutes';
import { butlerTokens, rgb } from '../../theme';
import {
  ButlerButton,
  ButlerCallout,
  ButlerCard,
  ButlerChip,
  ButlerErrorState,
  ButlerInput,
  ButlerLoading,
  ButlerPageHeader,
  ButlerSegmented,
  ButlerStack,
  ButlerTable,
  RefreshIcon,
  type ButlerColumn,
} from '../ui';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  return {
    toolbar: {
      display: 'flex',
      gap: 12,
      alignItems: 'center',
      flexWrap: 'wrap',
    },
    search: { flex: '1 1 260px', maxWidth: 420 },
    chips: { display: 'flex', gap: 6, flexWrap: 'wrap' },
    link: {
      color: rgb(t.palette.green[400]),
      textDecoration: 'none',
      '&:hover': { textDecoration: 'underline' },
    },
    muted: { color: t.text.subtle },
    lead: { margin: 0, fontSize: 13, color: t.text.subtle, maxWidth: 720 },
  };
});

export interface UserAccessRow {
  email: string;
  name: string;
  platformRole: string;
  authType?: string;
  teams: Array<{
    team: string;
    role: string;
    source: TeamMemberResponse['source'];
    groupName?: string;
  }>;
  /** True when the person is a User record; false when known only from a team's access list. */
  known: boolean;
}

export interface GroupAccessRow {
  name: string;
  identityProvider: string;
  teams: Array<{ team: string; role: string }>;
  observed: number;
}

/**
 * Turns the server's per-team answers into two views: every person and
 * where they have access, and every mapped group and what it grants.
 * It is a read of what the server already decided, member by member;
 * nothing here computes an effective role the server has not stated.
 */
export function buildAccessRows(
  users: UserListEntry[],
  perTeam: Array<{
    team: string;
    members: TeamMemberResponse[];
    groups: GroupSyncResponse[];
    groupMemberCounts: Record<string, number>;
  }>,
): { users: UserAccessRow[]; groups: GroupAccessRow[] } {
  const userMap = new Map<string, UserAccessRow>();
  for (const u of users) {
    const key = u.email.toLowerCase();
    userMap.set(key, {
      email: u.email,
      name: u.displayName || '',
      platformRole: u.platformRole || (u.isPlatformAdmin ? 'admin' : ''),
      authType: u.authType,
      teams: [],
      known: true,
    });
  }
  for (const t of perTeam) {
    for (const m of t.members) {
      const key = m.email.toLowerCase();
      let row = userMap.get(key);
      if (!row) {
        row = {
          email: m.email,
          name: m.name || '',
          platformRole: '',
          teams: [],
          known: false,
        };
        userMap.set(key, row);
      }
      if (!row.name && m.name) row.name = m.name;
      row.teams.push({
        team: t.team,
        role: m.role,
        source: m.source,
        groupName: m.groupName,
      });
    }
  }
  const groupMap = new Map<string, GroupAccessRow>();
  for (const t of perTeam) {
    for (const g of t.groups) {
      const idp = g.identityProvider || '';
      const key = `${g.name.toLowerCase()}::${idp.toLowerCase()}`;
      let row = groupMap.get(key);
      if (!row) {
        row = { name: g.name, identityProvider: idp, teams: [], observed: 0 };
        groupMap.set(key, row);
      }
      row.teams.push({ team: t.team, role: g.role });
      row.observed += t.groupMemberCounts[g.name] ?? 0;
    }
  }
  const byName = (
    a: { email?: string; name: string },
    b: { email?: string; name: string },
  ) => (a.email ?? a.name).localeCompare(b.email ?? b.name);
  return {
    users: [...userMap.values()].sort(byName),
    groups: [...groupMap.values()].sort(byName),
  };
}

export const sourceLabel = (
  source: TeamMemberResponse['source'],
  groupName?: string,
) =>
  source === 'direct'
    ? 'direct'
    : source === 'elevated'
    ? `elevated over ${groupName ?? 'group'}`
    : `via ${groupName ?? 'group'}`;

/**
 * Who has access to what, and why. Built from the reads the server grants
 * to every platform role: all teams, each team's members (with the
 * server's direct/group/elevated verdict), each team's group mappings,
 * and the user directory. Read-only; changes happen on the team page.
 */
export const AccessOverviewPage = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const routes = useButlerRoutes();
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | {
        status: 'ready';
        users: UserAccessRow[];
        groups: GroupAccessRow[];
        teams: number;
        refused: string[];
      }
  >({ status: 'loading' });
  const [tab, setTab] = useState<'users' | 'groups'>('users');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const [teamsRes, usersRes] = await Promise.all([
        api.listAllTeams(),
        api.listUsers(),
      ]);
      const refused: string[] = [];
      const perTeam = await Promise.all(
        teamsRes.teams.map(async t => {
          const [membersRes, groupsRes] = await Promise.allSettled([
            api.getTeamMembers(t.name),
            api.getTeamGroupSyncs(t.name),
          ]);
          if (membersRes.status === 'rejected') refused.push(t.name);
          const members =
            membersRes.status === 'fulfilled' ? membersRes.value.members : [];
          const counts =
            membersRes.status === 'fulfilled'
              ? membersRes.value.groupMemberCounts ?? {}
              : {};
          const groups =
            groupsRes.status === 'fulfilled'
              ? groupsRes.value.groups
              : membersRes.status === 'fulfilled'
              ? membersRes.value.groups ?? []
              : [];
          return { team: t.name, members, groups, groupMemberCounts: counts };
        }),
      );
      const rows = buildAccessRows(usersRes.users ?? [], perTeam);
      setState({
        status: 'ready',
        ...rows,
        teams: teamsRes.teams.length,
        refused,
      });
    } catch (err) {
      setState({
        status: 'error',
        message:
          err instanceof Error ? err.message : 'Failed to load access data',
      });
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const q = query.trim().toLowerCase();
  const filteredUsers = useMemo(
    () =>
      state.status === 'ready'
        ? state.users.filter(
            u =>
              !q ||
              u.email.toLowerCase().includes(q) ||
              u.name.toLowerCase().includes(q),
          )
        : [],
    [state, q],
  );
  const filteredGroups = useMemo(
    () =>
      state.status === 'ready'
        ? state.groups.filter(
            g =>
              !q ||
              g.name.toLowerCase().includes(q) ||
              g.identityProvider.toLowerCase().includes(q),
          )
        : [],
    [state, q],
  );

  const userColumns: ButlerColumn<UserAccessRow>[] = [
    {
      id: 'user',
      header: 'User',
      primary: true,
      render: u => (
        <span>
          {u.email}
          {u.name && <span className={classes.muted}> {u.name}</span>}
          {!u.known && (
            <span
              className={classes.muted}
              title="Listed on a team but has not signed in or been invited"
            >
              {' '}
              (no user record)
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'platform',
      header: 'Platform role',
      render: u =>
        u.platformRole ? (
          <ButlerChip tone={u.platformRole === 'admin' ? 'violet' : 'blue'}>
            {u.platformRole}
          </ButlerChip>
        ) : (
          <span className={classes.muted}>none</span>
        ),
    },
    {
      id: 'teams',
      header: 'Team access',
      render: u =>
        u.teams.length === 0 ? (
          <span className={classes.muted}>none</span>
        ) : (
          <span className={classes.chips}>
            {u.teams.map(t => (
              <ButlerChip
                key={`${t.team}-${t.role}-${t.source}`}
                tone={
                  t.role === 'admin'
                    ? 'green'
                    : t.role === 'operator'
                    ? 'blue'
                    : 'neutral'
                }
                title={sourceLabel(t.source, t.groupName)}
              >
                <RouterLink
                  className={classes.link}
                  to={routes.adminTeamDetail({ teamName: t.team })}
                >
                  {t.team}
                </RouterLink>
                {` ${t.role} (${sourceLabel(t.source, t.groupName)})`}
              </ButlerChip>
            ))}
          </span>
        ),
    },
  ];

  const groupColumns: ButlerColumn<GroupAccessRow>[] = [
    {
      id: 'group',
      header: 'Group',
      primary: true,
      mono: true,
      render: g => g.name,
    },
    {
      id: 'idp',
      header: 'Identity provider',
      render: g =>
        g.identityProvider || <span className={classes.muted}>any</span>,
    },
    {
      id: 'teams',
      header: 'Grants',
      render: g => (
        <span className={classes.chips}>
          {g.teams.map(t => (
            <ButlerChip
              key={`${t.team}-${t.role}`}
              tone={
                t.role === 'admin'
                  ? 'green'
                  : t.role === 'operator'
                  ? 'blue'
                  : 'neutral'
              }
            >
              <RouterLink
                className={classes.link}
                to={routes.adminTeamDetail({ teamName: t.team })}
              >
                {t.team}
              </RouterLink>
              {` ${t.role}`}
            </ButlerChip>
          ))}
        </span>
      ),
    },
    {
      id: 'observed',
      header: 'Observed members',
      align: 'right',
      render: g =>
        g.observed > 0 ? (
          String(g.observed)
        ) : (
          <span
            className={classes.muted}
            title="Nobody with this group has signed in yet"
          >
            0
          </span>
        ),
    },
  ];

  if (state.status === 'loading') return <ButlerLoading />;
  if (state.status === 'error')
    return <ButlerErrorState message={state.message} onRetry={load} />;

  return (
    <ButlerStack>
      <ButlerPageHeader
        title="Access"
        subtitle={`Who can reach what across ${state.teams} team${
          state.teams === 1 ? '' : 's'
        }, and why`}
        actions={
          <ButlerButton
            variant="secondary"
            startIcon={<RefreshIcon />}
            onClick={load}
          >
            Refresh
          </ButlerButton>
        }
      />
      <p className={classes.lead}>
        Roles shown are the server's verdict per team: direct membership, access
        through a mapped identity provider group, or a direct role elevated
        above the group's. Platform admins can reach everything regardless of
        team rows. Changes are made on each team's page.
      </p>
      {state.refused.length > 0 && (
        <ButlerCallout tone="warning" compact>
          {`Member lists for ${state.refused.join(
            ', ',
          )} were refused by the server; only group mappings are shown for them.`}
        </ButlerCallout>
      )}
      <div className={classes.toolbar}>
        <ButlerSegmented<'users' | 'groups'>
          aria-label="View"
          value={tab}
          onChange={v => {
            setTab(v);
            setQuery('');
          }}
          options={[
            { value: 'users', label: `Users (${state.users.length})` },
            { value: 'groups', label: `Groups (${state.groups.length})` },
          ]}
        />
        <div className={classes.search}>
          <ButlerInput
            aria-label={tab === 'users' ? 'Search users' : 'Search groups'}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={
              tab === 'users'
                ? 'Search by email or name'
                : 'Search by group or identity provider'
            }
          />
        </div>
      </div>
      <ButlerCard flush>
        {tab === 'users' ? (
          <ButlerTable
            bare
            aria-label="User access"
            columns={userColumns}
            rows={filteredUsers}
            rowKey={u => u.email}
          />
        ) : (
          <ButlerTable
            bare
            aria-label="Group access"
            columns={groupColumns}
            rows={filteredGroups}
            rowKey={g => `${g.name}::${g.identityProvider}`}
          />
        )}
      </ButlerCard>
    </ButlerStack>
  );
};
