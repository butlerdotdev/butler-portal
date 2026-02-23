// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useCallback } from 'react';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Button,
  IconButton,
  Tooltip,
  Typography,
  Chip,
  Box,
  TableContainer,
} from '@material-ui/core';
import { makeStyles, Theme, createStyles } from '@material-ui/core/styles';
import AddIcon from '@material-ui/icons/Add';
import EditIcon from '@material-ui/icons/Edit';
import DeleteIcon from '@material-ui/icons/Delete';
import RefreshIcon from '@material-ui/icons/Refresh';
import { Progress, WarningPanel, InfoCard } from '@backstage/core-components';
import { useNavigate } from 'react-router-dom';
import { usePipelineApi } from '../../hooks/usePipelineApi';
import { usePipelineTeam } from '../../hooks/usePipelineTeam';
import { hasMinRole } from '@internal/plugin-pipeline-common';
import type { FleetGroup } from '../../api/types/fleet';
import { GroupDialog } from './GroupDialog';

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    toolbar: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: theme.spacing(2),
    },
    labelChip: {
      marginRight: theme.spacing(0.5),
      marginBottom: theme.spacing(0.5),
    },
  }),
);

export function GroupList() {
  const classes = useStyles();
  const api = usePipelineApi();
  const navigate = useNavigate();
  const { activeTeam, activeRole, isPlatformAdmin } = usePipelineTeam();
  const isAdminMode = isPlatformAdmin && !activeTeam;
  const canManageGroups = isAdminMode || (!!activeRole && hasMinRole(activeRole, 'operator'));
  const [groups, setGroups] = useState<FleetGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<FleetGroup | null>(null);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.listFleetGroups();
      setGroups(result.items);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const handleDelete = async (group: FleetGroup) => {
    if (!window.confirm(`Delete group "${group.name}"? This cannot be undone.`)) return;
    try {
      await api.deleteFleetGroup(group.id);
      loadGroups();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      alert(`Failed to delete group: ${message}`);
    }
  };

  const handleDialogClose = (saved: boolean) => {
    setDialogOpen(false);
    setEditingGroup(null);
    if (saved) loadGroups();
  };

  if (error) {
    return <WarningPanel title="Failed to load groups" message={error.message} />;
  }

  return (
    <InfoCard title="Fleet Groups">
      <Box className={classes.toolbar}>
        <Typography variant="body2" color="textSecondary">
          {groups.length} group{groups.length !== 1 ? 's' : ''}
        </Typography>
        <Box>
          <Tooltip title="Refresh">
            <IconButton onClick={loadGroups} size="small">
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          {canManageGroups && (
            <Button
              variant="contained"
              color="primary"
              size="small"
              startIcon={<AddIcon />}
              onClick={() => setDialogOpen(true)}
            >
              Create Group
            </Button>
          )}
        </Box>
      </Box>
      {loading ? (
        <Progress />
      ) : groups.length === 0 ? (
        <Typography color="textSecondary" align="center">
          No groups created yet. Groups let you target agents by labels.
        </Typography>
      ) : (
        <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              {isAdminMode && <TableCell>Team</TableCell>}
              <TableCell>Description</TableCell>
              <TableCell>Label Selector</TableCell>
              <TableCell>Agents</TableCell>
              <TableCell>Created</TableCell>
              {canManageGroups && <TableCell align="right">Actions</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {groups.map(group => (
              <TableRow
                key={group.id}
                hover
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`groups/${group.id}`)}
              >
                <TableCell>{group.name}</TableCell>
                {isAdminMode && <TableCell>{group.team}</TableCell>}
                <TableCell>{group.description || '--'}</TableCell>
                <TableCell>
                  {group.label_selector && Object.keys(group.label_selector).length > 0
                    ? Object.entries(group.label_selector).map(([k, v]) => (
                        <Chip
                          key={k}
                          label={`${k}=${v}`}
                          size="small"
                          variant="outlined"
                          className={classes.labelChip}
                        />
                      ))
                    : '--'}
                </TableCell>
                <TableCell>{group.agentCount ?? '--'}</TableCell>
                <TableCell>{new Date(group.created_at).toLocaleDateString()}</TableCell>
                {canManageGroups && (
                  <TableCell align="right">
                    <Button
                      size="small"
                      startIcon={<EditIcon />}
                      onClick={() => {
                        setEditingGroup(group);
                        setDialogOpen(true);
                      }}
                      style={{ marginRight: 8 }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="small"
                      color="secondary"
                      startIcon={<DeleteIcon />}
                      onClick={() => handleDelete(group)}
                    >
                      Delete
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </TableContainer>
      )}
      <GroupDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        group={editingGroup}
      />
    </InfoCard>
  );
}
