// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState, useCallback } from 'react';
import type { FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { butlerApiRef } from '../../api/ButlerApi';
import { useTeamContext } from '../../hooks/useTeamContext';
import { useButlerRoutes } from '../../hooks/useButlerRoutes';
import { butlerTokens, rgb, rgba } from '../../theme';
import {
  ButlerButton,
  ButlerCallout,
  ButlerCard,
  ButlerDialog,
  ButlerEmptyState,
  ButlerErrorState,
  ButlerInput,
  ButlerLoading,
  ButlerPageHeader,
  ButlerSelect,
  ButlerStack,
  PlusIcon,
  TrashIcon,
  UsersIcon,
} from '../ui';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  return {
    groupChips: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 8,
    },
    groupChip: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 8px',
      borderRadius: t.radius.sm,
      fontSize: 14,
      lineHeight: '20px',
      backgroundColor: rgba(p.blue[500], 0.2),
      color: rgb(p.blue[200]),
    },
    groupChipRole: { color: rgba(p.blue[300], 0.6) },
    list: {
      listStyle: 'none',
      margin: 0,
      padding: 0,
      '& > li + li': { borderTop: `1px solid ${t.border}` },
    },
    row: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      padding: '16px 20px',
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
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      fontSize: 16,
      fontWeight: 500,
      backgroundColor: rgb(p.neutral[700]),
      color: rgb(p.neutral[300]),
    },
    avatarGroup: {
      backgroundColor: rgba(p.blue[500], 0.2),
      color: rgb(p.blue[300]),
    },
    avatarElevated: {
      backgroundColor: rgba(p.amber[500], 0.2),
      color: rgb(p.amber[300]),
      boxShadow: `0 0 0 2px ${rgba(p.amber[500], 0.3)}`,
    },
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
      color: t.text.secondary,
      overflowWrap: 'anywhere',
    },
    you: {
      marginLeft: 8,
      fontSize: 12,
      fontWeight: 400,
      color: t.text.subtle,
    },
    elevatedTag: {
      padding: '2px 6px',
      borderRadius: t.radius.sm,
      fontSize: 10,
      lineHeight: '14px',
      fontWeight: 500,
      backgroundColor: rgba(p.amber[500], 0.2),
      color: rgb(p.amber[400]),
    },
    meta: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginTop: 2,
      fontSize: 12,
      lineHeight: '16px',
    },
    email: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.subtle,
    },
    source: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      color: t.text.subtle,
    },
    sourceGroup: { color: rgb(p.blue[400]) },
    sourceElevated: { color: rgba(p.amber[400], 0.7) },
    right: {
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      flexShrink: 0,
    },
    roleWrap: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
    role: {
      padding: '4px 8px',
      borderRadius: t.radius.sm,
      fontSize: 12,
      lineHeight: '16px',
      fontWeight: 500,
    },
    roleAdmin: {
      backgroundColor: rgba(p.violet[500], 0.2),
      color: rgb(p.violet[400]),
    },
    roleOperator: {
      backgroundColor: rgba(p.green[500], 0.2),
      color: rgb(p.green[400]),
    },
    roleViewer: {
      backgroundColor: rgb(p.neutral[700]),
      color: rgb(p.neutral[300]),
    },
    elevatedFrom: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 12,
      color: rgb(p.amber[400]),
    },
    remove: {
      display: 'inline-flex',
      padding: 4,
      border: 'none',
      background: 'none',
      borderRadius: t.radius.md,
      color: t.text.subtle,
      cursor: 'pointer',
      transition: 'color 150ms',
      '&:hover': { color: rgb(p.red[400]) },
      '&:focus-visible': {
        outline: 'none',
        boxShadow: `0 0 0 2px ${t.accent}`,
      },
    },
    lock: {
      display: 'inline-flex',
      padding: 4,
      color: rgb(p.neutral[600]),
    },
    legend: {
      display: 'flex',
      alignItems: 'center',
      gap: 24,
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.subtle,
      fontFamily: t.fontSans,
    },
    legendItem: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
    legendDot: {
      width: 12,
      height: 12,
      borderRadius: '50%',
      backgroundColor: rgb(p.neutral[700]),
    },
    legendGroup: { backgroundColor: rgba(p.blue[500], 0.2) },
    legendElevated: {
      backgroundColor: rgba(p.amber[500], 0.2),
      boxShadow: `0 0 0 1px ${rgba(p.amber[500], 0.3)}`,
    },
    confirmText: {
      margin: 0,
      fontSize: 16,
      lineHeight: '24px',
      color: t.text.muted,
      '& strong': { color: t.text.secondary, fontWeight: 600 },
    },
    confirmNote: {
      margin: '8px 0 0',
      fontSize: 14,
      lineHeight: '20px',
      color: rgba(p.amber[400], 0.8),
    },
  };
});

