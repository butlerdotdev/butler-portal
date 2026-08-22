// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';
import { butlerApiRef } from '../../api/ButlerApi';
import type { TeamInfo } from '../../api/types/teams';
import { useButlerRoutes } from '../../hooks/useButlerRoutes';
import { useTeamContext } from '../../hooks/useTeamContext';
import { butlerTokens, rgb, rgba } from '../../theme';
import {
  ButlerButton,
  ButlerCard,
  ButlerChip,
  ButlerDialog,
  ButlerErrorState,
  ButlerInput,
  ButlerLoading,
  ButlerPageHeader,
  ButlerStack,
  PlusIcon,
  ServerIcon,
} from '../ui';
import { ButlerTextarea } from '../ui/ButlerForm';
import { ButlerAccessDenied } from '../ui/ButlerAccessDenied';
import { ChevronRightIcon, UsersIcon } from '../ui/ButlerDashboardIcons';
import { UserGroupIcon } from '../ui/adminIcons';

/** `/teams` returns the console `TeamResponse`; these fields are optional in TeamInfo. */
interface AdminTeam extends TeamInfo {
  description?: string;
  phase?: string;
  namespace?: string;
  memberCount?: number;
  groupCount?: number;
}

export function formatMemberCount(members: number, groups: number): string {
  const m = `${members} member${members === 1 ? '' : 's'}`;
  const g = `${groups} group${groups === 1 ? '' : 's'}`;
  if (members === 0 && groups === 0) return '0 members';
  if (groups === 0) return m;
  if (members === 0) return g;
  return `${m} + ${g}`;
}

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
      '&:focus-visible': {
        outline: `2px solid ${rgb(p.violet[500])}`,
        outlineOffset: 2,
        borderRadius: t.radius.lg,
      },
    },
    card: { height: '100%', boxSizing: 'border-box' },
    top: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 12,
    },
    identity: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      minWidth: 0,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: t.radius.lg,
      backgroundColor: rgba(p.violet[500], 0.2),
      color: rgb(p.violet[400]),
      fontWeight: 700,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    name: {
      margin: 0,
      fontSize: 16,
      lineHeight: '24px',
      fontWeight: 500,
      color: t.text.strong,
      overflowWrap: 'anywhere',
    },
    slug: {
      margin: 0,
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.subtle,
    },
    description: {
      margin: '0 0 12px',
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.muted,
      display: '-webkit-box',
      WebkitLineClamp: 2,
      WebkitBoxOrient: 'vertical',
      overflow: 'hidden',
    },
    meta: {
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.subtle,
    },
    metaItem: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
    },
    footer: {
      marginTop: 12,
      paddingTop: 12,
      borderTop: `1px solid ${t.border}`,
      display: 'flex',
      justifyContent: 'flex-end',
    },
    viewDetails: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.subtle,
    },
    emptyIcon: {
      width: 64,
      height: 64,
      margin: '0 auto 16px',
      borderRadius: '50%',
      backgroundColor: rgb(p.neutral[800]),
      color: rgb(p.neutral[600]),
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyCard: { padding: 32, textAlign: 'center' },
    emptyText: {
      margin: '0 0 16px',
      fontSize: 16,
      lineHeight: '24px',
      color: t.text.muted,
    },
    formError: {
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

export const AdminTeamsPage = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const routes = useButlerRoutes();
  const { isAdmin } = useTeamContext();
  const [teams, setTeams] = useState<AdminTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', displayName: '', description: '' });
  const [formError, setFormError] = useState<string | undefined>();

  const fetchTeams = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await api.listAllTeams();
      setTeams((response.teams || []) as AdminTeam[]);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (isAdmin) fetchTeams();
  }, [fetchTeams, isAdmin]);

  const closeCreate = () => {
    setCreateOpen(false);
    setForm({ name: '', displayName: '', description: '' });
    setFormError(undefined);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormError('Team name is required.');
      return;
    }
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(form.name)) {
      setFormError(
        'Name must be lowercase alphanumeric with hyphens, and cannot start or end with a hyphen.',
      );
      return;
    }
    setCreating(true);
    setFormError(undefined);
    try {
      await api.createTeam({
        name: form.name,
        displayName: form.displayName || form.name,
        description: form.description,
      });
      closeCreate();
      fetchTeams();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create team.');
    } finally {
      setCreating(false);
    }
  };

  if (!isAdmin) {
    return (
      <ButlerAccessDenied
        resourceType="page"
        message="Platform administrator access is required to manage teams."
        homeTo={routes.root()}
      />
    );
  }

  const createButton = (
    <ButlerButton startIcon={<PlusIcon />} onClick={() => setCreateOpen(true)}>
      Create Team
    </ButlerButton>
  );

  let body: React.ReactNode;
  if (loading) {
    body = <ButlerLoading />;
  } else if (error) {
    body = (
      <ButlerErrorState
        message="Failed to load teams"
        detail={error.message}
        onRetry={fetchTeams}
      />
    );
  } else if (teams.length === 0) {
    body = (
      <ButlerCard flush className={classes.emptyCard}>
        <div className={classes.emptyIcon}>
          <UsersIcon size={32} />
        </div>
        <p className={classes.emptyText}>No teams found</p>
        <ButlerButton onClick={() => setCreateOpen(true)}>
          Create Your First Team
        </ButlerButton>
      </ButlerCard>
    );
  } else {
    body = (
      <div className={classes.grid} role="list" aria-label="Teams">
        {teams.map(team => {
          const phase = team.phase || 'Ready';
          const label = team.displayName || team.name;
          return (
            <div key={team.name} role="listitem">
              <RouterLink
                to={routes.adminTeamDetail({ teamName: team.name })}
                className={classes.link}
              >
                <ButlerCard hoverable className={classes.card}>
                  <div className={classes.top}>
                    <div className={classes.identity}>
                      <div className={classes.avatar} aria-hidden>
                        {label.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <h3 className={classes.name}>{label}</h3>
                        <p className={classes.slug}>@{team.name}</p>
                      </div>
                    </div>
                    <ButlerChip tone={phase === 'Ready' ? 'green' : 'yellow'}>
                      {phase}
                    </ButlerChip>
                  </div>
                  {team.description && (
                    <p className={classes.description}>{team.description}</p>
                  )}
                  <div className={classes.meta}>
                    <span className={classes.metaItem}>
                      <UserGroupIcon />
                      {formatMemberCount(
                        team.memberCount ?? 0,
                        team.groupCount ?? 0,
                      )}
                    </span>
                    <span className={classes.metaItem}>
                      <ServerIcon size={16} />
                      {team.clusterCount} clusters
                    </span>
                  </div>
                  <div className={classes.footer}>
                    <span className={classes.viewDetails}>
                      View details
                      <ChevronRightIcon size={12} />
                    </span>
                  </div>
                </ButlerCard>
              </RouterLink>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <ButlerStack>
      <ButlerPageHeader
        title="Teams"
        subtitle="Manage team access and permissions"
        actions={createButton}
      />
      {body}

      <ButlerDialog
        open={createOpen}
        onClose={creating ? () => undefined : closeCreate}
        busy={creating}
        title="Create Team"
        footer={
          <>
            <ButlerButton
              variant="secondary"
              onClick={closeCreate}
              disabled={creating}
            >
              Cancel
            </ButlerButton>
            <ButlerButton
              type="submit"
              form="create-team-form"
              disabled={creating}
            >
              {creating ? 'Creating...' : 'Create Team'}
            </ButlerButton>
          </>
        }
      >
        <form
          id="create-team-form"
          onSubmit={handleCreate}
          style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          {formError && (
            <p className={classes.formError} role="alert">
              {formError}
            </p>
          )}
          <ButlerInput
            id="teamName"
            label="Team Name (slug)"
            value={form.name}
            onChange={e =>
              setForm(prev => ({
                ...prev,
                name: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
              }))
            }
            placeholder="engineering-team"
            required
            autoFocus
          />
          <ButlerInput
            id="displayName"
            label="Display Name"
            value={form.displayName}
            onChange={e =>
              setForm(prev => ({ ...prev, displayName: e.target.value }))
            }
            placeholder="Engineering Team"
          />
          <ButlerTextarea
            id="teamDescription"
            label="Description (optional)"
            value={form.description}
            onChange={e =>
              setForm(prev => ({ ...prev, description: e.target.value }))
            }
            placeholder="Team description..."
            rows={3}
          />
        </form>
      </ButlerDialog>
    </ButlerStack>
  );
};
