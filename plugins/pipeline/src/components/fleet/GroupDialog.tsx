// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  IconButton,
  Box,
  Chip,
  MenuItem,
} from '@material-ui/core';
import { makeStyles, Theme, createStyles } from '@material-ui/core/styles';
import AddIcon from '@material-ui/icons/Add';
import { usePipelineApi } from '../../hooks/usePipelineApi';
import { usePipelineTeam } from '../../hooks/usePipelineTeam';
import type { FleetGroup } from '../../api/types/fleet';

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    field: {
      marginBottom: theme.spacing(2),
    },
    labelSection: {
      marginTop: theme.spacing(2),
    },
    labelRow: {
      display: 'flex',
      gap: theme.spacing(1),
      alignItems: 'center',
      marginBottom: theme.spacing(1),
    },
    labelChips: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: theme.spacing(0.5),
      marginTop: theme.spacing(1),
    },
  }),
);

interface GroupDialogProps {
  open: boolean;
  onClose: (saved: boolean) => void;
  group: FleetGroup | null;
}

export function GroupDialog({ open, onClose, group }: GroupDialogProps) {
  const classes = useStyles();
  const api = usePipelineApi();
  const { teams, activeTeam, isPlatformAdmin } = usePipelineTeam();
  const isAdminMode = isPlatformAdmin && !activeTeam;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [labelKey, setLabelKey] = useState('');
  const [labelValue, setLabelValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (group) {
        setName(group.name);
        setDescription(group.description || '');
        setLabels(group.label_selector || {});
      } else {
        setName('');
        setDescription('');
        setLabels({});
      }
      setLabelKey('');
      setLabelValue('');
      setSelectedTeam('');
      setError(null);
    }
  }, [open, group]);

  const handleAddLabel = () => {
    if (!labelKey.trim()) return;
    setLabels(prev => ({ ...prev, [labelKey.trim()]: labelValue.trim() }));
    setLabelKey('');
    setLabelValue('');
  };

  const handleRemoveLabel = (key: string) => {
    setLabels(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (isAdminMode && !group && !selectedTeam) {
      setError('Team is required in admin mode');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const selector = Object.keys(labels).length > 0 ? labels : undefined;
      if (group) {
        await api.updateFleetGroup(group.id, {
          name: name.trim(),
          description: description.trim() || null,
          label_selector: selector || null,
        });
      } else {
        await api.createFleetGroup({
          name: name.trim(),
          description: description.trim() || undefined,
          label_selector: selector,
          team: isAdminMode ? selectedTeam : undefined,
        });
      }
      onClose(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => onClose(false)} maxWidth="sm" fullWidth>
      <DialogTitle>{group ? 'Edit Group' : 'Create Group'}</DialogTitle>
      <DialogContent>
        {isAdminMode && !group && (
          <TextField
            select
            className={classes.field}
            label="Team"
            value={selectedTeam}
            onChange={e => setSelectedTeam(e.target.value)}
            fullWidth
            variant="outlined"
            size="small"
            helperText="Admin mode: select which team this group belongs to"
          >
            {teams.map(t => (
              <MenuItem key={t} value={t}>{t}</MenuItem>
            ))}
          </TextField>
        )}
        <TextField
          className={classes.field}
          label="Name"
          value={name}
          onChange={e => setName(e.target.value)}
          fullWidth
          required
          variant="outlined"
          size="small"
          disabled={!!group}
        />
        <TextField
          className={classes.field}
          label="Description"
          value={description}
          onChange={e => setDescription(e.target.value)}
          fullWidth
          variant="outlined"
          size="small"
          multiline
          rows={2}
        />
        <div className={classes.labelSection}>
          <Typography variant="subtitle2" gutterBottom>
            Label Selector
          </Typography>
          <Typography variant="body2" color="textSecondary" gutterBottom>
            Agents matching ALL labels will be included in this group.
          </Typography>
          <Box className={classes.labelRow}>
            <TextField
              label="Key"
              value={labelKey}
              onChange={e => setLabelKey(e.target.value)}
              variant="outlined"
              size="small"
              style={{ flex: 1 }}
            />
            <TextField
              label="Value"
              value={labelValue}
              onChange={e => setLabelValue(e.target.value)}
              variant="outlined"
              size="small"
              style={{ flex: 1 }}
            />
            <IconButton size="small" onClick={handleAddLabel} disabled={!labelKey.trim()}>
              <AddIcon />
            </IconButton>
          </Box>
          <div className={classes.labelChips}>
            {Object.entries(labels).map(([k, v]) => (
              <Chip
                key={k}
                label={`${k}=${v}`}
                onDelete={() => handleRemoveLabel(k)}
                variant="outlined"
                size="small"
              />
            ))}
          </div>
        </div>
        {error && (
          <Typography color="error" variant="body2" style={{ marginTop: 16 }}>
            {error}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose(false)}>Cancel</Button>
        <Button onClick={handleSave} color="primary" variant="contained" disabled={saving}>
          {saving ? 'Saving...' : group ? 'Update' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
