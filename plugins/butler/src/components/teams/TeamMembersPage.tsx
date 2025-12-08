// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState, useCallback } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import {
  InfoCard,
  Progress,
  EmptyState,
} from '@backstage/core-components';
import {
  Grid,
  Typography,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  IconButton,
  Box,
  Avatar,
  Tooltip,
  makeStyles,
} from '@material-ui/core';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import PersonAddIcon from '@material-ui/icons/PersonAdd';
import DeleteIcon from '@material-ui/icons/Delete';
import LockIcon from '@material-ui/icons/Lock';
import GroupIcon from '@material-ui/icons/Group';
import ArrowUpwardIcon from '@material-ui/icons/ArrowUpward';
import { butlerApiRef } from '../../api/ButlerApi';
import { useTeamContext } from '../../hooks/useTeamContext';

const useStyles = makeStyles(theme => ({
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(2),
  },
  nameCell: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1.5),
  },
  avatarDirect: {
    width: 36,
    height: 36,
    fontSize: '0.875rem',
    backgroundColor: theme.palette.grey[600],
  },
  avatarGroup: {
    width: 36,
    height: 36,
    fontSize: '0.875rem',
    backgroundColor: '#1976d2',
  },
  avatarElevated: {
    width: 36,
    height: 36,
    fontSize: '0.875rem',
    backgroundColor: '#ff9800',
    border: '2px solid rgba(255, 152, 0, 0.4)',
  },
  elevatedChip: {
    backgroundColor: 'rgba(255, 152, 0, 0.15)',
    color: '#ff9800',
    fontWeight: 600,
    fontSize: '0.625rem',
    height: 18,
  },
  adminChip: {
    backgroundColor: theme.palette.secondary.main,
    color: theme.palette.secondary.contrastText,
  },
  operatorChip: {
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.primary.contrastText,
  },
  viewerChip: {
    backgroundColor: theme.palette.grey[500],
    color: theme.palette.common.white,
  },
  sourceGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    color: '#1976d2',
    fontSize: '0.75rem',
  },
  sourceElevated: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    color: 'rgba(255, 152, 0, 0.7)',
    fontSize: '0.75rem',
  },
  sourceDirect: {
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
  },
  elevationInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    color: '#ff9800',
    fontSize: '0.75rem',
  },
  groupBanner: {
    padding: theme.spacing(2),
    backgroundColor: 'rgba(25, 118, 210, 0.08)',
    border: '1px solid rgba(25, 118, 210, 0.2)',
    borderRadius: theme.shape.borderRadius,
    marginBottom: theme.spacing(2),
  },
  groupBannerChips: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: theme.spacing(1),
    marginTop: theme.spacing(1),
  },
  groupBannerChip: {
    backgroundColor: 'rgba(25, 118, 210, 0.15)',
    color: '#1976d2',
  },
  legend: {
    display: 'flex',
    gap: theme.spacing(3),
    marginTop: theme.spacing(2),
    alignItems: 'center',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
  },
  selfTag: {
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
    marginLeft: theme.spacing(1),
  },
  formField: {
    marginBottom: theme.spacing(2),
    minWidth: 200,
  },
}));

interface TeamMember {
  email: string;
  name?: string;
  role: string;
  source: 'direct' | 'group' | 'group-synced' | 'elevated';
  groupName?: string;
  group?: string;
  groupRole?: string;
  directRole?: string;
  canRemove?: boolean;
  removeNote?: string;
}

interface TeamGroup {
  name: string;
  role: string;
}