interface TeamMember {
  email: string;
  name?: string;
  role: string;
  source: 'direct' | 'group' | 'group-synced' | 'elevated';
  groupName?: string;
  groupRole?: string;
  directRole?: string;
  canRemove?: boolean;
  removeNote?: string;
}

interface TeamGroup {
  name: string;
  role: string;
}

type Role = 'admin' | 'operator' | 'viewer';

const ROLE_OPTIONS: Array<{ value: Role; label: string }> = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'operator', label: 'Operator' },
  { value: 'admin', label: 'Admin' },
];

const GroupGlyph = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width={12}
    height={12}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    aria-hidden
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
    />
  </svg>
);

const ArrowUpGlyph = () => (
  <svg
    width={12}
    height={12}
    fill="currentColor"
    viewBox="0 0 20 20"
    aria-hidden
  >
    <path
      fillRule="evenodd"
      d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z"
      clipRule="evenodd"
    />
  </svg>
);

const LockGlyph = () => (
  <svg
    width={20}
    height={20}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    aria-hidden
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
    />
  </svg>
);

function isGroupSource(member: TeamMember): boolean {
  return member.source === 'group' || member.source === 'group-synced';
}

export const TeamMembersPage = () => {
  const classes = useStyles();
  const { team } = useParams<{ team: string }>();
  const api = useApi(butlerApiRef);
  const routes = useButlerRoutes();
  const navigate = useNavigate();
  const { teams, isAdmin } = useTeamContext();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [groups, setGroups] = useState<TeamGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addRole, setAddRole] = useState<Role>('viewer');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const [selfWarning, setSelfWarning] = useState<string | null>(null);

  const currentTeam = teams.find(t => t.name === team);
  const teamDisplayName = currentTeam?.displayName || team;
  // The route team is the one being managed; the console gates member
  // mutation on the viewer's role in that team, and a platform admin
  // viewing a team they are not a member of keeps the admin affordances.
  const canManage = currentTeam?.role === 'admin' || isAdmin;

  const fetchCurrentUser = useCallback(async () => {
    try {
      const user = await api.getCurrentUser();
      setCurrentUserEmail(user?.email || null);
    } catch {
      // Only used to tag "(you)"; not critical.
    }
  }, [api]);

  const loadMembers = useCallback(async () => {
    if (!team) return;
    setLoading(true);
    setError(null);
    try {
      const response = await api.getTeamMembers(team);
      const raw: any[] = response?.members ?? response ?? [];
      const normalized: TeamMember[] = raw.map((m: any) => ({
        email: m.email || m.username || '',
        name: m.name || m.displayName || '',
        role: m.role || 'viewer',
        source: m.source || (m.group || m.groupName ? 'group' : 'direct'),
        groupName: m.groupName || m.group || undefined,
        groupRole: m.groupRole || undefined,
        directRole: m.directRole || undefined,
        canRemove:
          m.canRemove !== undefined ? m.canRemove : m.source !== 'group',
        removeNote: m.removeNote || undefined,
      }));
      setMembers(normalized);
      setGroups(response?.groups || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load team members',
      );
    } finally {
      setLoading(false);
    }
  }, [api, team]);

  useEffect(() => {
    loadMembers();
    fetchCurrentUser();
  }, [loadMembers, fetchCurrentUser]);

  const flashSelfWarning = (message: string) => {
    setSelfWarning(message);
    setTimeout(() => setSelfWarning(null), 5000);
  };

  const handleCloseAdd = () => {
    if (adding) return;
    setAddOpen(false);
    setAddEmail('');
    setAddRole('viewer');
    setAddError(null);
  };

  const handleAddMember = async (e: FormEvent) => {
    e.preventDefault();
    const email = addEmail.trim();
    if (!team || !email) return;
    setAdding(true);
    setAddError(null);
    try {
      await api.addTeamMember(team, { email, role: addRole });
      if (email === currentUserEmail) {
        flashSelfWarning(
          'You modified your own access. Your permissions may have changed.',
        );
      }
      setAdding(false);
      handleCloseAdd();
      loadMembers();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add member');
      setAdding(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!team || !memberToRemove) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      await api.removeTeamMember(team, memberToRemove.email);
      if (memberToRemove.email === currentUserEmail) {
        flashSelfWarning(
          'You removed your own access. You may lose access to this team.',
        );
      }
      setMemberToRemove(null);
      loadMembers();
    } catch (err) {
      setRemoveError(
        err instanceof Error ? err.message : 'Failed to remove member',
      );
    } finally {
      setRemoving(false);
    }
  };

  const sourceLabel = (member: TeamMember): string => {
    if (isGroupSource(member)) {
      return member.groupName ? `via ${member.groupName}` : 'via group';
    }
    if (member.source === 'elevated') {
      return member.groupName ? `${member.groupName} + elevated` : 'elevated';
    }
    return 'direct member';
  };

  const removeLabel = (member: TeamMember) =>
    member.source === 'elevated' ? 'Remove Elevation' : 'Remove Member';

  if (!team) {
    return (
      <ButlerEmptyState
        title="No team selected"
        description="Navigate to a team to manage its members."
      />
    );
  }

  if (loading) return <ButlerLoading />;

  if (error) {
    return (
      <ButlerErrorState
        message="Failed to load members"
        detail={error}
        onRetry={loadMembers}
      />
    );
  }

  const showLegend = members.some(m => m.source !== 'direct');

  return (
    <ButlerStack>
      <ButlerPageHeader
        title="Members"
        subtitle="Manage team members and their roles"
        onBack={() => navigate(routes.team({ team }))}
        actions={
          canManage && (
            <ButlerButton
              startIcon={<PlusIcon />}
              onClick={() => setAddOpen(true)}
            >
              Add Member
            </ButlerButton>
          )
        }
      />

      {selfWarning && (
        <ButlerCallout tone="amber" compact>
          {selfWarning}
        </ButlerCallout>
      )}

      {groups.length > 0 && (
        <ButlerCallout
          tone="info"
          title={
            <span
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              <UsersIcon size={20} />
              Group Access Rules
            </span>
          }
        >
          <p>Members of these groups automatically have access to this team:</p>
          <div className={classes.groupChips}>
            {groups.map(group => (
              <span key={group.name} className={classes.groupChip}>
                <span style={{ fontWeight: 500 }}>{group.name}</span>
                <span className={classes.groupChipRole}>({group.role})</span>
              </span>
            ))}
          </div>
        </ButlerCallout>
      )}

      {members.length === 0 ? (
        <ButlerEmptyState title="No members yet" />
      ) : (
        <ButlerCard flush>
          <ul className={classes.list} aria-label="Team members">
            {members.map((member, index) => {
              const elevated = member.source === 'elevated';
              const group = isGroupSource(member);
              const isSelf = member.email === currentUserEmail;
              const roleClass =
                member.role === 'admin'
                  ? classes.roleAdmin
                  : member.role === 'operator'
                  ? classes.roleOperator
                  : classes.roleViewer;
              return (
                <li
                  key={member.email || `member-${index}`}
                  className={classes.row}
                >
                  <div className={classes.identity}>
                    <div
                      className={clsx(
                        classes.avatar,
                        group && classes.avatarGroup,
                        elevated && classes.avatarElevated,
                      )}
                      aria-hidden
                    >
                      {(member.name || member.email).charAt(0).toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className={classes.nameRow}>
                        <p className={classes.name}>
                          {member.name || member.email}
                          {isSelf && <span className={classes.you}>(you)</span>}
                        </p>
                        {elevated && (
                          <span className={classes.elevatedTag}>ELEVATED</span>
                        )}
                      </div>
                      <div className={classes.meta}>
                        {member.name && (
                          <p className={classes.email}>{member.email}</p>
                        )}
                        <span
                          className={clsx(
                            classes.source,
                            group && classes.sourceGroup,
                            elevated && classes.sourceElevated,
                          )}
                        >
                          {(group || elevated) && <GroupGlyph />}
                          {sourceLabel(member)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className={classes.right}>
                    <div className={classes.roleWrap}>
                      <span className={clsx(classes.role, roleClass)}>
                        {member.role}
                      </span>
                      {elevated && member.groupRole && (
                        <span
                          className={classes.elevatedFrom}
                          title={`Elevated from ${member.groupRole} via ${member.groupName}`}
                        >
                          <ArrowUpGlyph />
                          from {member.groupRole}
                        </span>
                      )}
                    </div>
                    {canManage && member.canRemove !== false && !group && (
                      <button
                        type="button"
                        className={classes.remove}
                        title={member.removeNote || removeLabel(member)}
                        aria-label={`${removeLabel(member)} ${member.email}`}
                        onClick={() => {
                          setRemoveError(null);
                          setMemberToRemove(member);
                        }}
                      >
                        <TrashIcon />
                      </button>
                    )}
                    {group && !member.canRemove && (
                      <span
                        className={classes.lock}
                        title="Access managed via group membership"
                      >
                        <LockGlyph />
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </ButlerCard>
      )}

      {showLegend && (
        <div className={classes.legend}>
          <div className={classes.legendItem}>
            <span className={classes.legendDot} />
            <span>Direct member</span>
          </div>
          <div className={classes.legendItem}>
            <span className={clsx(classes.legendDot, classes.legendGroup)} />
            <span>Via group</span>
          </div>
          <div className={classes.legendItem}>
            <span className={clsx(classes.legendDot, classes.legendElevated)} />
            <span>Elevated</span>
          </div>
        </div>
      )}

      <ButlerDialog
        open={addOpen}
        onClose={handleCloseAdd}
        title="Add Member"
        busy={adding}
        footer={
          <>
            <ButlerButton
              variant="secondary"
              onClick={handleCloseAdd}
              disabled={adding}
            >
              Cancel
            </ButlerButton>
            <ButlerButton
              type="submit"
              form="butler-add-member-form"
              disabled={adding || !addEmail.trim()}
            >
              {adding ? 'Adding...' : 'Add Member'}
            </ButlerButton>
          </>
        }
      >
        <form
          id="butler-add-member-form"
          onSubmit={handleAddMember}
          style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          {addError && (
            <ButlerCallout tone="danger" compact role="alert">
              {addError}
            </ButlerCallout>
          )}
          {groups.length > 0 && (
            <ButlerCallout tone="info" compact>
              If this user already has access via a group, you can only add them
              with a higher role to elevate their permissions.
            </ButlerCallout>
          )}
          <ButlerInput
            label="Email"
            type="email"
            value={addEmail}
            onChange={e => setAddEmail(e.target.value)}
            placeholder="user@example.com"
            required
            autoFocus
          />
          <ButlerSelect
            label="Role"
            value={addRole}
            onChange={e => setAddRole(e.target.value as Role)}
          >
            {ROLE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </ButlerSelect>
        </form>
      </ButlerDialog>

      <ButlerDialog
        open={Boolean(memberToRemove)}
        onClose={() => setMemberToRemove(null)}
        title={memberToRemove ? removeLabel(memberToRemove) : ''}
        busy={removing}
        footer={
          <>
            <ButlerButton
              variant="secondary"
              onClick={() => setMemberToRemove(null)}
              disabled={removing}
            >
              Cancel
            </ButlerButton>
            <ButlerButton
              variant="danger"
              onClick={handleRemoveMember}
              disabled={removing}
            >
              {removing
                ? 'Removing...'
                : memberToRemove
                ? removeLabel(memberToRemove)
                : ''}
            </ButlerButton>
          </>
        }
      >
        {removeError && (
          <ButlerCallout tone="danger" compact role="alert">
            {removeError}
          </ButlerCallout>
        )}
        {memberToRemove?.source === 'elevated' ? (
          <div>
            <p className={classes.confirmText}>
              Remove elevated access for <strong>{memberToRemove.email}</strong>
              ?
            </p>
            <p className={classes.confirmNote}>
              They will revert to {memberToRemove.groupRole} access via{' '}
              {memberToRemove.groupName || 'group'}.
            </p>
          </div>
        ) : (
          <div>
            <p className={classes.confirmText}>
              Are you sure you want to remove{' '}
              <strong>{memberToRemove?.email}</strong> from{' '}
              <strong>{teamDisplayName}</strong>?
            </p>
            {memberToRemove?.email === currentUserEmail && (
              <p className={classes.confirmNote}>
                Warning: You are about to remove yourself from this team. You
                will lose access.
              </p>
            )}
          </div>
        )}
      </ButlerDialog>
    </ButlerStack>
  );
};
