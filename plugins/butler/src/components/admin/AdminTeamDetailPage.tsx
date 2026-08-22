// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { butlerApiRef } from '../../api/ButlerApi';
import type { Cluster } from '../../api/types/clusters';
import { useButlerRoutes } from '../../hooks/useButlerRoutes';
import { useTeamContext } from '../../hooks/useTeamContext';
import { butlerTokens, rgb, rgba } from '../../theme';
import {
  ButlerAccessDenied,
  ButlerButton,
  ButlerCallout,
  ButlerCard,
  ButlerDialog,
  ButlerErrorState,
  ButlerInput,
  ButlerKeyValueList,
  ButlerKeyValueRow,
  ButlerLinkButton,
  ButlerLoading,
  ButlerPageHeader,
  ButlerSelect,
  ButlerStack,
  ButlerStatusBadge,
  ButlerTable,
  EyeIcon,
  PlusIcon,
  ServerIcon,
  TrashIcon,
  UserAddIcon,
} from '../ui';
import type { ButlerColumn } from '../ui';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Role = 'admin' | 'operator' | 'viewer';

interface TeamResourceLimits {
  maxClusters?: number;
  maxTotalNodes?: number;
  maxNodesPerCluster?: number;
  maxCPUCores?: string;
  maxMemory?: string;
  maxStorage?: string;
}

interface TeamResourceUsage {
  clusters?: number;
  totalNodes?: number;
  totalCPU?: string;
  totalMemory?: string;
  totalStorage?: string;
}

interface ClusterDefaults {
  kubernetesVersion?: string;
  workerCount?: number;
  workerCPU?: number;
  workerMemoryGi?: number;
  workerDiskGi?: number;
}

interface TeamView {
  name: string;
  displayName: string;
  description?: string;
  phase: string;
  namespace: string;
  resourceLimits?: TeamResourceLimits;
  resourceUsage?: TeamResourceUsage;
  clusterDefaults?: ClusterDefaults;
}

interface TeamMember {
  email: string;
  name?: string;
  role: string;
  source?: 'direct' | 'group' | 'group-synced' | 'elevated';
  groupName?: string;
  groupRole?: string;
  canRemove?: boolean;
  removeNote?: string;
}

interface GroupSync {
  name: string;
  role: string;
  identityProvider?: string;
}

interface IdentityProviderSummary {
  name: string;
  displayName?: string;
}

/**
 * `/teams/{name}` answers with the flat console `TeamResponse`, but the same
 * route can also hand back the Team CRD. Read both so limits, usage and
 * defaults survive either shape.
 */
export function normalizeTeam(raw: any, fallbackName: string): TeamView {
  const meta = raw?.metadata ?? {};
  const spec = raw?.spec ?? {};
  const status = raw?.status ?? {};
  const name = raw?.name || meta.name || fallbackName;
  const quotas = spec.resourceQuotas;
  return {
    name,
    displayName: raw?.displayName || spec.displayName || name,
    description: raw?.description || spec.description,
    phase: raw?.phase || status.phase || 'Active',
    namespace:
      raw?.namespace || status.namespace || meta.namespace || `team-${name}`,
    resourceLimits: raw?.resourceLimits || spec.resourceLimits || quotas,
    resourceUsage: raw?.resourceUsage || status.resourceUsage,
    clusterDefaults: raw?.clusterDefaults || spec.clusterDefaults,
  };
}

function isGroupMember(member: TeamMember): boolean {
  return member.source === 'group' || member.source === 'group-synced';
}

