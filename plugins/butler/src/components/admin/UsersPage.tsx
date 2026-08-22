// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback, useEffect, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';
import { butlerApiRef } from '../../api/ButlerApi';
import { useButlerRoutes } from '../../hooks/useButlerRoutes';
import { useTeamContext } from '../../hooks/useTeamContext';
import { butlerTokens, rgb, rgba } from '../../theme';
import {
  ButlerAccessDenied,
  ButlerButton,
  ButlerCallout,
  ButlerCard,
  ButlerChip,
  ButlerDialog,
  ButlerErrorState,
  ButlerInput,
  ButlerLoading,
  ButlerPageHeader,
  ButlerStack,
  ButlerTable,
  PlusIcon,
} from '../ui';
import type { ButlerColumn } from '../ui';

export interface UserRecord {
  username?: string;
  email?: string;
  displayName?: string;
  name?: string;
  phase?: 'Pending' | 'Active' | 'Disabled' | 'Locked' | string;
  disabled?: boolean;
  authType?: 'internal' | 'sso';
  teams?: Array<{ name: string; role?: string }> | string[];
  isAdmin?: boolean;
  metadata?: { name?: string };
  spec?: { email?: string; displayName?: string };
  status?: { phase?: string; teams?: Array<{ name: string; role?: string }> };
}

const getName = (u: UserRecord) =>
  u.displayName ||
  u.name ||
  u.spec?.displayName ||
  u.metadata?.name ||
  u.email ||
  'Unknown';
const getEmail = (u: UserRecord) => u.email || u.spec?.email || '';
const getUsername = (u: UserRecord) =>
  u.username || u.metadata?.name || getEmail(u);
const getPhase = (u: UserRecord) =>
  u.disabled ? 'Disabled' : u.phase || u.status?.phase || 'Active';
const getAuthType = (u: UserRecord): 'internal' | 'sso' =>
  u.authType || 'internal';
const getTeams = (u: UserRecord): string[] => {
  const raw = u.status?.teams ?? u.teams ?? [];
  return raw.map((t: string | { name: string }) =>
    typeof t === 'string' ? t : t.name,
  );
};

const statusTone = (phase: string) => {
  switch (phase) {
    case 'Active':
      return 'green' as const;
    case 'Pending':
      return 'yellow' as const;
    case 'Locked':
      return 'red' as const;
    default:
      return 'neutral' as const;
  }
};

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  return {
    user: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    },
    avatar: {
      width: 32,
      height: 32,
      borderRadius: '50%',
      backgroundColor: rgb(p.neutral[700]),
      color: rgb(p.neutral[300]),
      fontSize: 14,
      fontWeight: 500,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    userName: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      fontWeight: 500,
      color: rgb(p.neutral[200]),
    },
    userHandle: {
      margin: 0,
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.subtle,
    },
    email: { color: rgb(p.neutral[300]) },
    violetChip: {
      backgroundColor: rgba(p.violet[500], 0.2),
      color: rgb(p.violet[400]),
    },
    teams: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 4,
    },
    teamChip: {
      backgroundColor: rgb(p.neutral[700]),
      color: rgb(p.neutral[300]),
      fontWeight: 400,
    },
    more: { fontSize: 12, color: t.text.subtle },
    dash: { fontSize: 12, color: t.text.subtle },
    actions: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 8,
    },
    managed: { fontSize: 12, color: t.text.subtle, whiteSpace: 'nowrap' },
    danger: {
      color: rgb(p.red[400]),
      '&:hover': { color: rgb(p.red[300]) },
    },
    checkbox: {
      width: 16,
      height: 16,
      accentColor: rgb(p.green[500]),
      cursor: 'pointer',
    },
    selectedRow: { backgroundColor: rgba(p.blue[500], 0.05) },
    bulkBar: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      padding: 12,
      backgroundColor: rgba(p.blue[500], 0.05),
      borderColor: rgba(p.blue[500], 0.2),
      fontSize: 14,
      color: rgb(p.neutral[200]),
    },
    bulkActions: { display: 'flex', gap: 8 },
    empty: {
      padding: 32,
      textAlign: 'center',
      fontSize: 14,
      color: t.text.subtle,
    },
    text: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.muted,
      '& strong': { color: rgb(p.neutral[200]), fontWeight: 600 },
    },
    note: {
      margin: 0,
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.subtle,
    },
    inviteRow: { position: 'relative' },
    inviteInput: { paddingRight: 88 },
    inviteCopy: { position: 'absolute', right: 4, top: 4 },
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

