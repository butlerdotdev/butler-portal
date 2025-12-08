// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import {
  Table as BackstageTable,
  TableColumn,
  InfoCard,
  Progress,
  EmptyState,
  Link,
} from '@backstage/core-components';
import {
  Grid,
  Typography,
  Button,
  Box,
  Chip,
  Tabs,
  Tab,
  Paper,
  List,
  ListItem,
  ListItemText,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  Tooltip,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  makeStyles,
} from '@material-ui/core';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import PersonAddIcon from '@material-ui/icons/PersonAdd';
import AddIcon from '@material-ui/icons/Add';
import DeleteIcon from '@material-ui/icons/Delete';
import GroupIcon from '@material-ui/icons/Group';
import ArrowUpwardIcon from '@material-ui/icons/ArrowUpward';
import { butlerApiRef } from '../../api/ButlerApi';
import type { Cluster } from '../../api/types/clusters';
import { StatusBadge } from '../StatusBadge/StatusBadge';

const useStyles = makeStyles(theme => ({
  header: {
    marginBottom: theme.spacing(3),
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(1),
  },
  tabContent: {
    marginTop: theme.spacing(2),
  },
  metadataRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: theme.spacing(1, 0),
  },
  metadataLabel: {
    fontWeight: 600,
    color: theme.palette.text.secondary,
    minWidth: 160,
  },
  quotaGrid: {
    marginTop: theme.spacing(1),
  },
  quotaItem: {
    textAlign: 'center' as const,
    padding: theme.spacing(2),
  },
  quotaValue: {
    fontSize: '1.5rem',
    fontWeight: 700,
  },
  groupSyncItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing(1, 0),
    marginBottom: theme.spacing(1),
  },
  formField: {
    marginBottom: theme.spacing(2),
    minWidth: 200,
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
  elevatedChip: {
    backgroundColor: 'rgba(255, 152, 0, 0.15)',
    color: '#ff9800',
    fontWeight: 600,
    fontSize: '0.625rem',
    height: 18,
  },
  elevationInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    color: '#ff9800',
    fontSize: '0.75rem',
  },
  sourceGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    color: '#1976d2',
    fontSize: '0.75rem',
  },
  roleSelect: {
    minWidth: 120,
  },
}));