function isElevatedMember(member: TeamMember): boolean {
  return member.source === 'elevated';
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  return {
    infoGrid: {
      display: 'grid',
      gridTemplateColumns: '1fr',
      gap: 24,
      '@media (min-width: 1024px)': {
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      },
    },
    statusGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: 16,
    },
    statValue: {
      margin: 0,
      fontSize: 24,
      lineHeight: '32px',
      fontWeight: 700,
      fontVariantNumeric: 'tabular-nums',
      color: t.text.muted,
    },
    statGreen: { color: rgb(p.green[400]) },
    statYellow: { color: rgb(p.yellow[400]) },
    statRed: { color: rgb(p.red[400]) },
    statLabel: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.subtle,
    },
    usageRoot: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      minWidth: 0,
    },
    usageRow: {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 8,
    },
    usageLabel: {
      fontSize: 14,
      lineHeight: '20px',
      color: rgb(p.neutral[300]),
    },
    usageValue: {
      fontSize: 14,
      lineHeight: '20px',
      fontFamily: t.fontMono,
      color: t.text.muted,
    },
    usageAmber: { color: rgb(p.amber[400]) },
    usageRed: { color: rgb(p.red[400]) },
    usageLimit: { color: t.text.subtle },
    usageNoLimit: {
      marginLeft: 4,
      fontSize: 12,
      color: rgb(p.neutral[600]),
    },
    usageTrack: {
      height: 8,
      borderRadius: t.radius.pill,
      backgroundColor: rgb(p.neutral[800]),
      overflow: 'hidden',
    },
    usageFill: { height: '100%', borderRadius: t.radius.pill },
    usageFillGreen: { backgroundColor: rgb(p.green[500]) },
    usageFillAmber: { backgroundColor: rgb(p.amber[500]) },
    usageFillRed: { backgroundColor: rgb(p.red[500]) },
    usageFillNone: { backgroundColor: rgba(p.neutral[600], 0.5) },
    usagePct: {
      textAlign: 'right',
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.muted,
    },
    description: {
      margin: '16px 0 0',
      paddingTop: 16,
      borderTop: `1px solid ${t.border}`,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.muted,
    },
    quickActions: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      '& > *': { width: '100%', justifyContent: 'flex-start' },
    },
    usageGrid: {
      display: 'grid',
      gridTemplateColumns: '1fr',
      columnGap: 32,
      rowGap: 16,
      '@media (min-width: 768px)': {
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      },
      '@media (min-width: 1024px)': {
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      },
    },
    defaultsGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: 16,
      '@media (min-width: 768px)': {
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      },
      '@media (min-width: 1024px)': {
        gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
      },
    },
    defaultLabel: {
      margin: 0,
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.subtle,
    },
    defaultValue: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      fontFamily: t.fontMono,
      color: t.text.secondary,
    },
    muted: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.subtle,
    },
    cardHead: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      flexWrap: 'wrap',
      padding: '16px 20px',
      borderBottom: `1px solid ${t.border}`,
    },
    cardTitle: {
      margin: 0,
      fontSize: 18,
      lineHeight: '28px',
      fontWeight: 500,
      color: t.text.strong,
    },
    cardSub: {
      margin: '2px 0 0',
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.subtle,
    },
    cardEmpty: {
      padding: '32px 20px',
      textAlign: 'center',
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.subtle,
    },
    cardEmptyHint: {
      margin: '8px 0 0',
      fontSize: 12,
      lineHeight: '16px',
      color: rgb(p.neutral[600]),
    },
    cell: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    email: { color: rgb(p.neutral[200]) },
    elevatedTag: {
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 6px',
      borderRadius: t.radius.sm,
      backgroundColor: rgba(p.amber[500], 0.2),
      color: rgb(p.amber[400]),
      fontSize: 10,
      lineHeight: '14px',
      fontWeight: 500,
      letterSpacing: '0.05em',
    },
    rolePill: {
      display: 'inline-flex',
      alignItems: 'center',
      padding: '4px 8px',
      borderRadius: t.radius.sm,
      fontSize: 12,
      lineHeight: '16px',
      fontWeight: 500,
      textTransform: 'capitalize',
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
    viaGroup: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 12,
      lineHeight: '16px',
      color: rgb(p.blue[400]),
    },
    elevationNote: {
      fontSize: 12,
      lineHeight: '16px',
      color: rgb(p.amber[400]),
      whiteSpace: 'nowrap',
    },
    subtle: { fontSize: 12, lineHeight: '16px', color: t.text.subtle },
    roleSelect: { minWidth: 120 },
    clusterRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      padding: '16px 20px',
      borderTop: `1px solid ${t.border}`,
      // The card header already draws the rule above the first row.
      '&:first-of-type': { borderTop: 'none' },
      textDecoration: 'none',
      color: 'inherit',
      transition: 'background-color 150ms',
      '&:hover': { backgroundColor: t.inset },
      '&:focus-visible': {
        outline: `2px solid ${t.accent}`,
        outlineOffset: -2,
      },
    },
    clusterLeft: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      minWidth: 0,
    },
    clusterIcon: {
      width: 40,
      height: 40,
      borderRadius: t.radius.lg,
      backgroundColor: rgba(p.green[500], 0.1),
      color: rgb(p.green[500]),
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    clusterName: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      fontWeight: 500,
      color: rgb(p.neutral[200]),
      overflowWrap: 'anywhere',
    },
    clusterMeta: {
      margin: 0,
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.subtle,
    },
    viewAll: {
      fontSize: 14,
      lineHeight: '20px',
      color: rgb(p.violet[400]),
      textDecoration: 'none',
      '&:hover': { textDecoration: 'underline' },
    },
    dialogStack: { display: 'flex', flexDirection: 'column', gap: 16 },
    dialogText: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.muted,
    },
    dialogStrong: { color: t.text.secondary, fontWeight: 500 },
    dialogMono: { fontFamily: t.fontMono },
    dialogWarn: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: rgb(p.amber[400]),
    },
    dialogError: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: rgb(p.red[400]),
    },
  };
});

