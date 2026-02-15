// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState, useCallback } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { Progress, EmptyState } from '@backstage/core-components';
import {
  Typography,
  Button,
  Box,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Chip,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import { Alert } from '@material-ui/lab';
import AddIcon from '@material-ui/icons/Add';
import DeleteIcon from '@material-ui/icons/Delete';
import EditIcon from '@material-ui/icons/Edit';
import { butlerApiRef } from '@internal/plugin-butler';
import type {
  WorkspaceTemplate,
  WorkspaceImage,
} from '@internal/plugin-butler';

const useStyles = makeStyles(theme => ({
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(3),
  },
  scopeChip: {
    fontWeight: 500,
  },
  formSection: {
    marginTop: theme.spacing(2),
  },
  sectionTitle: {
    fontWeight: 600,
    marginTop: theme.spacing(2),
    marginBottom: theme.spacing(1),
  },
}));

export const TemplateSettings = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);

  const [templates, setTemplates] = useState<WorkspaceTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] =
    useState<WorkspaceTemplate | null>(null);
  const [images, setImages] = useState<WorkspaceImage[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('');
  const [category, setCategory] = useState('');
  const [scope, setScope] = useState<'cluster' | 'team'>('team');
  const [image, setImage] = useState('');
  const [repositories, setRepositories] = useState<
    { url: string; branch: string }[]
  >([{ url: '', branch: '' }]);
  const [dotfilesRepo, setDotfilesRepo] = useState('');
  const [cpu, setCpu] = useState('2');
  const [memory, setMemory] = useState('4Gi');
  const [storageSize, setStorageSize] = useState('10Gi');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isEditing = editingTemplate !== null;

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await api.listWorkspaceTemplates();
      setTemplates(response.templates || []);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Load image catalog when dialog opens
  useEffect(() => {
    if (!dialogOpen) return;
    setLoadingCatalog(true);
    api
      .listWorkspaceImages()
      .then(response => setImages(response.images || []))
      .catch(() => setImages([]))
      .finally(() => setLoadingCatalog(false));
  }, [dialogOpen, api]);

  const resetForm = () => {
    setName('');
    setDisplayName('');
    setDescription('');
    setIcon('');
    setCategory('');
    setScope('team');
    setImage('');
    setRepositories([{ url: '', branch: '' }]);
    setDotfilesRepo('');
    setCpu('2');
    setMemory('4Gi');
    setStorageSize('10Gi');
    setFormError(null);
    setEditingTemplate(null);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (tpl: WorkspaceTemplate) => {
    setEditingTemplate(tpl);
    setName(tpl.metadata.name);
    setDisplayName(tpl.spec.displayName || '');
    setDescription(tpl.spec.description || '');
    setIcon(tpl.spec.icon || '');
    setCategory(tpl.spec.category || '');
    setScope(tpl.spec.scope || 'team');
    setImage(tpl.spec.template?.image || '');

    const t = tpl.spec.template;
    if (t?.repositories && t.repositories.length > 0) {
      setRepositories(
        t.repositories.map(r => ({
          url: r.url || '',
          branch: r.branch || '',
        })),
      );
    } else if (t?.repository) {
      setRepositories([
        { url: t.repository.url || '', branch: t.repository.branch || '' },
      ]);
    } else {
      setRepositories([{ url: '', branch: '' }]);
    }

    setDotfilesRepo(t?.dotfiles?.url || '');
    setCpu(t?.resources?.cpu || '2');
    setMemory(t?.resources?.memory || '4Gi');
    setStorageSize(t?.storageSize || '10Gi');
    setFormError(null);
    setDialogOpen(true);
  };

  const buildTemplateBody = () => {
    const template: Record<string, any> = {
      image: image.trim(),
    };

    const validRepos = repositories.filter(r => r.url.trim());
    if (validRepos.length === 1) {
      template.repository = {
        url: validRepos[0].url.trim(),
        branch: validRepos[0].branch.trim() || undefined,
      };
    } else if (validRepos.length > 1) {
      template.repositories = validRepos.map(r => ({
        url: r.url.trim(),
        branch: r.branch.trim() || undefined,
      }));
    }

    if (dotfilesRepo.trim()) {
      template.dotfiles = { url: dotfilesRepo.trim() };
    }

    if (cpu.trim() || memory.trim()) {
      template.resources = {
        cpu: cpu.trim() || undefined,
        memory: memory.trim() || undefined,
      };
    }

    if (storageSize.trim()) {
      template.storageSize = storageSize.trim();
    }

    return template;
  };

  const handleSave = async () => {
    if (!displayName.trim()) {
      setFormError('Display name is required.');
      return;
    }
    if (!image.trim()) {
      setFormError('Image is required.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const template = buildTemplateBody();

      if (isEditing) {
        const body: Record<string, any> = {
          displayName: displayName.trim(),
          template,
        };
        if (description.trim()) body.description = description.trim();
        else body.description = '';
        if (icon.trim()) body.icon = icon.trim();
        else body.icon = '';
        if (category.trim()) body.category = category.trim();
        else body.category = '';

        await api.updateWorkspaceTemplate(
          editingTemplate!.metadata.namespace,
          editingTemplate!.metadata.name,
          body as any,
        );
      } else {
        if (!name.trim()) {
          setFormError('Name is required.');
          setSaving(false);
          return;
        }
        const body: Record<string, any> = {
          name: name.trim(),
          displayName: displayName.trim(),
          template,
          scope,
        };
        if (description.trim()) body.description = description.trim();
        if (icon.trim()) body.icon = icon.trim();
        if (category.trim()) body.category = category.trim();

        await api.createWorkspaceTemplate(body as any);
      }

      setDialogOpen(false);
      resetForm();
      await fetchTemplates();
    } catch (e) {
      setFormError(
        e instanceof Error
          ? e.message
          : `Failed to ${isEditing ? 'update' : 'create'} template.`,
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (namespace: string, tplName: string) => {
    const id = `${namespace}/${tplName}`;
    setDeletingId(id);
    try {
      await api.deleteWorkspaceTemplate(namespace, tplName);
      await fetchTemplates();
    } catch {
      // Silent
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return <Progress />;
  }

  if (error) {
    return (
      <EmptyState
        title="Failed to load templates"
        description={error.message}
        missing="info"
      />
    );
  }

  return (
    <div>
      <div className={classes.headerRow}>
        <div>
          <Typography variant="h5">Workspace Templates</Typography>
          <Typography variant="body2" color="textSecondary">
            Manage templates that pre-fill workspace settings.
          </Typography>
        </div>
        <Button
          variant="contained"
          color="primary"
          size="small"
          startIcon={<AddIcon />}
          onClick={openCreate}
        >
          Create Template
        </Button>
      </div>

      {templates.length === 0 ? (
        <EmptyState
          title="No templates"
          description="Create a workspace template to provide pre-configured starting points for developers."
          missing="content"
          action={
            <Button
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
              onClick={openCreate}
            >
              Create Template
            </Button>
          }
        />
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Image</TableCell>
                <TableCell>Scope</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Created</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {templates.map(tpl => {
                const id = `${tpl.metadata.namespace}/${tpl.metadata.name}`;
                return (
                  <TableRow key={id}>
                    <TableCell>
                      <Box>
                        <Typography
                          variant="body2"
                          style={{ fontWeight: 500 }}
                        >
                          {tpl.spec.icon && `${tpl.spec.icon} `}
                          {tpl.spec.displayName}
                        </Typography>
                        {tpl.spec.description && (
                          <Typography
                            variant="caption"
                            color="textSecondary"
                          >
                            {tpl.spec.description}
                          </Typography>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        noWrap
                        style={{ maxWidth: 200 }}
                      >
                        {tpl.spec.template?.image || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={tpl.spec.scope || 'team'}
                        size="small"
                        variant="outlined"
                        color={
                          tpl.spec.scope === 'cluster'
                            ? 'primary'
                            : 'default'
                        }
                        className={classes.scopeChip}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="textSecondary">
                        {tpl.spec.category || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="textSecondary">
                        {tpl.metadata.creationTimestamp
                          ? new Date(
                              tpl.metadata.creationTimestamp,
                            ).toLocaleDateString()
                          : '-'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        onClick={() => openEdit(tpl)}
                        aria-label="edit template"
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() =>
                          handleDelete(
                            tpl.metadata.namespace,
                            tpl.metadata.name,
                          )
                        }
                        disabled={deletingId === id}
                        aria-label="delete template"
                      >
                        {deletingId === id ? (
                          <CircularProgress size={16} />
                        ) : (
                          <DeleteIcon
                            fontSize="small"
                            style={{ color: '#f44336' }}
                          />
                        )}
                      </IconButton>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Create / Edit Template Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {isEditing ? 'Edit Template' : 'Create Workspace Template'}
        </DialogTitle>
        <DialogContent>
          {loadingCatalog ? (
            <Box display="flex" justifyContent="center" p={4}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              <Typography
                variant="subtitle2"
                className={classes.sectionTitle}
                style={{ marginTop: 0 }}
              >
                Basic Information
              </Typography>
              {!isEditing && (
                <Box mt={1}>
                  <TextField
                    label="Name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    fullWidth
                    variant="outlined"
                    size="small"
                    required
                    placeholder="go-dev"
                    helperText="Unique identifier (lowercase, dashes allowed)."
                  />
                </Box>
              )}
              <Box mt={isEditing ? 1 : 2}>
                <TextField
                  label="Display Name"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  fullWidth
                  variant="outlined"
                  size="small"
                  required
                  placeholder="Go Development"
                />
              </Box>
              <Box mt={2}>
                <TextField
                  label="Description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  fullWidth
                  variant="outlined"
                  size="small"
                  placeholder="Pre-configured Go development environment."
                  multiline
                  minRows={2}
                />
              </Box>
              <Box mt={2} display="flex" style={{ gap: 16 }}>
                <TextField
                  label="Icon"
                  value={icon}
                  onChange={e => setIcon(e.target.value)}
                  variant="outlined"
                  size="small"
                  style={{ flex: 1 }}
                  placeholder="🐹"
                />
                <TextField
                  label="Category"
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  variant="outlined"
                  size="small"
                  style={{ flex: 1 }}
                  placeholder="Development"
                />
              </Box>

              <Typography
                variant="subtitle2"
                className={classes.sectionTitle}
              >
                Configuration
              </Typography>
              <Box mt={1}>
                <TextField
                  select
                  label="Image"
                  value={image}
                  onChange={e => setImage(e.target.value)}
                  fullWidth
                  variant="outlined"
                  size="small"
                  required
                >
                  {image && !images.find(i => i.image === image) && (
                    <MenuItem value={image}>{image}</MenuItem>
                  )}
                  {images.map(img => (
                    <MenuItem key={img.name} value={img.image}>
                      {img.displayName} - {img.description}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>
              <Box mt={2}>
                <Box
                  display="flex"
                  justifyContent="space-between"
                  alignItems="center"
                  mb={1}
                >
                  <Typography variant="body2" color="textSecondary">
                    Repositories
                  </Typography>
                  <Button
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={() =>
                      setRepositories(prev => [
                        ...prev,
                        { url: '', branch: '' },
                      ])
                    }
                    style={{ textTransform: 'none' }}
                  >
                    Add Repository
                  </Button>
                </Box>
                {repositories.map((repo, idx) => (
                  <Box
                    key={idx}
                    display="flex"
                    style={{ gap: 8 }}
                    alignItems="center"
                    mb={1}
                  >
                    <TextField
                      label={`Repository URL${repositories.length > 1 ? ` #${idx + 1}` : ''}`}
                      value={repo.url}
                      onChange={e => {
                        const updated = [...repositories];
                        updated[idx] = {
                          ...updated[idx],
                          url: e.target.value,
                        };
                        setRepositories(updated);
                      }}
                      variant="outlined"
                      size="small"
                      style={{ flex: 2 }}
                      placeholder="https://github.com/org/repo"
                    />
                    <TextField
                      label="Branch"
                      value={repo.branch}
                      onChange={e => {
                        const updated = [...repositories];
                        updated[idx] = {
                          ...updated[idx],
                          branch: e.target.value,
                        };
                        setRepositories(updated);
                      }}
                      variant="outlined"
                      size="small"
                      style={{ flex: 1 }}
                      placeholder="main"
                    />
                    {repositories.length > 1 && (
                      <IconButton
                        size="small"
                        onClick={() =>
                          setRepositories(prev =>
                            prev.filter((_, i) => i !== idx),
                          )
                        }
                        aria-label="remove repository"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Box>
                ))}
                {repositories.filter(r => r.url.trim()).length > 1 && (
                  <Typography
                    variant="caption"
                    color="textSecondary"
                    style={{ display: 'block', marginTop: 4 }}
                  >
                    Multiple repositories will be cloned as sibling directories.
                  </Typography>
                )}
              </Box>
              <Box mt={2}>
                <TextField
                  label="Dotfiles Repository"
                  value={dotfilesRepo}
                  onChange={e => setDotfilesRepo(e.target.value)}
                  fullWidth
                  variant="outlined"
                  size="small"
                  placeholder="https://github.com/user/dotfiles"
                />
              </Box>
              <Box mt={2} display="flex" style={{ gap: 16 }}>
                <TextField
                  label="CPU"
                  value={cpu}
                  onChange={e => setCpu(e.target.value)}
                  variant="outlined"
                  size="small"
                  style={{ flex: 1 }}
                  placeholder="2"
                />
                <TextField
                  label="Memory"
                  value={memory}
                  onChange={e => setMemory(e.target.value)}
                  variant="outlined"
                  size="small"
                  style={{ flex: 1 }}
                  placeholder="4Gi"
                />
                <TextField
                  label="Storage"
                  value={storageSize}
                  onChange={e => setStorageSize(e.target.value)}
                  variant="outlined"
                  size="small"
                  style={{ flex: 1 }}
                  placeholder="10Gi"
                />
              </Box>

              {!isEditing && (
                <>
                  <Typography
                    variant="subtitle2"
                    className={classes.sectionTitle}
                  >
                    Scope
                  </Typography>
                  <Box display="flex" style={{ gap: 8 }}>
                    {(['team', 'cluster'] as const).map(s => (
                      <Chip
                        key={s}
                        label={s === 'team' ? 'Team' : 'Cluster (all teams)'}
                        size="small"
                        color={scope === s ? 'primary' : 'default'}
                        variant={scope === s ? 'default' : 'outlined'}
                        onClick={() => setScope(s)}
                        clickable
                      />
                    ))}
                  </Box>
                  <Typography
                    variant="caption"
                    color="textSecondary"
                    style={{ display: 'block', marginTop: 4 }}
                  >
                    {scope === 'team'
                      ? 'Available only to your current team.'
                      : 'Available to all teams. Requires platform admin.'}
                  </Typography>
                </>
              )}

              {formError && (
                <Box mt={2}>
                  <Alert severity="error">{formError}</Alert>
                </Box>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            color="primary"
            variant="contained"
            disabled={
              saving ||
              loadingCatalog ||
              (!isEditing && !name.trim()) ||
              !displayName.trim() ||
              !image.trim()
            }
            startIcon={
              saving ? (
                <CircularProgress size={16} color="inherit" />
              ) : undefined
            }
          >
            {saving
              ? isEditing
                ? 'Saving...'
                : 'Creating...'
              : isEditing
                ? 'Save Changes'
                : 'Create Template'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};
