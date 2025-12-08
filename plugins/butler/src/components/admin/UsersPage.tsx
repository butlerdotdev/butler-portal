// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import React, { useEffect, useState, useCallback } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import {
  Progress,
  EmptyState,
} from '@backstage/core-components';
import {
  Typography,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  IconButton,
  Menu,
  MenuItem,
  InputAdornment,
  Box,
  Avatar,
  Tooltip,
  makeStyles,
} from '@material-ui/core';
import AddIcon from '@material-ui/icons/Add';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import RefreshIcon from '@material-ui/icons/Refresh';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import FileCopyIcon from '@material-ui/icons/FileCopy';
import { butlerApiRef } from '../../api/ButlerApi';

const useStyles = makeStyles(theme => ({
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(3),
  },
  actions: {
    display: 'flex',
    gap: theme.spacing(1),
  },
  formField: {
    marginBottom: theme.spacing(2),
  },
  teamChips: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: theme.spacing(0.5),
  },
  nameCell: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1.5),
  },
  avatar: {
    width: 32,
    height: 32,
    fontSize: '0.875rem',
    backgroundColor: theme.palette.primary.main,
  },
  statusActive: {
    backgroundColor: '#4caf50',
    color: '#fff',
  },
  statusPending: {
    backgroundColor: '#ff9800',
    color: '#fff',
  },
  statusDisabled: {
    backgroundColor: theme.palette.grey[500],
    color: '#fff',
  },
  statusLocked: {
    backgroundColor: theme.palette.error.main,
    color: '#fff',
  },
  typeSso: {
    backgroundColor: '#2196f3',
    color: '#fff',
  },
  typeInternal: {
    backgroundColor: '#9c27b0',
    color: '#fff',
  },
  inviteUrlField: {
    fontFamily: 'monospace',
    fontSize: '0.8rem',
  },
  inviteWarning: {
    marginTop: theme.spacing(1),
    color: theme.palette.warning.main,
    fontSize: '0.75rem',
  },
  tableContainer: {
    overflowX: 'auto' as const,
  },
}));

interface UserRecord {
  username: string;
  email: string;
  displayName?: string;
  name?: string;
  phase?: 'Pending' | 'Active' | 'Disabled' | 'Locked';
  disabled?: boolean;
  authType?: 'internal' | 'sso';
  teams?: Array<{ name: string; role?: string }> | string[];
  isAdmin?: boolean;
  role?: string;
  createdAt?: string;
  metadata?: {
    name?: string;
    creationTimestamp?: string;
  };
  spec?: {
    email?: string;
    displayName?: string;
  };
  status?: {
    phase?: string;
    teams?: Array<{ name: string; role?: string }>;
  };
}