export const UsersPage = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const routes = useButlerRoutes();
  const { isAdmin } = useTeamContext();

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<Error | undefined>();
  const [error, setError] = useState('');
  const [currentUser, setCurrentUser] = useState<{
    email?: string;
    username?: string;
  } | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ email: '', name: '' });
  const [createError, setCreateError] = useState('');

  const [inviteUrl, setInviteUrl] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<UserRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toggleTarget, setToggleTarget] = useState<UserRecord | null>(null);
  const [toggling, setToggling] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setLoadError(undefined);
    try {
      const response = await api.listUsers();
      setUsers(response?.users || []);
    } catch (e) {
      setLoadError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (!isAdmin) return;
    fetchUsers();
    api
      .getCurrentUser()
      .then(u => setCurrentUser(u))
      .catch(() => undefined);
  }, [api, fetchUsers, isAdmin]);

  const isSelf = (u: UserRecord) =>
    !!currentUser &&
    ((!!getEmail(u) && getEmail(u) === currentUser.email) ||
      (!!currentUser.username && getUsername(u) === currentUser.username));

  const fail = (e: unknown, fallback: string) =>
    setError(e instanceof Error ? e.message : fallback);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = createForm.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setCreateError('Please enter a valid email address.');
      return;
    }
    setCreating(true);
    setCreateError('');
    try {
      const result = await api.createUser({
        email,
        name: createForm.name.trim() || undefined,
      });
      setCreateOpen(false);
      setCreateForm({ email: '', name: '' });
      if (result.inviteUrl) {
        setInviteUrl(result.inviteUrl);
        setInviteOpen(true);
      }
      fetchUsers();
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : 'Failed to create user.',
      );
    } finally {
      setCreating(false);
    }
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
    } catch {
      const area = document.createElement('textarea');
      area.value = inviteUrl;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const closeInvite = () => {
    setInviteOpen(false);
    setInviteUrl('');
    setCopied(false);
  };

  const resendInvite = async (u: UserRecord) => {
    try {
      const result = await api.resendInvite(getUsername(u));
      if (result.inviteUrl) {
        setInviteUrl(result.inviteUrl);
        setInviteOpen(true);
      }
    } catch (e) {
      fail(e, 'Failed to resend invite');
    }
  };

  const confirmToggle = async () => {
    if (!toggleTarget) return;
    const username = getUsername(toggleTarget);
    const disabled = getPhase(toggleTarget) === 'Disabled';
    setToggling(true);
    try {
      if (disabled) await api.enableUser(username);
      else await api.disableUser(username);
      setToggleTarget(null);
      fetchUsers();
    } catch (e) {
      fail(e, `Failed to ${disabled ? 'enable' : 'disable'} user`);
      setToggleTarget(null);
    } finally {
      setToggling(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteUser(getUsername(deleteTarget));
      setDeleteTarget(null);
      fetchUsers();
    } catch (e) {
      fail(e, 'Failed to delete user');
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const internalUsers = users.filter(u => getAuthType(u) === 'internal');
  const toggleSelect = (username: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(username)) next.delete(username);
      else next.add(username);
      return next;
    });
  const toggleSelectAll = () =>
    setSelected(
      selected.size === internalUsers.length
        ? new Set()
        : new Set(internalUsers.map(getUsername)),
    );

  const bulkDelete = async () => {
    setBulkDeleting(true);
    for (const username of selected) {
      const user = users.find(u => getUsername(u) === username);
      if (user && isSelf(user)) continue;
      try {
        await api.deleteUser(username);
      } catch {
        // Continue with the remaining users, as the console does.
      }
    }
    setSelected(new Set());
    setBulkDeleting(false);
    setBulkOpen(false);
    fetchUsers();
  };

  if (!isAdmin) {
    return (
      <ButlerAccessDenied
        resourceType="page"
        message="Platform administrator access is required to manage users."
        homeTo={routes.root()}
      />
    );
  }

  const showSelect = internalUsers.length > 0;
  const columns: ButlerColumn<UserRecord>[] = [
    ...(showSelect
      ? [
          {
            id: 'select',
            width: 40,
            header: (
              <input
                type="checkbox"
                className={classes.checkbox}
                aria-label="Select all internal users"
                checked={
                  selected.size > 0 && selected.size === internalUsers.length
                }
                onChange={toggleSelectAll}
              />
            ),
            render: (u: UserRecord) =>
              getAuthType(u) === 'internal' ? (
                <input
                  type="checkbox"
                  className={classes.checkbox}
                  aria-label={`Select ${getName(u)}`}
                  checked={selected.has(getUsername(u))}
                  onChange={() => toggleSelect(getUsername(u))}
                />
              ) : null,
          } as ButlerColumn<UserRecord>,
        ]
      : []),
    {
      id: 'user',
      header: 'User',
      render: u => (
        <div className={classes.user}>
          <div className={classes.avatar} aria-hidden>
            {(getName(u) || getEmail(u)).charAt(0).toUpperCase()}
          </div>
          <div>
            <p className={classes.userName}>{getName(u)}</p>
            {getAuthType(u) === 'internal' && getUsername(u) && (
              <p className={classes.userHandle}>@{getUsername(u)}</p>
            )}
          </div>
        </div>
      ),
    },
    {
      id: 'email',
      header: 'Email',
      render: u => <span className={classes.email}>{getEmail(u)}</span>,
    },
    {
      id: 'type',
      header: 'Type',
      render: u =>
        getAuthType(u) === 'sso' ? (
          <ButlerChip tone="blue">SSO</ButlerChip>
        ) : (
          <ButlerChip className={classes.violetChip}>Internal</ButlerChip>
        ),
    },
    {
      id: 'status',
      header: 'Status',
      render: u => {
        const phase = getPhase(u);
        return <ButlerChip tone={statusTone(phase)}>{phase}</ButlerChip>;
      },
    },
    {
      id: 'teams',
      header: 'Teams',
      render: u => {
        const teams = getTeams(u);
        if (teams.length === 0) return <span className={classes.dash}>-</span>;
        return (
          <div className={classes.teams}>
            {teams.slice(0, 2).map(team => (
              <ButlerChip key={team} className={classes.teamChip}>
                {team}
              </ButlerChip>
            ))}
            {teams.length > 2 && (
              <span className={classes.more}>+{teams.length - 2}</span>
            )}
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      render: u => {
        if (getAuthType(u) === 'sso') {
          return <span className={classes.managed}>Managed via Teams</span>;
        }
        const phase = getPhase(u);
        return (
          <div className={classes.actions}>
            {phase === 'Pending' && (
              <ButlerButton
                variant="ghost"
                size="sm"
                onClick={() => resendInvite(u)}
              >
                Resend Invite
              </ButlerButton>
            )}
            <ButlerButton
              variant="ghost"
              size="sm"
              onClick={() => setToggleTarget(u)}
            >
              {phase === 'Disabled' ? 'Enable' : 'Disable'}
            </ButlerButton>
            {!isSelf(u) && (
              <ButlerButton
                variant="ghost"
                size="sm"
                className={classes.danger}
                onClick={() => setDeleteTarget(u)}
              >
                Delete
              </ButlerButton>
            )}
          </div>
        );
      },
    },
  ];

  let body: React.ReactNode;
  if (loading) {
    body = <ButlerLoading />;
  } else if (loadError) {
    body = (
      <ButlerErrorState
        message="Failed to load users"
        detail={loadError.message}
        onRetry={fetchUsers}
      />
    );
  } else if (users.length === 0) {
    body = (
      <ButlerCard flush className={classes.empty}>
        No users found. Create your first user or add members to teams.
      </ButlerCard>
    );
  } else {
    body = (
      <ButlerTable<UserRecord>
        aria-label="Users"
        columns={columns}
        rows={users}
        rowKey={u => getUsername(u) || getEmail(u)}
      />
    );
  }

  const targetName = deleteTarget ? getUsername(deleteTarget) : '';
  const toggleDisabled =
    toggleTarget !== null && getPhase(toggleTarget) === 'Disabled';

  return (
    <ButlerStack>
      <ButlerPageHeader
        title="User Management"
        subtitle="View all users with platform access (SSO and internal accounts)"
        actions={
          <ButlerButton
            startIcon={<PlusIcon />}
            onClick={() => setCreateOpen(true)}
          >
            Add User
          </ButlerButton>
        }
      />

      {error && (
        <ButlerErrorState
          message={error}
          onRetry={() => setError('')}
          retryLabel="Dismiss"
        />
      )}

      {selected.size > 0 && (
        <ButlerCard flush className={classes.bulkBar} role="status">
          <span>
            {selected.size} user{selected.size === 1 ? '' : 's'} selected
          </span>
          <div className={classes.bulkActions}>
            <ButlerButton
              variant="secondary"
              size="sm"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </ButlerButton>
            <ButlerButton
              variant="danger"
              size="sm"
              onClick={() => setBulkOpen(true)}
            >
              Delete {selected.size}
            </ButlerButton>
          </div>
        </ButlerCard>
      )}

      {body}

      <ButlerDialog
        open={createOpen}
        onClose={() => {
          if (creating) return;
          setCreateOpen(false);
          setCreateError('');
        }}
        busy={creating}
        title="Add New User"
        footer={
          <>
            <ButlerButton
              variant="secondary"
              disabled={creating}
              onClick={() => {
                setCreateOpen(false);
                setCreateError('');
              }}
            >
              Cancel
            </ButlerButton>
            <ButlerButton
              type="submit"
              form="create-user-form"
              disabled={creating}
            >
              {creating ? 'Creating...' : 'Create User'}
            </ButlerButton>
          </>
        }
      >
        <form
          id="create-user-form"
          onSubmit={handleCreate}
          style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          {createError && (
            <p className={classes.formError} role="alert">
              {createError}
            </p>
          )}
          <ButlerInput
            id="new-user-email"
            label="Email Address"
            type="email"
            value={createForm.email}
            onChange={e =>
              setCreateForm(prev => ({ ...prev, email: e.target.value }))
            }
            placeholder="user@example.com"
            required
            autoFocus
          />
          <ButlerInput
            id="new-user-name"
            label="Display Name (optional)"
            value={createForm.name}
            onChange={e =>
              setCreateForm(prev => ({ ...prev, name: e.target.value }))
            }
            placeholder="John Doe"
          />
          <p className={classes.note}>
            An invite link will be generated. Share it with the user to let them
            set their password.
          </p>
        </form>
      </ButlerDialog>

      <ButlerDialog
        open={inviteOpen}
        onClose={closeInvite}
        title="Invite Link Generated"
        footer={<ButlerButton onClick={closeInvite}>Done</ButlerButton>}
      >
        <p className={classes.text}>
          Share this link with the user. They will use it to set their password
          and activate their account.
        </p>
        <div className={classes.inviteRow}>
          <ButlerInput
            aria-label="Invite link"
            readOnly
            mono
            value={inviteUrl}
            className={classes.inviteInput}
          />
          <ButlerButton
            size="sm"
            className={classes.inviteCopy}
            onClick={copyInvite}
          >
            {copied ? 'Copied!' : 'Copy'}
          </ButlerButton>
        </div>
        <ButlerCallout tone="warning" compact>
          <p className={classes.note}>
            This link is only shown once and expires in 48 hours.
          </p>
        </ButlerCallout>
      </ButlerDialog>

      <ButlerDialog
        open={toggleTarget !== null}
        onClose={() => setToggleTarget(null)}
        busy={toggling}
        title={toggleDisabled ? 'Enable User' : 'Disable User'}
        footer={
          <>
            <ButlerButton
              variant="secondary"
              onClick={() => setToggleTarget(null)}
              disabled={toggling}
            >
              Cancel
            </ButlerButton>
            <ButlerButton
              variant={toggleDisabled ? 'primary' : 'danger'}
              onClick={confirmToggle}
              disabled={toggling}
            >
              {toggling
                ? toggleDisabled
                  ? 'Enabling...'
                  : 'Disabling...'
                : toggleDisabled
                ? 'Enable User'
                : 'Disable User'}
            </ButlerButton>
          </>
        }
      >
        <p className={classes.text}>
          {toggleDisabled ? 'Re-enable' : 'Disable'} user{' '}
          <strong>{toggleTarget ? getUsername(toggleTarget) : ''}</strong>?
          {toggleDisabled
            ? ' They will be able to sign in again.'
            : ' They will no longer be able to sign in until re-enabled.'}
        </p>
      </ButlerDialog>

      <ButlerDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        busy={deleting}
        title="Delete User"
        footer={
          <>
            <ButlerButton
              variant="secondary"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancel
            </ButlerButton>
            <ButlerButton
              variant="danger"
              onClick={confirmDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete User'}
            </ButlerButton>
          </>
        }
      >
        <p className={classes.text}>
          Are you sure you want to delete user <strong>{targetName}</strong>?
          This action cannot be undone.
        </p>
      </ButlerDialog>

      <ButlerDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        busy={bulkDeleting}
        title={`Delete ${selected.size} user${selected.size === 1 ? '' : 's'}`}
        footer={
          <>
            <ButlerButton
              variant="secondary"
              onClick={() => setBulkOpen(false)}
              disabled={bulkDeleting}
            >
              Cancel
            </ButlerButton>
            <ButlerButton
              variant="danger"
              onClick={bulkDelete}
              disabled={bulkDeleting}
            >
              {bulkDeleting ? 'Deleting...' : `Delete ${selected.size}`}
            </ButlerButton>
          </>
        }
      >
        <p className={classes.text}>
          The selected internal users will be permanently deleted. Your own
          account is skipped. This action cannot be undone.
        </p>
      </ButlerDialog>
    </ButlerStack>
  );
};
