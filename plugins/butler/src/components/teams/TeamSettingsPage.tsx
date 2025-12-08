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
  TextField,
  Box,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  makeStyles,
} from '@material-ui/core';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import EditIcon from '@material-ui/icons/Edit';
import SaveIcon from '@material-ui/icons/Save';
import CancelIcon from '@material-ui/icons/Cancel';

import { butlerApiRef } from '../../api/ButlerApi';
import { useTeamContext } from '../../hooks/useTeamContext';

const useStyles = makeStyles(theme => ({
  fieldRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing(1.5, 0),
  },
  fieldLabel: {
    color: theme.palette.text.secondary,
    fontWeight: 500,
    minWidth: 160,
  },
  fieldValue: {
    fontWeight: 400,
  },
  editForm: {
    display: 'flex',
    gap: theme.spacing(1),
    alignItems: 'center',
    flexGrow: 1,
  },
  editField: {
    flexGrow: 1,
  },
  editButtons: {
    display: 'flex',
    gap: theme.spacing(0.5),
  },
  quotaItem: {
    padding: theme.spacing(1, 0),
  },
  quotaLabel: {
    fontWeight: 500,
  },
  quotaValue: {
    fontWeight: 600,
    color: theme.palette.primary.main,
  },
  sectionDivider: {
    margin: theme.spacing(2, 0),
  },
  accessChip: {
    margin: theme.spacing(0.5),
  },
  accessSection: {
    marginTop: theme.spacing(1),
  },
  successMessage: {
    color: theme.palette.success?.main ?? '#4caf50',
    marginTop: theme.spacing(1),
  },
  errorMessage: {
    color: theme.palette.error.main,
    marginTop: theme.spacing(1),
  },
  emptyText: {
    color: theme.palette.text.secondary,
    fontStyle: 'italic',
  },
}));

interface TeamDetail {
  metadata?: {
    name: string;
    namespace?: string;
    uid?: string;
    creationTimestamp?: string;
  };
  spec?: {
    displayName?: string;
    description?: string;
    resourceQuotas?: {
      maxClusters?: number;
      maxWorkersPerCluster?: number;
      maxTotalWorkers?: number;
    };
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
  };
  status?: {
    namespace?: string;
    phase?: string;
  };
}