const ROLE_OPTIONS: Array<{ value: Role; label: string; long: string }> = [
  { value: 'viewer', label: 'Viewer', long: 'Viewer - Can view resources' },
  {
    value: 'operator',
    label: 'Operator',
    long: 'Operator - Can manage clusters',
  },
  { value: 'admin', label: 'Admin', long: 'Admin - Full team access' },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const AdminTeamDetailPage = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const routes = useButlerRoutes();
  const navigate = useNavigate();
  const { isAdmin } = useTeamContext();
  const { teamName } = useParams<{ teamName: string }>();

  const [team, setTeam] = useState<TeamView | null>(null);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [groupMemberCounts, setGroupMemberCounts] = useState<
    Record<string, number>
  >({});
  const [groupSyncs, setGroupSyncs] = useState<GroupSync[]>([]);
  const [identityProviders, setIdentityProviders] = useState<
    IdentityProviderSummary[]
  >([]);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();

  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<Role>('viewer');
  const [addingMember, setAddingMember] = useState(false);
  const [addMemberError, setAddMemberError] = useState<string | null>(null);

  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);
  const [removingMember, setRemovingMember] = useState(false);

  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupRole, setNewGroupRole] = useState<Role>('viewer');
  const [newGroupIdP, setNewGroupIdP] = useState('');
  const [addingGroup, setAddingGroup] = useState(false);
  const [addGroupError, setAddGroupError] = useState<string | null>(null);

  const [groupToRemove, setGroupToRemove] = useState<GroupSync | null>(null);
  const [removingGroup, setRemovingGroup] = useState(false);

  const [deleteTeamOpen, setDeleteTeamOpen] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deletingTeam, setDeletingTeam] = useState(false);
  const [deleteTeamError, setDeleteTeamError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!teamName) return;

    setLoading(true);
    setError(undefined);
    try {
      const [teamRes, clustersRes, membersRes, groupsRes, idpsRes, userRes] =
        await Promise.allSettled([
          api.getTeam(teamName),
          api.listClusters({ team: teamName }),
          api.getTeamMembers(teamName),
          api.getTeamGroupSyncs(teamName),
          api.listIdentityProviders(),
          api.getCurrentUser(),
        ]);

      if (teamRes.status === 'fulfilled') {
        setTeam(normalizeTeam(teamRes.value, teamName));
      } else {
        throw teamRes.reason;
      }

      if (clustersRes.status === 'fulfilled') {
        setClusters(clustersRes.value.clusters || []);
      }

      if (membersRes.status === 'fulfilled') {
        const data = membersRes.value;
        setMembers(data?.members || data?.users || []);
        setGroupMemberCounts(data?.groupMemberCounts || {});
      }

      if (groupsRes.status === 'fulfilled') {
        setGroupSyncs(groupsRes.value?.groups || []);
      }

      if (idpsRes.status === 'fulfilled') {
        setIdentityProviders(
          (idpsRes.value?.identityProviders || []).map(
            (idp: {
              metadata: { name: string };
              spec?: { displayName?: string };
            }) => ({
              name: idp.metadata.name,
              displayName: idp.spec?.displayName || idp.metadata.name,
            }),
          ),
        );
      }

      if (userRes.status === 'fulfilled') {
        setCurrentUserEmail(userRes.value?.email || null);
      }
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [api, teamName]);

  useEffect(() => {
    if (isAdmin) fetchData();
  }, [fetchData, isAdmin]);

  const handleAddMember = async () => {
    if (!teamName || !newMemberEmail.trim()) return;
    setAddingMember(true);
    setAddMemberError(null);
    try {
      await api.addTeamMember(teamName, {
        email: newMemberEmail.trim(),
        role: newMemberRole,
      });
      setAddMemberOpen(false);
      setNewMemberEmail('');
      setNewMemberRole('viewer');
      fetchData();
    } catch (e) {
      setAddMemberError(
        e instanceof Error ? e.message : 'Failed to add member',
      );
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!teamName || !memberToRemove) return;
    setRemovingMember(true);
    try {
      await api.removeTeamMember(teamName, memberToRemove.email);
      setMemberToRemove(null);
      fetchData();
    } catch {
      // The refetch below shows whether the removal took effect.
    } finally {
      setRemovingMember(false);
    }
  };

  const handleChangeRole = async (member: TeamMember, role: string) => {
    if (!teamName || isGroupMember(member)) return;
    try {
      await api.updateMemberRole(teamName, member.email, role);
      fetchData();
    } catch {
      // The refetch below restores the server's view of the role.
    }
  };

  const handleAddGroupSync = async () => {
    if (!teamName || !newGroupName.trim()) return;
    setAddingGroup(true);
    setAddGroupError(null);
    try {
      await api.addGroupSync(teamName, {
        group: newGroupName.trim(),
        role: newGroupRole,
        identityProvider: newGroupIdP || undefined,
      });
      setAddGroupOpen(false);
      setNewGroupName('');
      setNewGroupRole('viewer');
      setNewGroupIdP('');
      fetchData();
    } catch (e) {
      setAddGroupError(
        e instanceof Error ? e.message : 'Failed to add group sync',
      );
    } finally {
      setAddingGroup(false);
    }
  };

  const handleRemoveGroupSync = async () => {
    if (!teamName || !groupToRemove) return;
    setRemovingGroup(true);
    try {
      await api.removeGroupSync(teamName, groupToRemove.name);
      setGroupToRemove(null);
      fetchData();
    } catch {
      // The refetch below shows whether the removal took effect.
    } finally {
      setRemovingGroup(false);
    }
  };

  const handleChangeGroupRole = async (group: GroupSync, role: string) => {
    if (!teamName) return;
    try {
      await api.updateGroupSyncRole(teamName, group.name, role);
      fetchData();
    } catch {
      // The refetch below restores the server's view of the role.
    }
  };

  const handleDeleteTeam = async () => {
    if (!teamName || deleteConfirmName !== teamName) return;
    setDeletingTeam(true);
    setDeleteTeamError(null);
    try {
      await api.deleteTeam(teamName);
      navigate(routes.adminTeams());
    } catch (e) {
      setDeleteTeamError(
        e instanceof Error ? e.message : 'Failed to delete team',
      );
    } finally {
      setDeletingTeam(false);
    }
  };

  if (!isAdmin) {
    return (
      <ButlerAccessDenied
        resourceType="team"
        resourceName={teamName}
        message="Platform administrator access is required to manage teams."
        homeTo={routes.root()}
      />
    );
  }

  if (loading) {
    return <ButlerLoading />;
  }

  if (error || !team) {
    return (
      <ButlerErrorState
        message={error ? 'Failed to load team details' : 'Team not found'}
        detail={error?.message || `Team "${teamName}" could not be found.`}
        onRetry={fetchData}
      />
    );
  }

  const readyClusters = clusters.filter(
    c => c.status?.phase === 'Ready',
  ).length;
  const provisioningClusters = clusters.filter(c =>
    ['Provisioning', 'Pending', 'Scaling'].includes(c.status?.phase || ''),
  ).length;
  const failedClusters = clusters.filter(
    c => c.status?.phase === 'Failed',
  ).length;

  const limits = team.resourceLimits;
  const usage = team.resourceUsage;
  const defaults = team.clusterDefaults;

  const roleClass = (role: string) =>
    role === 'admin'
      ? classes.roleAdmin
      : role === 'operator'
      ? classes.roleOperator
      : classes.roleViewer;

  const memberColumns: ButlerColumn<TeamMember>[] = [
    {
      id: 'email',
      header: 'Email',
      render: member => (
        <span className={classes.cell}>
          <span className={classes.email}>{member.email}</span>
          {isElevatedMember(member) && (
            <span className={classes.elevatedTag}>ELEVATED</span>
          )}
        </span>
      ),
    },
    {
      id: 'role',
      header: 'Role',
      render: member =>
        isGroupMember(member) ? (
          <span className={classes.cell}>
            <span className={clsx(classes.rolePill, roleClass(member.role))}>
              {member.role}
            </span>
            <span
              className={classes.viaGroup}
              title={
                member.groupName
                  ? `Role from ${member.groupName}`
                  : 'Role from group membership'
              }
            >
              via group
            </span>
          </span>
        ) : (
          <span className={classes.cell}>
            <div className={classes.roleSelect}>
              <ButlerSelect
                aria-label={`Role for ${member.email}`}
                value={member.role}
                onChange={event => handleChangeRole(member, event.target.value)}
              >
                {ROLE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </ButlerSelect>
            </div>
            {isElevatedMember(member) && member.groupRole && (
              <span
                className={classes.elevationNote}
                title={`Elevated from ${member.groupRole} via ${
                  member.groupName || 'group'
                }`}
              >
                &uarr; from {member.groupRole}
              </span>
            )}
          </span>
        ),
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      render: member =>
        isGroupMember(member) ? (
          <span className={classes.subtle} title="Manage via group membership">
            via group
          </span>
        ) : isElevatedMember(member) ? (
          <ButlerLinkButton
            tone="muted"
            title={member.removeNote}
            onClick={() => setMemberToRemove(member)}
          >
            Remove Elevation
          </ButlerLinkButton>
        ) : (
          <ButlerLinkButton
            tone="danger"
            onClick={() => setMemberToRemove(member)}
          >
            Remove
          </ButlerLinkButton>
        ),
    },
  ];

  const groupColumns: ButlerColumn<GroupSync>[] = [
    {
      id: 'group',
      header: 'Group',
      primary: true,
      mono: true,
      render: g => g.name,
    },
    {
      id: 'idp',
      header: 'Identity Provider',
      render: g =>
        g.identityProvider ? (
          g.identityProvider
        ) : (
          <span className={classes.subtle}>Any</span>
        ),
    },
    {
      id: 'role',
      header: 'Role',
      render: g => (
        <div className={classes.roleSelect}>
          <ButlerSelect
            aria-label={`Role for group ${g.name}`}
            value={g.role}
            onChange={event => handleChangeGroupRole(g, event.target.value)}
          >
            {ROLE_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </ButlerSelect>
        </div>
      ),
    },
    {
      id: 'observed',
      header: 'Observed Members',
      render: g => {
        const count = groupMemberCounts[g.name] ?? 0;
        return count > 0 ? (
          <span className={classes.email}>{count}</span>
        ) : (
          <span
            className={classes.subtle}
            title="No users have been observed with this group. Users appear after their first SSO login."
          >
            0
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      render: g => (
        <ButlerLinkButton tone="danger" onClick={() => setGroupToRemove(g)}>
          Remove
        </ButlerLinkButton>
      ),
    },
  ];

  const addMemberButton = (
    <ButlerButton
      size="sm"
      startIcon={<PlusIcon />}
      onClick={() => setAddMemberOpen(true)}
    >
      Add Member
    </ButlerButton>
  );

  return (
    <ButlerStack>
      <ButlerPageHeader
        title={team.displayName}
        titleAdornment={<ButlerStatusBadge status={team.phase} />}
        subtitle={`@${team.name}`}
        onBack={() => navigate(routes.adminTeams())}
        actions={
          <ButlerButton
            variant="danger"
            size="sm"
            startIcon={<TrashIcon size={16} />}
            onClick={() => setDeleteTeamOpen(true)}
            disabled={clusters.length > 0}
            title={
              clusters.length > 0
                ? 'Delete all clusters before removing this team'
                : undefined
            }
          >
            Delete Team
          </ButlerButton>
        }
      />

      <div className={classes.infoGrid}>
        <ButlerCard title="Team Details">
          <ButlerKeyValueList>
            <ButlerKeyValueRow label="Namespace" mono truncate>
              {team.namespace}
            </ButlerKeyValueRow>
            <ButlerKeyValueRow label="Members">
              {members.length}
            </ButlerKeyValueRow>
            <ButlerKeyValueRow label="Clusters">
              {clusters.length}
            </ButlerKeyValueRow>
          </ButlerKeyValueList>
          {team.description && (
            <p className={classes.description}>{team.description}</p>
          )}
        </ButlerCard>

        <ButlerCard title="Cluster Status">
          <div className={classes.statusGrid}>
            <ClusterStat label="Ready" value={readyClusters} tone="green" />
            <ClusterStat
              label="Provisioning"
              value={provisioningClusters}
              tone="yellow"
            />
            <ClusterStat label="Failed" value={failedClusters} tone="red" />
            <ClusterStat label="Total" value={clusters.length} />
          </div>
        </ButlerCard>

        <ButlerCard title="Quick Actions">
          <div className={classes.quickActions}>
            <ButlerButton
              variant="secondary"
              startIcon={<UserAddIcon size={16} />}
              onClick={() => setAddMemberOpen(true)}
            >
              Add Member
            </ButlerButton>
            <ButlerButton
              variant="secondary"
              component={RouterLink}
              to={routes.team({ team: team.name })}
              startIcon={<EyeIcon />}
            >
              View as Team
            </ButlerButton>
          </div>
        </ButlerCard>
      </div>

      <ButlerCard title="Resource Usage">
        {usage ? (
          <div className={classes.usageGrid}>
            <ResourceUsageBar
              label="Clusters"
              used={usage.clusters ?? 0}
              limit={limits?.maxClusters}
            />
            <ResourceUsageBar
              label="Total Nodes"
              used={usage.totalNodes ?? 0}
              limit={limits?.maxTotalNodes}
            />
            <ResourceUsageBar
              label="CPU Cores"
              used={usage.totalCPU || '0'}
              limit={limits?.maxCPUCores}
              unit="cores"
            />
            <ResourceUsageBar
              label="Memory"
              used={usage.totalMemory || '0'}
              limit={limits?.maxMemory}
            />
            <ResourceUsageBar
              label="Storage"
              used={usage.totalStorage || '0'}
              limit={limits?.maxStorage}
            />
            {limits?.maxNodesPerCluster != null && (
              <div>
                <p className={classes.defaultLabel}>Max Nodes per Cluster</p>
                <p className={classes.defaultValue}>
                  {limits.maxNodesPerCluster}
                </p>
              </div>
            )}
          </div>
        ) : (
          <p className={classes.muted}>
            Resource usage data is not yet available. The controller has not
            populated usage metrics for this team.
          </p>
        )}
      </ButlerCard>

      <ButlerCard title="Cluster Defaults">
        {defaults ? (
          <div className={classes.defaultsGrid}>
            <DefaultValue
              label="K8s Version"
              value={defaults.kubernetesVersion}
            />
            <DefaultValue label="Worker Count" value={defaults.workerCount} />
            <DefaultValue
              label="Worker CPU"
              value={
                defaults.workerCPU != null
                  ? `${defaults.workerCPU} cores`
                  : undefined
              }
            />
            <DefaultValue
              label="Worker Memory"
              value={
                defaults.workerMemoryGi != null
                  ? `${defaults.workerMemoryGi} Gi`
                  : undefined
              }
            />
            <DefaultValue
              label="Worker Disk"
              value={
                defaults.workerDiskGi != null
                  ? `${defaults.workerDiskGi} Gi`
                  : undefined
              }
            />
          </div>
        ) : (
          <p className={classes.muted}>
            No cluster defaults configured. New clusters will use platform
            defaults.
          </p>
        )}
      </ButlerCard>

      <ButlerCard flush style={{ overflow: 'hidden' }}>
        <div className={classes.cardHead}>
          <h2 className={classes.cardTitle}>Members</h2>
          {addMemberButton}
        </div>
        {members.length === 0 ? (
          <p className={classes.cardEmpty}>No members in this team</p>
        ) : (
          <ButlerTable
            bare
            aria-label="Team members"
            columns={memberColumns}
            rows={members}
            rowKey={member => member.email}
          />
        )}
      </ButlerCard>

      <ButlerCard flush style={{ overflow: 'hidden' }}>
        <div className={classes.cardHead}>
          <div>
            <h2 className={classes.cardTitle}>Group Sync</h2>
            <p className={classes.cardSub}>
              Automatically grant access to users based on their IdP groups
            </p>
          </div>
          <ButlerButton
            size="sm"
            startIcon={<PlusIcon />}
            onClick={() => setAddGroupOpen(true)}
          >
            Add Group
          </ButlerButton>
        </div>
        {groupSyncs.length === 0 ? (
          <div className={classes.cardEmpty}>
            No group syncs configured
            <p className={classes.cardEmptyHint}>
              Map IdP groups to automatically grant team access to their members
            </p>
          </div>
        ) : (
          <ButlerTable
            bare
            aria-label="Group sync rules"
            columns={groupColumns}
            rows={groupSyncs}
            rowKey={group => `${group.name}-${group.identityProvider || 'any'}`}
          />
        )}
      </ButlerCard>

      <ButlerCard flush style={{ overflow: 'hidden' }}>
        <div className={classes.cardHead}>
          <h2 className={classes.cardTitle}>Clusters</h2>
          <RouterLink className={classes.viewAll} to={routes.adminClusters()}>
            View all &rarr;
          </RouterLink>
        </div>
        {clusters.length === 0 ? (
          <p className={classes.cardEmpty}>No clusters in this team</p>
        ) : (
          clusters.slice(0, 5).map(cluster => (
            <RouterLink
              key={`${cluster.metadata.namespace}/${cluster.metadata.name}`}
              className={classes.clusterRow}
              to={routes.clusterDetail({
                team: team.name,
                namespace: cluster.metadata.namespace,
                name: cluster.metadata.name,
              })}
            >
              <span className={classes.clusterLeft}>
                <span className={classes.clusterIcon} aria-hidden>
                  <ServerIcon />
                </span>
                <span>
                  <p className={classes.clusterName}>{cluster.metadata.name}</p>
                  <p className={classes.clusterMeta}>
                    {cluster.spec.kubernetesVersion} &bull;{' '}
                    {cluster.spec.workers?.replicas || 0} workers
                  </p>
                </span>
              </span>
              <ButlerStatusBadge status={cluster.status?.phase || 'Unknown'} />
            </RouterLink>
          ))
        )}
      </ButlerCard>

      <ButlerDialog
        open={addMemberOpen}
        onClose={() => {
          setAddMemberOpen(false);
          setAddMemberError(null);
        }}
        title="Add Team Member"
        busy={addingMember}
        footer={
          <>
            <ButlerButton
              variant="secondary"
              onClick={() => {
                setAddMemberOpen(false);
                setAddMemberError(null);
              }}
              disabled={addingMember}
            >
              Cancel
            </ButlerButton>
            <ButlerButton
              onClick={handleAddMember}
              disabled={addingMember || !newMemberEmail.trim()}
            >
              {addingMember ? 'Adding...' : 'Add Member'}
            </ButlerButton>
          </>
        }
      >
        <div className={classes.dialogStack}>
          {addMemberError && (
            <p className={classes.dialogError}>{addMemberError}</p>
          )}
          {groupSyncs.length > 0 && (
            <ButlerCallout tone="info">
              If this user already has access via a group, you can only add them
              with a higher role to elevate their permissions.
            </ButlerCallout>
          )}
          <ButlerInput
            label="User Email"
            type="email"
            required
            autoFocus
            value={newMemberEmail}
            placeholder="user@example.com"
            onChange={event => setNewMemberEmail(event.target.value)}
          />
          <ButlerSelect
            label="Role"
            value={newMemberRole}
            onChange={event => setNewMemberRole(event.target.value as Role)}
          >
            {ROLE_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.long}
              </option>
            ))}
          </ButlerSelect>
        </div>
      </ButlerDialog>

      <ButlerDialog
        open={Boolean(memberToRemove)}
        onClose={() => setMemberToRemove(null)}
        title={
          memberToRemove && isElevatedMember(memberToRemove)
            ? 'Remove Elevation'
            : 'Remove Member'
        }
        busy={removingMember}
        footer={
          <>
            <ButlerButton
              variant="secondary"
              onClick={() => setMemberToRemove(null)}
              disabled={removingMember}
            >
              Cancel
            </ButlerButton>
            <ButlerButton
              variant="danger"
              onClick={handleRemoveMember}
              disabled={removingMember}
            >
              {removingMember
                ? 'Removing...'
                : memberToRemove && isElevatedMember(memberToRemove)
                ? 'Remove Elevation'
                : 'Remove Member'}
            </ButlerButton>
          </>
        }
      >
        <div className={classes.dialogStack}>
          {memberToRemove && isElevatedMember(memberToRemove) ? (
            <>
              <p className={classes.dialogText}>
                Remove elevated access for{' '}
                <span className={classes.dialogStrong}>
                  {memberToRemove.email}
                </span>
                ?
              </p>
              <p className={classes.dialogWarn}>
                They will revert to {memberToRemove.groupRole} access via{' '}
                {memberToRemove.groupName || 'group'}.
              </p>
            </>
          ) : (
            <>
              <p className={classes.dialogText}>
                Are you sure you want to remove{' '}
                <span className={classes.dialogStrong}>
                  {memberToRemove?.email}
                </span>{' '}
                from{' '}
                <span className={classes.dialogStrong}>{team.displayName}</span>
                ?
              </p>
              {memberToRemove?.email === currentUserEmail && (
                <p className={classes.dialogWarn}>
                  Warning: You are about to remove yourself from this team.
                </p>
              )}
            </>
          )}
        </div>
      </ButlerDialog>

      <ButlerDialog
        open={addGroupOpen}
        onClose={() => {
          setAddGroupOpen(false);
          setAddGroupError(null);
        }}
        title="Add Group Sync"
        busy={addingGroup}
        width={512}
        footer={
          <>
            <ButlerButton
              variant="secondary"
              onClick={() => {
                setAddGroupOpen(false);
                setAddGroupError(null);
              }}
              disabled={addingGroup}
            >
              Cancel
            </ButlerButton>
            <ButlerButton
              onClick={handleAddGroupSync}
              disabled={addingGroup || !newGroupName.trim()}
            >
              {addingGroup ? 'Adding...' : 'Add Group Sync'}
            </ButlerButton>
          </>
        }
      >
        <div className={classes.dialogStack}>
          {addGroupError && (
            <p className={classes.dialogError}>{addGroupError}</p>
          )}
          <ButlerInput
            label="Group Name"
            required
            autoFocus
            value={newGroupName}
            placeholder="engineering-platform"
            help="The group name as it appears in your identity provider (for example an AD group, Google group or Okta group)."
            onChange={event => setNewGroupName(event.target.value)}
          />
          <ButlerSelect
            label="Identity Provider (Optional)"
            value={newGroupIdP}
            help='Restrict this mapping to a specific IdP, or leave as "Any" to match groups from any provider.'
            onChange={event => setNewGroupIdP(event.target.value)}
          >
            <option value="">Any identity provider</option>
            {identityProviders.map(idp => (
              <option key={idp.name} value={idp.name}>
                {idp.displayName || idp.name}
              </option>
            ))}
          </ButlerSelect>
          <ButlerSelect
            label="Role"
            value={newGroupRole}
            onChange={event => setNewGroupRole(event.target.value as Role)}
          >
            {ROLE_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.long}
              </option>
            ))}
          </ButlerSelect>
        </div>
      </ButlerDialog>

      <ButlerDialog
        open={Boolean(groupToRemove)}
        onClose={() => setGroupToRemove(null)}
        title="Remove Group Sync"
        busy={removingGroup}
        footer={
          <>
            <ButlerButton
              variant="secondary"
              onClick={() => setGroupToRemove(null)}
              disabled={removingGroup}
            >
              Cancel
            </ButlerButton>
            <ButlerButton
              variant="danger"
              onClick={handleRemoveGroupSync}
              disabled={removingGroup}
            >
              {removingGroup ? 'Removing...' : 'Remove Group Sync'}
            </ButlerButton>
          </>
        }
      >
        <div className={classes.dialogStack}>
          <p className={classes.dialogText}>
            Are you sure you want to remove the group sync for{' '}
            <span className={clsx(classes.dialogStrong, classes.dialogMono)}>
              {groupToRemove?.name}
            </span>
            {groupToRemove?.identityProvider && (
              <>
                {' '}
                from{' '}
                <span className={classes.dialogStrong}>
                  {groupToRemove.identityProvider}
                </span>
              </>
            )}
            ?
          </p>
          <p className={classes.muted}>
            Users from this group will lose access unless they have direct
            membership or match another group sync.
          </p>
        </div>
      </ButlerDialog>

      <ButlerDialog
        open={deleteTeamOpen}
        onClose={() => {
          setDeleteTeamOpen(false);
          setDeleteConfirmName('');
          setDeleteTeamError(null);
        }}
        title="Delete Team"
        iconTone="danger"
        busy={deletingTeam}
        footer={
          <>
            <ButlerButton
              variant="secondary"
              onClick={() => {
                setDeleteTeamOpen(false);
                setDeleteConfirmName('');
                setDeleteTeamError(null);
              }}
              disabled={deletingTeam}
            >
              Cancel
            </ButlerButton>
            <ButlerButton
              variant="danger"
              onClick={handleDeleteTeam}
              disabled={deletingTeam || deleteConfirmName !== teamName}
            >
              {deletingTeam ? 'Deleting...' : 'Delete Team'}
            </ButlerButton>
          </>
        }
      >
        <div className={classes.dialogStack}>
          {deleteTeamError && (
            <p className={classes.dialogError}>{deleteTeamError}</p>
          )}
          <p className={classes.dialogText}>
            This will permanently delete{' '}
            <span className={classes.dialogStrong}>{team.displayName}</span> and
            its namespace. This action cannot be undone.
          </p>
          {clusters.length > 0 && (
            <ButlerCallout tone="danger">
              This team has {clusters.length} cluster
              {clusters.length === 1 ? '' : 's'} that will be affected. Ensure
              all clusters are deleted before removing the team.
            </ButlerCallout>
          )}
          {members.length > 0 && (
            <p className={classes.muted}>
              {members.length} member{members.length === 1 ? '' : 's'} will lose
              access.
            </p>
          )}
          <ButlerInput
            label={`Type "${teamName}" to confirm`}
            value={deleteConfirmName}
            placeholder={teamName}
            onChange={event => setDeleteConfirmName(event.target.value)}
          />
        </div>
      </ButlerDialog>
    </ButlerStack>
  );
};