interface TeamDetail {
  metadata?: {
    name: string;
    namespace?: string;
    uid?: string;
    creationTimestamp?: string;
    labels?: Record<string, string>;
  };
  spec?: {
    displayName?: string;
    description?: string;
    access?: {
      users?: Array<{
        email: string;
        role: string;
      }>;
      groups?: Array<{
        name: string;
        role: string;
      }>;
    };
    resourceQuotas?: {
      maxClusters?: number;
      maxNodesPerCluster?: number;
      maxTotalNodes?: number;
    };
  };
  status?: {
    phase?: string;
    namespace?: string;
    clusterCount?: number;
    conditions?: Array<{
      type: string;
      status: string;
      reason?: string;
      message?: string;
    }>;
  };
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

type ClusterRow = {
  id: string;
  name: string;
  namespace: string;
  version: string;
  workers: number;
  phase: string;
  age: string;
};

function formatAge(timestamp: string | undefined): string {
  if (!timestamp) return 'Unknown';
  const created = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 1) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return `${diffMinutes}m`;
    }
    return `${diffHours}h`;
  }
  if (diffDays < 30) return `${diffDays}d`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo`;
}

export const AdminTeamDetailPage = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const { teamName } = useParams<{ teamName: string }>();
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [groupSyncs, setGroupSyncs] = useState<GroupSync[]>([]);
  const [identityProviders, setIdentityProviders] = useState<
    IdentityProviderSummary[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();
  const [activeTab, setActiveTab] = useState(0);

  // Current user for self-modification detection
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(
    null,
  );

  // Add member dialog
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<
    'admin' | 'operator' | 'viewer'
  >('viewer');
  const [addingMember, setAddingMember] = useState(false);
  const [addMemberError, setAddMemberError] = useState<string | null>(null);

  // Remove member dialog
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(
    null,
  );
  const [removingMember, setRemovingMember] = useState(false);

  // Add group sync dialog
  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupRole, setNewGroupRole] = useState<
    'admin' | 'operator' | 'viewer'
  >('viewer');
  const [newGroupIdP, setNewGroupIdP] = useState('');
  const [addingGroup, setAddingGroup] = useState(false);
  const [addGroupError, setAddGroupError] = useState<string | null>(null);

  // Remove group sync dialog
  const [groupToRemove, setGroupToRemove] = useState<GroupSync | null>(null);
  const [removingGroup, setRemovingGroup] = useState(false);

  const fetchData = useCallback(async () => {
    if (!teamName) return;

    setLoading(true);
    setError(undefined);
    try {
      const [teamRes, clustersRes, membersRes, groupsRes, idpsRes, userRes] =
        await Promise.allSettled([
          api.getTeam(teamName),
          api.getTeamClusters(teamName),
          api.getTeamMembers(teamName),
          api.getTeamGroupSyncs(teamName),
          api.listIdentityProviders(),
          api.getCurrentUser(),
        ]);

      if (teamRes.status === 'fulfilled') {
        setTeam(teamRes.value);
      } else {
        throw teamRes.reason;
      }

      if (clustersRes.status === 'fulfilled') {
        setClusters(clustersRes.value.clusters || []);
      }

      if (membersRes.status === 'fulfilled') {
        const membersData = membersRes.value;
        setMembers(membersData?.members || membersData?.users || []);
      }

      if (groupsRes.status === 'fulfilled') {
        const groupsData = groupsRes.value;
        setGroupSyncs(groupsData?.groups || []);
      }

      if (idpsRes.status === 'fulfilled') {
        const idpsData = idpsRes.value;
        const idpList = (
          idpsData?.identityProviders || []
        ).map(
          (idp: {
            metadata: { name: string };
            spec?: { displayName?: string };
          }) => ({
            name: idp.metadata.name,
            displayName: idp.spec?.displayName || idp.metadata.name,
          }),
        );
        setIdentityProviders(idpList);
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
    fetchData();
  }, [fetchData]);

  // --- Member handlers ---

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
      // silent
    } finally {
      setRemovingMember(false);
    }
  };

  const handleChangeRole = async (member: TeamMember, newRole: string) => {
    if (!teamName) return;

    if (
      member.source === 'group' ||
      member.source === 'group-synced'
    ) {
      return;
    }

    try {
      await api.updateMemberRole(teamName, member.email, newRole);
      fetchData();
    } catch {
      // silent
    }
  };

  // --- Group sync handlers ---

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
      // silent
    } finally {
      setRemovingGroup(false);
    }
  };

  const handleChangeGroupRole = async (
    group: GroupSync,
    newRole: string,
  ) => {
    if (!teamName) return;

    try {
      await api.updateGroupSyncRole(teamName, group.name, newRole);
      fetchData();
    } catch {
      // silent
    }
  };

  // --- Helpers ---

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

  function getMemberSource(member: TeamMember): string {
    return member.source || 'direct';
  }

  function isGroupMember(member: TeamMember): boolean {
    const src = getMemberSource(member);
    return src === 'group' || src === 'group-synced';
  }

  function isElevatedMember(member: TeamMember): boolean {
    return getMemberSource(member) === 'elevated';
  }

  // --- Loading / Error ---

  if (loading) {
    return <Progress />;
  }

  if (error) {
    return (
      <EmptyState
        title="Failed to load team details"
        description={error.message}
        missing="info"
      />
    );
  }

  if (!team) {
    return (
      <EmptyState
        title="Team not found"
        description={`Team "${teamName}" could not be found.`}
        missing="info"
      />
    );
  }

  const displayName =
    team.spec?.displayName || team.metadata?.name || teamName;
  const phase = team.status?.phase || 'Active';
  const description = team.spec?.description;
  const quotas = team.spec?.resourceQuotas;

  const clusterColumns: TableColumn<ClusterRow>[] = [
    {
      title: 'Name',
      field: 'name',
      render: (row: ClusterRow) => (
        <Link
          to={`../../t/${teamName}/clusters/${row.namespace}/${row.name}`}
        >
          {row.name}
        </Link>
      ),
    },
    {
      title: 'Namespace',
      field: 'namespace',
    },
    {
      title: 'Version',
      field: 'version',
    },
    {
      title: 'Workers',
      field: 'workers',
      type: 'numeric',
    },
    {
      title: 'Phase',
      field: 'phase',
      render: (row: ClusterRow) => <StatusBadge status={row.phase} />,
    },
    {
      title: 'Age',
      field: 'age',
    },
  ];

  const clusterData: ClusterRow[] = clusters.map(cluster => ({
    id:
      cluster.metadata.uid ||
      `${cluster.metadata.namespace}/${cluster.metadata.name}`,
    name: cluster.metadata.name,
    namespace: cluster.metadata.namespace,
    version: cluster.spec.kubernetesVersion,
    workers: cluster.spec.workers?.replicas ?? 0,
    phase: cluster.status?.phase || 'Unknown',
    age: formatAge(cluster.metadata.creationTimestamp),
  }));

  return (
    <div>
      <Button
        startIcon={<ArrowBackIcon />}
        component={RouterLink}
        to="/butler/admin/teams"
        style={{ textTransform: 'none', marginBottom: 16 }}
      >
        Back to Teams
      </Button>

      {/* Team Header */}
      <div className={classes.header}>
        <div className={classes.headerRow}>
          <Typography variant="h4">{displayName}</Typography>
          <StatusBadge status={phase} />
        </div>
        {description && (
          <Typography variant="body1" color="textSecondary">
            {description}
          </Typography>
        )}
        <Box mt={1}>
          <Typography variant="body2" color="textSecondary">
            Namespace: {team.status?.namespace || `team-${teamName}`}
          </Typography>
        </Box>
      </div>

      {/* Tabs */}
      <Paper>
        <Tabs
          value={activeTab}
          onChange={(_, newValue) => setActiveTab(newValue)}
          indicatorColor="primary"
          textColor="primary"
        >
          <Tab label="Overview" />
          <Tab label={`Members (${members.length})`} />
          <Tab label={`Clusters (${clusters.length})`} />
          <Tab label={`Group Sync (${groupSyncs.length})`} />
        </Tabs>
      </Paper>

      <div className={classes.tabContent}>
        {/* Overview Tab */}
        {activeTab === 0 && (
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <InfoCard title="Team Metadata">
                <div className={classes.metadataRow}>
                  <Typography className={classes.metadataLabel}>
                    Name
                  </Typography>
                  <Typography>{team.metadata?.name || teamName}</Typography>
                </div>
                <Divider />
                <div className={classes.metadataRow}>
                  <Typography className={classes.metadataLabel}>
                    Display Name
                  </Typography>
                  <Typography>{displayName}</Typography>
                </div>
                <Divider />
                <div className={classes.metadataRow}>
                  <Typography className={classes.metadataLabel}>
                    Namespace
                  </Typography>
                  <Typography>
                    {team.status?.namespace || `team-${teamName}`}
                  </Typography>
                </div>
                <Divider />
                <div className={classes.metadataRow}>
                  <Typography className={classes.metadataLabel}>
                    Phase
                  </Typography>
                  <StatusBadge status={phase} />
                </div>
                <Divider />
                <div className={classes.metadataRow}>
                  <Typography className={classes.metadataLabel}>
                    Created
                  </Typography>
                  <Typography>
                    {team.metadata?.creationTimestamp
                      ? new Date(
                          team.metadata.creationTimestamp,
                        ).toLocaleString()
                      : 'Unknown'}
                  </Typography>
                </div>
                {team.metadata?.uid && (
                  <>
                    <Divider />
                    <div className={classes.metadataRow}>
                      <Typography className={classes.metadataLabel}>
                        UID
                      </Typography>
                      <Typography variant="body2">
                        {team.metadata.uid}
                      </Typography>
                    </div>
                  </>
                )}
              </InfoCard>
            </Grid>

            <Grid item xs={12} md={6}>
              <InfoCard title="Resource Quotas">
                {quotas ? (
                  <Grid container spacing={2} className={classes.quotaGrid}>
                    <Grid item xs={4}>
                      <div className={classes.quotaItem}>
                        <Typography className={classes.quotaValue}>
                          {quotas.maxClusters ?? 'Unlimited'}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="textSecondary"
                        >
                          Max Clusters
                        </Typography>
                      </div>
                    </Grid>
                    <Grid item xs={4}>
                      <div className={classes.quotaItem}>
                        <Typography className={classes.quotaValue}>
                          {quotas.maxNodesPerCluster ?? 'Unlimited'}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="textSecondary"
                        >
                          Max Nodes/Cluster
                        </Typography>
                      </div>
                    </Grid>
                    <Grid item xs={4}>
                      <div className={classes.quotaItem}>
                        <Typography className={classes.quotaValue}>
                          {quotas.maxTotalNodes ?? 'Unlimited'}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="textSecondary"
                        >
                          Max Total Nodes
                        </Typography>
                      </div>
                    </Grid>
                  </Grid>
                ) : (
                  <Typography color="textSecondary" align="center">
                    No resource quotas configured.
                  </Typography>
                )}
              </InfoCard>
            </Grid>

            {/* Conditions */}
            {team.status?.conditions && team.status.conditions.length > 0 && (
              <Grid item xs={12}>
                <InfoCard title="Conditions">
                  <List disablePadding>
                    {team.status.conditions.map((condition, index) => (
                      <React.Fragment key={condition.type}>
                        {index > 0 && <Divider component="li" />}
                        <ListItem>
                          <ListItemText
                            primary={
                              <Box
                                display="flex"
                                alignItems="center"
                                gridGap={8}
                              >
                                <Typography variant="subtitle2">
                                  {condition.type}
                                </Typography>
                                <Chip
                                  label={condition.status}
                                  size="small"
                                  color={
                                    condition.status === 'True'
                                      ? 'primary'
                                      : 'default'
                                  }
                                  variant="outlined"
                                />
                              </Box>
                            }
                            secondary={
                              condition.message ||
                              condition.reason ||
                              undefined
                            }
                          />
                        </ListItem>
                      </React.Fragment>
                    ))}
                  </List>
                </InfoCard>
              </Grid>
            )}
          </Grid>
        )}

        {/* Members Tab */}
        {activeTab === 1 && (
          <div>
            <div className={classes.sectionHeader}>
              <Typography variant="h6">
                Team Members ({members.length})
              </Typography>
              <Button
                variant="contained"
                color="primary"
                size="small"
                startIcon={<PersonAddIcon />}
                onClick={() => setAddMemberOpen(true)}
              >
                Add Member
              </Button>
            </div>

            {members.length === 0 ? (
              <EmptyState
                title="No members"
                description="This team has no members assigned yet."
                missing="content"
                action={
                  <Button
                    variant="contained"
                    color="primary"
                    startIcon={<PersonAddIcon />}
                    onClick={() => setAddMemberOpen(true)}
                  >
                    Add Member
                  </Button>
                }
              />
            ) : (
              <InfoCard>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Email</TableCell>
                      <TableCell>Source</TableCell>
                      <TableCell>Role</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {members.map((member, index) => (
                      <TableRow key={member.email || `member-${index}`}>
                        <TableCell>
                          <Box display="flex" alignItems="center" gridGap={8}>
                            <Typography variant="body2">
                              {member.email}
                            </Typography>
                            {isElevatedMember(member) && (
                              <Chip
                                label="ELEVATED"
                                size="small"
                                className={classes.elevatedChip}
                              />
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          {isGroupMember(member) ? (
                            <span className={classes.sourceGroup}>
                              <GroupIcon style={{ fontSize: 14 }} />
                              via group
                              {member.groupName && ` (${member.groupName})`}
                            </span>
                          ) : isElevatedMember(member) ? (
                            <span className={classes.elevationInfo}>
                              <ArrowUpwardIcon style={{ fontSize: 14 }} />
                              elevated
                              {member.groupName &&
                                ` from ${member.groupName}`}
                            </span>
                          ) : (
                            <Typography
                              variant="body2"
                              color="textSecondary"
                            >
                              direct
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          {isGroupMember(member) ? (
                            <Box
                              display="flex"
                              alignItems="center"
                              gridGap={8}
                            >
                              <Chip
                                label={member.role}
                                size="small"
                                className={getRoleChipClass(member.role)}
                              />
                              <Typography
                                variant="caption"
                                color="textSecondary"
                              >
                                (via group)
                              </Typography>
                            </Box>
                          ) : (
                            <Box
                              display="flex"
                              alignItems="center"
                              gridGap={8}
                            >
                              <FormControl size="small">
                                <Select
                                  value={member.role}
                                  onChange={e =>
                                    handleChangeRole(
                                      member,
                                      e.target.value as string,
                                    )
                                  }
                                  className={classes.roleSelect}
                                  disableUnderline={false}
                                >
                                  <MenuItem value="viewer">Viewer</MenuItem>
                                  <MenuItem value="operator">
                                    Operator
                                  </MenuItem>
                                  <MenuItem value="admin">Admin</MenuItem>
                                </Select>
                              </FormControl>
                              {isElevatedMember(member) &&
                                member.groupRole && (
                                  <span className={classes.elevationInfo}>
                                    <ArrowUpwardIcon
                                      style={{ fontSize: 12 }}
                                    />
                                    from {member.groupRole}
                                  </span>
                                )}
                            </Box>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          {isGroupMember(member) ? (
                            <Typography
                              variant="caption"
                              color="textSecondary"
                            >
                              via group
                            </Typography>
                          ) : isElevatedMember(member) ? (
                            <Tooltip
                              title={
                                member.removeNote || 'Remove elevation'
                              }
                            >
                              <Button
                                size="small"
                                onClick={() => setMemberToRemove(member)}
                                style={{
                                  color: '#ff9800',
                                  textTransform: 'none',
                                }}
                              >
                                Remove Elevation
                              </Button>
                            </Tooltip>
                          ) : (
                            <Tooltip title="Remove member">
                              <IconButton
                                size="small"
                                onClick={() => setMemberToRemove(member)}
                                style={{ color: '#f44336' }}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </InfoCard>
            )}
          </div>
        )}

        {/* Clusters Tab */}
        {activeTab === 2 && (
          <div>
            {clusters.length === 0 ? (
              <EmptyState
                title="No clusters"
                description="This team has no clusters yet."
                missing="content"
              />
            ) : (
              <BackstageTable<ClusterRow>
                title={`Team Clusters (${clusters.length})`}
                options={{
                  search: true,
                  paging: clusters.length > 20,
                  pageSize: 20,
                  padding: 'dense',
                }}
                columns={clusterColumns}
                data={clusterData}
              />
            )}
          </div>
        )}

        {/* Group Sync Tab */}
        {activeTab === 3 && (
          <div>
            <div className={classes.sectionHeader}>
              <div>
                <Typography variant="h6">Group Sync Rules</Typography>
                <Typography variant="body2" color="textSecondary">
                  Automatically grant access to users based on their IdP
                  groups
                </Typography>
              </div>
              <Button
                variant="contained"
                color="primary"
                size="small"
                startIcon={<AddIcon />}
                onClick={() => setAddGroupOpen(true)}
              >
                Add Group
              </Button>
            </div>

            {groupSyncs.length === 0 ? (
              <InfoCard title="Group Sync Rules">
                <Box textAlign="center" py={4}>
                  <Typography color="textSecondary" gutterBottom>
                    No group syncs configured for this team.
                  </Typography>
                  <Typography
                    variant="body2"
                    color="textSecondary"
                    gutterBottom
                  >
                    Map IdP groups to automatically grant team access to
                    their members.
                  </Typography>
                  <Box mt={2}>
                    <Button
                      variant="contained"
                      color="primary"
                      startIcon={<AddIcon />}
                      onClick={() => setAddGroupOpen(true)}
                    >
                      Add Group Sync
                    </Button>
                  </Box>
                </Box>
              </InfoCard>
            ) : (
              <InfoCard>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Group</TableCell>
                      <TableCell>Identity Provider</TableCell>
                      <TableCell>Role</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {groupSyncs.map((group, index) => (
                      <TableRow
                        key={`${group.name}-${group.identityProvider || index}`}
                      >
                        <TableCell>
                          <Typography
                            variant="body2"
                            style={{ fontFamily: 'monospace' }}
                          >
                            {group.name}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {group.identityProvider ? (
                            <Typography variant="body2">
                              {group.identityProvider}
                            </Typography>
                          ) : (
                            <Typography
                              variant="body2"
                              color="textSecondary"
                              style={{ fontStyle: 'italic' }}
                            >
                              Any
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <FormControl size="small">
                            <Select
                              value={group.role}
                              onChange={e =>
                                handleChangeGroupRole(
                                  group,
                                  e.target.value as string,
                                )
                              }
                              className={classes.roleSelect}
                              disableUnderline={false}
                            >
                              <MenuItem value="viewer">Viewer</MenuItem>
                              <MenuItem value="operator">Operator</MenuItem>
                              <MenuItem value="admin">Admin</MenuItem>
                            </Select>
                          </FormControl>
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Remove group sync">
                            <IconButton
                              size="small"
                              onClick={() => setGroupToRemove(group)}
                              style={{ color: '#f44336' }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </InfoCard>
            )}
          </div>
        )}
      </div>

      {/* Add Member Dialog */}
      <Dialog
        open={addMemberOpen}
        onClose={() => {
          setAddMemberOpen(false);
          setAddMemberError(null);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Add Team Member</DialogTitle>
        <DialogContent>
          {addMemberError && (
            <Typography color="error" variant="body2" gutterBottom>
              {addMemberError}
            </Typography>
          )}
          {groupSyncs.length > 0 && (
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
            label="User Email"
            type="email"
            value={newMemberEmail}
            onChange={e => setNewMemberEmail(e.target.value)}
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
            <InputLabel id="admin-add-member-role-label">Role</InputLabel>
            <Select
              labelId="admin-add-member-role-label"
              value={newMemberRole}
              onChange={e =>
                setNewMemberRole(
                  e.target.value as 'admin' | 'operator' | 'viewer',
                )
              }
              label="Role"
            >
              <MenuItem value="viewer">
                Viewer - Can view resources
              </MenuItem>
              <MenuItem value="operator">
                Operator - Can manage clusters
              </MenuItem>
              <MenuItem value="admin">
                Admin - Full team access
              </MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setAddMemberOpen(false);
              setAddMemberError(null);
            }}
            disabled={addingMember}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAddMember}
            color="primary"
            variant="contained"
            disabled={addingMember || !newMemberEmail.trim()}
          >
            {addingMember ? 'Adding...' : 'Add Member'}
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
          {isElevatedMember(memberToRemove || ({} as TeamMember))
            ? 'Remove Elevation'
            : 'Remove Member'}
        </DialogTitle>
        <DialogContent>
          {memberToRemove &&
          isElevatedMember(memberToRemove) ? (
            <>
              <Typography variant="body2">
                Remove elevated access for{' '}
                <strong>{memberToRemove.email}</strong>?
              </Typography>
              <Typography
                variant="body2"
                style={{ color: '#ff9800', marginTop: 8 }}
              >
                They will revert to {memberToRemove.groupRole} access via{' '}
                {memberToRemove.groupName || 'group'}.
              </Typography>
            </>
          ) : (
            <>
              <Typography variant="body2">
                Are you sure you want to remove{' '}
                <strong>{memberToRemove?.email}</strong> from{' '}
                <strong>{displayName}</strong>?
              </Typography>
              {memberToRemove?.email === currentUserEmail && (
                <Typography
                  variant="body2"
                  style={{ color: '#ff9800', marginTop: 8 }}
                >
                  Warning: You are about to remove yourself from this team.
                </Typography>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setMemberToRemove(null)}
            disabled={removingMember}
          >
            Cancel
          </Button>
          <Button
            onClick={handleRemoveMember}
            style={{ color: '#f44336' }}
            disabled={removingMember}
          >
            {removingMember
              ? 'Removing...'
              : memberToRemove && isElevatedMember(memberToRemove)
                ? 'Remove Elevation'
                : 'Remove Member'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Group Sync Dialog */}
      <Dialog
        open={addGroupOpen}
        onClose={() => {
          setAddGroupOpen(false);
          setAddGroupError(null);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Add Group Sync</DialogTitle>
        <DialogContent>
          {addGroupError && (
            <Typography color="error" variant="body2" gutterBottom>
              {addGroupError}
            </Typography>
          )}
          <TextField
            className={classes.formField}
            label="Group Name"
            value={newGroupName}
            onChange={e => setNewGroupName(e.target.value)}
            fullWidth
            required
            autoFocus
            margin="dense"
            placeholder="engineering-platform"
            helperText="The group name as it appears in your identity provider (e.g., AD group name, Google group, Okta group)"
          />
          <FormControl
            variant="outlined"
            size="small"
            fullWidth
            className={classes.formField}
          >
            <InputLabel id="group-idp-label">
              Identity Provider (Optional)
            </InputLabel>
            <Select
              labelId="group-idp-label"
              value={newGroupIdP}
              onChange={e => setNewGroupIdP(e.target.value as string)}
              label="Identity Provider (Optional)"
            >
              <MenuItem value="">Any identity provider</MenuItem>
              {identityProviders.map(idp => (
                <MenuItem key={idp.name} value={idp.name}>
                  {idp.displayName || idp.name}
                </MenuItem>
              ))}
            </Select>
            <Typography
              variant="caption"
              color="textSecondary"
              style={{ marginTop: 4 }}
            >
              Restrict this mapping to a specific IdP, or leave as "Any" to
              match groups from any provider
            </Typography>
          </FormControl>
          <FormControl
            variant="outlined"
            size="small"
            fullWidth
            className={classes.formField}
          >
            <InputLabel id="group-role-label">Role</InputLabel>
            <Select
              labelId="group-role-label"
              value={newGroupRole}
              onChange={e =>
                setNewGroupRole(
                  e.target.value as 'admin' | 'operator' | 'viewer',
                )
              }
              label="Role"
            >
              <MenuItem value="viewer">
                Viewer - Can view resources
              </MenuItem>
              <MenuItem value="operator">
                Operator - Can manage clusters
              </MenuItem>
              <MenuItem value="admin">
                Admin - Full team access
              </MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setAddGroupOpen(false);
              setAddGroupError(null);
            }}
            disabled={addingGroup}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAddGroupSync}
            color="primary"
            variant="contained"
            disabled={addingGroup || !newGroupName.trim()}
          >
            {addingGroup ? 'Adding...' : 'Add Group Sync'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Remove Group Sync Confirmation Dialog */}
      <Dialog
        open={Boolean(groupToRemove)}
        onClose={() => setGroupToRemove(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Remove Group Sync</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Are you sure you want to remove the group sync for{' '}
            <strong style={{ fontFamily: 'monospace' }}>
              {groupToRemove?.name}
            </strong>
            {groupToRemove?.identityProvider && (
              <>
                {' '}
                from{' '}
                <strong>{groupToRemove.identityProvider}</strong>
              </>
            )}
            ?
          </Typography>
          <Typography
            variant="body2"
            color="textSecondary"
            style={{ marginTop: 8 }}
          >
            Users from this group will lose access unless they have direct
            membership or match another group sync.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setGroupToRemove(null)}
            disabled={removingGroup}
          >
            Cancel
          </Button>
          <Button
            onClick={handleRemoveGroupSync}
            style={{ color: '#f44336' }}
            disabled={removingGroup}
          >
            {removingGroup ? 'Removing...' : 'Remove Group Sync'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};