export const TeamSettingsPage = () => {
  const classes = useStyles();
  const { team } = useParams<{ team: string }>();
  const api = useApi(butlerApiRef);
  const { teams } = useTeamContext();

  const [teamDetail, setTeamDetail] = useState<TeamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Determine if user is a team admin
  const currentTeam = teams.find(t => t.name === team);
  const isTeamAdmin = currentTeam?.role === 'admin';

  const loadTeam = useCallback(async () => {
    if (!team) return;

    setLoading(true);
    setError(null);

    try {
      const response = await api.getTeam(team);
      setTeamDetail(response);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load team details',
      );
    } finally {
      setLoading(false);
    }
  }, [api, team]);

  useEffect(() => {
    loadTeam();
  }, [loadTeam]);

  const startEdit = (field: string) => {
    setSaveMessage(null);
    setSaveError(null);

    if (field === 'displayName') {
      setEditDisplayName(
        teamDetail?.spec?.displayName || teamDetail?.metadata?.name || '',
      );
    } else if (field === 'description') {
      setEditDescription(teamDetail?.spec?.description || '');
    }
    setEditingField(field);
  };

  const cancelEdit = () => {
    setEditingField(null);
    setSaveMessage(null);
    setSaveError(null);
  };

  const saveField = async (field: string) => {
    if (!team) return;

    setSaving(true);
    setSaveMessage(null);
    setSaveError(null);

    try {
      const updates: Record<string, string> = {};
      if (field === 'displayName') {
        updates.displayName = editDisplayName;
      } else if (field === 'description') {
        updates.description = editDescription;
      }

      await api.updateTeam(team!, updates);

      setSaveMessage(`Updated ${field === 'displayName' ? 'display name' : 'description'} successfully`);
      setEditingField(null);
      await loadTeam();
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : `Failed to update ${field}`,
      );
    } finally {
      setSaving(false);
    }
  };

  if (!team) {
    return (
      <EmptyState
        title="No team selected"
        description="Navigate to a team to view its settings."
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
          Failed to load settings
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
            {/* General feedback messages */}
            {saveMessage && (
              <Grid item xs={12}>
                <Typography variant="body2" className={classes.successMessage}>
                  {saveMessage}
                </Typography>
              </Grid>
            )}
            {saveError && (
              <Grid item xs={12}>
                <Typography variant="body2" className={classes.errorMessage}>
                  {saveError}
                </Typography>
              </Grid>
            )}

            {/* Team Info */}
            <Grid item xs={12} md={6}>
              <InfoCard title="Team Information">
                {/* Name (read-only) */}
                <Box className={classes.fieldRow}>
                  <Typography
                    variant="body2"
                    className={classes.fieldLabel}
                  >
                    Name
                  </Typography>
                  <Typography variant="body1" className={classes.fieldValue}>
                    {teamDetail?.metadata?.name || team}
                  </Typography>
                </Box>

                <Divider />

                {/* Display Name */}
                <Box className={classes.fieldRow}>
                  <Typography
                    variant="body2"
                    className={classes.fieldLabel}
                  >
                    Display Name
                  </Typography>
                  {editingField === 'displayName' ? (
                    <Box className={classes.editForm}>
                      <TextField
                        className={classes.editField}
                        variant="outlined"
                        size="small"
                        value={editDisplayName}
                        onChange={e => setEditDisplayName(e.target.value)}
                        autoFocus
                      />
                      <Box className={classes.editButtons}>
                        <Button
                          size="small"
                          color="primary"
                          startIcon={<SaveIcon />}
                          onClick={() => saveField('displayName')}
                          disabled={saving}
                        >
                          Save
                        </Button>
                        <Button
                          size="small"
                          startIcon={<CancelIcon />}
                          onClick={cancelEdit}
                          disabled={saving}
                        >
                          Cancel
                        </Button>
                      </Box>
                    </Box>
                  ) : (
                    <Box display="flex" alignItems="center" style={{ gap: 8 }}>
                      <Typography
                        variant="body1"
                        className={classes.fieldValue}
                      >
                        {teamDetail?.spec?.displayName || '-'}
                      </Typography>
                      {isTeamAdmin && (
                        <Button
                          size="small"
                          startIcon={<EditIcon />}
                          onClick={() => startEdit('displayName')}
                        >
                          Edit
                        </Button>
                      )}
                    </Box>
                  )}
                </Box>

                <Divider />

                {/* Description */}
                <Box className={classes.fieldRow}>
                  <Typography
                    variant="body2"
                    className={classes.fieldLabel}
                  >
                    Description
                  </Typography>
                  {editingField === 'description' ? (
                    <Box className={classes.editForm}>
                      <TextField
                        className={classes.editField}
                        variant="outlined"
                        size="small"
                        value={editDescription}
                        onChange={e => setEditDescription(e.target.value)}
                        multiline
                        minRows={2}
                        autoFocus
                      />
                      <Box className={classes.editButtons}>
                        <Button
                          size="small"
                          color="primary"
                          startIcon={<SaveIcon />}
                          onClick={() => saveField('description')}
                          disabled={saving}
                        >
                          Save
                        </Button>
                        <Button
                          size="small"
                          startIcon={<CancelIcon />}
                          onClick={cancelEdit}
                          disabled={saving}
                        >
                          Cancel
                        </Button>
                      </Box>
                    </Box>
                  ) : (
                    <Box display="flex" alignItems="center" style={{ gap: 8 }}>
                      <Typography
                        variant="body1"
                        className={classes.fieldValue}
                      >
                        {teamDetail?.spec?.description || '-'}
                      </Typography>
                      {isTeamAdmin && (
                        <Button
                          size="small"
                          startIcon={<EditIcon />}
                          onClick={() => startEdit('description')}
                        >
                          Edit
                        </Button>
                      )}
                    </Box>
                  )}
                </Box>

                <Divider />

                {/* Namespace (read-only) */}
                <Box className={classes.fieldRow}>
                  <Typography
                    variant="body2"
                    className={classes.fieldLabel}
                  >
                    Namespace
                  </Typography>
                  <Typography variant="body1" className={classes.fieldValue}>
                    {teamDetail?.status?.namespace ||
                      teamDetail?.metadata?.namespace ||
                      `team-${team}`}
                  </Typography>
                </Box>

                <Divider />

                {/* Created */}
                <Box className={classes.fieldRow}>
                  <Typography
                    variant="body2"
                    className={classes.fieldLabel}
                  >
                    Created
                  </Typography>
                  <Typography variant="body1" className={classes.fieldValue}>
                    {teamDetail?.metadata?.creationTimestamp
                      ? new Date(
                          teamDetail.metadata.creationTimestamp,
                        ).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })
                      : '-'}
                  </Typography>
                </Box>
              </InfoCard>
            </Grid>

            {/* Resource Quotas */}
            <Grid item xs={12} md={6}>
              <InfoCard title="Resource Quotas">
                {teamDetail?.spec?.resourceQuotas ? (
                  <List disablePadding>
                    {teamDetail.spec.resourceQuotas.maxClusters !==
                      undefined && (
                      <ListItem
                        disableGutters
                        className={classes.quotaItem}
                      >
                        <ListItemText
                          primary={
                            <Typography
                              variant="body2"
                              className={classes.quotaLabel}
                            >
                              Max Clusters
                            </Typography>
                          }
                          secondary={
                            <Typography
                              variant="h6"
                              className={classes.quotaValue}
                            >
                              {teamDetail.spec.resourceQuotas.maxClusters}
                            </Typography>
                          }
                        />
                      </ListItem>
                    )}
                    {teamDetail.spec.resourceQuotas.maxWorkersPerCluster !==
                      undefined && (
                      <>
                        <Divider />
                        <ListItem
                          disableGutters
                          className={classes.quotaItem}
                        >
                          <ListItemText
                            primary={
                              <Typography
                                variant="body2"
                                className={classes.quotaLabel}
                              >
                                Max Workers per Cluster
                              </Typography>
                            }
                            secondary={
                              <Typography
                                variant="h6"
                                className={classes.quotaValue}
                              >
                                {
                                  teamDetail.spec.resourceQuotas
                                    .maxWorkersPerCluster
                                }
                              </Typography>
                            }
                          />
                        </ListItem>
                      </>
                    )}
                    {teamDetail.spec.resourceQuotas.maxTotalWorkers !==
                      undefined && (
                      <>
                        <Divider />
                        <ListItem
                          disableGutters
                          className={classes.quotaItem}
                        >
                          <ListItemText
                            primary={
                              <Typography
                                variant="body2"
                                className={classes.quotaLabel}
                              >
                                Max Total Workers
                              </Typography>
                            }
                            secondary={
                              <Typography
                                variant="h6"
                                className={classes.quotaValue}
                              >
                                {
                                  teamDetail.spec.resourceQuotas
                                    .maxTotalWorkers
                                }
                              </Typography>
                            }
                          />
                        </ListItem>
                      </>
                    )}
                  </List>
                ) : (
                  <Typography variant="body2" className={classes.emptyText}>
                    No resource quotas configured for this team.
                  </Typography>
                )}
              </InfoCard>
            </Grid>

            {/* Access Configuration */}
            <Grid item xs={12}>
              <InfoCard title="Access Configuration">
                <Grid container spacing={3}>
                  {/* Users */}
                  <Grid item xs={12} md={6}>
                    <Typography variant="subtitle2" gutterBottom>
                      Users
                    </Typography>
                    <Box className={classes.accessSection}>
                      {teamDetail?.spec?.access?.users &&
                      teamDetail.spec.access.users.length > 0 ? (
                        teamDetail.spec.access.users.map((user, index) => (
                          <Chip
                            key={`user-${index}`}
                            label={`${user.email} (${user.role})`}
                            variant="outlined"
                            size="small"
                            className={classes.accessChip}
                          />
                        ))
                      ) : (
                        <Typography
                          variant="body2"
                          className={classes.emptyText}
                        >
                          No direct user access configured.
                        </Typography>
                      )}
                    </Box>
                  </Grid>

                  {/* Groups */}
                  <Grid item xs={12} md={6}>
                    <Typography variant="subtitle2" gutterBottom>
                      Groups
                    </Typography>
                    <Box className={classes.accessSection}>
                      {teamDetail?.spec?.access?.groups &&
                      teamDetail.spec.access.groups.length > 0 ? (
                        teamDetail.spec.access.groups.map((group, index) => (
                          <Chip
                            key={`group-${index}`}
                            label={`${group.name} (${group.role})`}
                            variant="outlined"
                            size="small"
                            color="primary"
                            className={classes.accessChip}
                          />
                        ))
                      ) : (
                        <Typography
                          variant="body2"
                          className={classes.emptyText}
                        >
                          No group access configured.
                        </Typography>
                      )}
                    </Box>
                  </Grid>
                </Grid>
              </InfoCard>
            </Grid>
    </Grid>
  );
};
