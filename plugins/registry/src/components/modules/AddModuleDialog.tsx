// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Paper,
} from '@material-ui/core';
import { useRegistryApi } from '../../hooks/useRegistryApi';
import type { Artifact } from '../../api/types/artifacts';

interface AddModuleDialogProps {
  open: boolean;
  envId: string;
  onClose: () => void;
  onAdded: () => void;
}

export function AddModuleDialog({
  open,
  envId,
  onClose,
  onAdded,
}: AddModuleDialogProps) {
  const api = useRegistryApi();

  const [localName, setLocalName] = useState('');
  const [artifactNs, setArtifactNs] = useState('');
  const [artifactName, setArtifactName] = useState('');
  const [pinnedVersion, setPinnedVersion] = useState('');
  const [execMode, setExecMode] = useState<'byoc' | 'peaas'>('byoc');
  const [tfVersion, setTfVersion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Artifact search
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Artifact[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = async () => {
    if (!search) return;
    try {
      setSearching(true);
      const data = await api.listArtifacts({
        search,
        limit: 10,
      });
      setResults(data.items);
    } catch {
      // Silent
    } finally {
      setSearching(false);
    }
  };

  const selectArtifact = (artifact: Artifact) => {
    setArtifactNs(artifact.namespace);
    setArtifactName(artifact.name);
    if (!localName) setLocalName(artifact.name);
    setResults([]);
    setSearch('');
  };

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      setError(null);
      await api.addModule(envId, {
        name: localName.trim(),
        artifact_namespace: artifactNs.trim(),
        artifact_name: artifactName.trim(),
        pinned_version: pinnedVersion.trim() || undefined,
        execution_mode: execMode,
        tf_version: tfVersion.trim() || undefined,
      });
      // Reset form
      setLocalName('');
      setArtifactNs('');
      setArtifactName('');
      setPinnedVersion('');
      setExecMode('byoc');
      setTfVersion('');
      onAdded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add module');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Module</DialogTitle>
      <DialogContent>
        <Box mb={2}>
          <Typography variant="subtitle2" gutterBottom>
            Search Registry Artifacts
          </Typography>
          <Box display="flex" style={{ gap: 8 }}>
            <TextField
              fullWidth
              variant="outlined"
              size="small"
              placeholder="Search by name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
            <Button
              variant="outlined"
              size="small"
              onClick={handleSearch}
              disabled={searching}
            >
              Search
            </Button>
          </Box>
          {results.length > 0 && (
            <Paper
              variant="outlined"
              style={{ marginTop: 8, maxHeight: 200, overflow: 'auto' }}
            >
              {results.map(a => (
                <Box
                  key={a.id}
                  p={1}
                  style={{ cursor: 'pointer' }}
                  onClick={() => selectArtifact(a)}
                >
                  <Typography variant="body2">
                    {a.namespace}/{a.name}
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    {a.type} | {a.description || 'No description'}
                  </Typography>
                </Box>
              ))}
            </Paper>
          )}
        </Box>

        <TextField
          fullWidth
          variant="outlined"
          label="Local Name"
          value={localName}
          onChange={e => setLocalName(e.target.value)}
          margin="normal"
          size="small"
          placeholder="e.g. vpc, eks, rds"
          helperText="Unique name within this environment"
        />
        <Box display="flex" style={{ gap: 16 }}>
          <TextField
            variant="outlined"
            label="Namespace"
            value={artifactNs}
            onChange={e => setArtifactNs(e.target.value)}
            margin="normal"
            size="small"
            style={{ flex: 1 }}
          />
          <TextField
            variant="outlined"
            label="Artifact Name"
            value={artifactName}
            onChange={e => setArtifactName(e.target.value)}
            margin="normal"
            size="small"
            style={{ flex: 1 }}
          />
        </Box>
        <TextField
          fullWidth
          variant="outlined"
          label="Pinned Version"
          value={pinnedVersion}
          onChange={e => setPinnedVersion(e.target.value)}
          margin="normal"
          size="small"
          placeholder="Leave empty to track latest"
          helperText="Exact version (1.2.3) or constraint (~> 1.2)"
        />
        <TextField
          select
          fullWidth
          variant="outlined"
          label="Execution Mode"
          value={execMode}
          onChange={e => setExecMode(e.target.value as 'byoc' | 'peaas')}
          margin="normal"
          size="small"
        >
          <MenuItem value="byoc">BYOC (Bring Your Own Compute)</MenuItem>
          <MenuItem value="peaas">PeaaS (Platform-Managed)</MenuItem>
        </TextField>
        <TextField
          fullWidth
          variant="outlined"
          label="Terraform Version"
          value={tfVersion}
          onChange={e => setTfVersion(e.target.value)}
          margin="normal"
          size="small"
          placeholder="e.g. 1.9.0 (optional)"
        />

        {error && (
          <Typography color="error" variant="body2" style={{ marginTop: 8 }}>
            {error}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          color="primary"
          onClick={handleSubmit}
          disabled={submitting || !localName || !artifactNs || !artifactName}
        >
          {submitting ? 'Adding...' : 'Add Module'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