export const UsersPage = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();

  // Current user (for self-delete prevention)
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Create user dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ email: '', name: '' });
  const [createError, setCreateError] = useState<string | undefined>();

  // Invite URL dialog (shown after creating user)
  const [inviteUrlOpen, setInviteUrlOpen] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');
  const [copied, setCopied] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<UserRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Actions menu
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuUser, setMenuUser] = useState<UserRecord | null>(null);

  // Inline action loading
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await api.listUsers();
      setUsers(response?.users || []);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [api]);

  const fetchCurrentUser = useCallback(async () => {
    try {
      const user = await api.getCurrentUser();
      setCurrentUser(user);
    } catch {
      // not critical
    }
  }, [api]);

  useEffect(() => {
    fetchUsers();
    fetchCurrentUser();
  }, [fetchUsers, fetchCurrentUser]);

  // --- Helpers ---

  function getUserName(user: UserRecord): string {
    return (
      user.displayName ||
      user.name ||
      user.spec?.displayName ||
      user.metadata?.name ||
      user.email ||
      'Unknown'
    );
  }

  function getUserEmail(user: UserRecord): string {
    return user.email || user.spec?.email || '';
  }

  function getUserUsername(user: UserRecord): string {
    return user.username || user.metadata?.name || getUserEmail(user);
  }

  function getUserPhase(user: UserRecord): string {
    if (user.disabled) return 'Disabled';
    return user.phase || user.status?.phase || 'Active';
  }

  function getUserAuthType(user: UserRecord): 'internal' | 'sso' {
    return user.authType || 'internal';
  }

  function getUserTeams(
    user: UserRecord,
  ): Array<{ name: string; role?: string }> {
    if (user.status?.teams) return user.status.teams;
    if (!user.teams) return [];
    return user.teams.map((t: any) =>
      typeof t === 'string' ? { name: t } : t,
    );
  }

  function isCurrentUser(user: UserRecord): boolean {
    if (!currentUser) return false;
    const userEmail = getUserEmail(user);
    return (
      userEmail === currentUser.email ||
      getUserUsername(user) === currentUser.username
    );
  }

  // --- Handlers ---

  const handleCreateUser = async () => {
    if (!createForm.email.trim()) {
      setCreateError('Email is required.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(createForm.email)) {
      setCreateError('Please enter a valid email address.');
      return;
    }

    setCreating(true);
    setCreateError(undefined);
    try {
      const result = await api.createUser({
        email: createForm.email.trim(),
        name: createForm.name.trim() || undefined,
      });
      setCreateOpen(false);
      setCreateForm({ email: '', name: '' });

      if (result.inviteUrl) {
        setInviteUrl(result.inviteUrl);
        setInviteUrlOpen(true);
      }

      fetchUsers();
    } catch (e) {
      setCreateError(
        e instanceof Error ? e.message : 'Failed to create user.',
      );
    } finally {
      setCreating(false);
    }
  };

  const handleCloseCreate = () => {
    setCreateOpen(false);
    setCreateForm({ email: '', name: '' });
    setCreateError(undefined);
  };

  const handleCopyInviteUrl = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textArea = document.createElement('textarea');
      textArea.value = inviteUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCloseInviteUrl = () => {
    setInviteUrlOpen(false);
    setInviteUrl('');
    setCopied(false);
  };

  const handleToggleDisable = async (user: UserRecord) => {
    const username = getUserUsername(user);
    const isDisabled = getUserPhase(user) === 'Disabled';
    setActionLoading(username);
    handleCloseMenu();
    try {
      if (isDisabled) {
        await api.enableUser(username);
      } else {
        await api.disableUser(username);
      }
      fetchUsers();
    } catch {
      // Error will be visible when the page re-renders
    } finally {
      setActionLoading(null);
    }
  };

  const handleResendInvite = async (user: UserRecord) => {
    const username = getUserUsername(user);
    setActionLoading(username);
    handleCloseMenu();
    try {
      const result = await api.resendInvite(username);
      if (result.inviteUrl) {
        setInviteUrl(result.inviteUrl);
        setInviteUrlOpen(true);
      }
    } catch {
      // silent
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteUser(getUserUsername(deleteTarget));
      setDeleteTarget(null);
      fetchUsers();
    } catch {
      // silent
    } finally {
      setDeleting(false);
    }
  };

  const handleOpenMenu = (
    event: React.MouseEvent<HTMLElement>,
    user: UserRecord,
  ) => {
    setMenuAnchor(event.currentTarget);
    setMenuUser(user);
  };

  const handleCloseMenu = () => {
    setMenuAnchor(null);
    setMenuUser(null);
  };

  // --- Status badge ---

  function getStatusChipClass(phase: string): string | undefined {
    switch (phase) {
      case 'Active':
        return classes.statusActive;
      case 'Pending':
        return classes.statusPending;
      case 'Disabled':
        return classes.statusDisabled;
      case 'Locked':
        return classes.statusLocked;
      default:
        return undefined;
    }
  }

  // --- Render ---

  if (loading) {
    return <Progress />;
  }

  if (error) {
    return (
      <EmptyState
        title="Failed to load users"
        description={error.message}
        missing="info"
      />
    );
  }

  return (
    <div>
      <Button
        startIcon={<ArrowBackIcon />}
        component={RouterLink}
        to="/butler/admin"
        style={{ textTransform: 'none', marginBottom: 16 }}
      >
        Back to Admin
      </Button>

      <div className={classes.header}>
        <div>
          <Typography variant="h4">User Management</Typography>
          <Typography variant="body2" color="textSecondary">
            View all users with platform access (SSO and internal accounts)
          </Typography>
        </div>
        <div className={classes.actions}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={fetchUsers}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={() => setCreateOpen(true)}
          >
            Add User
          </Button>
        </div>
      </div>

      {users.length === 0 ? (
        <EmptyState
          title="No users found"
          description="No users have been created on the platform."
          missing="content"
          action={
            <Button
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
              onClick={() => setCreateOpen(true)}
            >
              Add User
            </Button>
          }
        />
      ) : (
        <div className={classes.tableContainer}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>User</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Teams</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((user, index) => {
                const phase = getUserPhase(user);
                const authType = getUserAuthType(user);
                const teams = getUserTeams(user);
                const username = getUserUsername(user);
                const isLoading = actionLoading === username;

                return (
                  <TableRow key={getUserEmail(user) || `user-${index}`}>
                    <TableCell>
                      <Box className={classes.nameCell}>
                        <Avatar className={classes.avatar}>
                          {(getUserName(user) || getUserEmail(user))
                            .charAt(0)
                            .toUpperCase()}
                        </Avatar>
                        <Box>
                          <Typography variant="body2" style={{ fontWeight: 600 }}>
                            {getUserName(user)}
                          </Typography>
                          {authType === 'internal' && username && (
                            <Typography variant="caption" color="textSecondary">
                              @{username}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {getUserEmail(user)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={authType === 'sso' ? 'SSO' : 'Internal'}
                        className={
                          authType === 'sso'
                            ? classes.typeSso
                            : classes.typeInternal
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={phase}
                        className={getStatusChipClass(phase)}
                        variant={
                          getStatusChipClass(phase) ? 'default' : 'outlined'
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <div className={classes.teamChips}>
                        {teams.length === 0 ? (
                          <Typography
                            variant="body2"
                            color="textSecondary"
                          >
                            --
                          </Typography>
                        ) : (
                          <>
                            {teams.slice(0, 2).map(team => (
                              <Chip
                                key={team.name}
                                label={
                                  team.role
                                    ? `${team.name} (${team.role})`
                                    : team.name
                                }
                                size="small"
                                variant="outlined"
                              />
                            ))}
                            {teams.length > 2 && (
                              <Typography
                                variant="caption"
                                color="textSecondary"
                              >
                                +{teams.length - 2}
                              </Typography>
                            )}
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell align="right">
                      {authType === 'sso' ? (
                        <Typography
                          variant="caption"
                          color="textSecondary"
                        >
                          Managed via Teams
                        </Typography>
                      ) : (
                        <Tooltip title="Actions">
                          <IconButton
                            size="small"
                            onClick={e => handleOpenMenu(e, user)}
                            disabled={isLoading}
                          >
                            <MoreVertIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Actions Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor) && Boolean(menuUser)}
        onClose={handleCloseMenu}
      >
        {menuUser &&
          getUserPhase(menuUser) === 'Pending' && (
            <MenuItem
              onClick={() => {
                if (menuUser) handleResendInvite(menuUser);
              }}
            >
              Resend Invite
            </MenuItem>
          )}
        {menuUser &&
          getUserAuthType(menuUser) === 'internal' && (
            <MenuItem
              onClick={() => {
                if (menuUser) handleToggleDisable(menuUser);
              }}
            >
              {getUserPhase(menuUser) === 'Disabled' ? 'Enable' : 'Disable'}
            </MenuItem>
          )}
        {menuUser &&
          getUserAuthType(menuUser) === 'internal' &&
          !isCurrentUser(menuUser) && (
            <MenuItem
              onClick={() => {
                setDeleteTarget(menuUser);
                handleCloseMenu();
              }}
              style={{ color: '#f44336' }}
            >
              Delete
            </MenuItem>
          )}
        {menuUser && isCurrentUser(menuUser) && (
          <MenuItem disabled>
            Cannot delete yourself
          </MenuItem>
        )}
      </Menu>

      {/* Create User Dialog */}
      <Dialog
        open={createOpen}
        onClose={handleCloseCreate}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Add New User</DialogTitle>
        <DialogContent>
          {createError && (
            <Typography color="error" variant="body2" gutterBottom>
              {createError}
            </Typography>
          )}
          <TextField
            className={classes.formField}
            label="Email Address"
            type="email"
            value={createForm.email}
            onChange={e =>
              setCreateForm(prev => ({ ...prev, email: e.target.value }))
            }
            fullWidth
            required
            autoFocus
            margin="dense"
            placeholder="user@example.com"
            helperText="The email address of the user to invite."
          />
          <TextField
            className={classes.formField}
            label="Display Name (optional)"
            value={createForm.name}
            onChange={e =>
              setCreateForm(prev => ({ ...prev, name: e.target.value }))
            }
            fullWidth
            margin="dense"
            placeholder="John Doe"
            helperText="Optional display name for the user."
          />
          <Typography variant="caption" color="textSecondary">
            An invite link will be generated. Share it with the user to let
            them set their password.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseCreate} disabled={creating}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateUser}
            color="primary"
            variant="contained"
            disabled={creating}
          >
            {creating ? 'Creating...' : 'Create User'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Invite URL Dialog */}
      <Dialog
        open={inviteUrlOpen}
        onClose={handleCloseInviteUrl}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Invite Link Generated</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="textSecondary" gutterBottom>
            Share this link with the user. They will use it to set their
            password and activate their account.
          </Typography>
          <TextField
            fullWidth
            value={inviteUrl}
            margin="dense"
            variant="outlined"
            InputProps={{
              readOnly: true,
              className: classes.inviteUrlField,
              endAdornment: (
                <InputAdornment position="end">
                  <Tooltip title={copied ? 'Copied!' : 'Copy to clipboard'}>
                    <IconButton
                      size="small"
                      onClick={handleCopyInviteUrl}
                    >
                      <FileCopyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </InputAdornment>
              ),
            }}
          />
          {copied && (
            <Typography
              variant="caption"
              style={{ color: '#4caf50', marginTop: 4, display: 'block' }}
            >
              Copied to clipboard!
            </Typography>
          )}
          <Typography className={classes.inviteWarning}>
            This link is only shown once and expires in 48 hours.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleCloseInviteUrl}
            color="primary"
            variant="contained"
          >
            Done
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete User</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Are you sure you want to delete user{' '}
            <strong>{deleteTarget ? getUserUsername(deleteTarget) : ''}</strong>?
            This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteUser}
            style={{ color: '#f44336' }}
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete User'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};