export const TeamMembersPage = () => {
  const classes = useStyles();
  const { team } = useParams<{ team: string }>();
  const api = useApi(butlerApiRef);
  const { teams } = useTeamContext();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [groups, setGroups] = useState<TeamGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Current user for self-modification detection
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  // Add member dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addRole, setAddRole] = useState<'admin' | 'operator' | 'viewer'>(
    'viewer',
  );
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Remove member dialog
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(
    null,
  );
  const [removing, setRemoving] = useState(false);

  // Self-modification warning
  const [selfWarning, setSelfWarning] = useState<string | null>(null);

  const currentTeam = teams.find(t => t.name === team);
  const isTeamAdmin = currentTeam?.role === 'admin';

  const fetchCurrentUser = useCallback(async () => {
    try {
      const user = await api.getCurrentUser();
      setCurrentUserEmail(user?.email || null);
    } catch {
      // not critical
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
        canRemove: m.canRemove !== undefined ? m.canRemove : m.source !== 'group',
        removeNote: m.removeNote || undefined,
      }));
      setMembers(normalized);

      // Also extract groups from the response if present
      const groupsData: TeamGroup[] = response?.groups || [];
      setGroups(groupsData);
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

  // --- Handlers ---

  const handleAddMember = async () => {
    if (!team || !addEmail.trim()) return;

    setAdding(true);
    setAddError(null);

    try {
      await api.addTeamMember(team, {
        email: addEmail.trim(),
        role: addRole,
      });

      // Self-modification warning
      if (addEmail.trim() === currentUserEmail) {
        setSelfWarning(
          'You modified your own access. Your permissions may have changed.',
        );
        setTimeout(() => setSelfWarning(null), 5000);
      }

      setAddOpen(false);
      setAddEmail('');
      setAddRole('viewer');
      loadMembers();
    } catch (err) {
      setAddError(
        err instanceof Error ? err.message : 'Failed to add member',
      );
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!team || !memberToRemove) return;

    setRemoving(true);

    try {
      await api.removeTeamMember(team, memberToRemove.email);

      // Self-modification warning
      if (memberToRemove.email === currentUserEmail) {
        setSelfWarning(
          'You removed your own access. You may lose access to this team.',
        );
        setTimeout(() => setSelfWarning(null), 5000);
      }

      setMemberToRemove(null);
      loadMembers();
    } catch {
      // silent
    } finally {
      setRemoving(false);
    }
  };

  const handleCloseAdd = () => {
    setAddOpen(false);
    setAddEmail('');
    setAddRole('viewer');
    setAddError(null);
  };

  // --- Helpers ---

  function getAvatarClass(source: string): string {
    switch (source) {
      case 'elevated':
        return classes.avatarElevated;
      case 'group':
      case 'group-synced':
        return classes.avatarGroup;
      default:
        return classes.avatarDirect;
    }
  }

  function getRoleChipClass(role: string): string | undefined {
    switch (role) {
      case 'admin':
        return classes.adminChip;
      case 'operator':
        return classes.operatorChip;
      case 'viewer':
        return classes.viewerChip;
      default:
        return undefined;
    }
  }

  function getSourceLabel(member: TeamMember): string {
    const groupName = member.groupName || member.group;
    switch (member.source) {
      case 'group':
      case 'group-synced':
        return groupName ? `via ${groupName}` : 'via group';
      case 'elevated':
        return groupName ? `${groupName} + elevated` : 'elevated';
      default:
        return 'direct member';
    }
  }

  function getRemoveLabel(member: TeamMember): string {
    return member.source === 'elevated'
      ? 'Remove Elevation'
      : 'Remove Member';
  }

  // --- Render ---

  if (!team) {
    return (
      <EmptyState
        title="No team selected"
        description="Navigate to a team to manage its members."
        missing="info"
      />
    );
  }

  if (loading) {
    return <Progress />;
  }

  if (error) {
    return (
      <Box p={2}>
        <Typography color="error" variant="h6">
          Failed to load members
        </Typography>
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      </Box>
    );
  }

  return (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <Button
          startIcon={<ArrowBackIcon />}
          component={RouterLink}
          to={`/butler/t/${team}`}
          style={{ textTransform: 'none', marginBottom: 16 }}
        >
          Back to Dashboard
        </Button>
      </Grid>

      <Grid item xs={12}>
        <div className={classes.header}>
          <div>
            <Typography variant="h4">Members</Typography>
            <Typography variant="body2" color="textSecondary">
              Manage team members and their roles
            </Typography>
          </div>
          {isTeamAdmin && (
            <Button
              variant="contained"
              color="primary"
              startIcon={<PersonAddIcon />}
              onClick={() => setAddOpen(true)}
            >
              Add Member
            </Button>
          )}
        </div>
      </Grid>

      {/* Self-modification warning */}
      {selfWarning && (
        <Grid item xs={12}>
          <Box
            p={2}
            style={{
              backgroundColor: 'rgba(255, 152, 0, 0.1)',
              border: '1px solid rgba(255, 152, 0, 0.3)',
              borderRadius: 4,
            }}
          >
            <Typography variant="body2" style={{ color: '#ff9800' }}>
              {selfWarning}
            </Typography>
          </Box>
        </Grid>
      )}

      {/* Group Access Rules Banner */}
      {groups.length > 0 && (
        <Grid item xs={12}>
          <Box className={classes.groupBanner}>
            <Box display="flex" alignItems="center" gridGap={8}>
              <GroupIcon style={{ color: '#1976d2' }} fontSize="small" />
              <Typography
                variant="subtitle2"
                style={{ color: '#1976d2' }}
              >
                Group Access Rules
              </Typography>
            </Box>
            <Typography
              variant="body2"
              color="textSecondary"
              style={{ marginTop: 4 }}
            >
              Members of these groups automatically have access to this team:
            </Typography>
            <div className={classes.groupBannerChips}>
              {groups.map(group => (
                <Chip
                  key={group.name}
                  label={`${group.name} (${group.role})`}
                  size="small"
                  className={classes.groupBannerChip}
                />
              ))}
            </div>
          </Box>
        </Grid>
      )}

      {/* Members Table */}
      <Grid item xs={12}>
        {members.length === 0 ? (
          <EmptyState
            title="No members"
            description="This team has no members yet."
            missing="content"
          />
        ) : (
          <InfoCard title={`Members (${members.length})`}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Member</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Source</TableCell>
                  {isTeamAdmin && (
                    <TableCell align="right">Actions</TableCell>
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {members.map((member, index) => {
                  const isElevated = member.source === 'elevated';
                  const isGroup =
                    member.source === 'group' ||
                    member.source === 'group-synced';
                  const isSelf = member.email === currentUserEmail;

                  return (
                    <TableRow key={member.email || `member-${index}`}>
                      <TableCell>
                        <Box className={classes.nameCell}>
                          <Avatar className={getAvatarClass(member.source)}>
                            {(member.name || member.email)
                              .charAt(0)
                              .toUpperCase()}
                          </Avatar>
                          <Box>
                            <Box display="flex" alignItems="center">
                              <Typography
                                variant="body2"
                                style={{ fontWeight: 600 }}
                              >
                                {member.name || member.email}
                              </Typography>
                              {isSelf && (
                                <span className={classes.selfTag}>
                                  (you)
                                </span>
                              )}
                              {isElevated && (
                                <Chip
                                  label="ELEVATED"
                                  size="small"
                                  className={classes.elevatedChip}
                                  style={{ marginLeft: 8 }}
                                />
                              )}
                            </Box>
                            {member.name && (
                              <Typography
                                variant="caption"
                                color="textSecondary"
                              >
                                {member.email}
                              </Typography>
                            )}
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box display="flex" alignItems="center" gridGap={8}>
                          <Chip
                            size="small"
                            label={member.role}
                            className={getRoleChipClass(member.role)}
                          />
                          {isElevated && member.groupRole && (
                            <span className={classes.elevationInfo}>
                              <ArrowUpwardIcon
                                style={{ fontSize: 12 }}
                              />
                              from {member.groupRole}
                            </span>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        {isGroup ? (
                          <span className={classes.sourceGroup}>
                            <GroupIcon style={{ fontSize: 14 }} />
                            {getSourceLabel(member)}
                          </span>
                        ) : isElevated ? (
                          <span className={classes.sourceElevated}>
                            <GroupIcon style={{ fontSize: 14 }} />
                            {getSourceLabel(member)}
                          </span>
                        ) : (
                          <span className={classes.sourceDirect}>
                            {getSourceLabel(member)}
                          </span>
                        )}
                      </TableCell>
                      {isTeamAdmin && (
                        <TableCell align="right">
                          {member.canRemove !== false &&
                            !isGroup && (
                              <Tooltip
                                title={
                                  member.removeNote || getRemoveLabel(member)
                                }
                              >
                                <IconButton
                                  size="small"
                                  onClick={() => setMemberToRemove(member)}
                                  style={
                                    isElevated
                                      ? { color: '#ff9800' }
                                      : { color: '#f44336' }
                                  }
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                          {isGroup && !member.canRemove && (
                            <Tooltip title="Access managed via group membership">
                              <LockIcon
                                fontSize="small"
                                color="disabled"
                              />
                            </Tooltip>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </InfoCard>
        )}
      </Grid>

      {/* Legend */}
      {members.some(m => m.source !== 'direct') && (
        <Grid item xs={12}>
          <div className={classes.legend}>
            <div className={classes.legendItem}>
              <div
                className={classes.legendDot}
                style={{ backgroundColor: '#757575' }}
              />
              <span>Direct member</span>
            </div>
            <div className={classes.legendItem}>
              <div
                className={classes.legendDot}
                style={{ backgroundColor: '#1976d2' }}
              />
              <span>Via group</span>
            </div>
            <div className={classes.legendItem}>
              <div
                className={classes.legendDot}
                style={{
                  backgroundColor: '#ff9800',
                  border: '1px solid rgba(255, 152, 0, 0.4)',
                }}
              />
              <span>Elevated</span>
            </div>
          </div>
        </Grid>
      )}

      {/* Add Member Dialog */}
      <Dialog
        open={addOpen}
        onClose={handleCloseAdd}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Add Member</DialogTitle>
        <DialogContent>
          {addError && (
            <Typography color="error" variant="body2" gutterBottom>
              {addError}
            </Typography>
          )}
          {groups.length > 0 && (
            <Box
              mb={2}
              p={1.5}
              style={{
                backgroundColor: 'rgba(25, 118, 210, 0.08)',
                border: '1px solid rgba(25, 118, 210, 0.2)',
                borderRadius: 4,
              }}
            >
              <Typography variant="body2" style={{ color: '#1976d2' }}>
                If this user already has access via a group, you can only add
                them with a higher role to elevate their permissions.
              </Typography>
            </Box>
          )}
          <TextField
            className={classes.formField}
            label="Email"
            type="email"
            value={addEmail}
            onChange={e => setAddEmail(e.target.value)}
            fullWidth
            required
            autoFocus
            margin="dense"
            placeholder="user@example.com"
          />
          <FormControl
            variant="outlined"
            size="small"
            fullWidth
            className={classes.formField}
          >
            <InputLabel id="add-member-role-label">Role</InputLabel>
            <Select
              labelId="add-member-role-label"
              value={addRole}
              onChange={e =>
                setAddRole(
                  e.target.value as 'admin' | 'operator' | 'viewer',
                )
              }
              label="Role"
            >
              <MenuItem value="viewer">Viewer</MenuItem>
              <MenuItem value="operator">Operator</MenuItem>
              <MenuItem value="admin">Admin</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseAdd} disabled={adding}>
            Cancel
          </Button>
          <Button
            onClick={handleAddMember}
            color="primary"
            variant="contained"
            disabled={adding || !addEmail.trim()}
          >
            {adding ? 'Adding...' : 'Add Member'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Remove Member Confirmation Dialog */}
      <Dialog
        open={Boolean(memberToRemove)}
        onClose={() => setMemberToRemove(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          {memberToRemove?.source === 'elevated'
            ? 'Remove Elevation'
            : 'Remove Member'}
        </DialogTitle>
        <DialogContent>
          {memberToRemove?.source === 'elevated' ? (
            <>
              <Typography variant="body2">
                Remove elevated access for{' '}
                <strong>{memberToRemove?.email}</strong>?
              </Typography>
              <Typography
                variant="body2"
                style={{ color: '#ff9800', marginTop: 8 }}
              >
                They will revert to {memberToRemove?.groupRole} access via{' '}
                {memberToRemove?.groupName || memberToRemove?.group || 'group'}.
              </Typography>
            </>
          ) : (
            <>
              <Typography variant="body2">
                Are you sure you want to remove{' '}
                <strong>{memberToRemove?.email}</strong> from{' '}
                <strong>{currentTeam?.displayName || team}</strong>?
              </Typography>
              {memberToRemove?.email === currentUserEmail && (
                <Typography
                  variant="body2"
                  style={{ color: '#ff9800', marginTop: 8 }}
                >
                  Warning: You are about to remove yourself from this team. You
                  will lose access.
                </Typography>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setMemberToRemove(null)}
            disabled={removing}
          >
            Cancel
          </Button>
          <Button
            onClick={handleRemoveMember}
            style={{ color: '#f44336' }}
            disabled={removing}
          >
            {removing
              ? 'Removing...'
              : memberToRemove?.source === 'elevated'
                ? 'Remove Elevation'
                : 'Remove Member'}
          </Button>
        </DialogActions>
      </Dialog>
    </Grid>
  );
};