const DefaultValue = ({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) => {
  const classes = useStyles();
  if (value === undefined || value === null || value === '') return null;
  return (
    <div>
      <p className={classes.defaultLabel}>{label}</p>
      <p className={classes.defaultValue}>{value}</p>
    </div>
  );
};

/** Console team-detail cluster-status quad: bold toned count over a label. */
const ClusterStat = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'green' | 'yellow' | 'red';
}) => {
  const classes = useStyles();
  const toneClass =
    tone === 'green'
      ? classes.statGreen
      : tone === 'yellow'
      ? classes.statYellow
      : tone === 'red'
      ? classes.statRed
      : undefined;
  return (
    <div>
      <p className={clsx(classes.statValue, toneClass)}>{value}</p>
      <p className={classes.statLabel}>{label}</p>
    </div>
  );
};

type Quantity = number | string | undefined | null;

const UNIT_MULTIPLIERS: Record<string, number> = {
  m: 1 / 1000,
  k: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  Ki: 1024,
  Mi: 1024 ** 2,
  Gi: 1024 ** 3,
  Ti: 1024 ** 4,
};

/** Kubernetes quantity to a plain number, so usage and limit compare. */
export function parseQuantity(value: Quantity): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return value;
  const match = /^([0-9.]+)\s*([a-zA-Z]*)$/.exec(value.trim());
  if (!match) return 0;
  const amount = parseFloat(match[1]);
  if (Number.isNaN(amount)) return 0;
  const unit = match[2];
  return unit ? amount * (UNIT_MULTIPLIERS[unit] ?? 1) : amount;
}

