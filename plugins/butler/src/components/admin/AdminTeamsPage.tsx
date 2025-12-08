// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState, useCallback } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import {
  Table,
  TableColumn,
  Progress,
  EmptyState,
  Link,
} from '@backstage/core-components';
import {
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  makeStyles,
} from '@material-ui/core';
import AddIcon from '@material-ui/icons/Add';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import RefreshIcon from '@material-ui/icons/Refresh';
import { butlerApiRef } from '../../api/ButlerApi';
import type { TeamInfo } from '../../api/types/teams';

const useStyles = makeStyles(theme => ({
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(2),
  },
  actions: {
    display: 'flex',
    gap: theme.spacing(1),
  },
  formField: {
    marginBottom: theme.spacing(2),
  },
}));

type TeamRow = {
  id: string;
  name: string;
  displayName: string;
  clusterCount: number;
  role: string;
};

export const AdminTeamsPage = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    displayName: '',
    description: '',
  });
  const [formError, setFormError] = useState<string | undefined>();

  const fetchTeams = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await api.listAllTeams();
      setTeams(response.teams || []);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  const handleCreateTeam = async () => {
    if (!formData.name.trim()) {
      setFormError('Team name is required.');
      return;
    }

    const nameRegex = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
    if (formData.name.length > 2 && !nameRegex.test(formData.name)) {
      setFormError(
        'Name must be lowercase alphanumeric with hyphens, and cannot start or end with a hyphen.',
      );
      return;
    }

    setCreating(true);
    setFormError(undefined);
    try {
      await api.createTeam({
        name: formData.name,
        displayName: formData.displayName || formData.name,
        description: formData.description,
      });
      setCreateOpen(false);
      setFormData({ name: '', displayName: '', description: '' });
      fetchTeams();
    } catch (e) {
      setFormError(
        e instanceof Error ? e.message : 'Failed to create team.',
      );
    } finally {
      setCreating(false);
    }
  };

  const handleCloseDialog = () => {
    setCreateOpen(false);
    setFormData({ name: '', displayName: '', description: '' });
    setFormError(undefined);
  };

  if (loading) {
    return <Progress />;
  }

  if (error) {
    return (
      <EmptyState
        title="Failed to load teams"
        description={error.message}
        missing="info"
      />
    );
  }

  const columns: TableColumn<TeamRow>[] = [
    {
      title: 'Name',
      field: 'name',
      render: (row: TeamRow) => (
        <Link to={`./${row.name}`}>{row.name}</Link>
      ),
    },
    {
      title: 'Display Name',
      field: 'displayName',
    },
    {
      title: 'Clusters',
      field: 'clusterCount',
      type: 'numeric',
    },
    {
      title: 'Role',
      field: 'role',
    },
  ];

  const data: TeamRow[] = teams.map(team => ({
    id: team.name,
    name: team.name,
    displayName: team.displayName || team.name,
    clusterCount: team.clusterCount,
    role: team.role,
  }));

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
        <Typography variant="h4">Teams</Typography>
        <div className={classes.actions}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={fetchTeams}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={() => setCreateOpen(true)}
          >
            Create Team
          </Button>
        </div>
      </div>

      {teams.length === 0 ? (
        <EmptyState
          title="No teams found"
          description="Get started by creating your first team."
          missing="content"
          action={
            <Button
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
              onClick={() => setCreateOpen(true)}
            >
              Create Team
            </Button>
          }
        />
      ) : (
        <Table<TeamRow>
          title={`Teams (${teams.length})`}
          options={{
            search: true,
            paging: teams.length > 20,
            pageSize: 20,
            padding: 'dense',
          }}
          columns={columns}
          data={data}
        />
      )}

      {/* Create Team Dialog */}
      <Dialog
        open={createOpen}
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create Team</DialogTitle>
        <DialogContent>
          {formError && (
            <Typography color="error" variant="body2" gutterBottom>
              {formError}
            </Typography>
          )}
          <TextField
            className={classes.formField}
            label="Name"
            helperText="Lowercase alphanumeric with hyphens. Used as the namespace identifier."
            value={formData.name}
            onChange={e =>
              setFormData(prev => ({ ...prev, name: e.target.value }))
            }
            fullWidth
            required
            autoFocus
            margin="dense"
          />
          <TextField
            className={classes.formField}
            label="Display Name"
            helperText="Human-readable name for the team."
            value={formData.displayName}
            onChange={e =>
              setFormData(prev => ({ ...prev, displayName: e.target.value }))
            }
            fullWidth
            margin="dense"
          />
          <TextField
            className={classes.formField}
            label="Description"
            helperText="Optional description of the team's purpose."
            value={formData.description}
            onChange={e =>
              setFormData(prev => ({ ...prev, description: e.target.value }))
            }
            fullWidth
            multiline
            rows={3}
            margin="dense"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} disabled={creating}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateTeam}
            color="primary"
            variant="contained"
            disabled={creating}
          >
            {creating ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};