function formatQuantity(value: Quantity, unit?: string): string {
  if (value === null || value === undefined || value === '') return '0';
  return unit ? `${value} ${unit}` : String(value);
}

/**
 * Console `ResourceUsageBar`: label, mono `used / limit`, 8px track that
 * turns amber at 80% and red at 90%.
 */
const ResourceUsageBar = ({
  label,
  used,
  limit,
  unit,
}: {
  label: string;
  used: Quantity;
  limit: Quantity;
  unit?: string;
}) => {
  const classes = useStyles();
  const usedNum = parseQuantity(used);
  const hasLimit =
    limit !== null && limit !== undefined && limit !== '' && limit !== 0;
  const limitNum = hasLimit ? parseQuantity(limit) : 0;
  const pct =
    hasLimit && limitNum > 0 ? Math.round((usedNum / limitNum) * 100) : 0;
  const textClass =
    hasLimit && pct >= 90
      ? classes.usageRed
      : hasLimit && pct >= 80
      ? classes.usageAmber
      : undefined;
  const fillClass =
    pct >= 90
      ? classes.usageFillRed
      : pct >= 80
      ? classes.usageFillAmber
      : classes.usageFillGreen;
  return (
    <div className={classes.usageRoot}>
      <div className={classes.usageRow}>
        <span className={classes.usageLabel}>{label}</span>
        <span className={clsx(classes.usageValue, textClass)}>
          {formatQuantity(used, unit)}
          {hasLimit ? (
            <span className={classes.usageLimit}>
              {' '}
              / {formatQuantity(limit, unit)}
            </span>
          ) : (
            <span className={classes.usageNoLimit}>No limit</span>
          )}
        </span>
      </div>
      <div
        className={classes.usageTrack}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={hasLimit ? Math.min(pct, 100) : undefined}
      >
        <div
          className={clsx(
            classes.usageFill,
            hasLimit ? fillClass : classes.usageFillNone,
          )}
          style={{
            width: hasLimit
              ? `${Math.min(pct, 100)}%`
              : usedNum > 0
              ? '100%'
              : '0%',
          }}
        />
      </div>
      {hasLimit && (
        <div className={clsx(classes.usagePct, textClass)}>{pct}%</div>
      )}
    </div>
  );
};
