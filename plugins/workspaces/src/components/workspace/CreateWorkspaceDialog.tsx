// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';
import {
  Grid,
  Typography,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Box,
  IconButton,
  CircularProgress,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import { Alert } from '@material-ui/lab';
import AddIcon from '@material-ui/icons/Add';
import DeleteIcon from '@material-ui/icons/Delete';
import type {
  ButlerApi,
  Cluster,
  WorkspaceImage,
  WorkspaceTemplate,
  CreateWorkspaceRequest,
} from '@internal/plugin-butler';
import { createTarGzFromFiles } from '../../util/tarGz';

const useStyles = makeStyles(theme => ({
  templateCard: {
    cursor: 'pointer',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    '&:hover': {
      borderColor: theme.palette.primary.main,
    },
  },
  templateCardSelected: {
    borderColor: theme.palette.primary.main,
    boxShadow: `0 0 0 1px ${theme.palette.primary.main}`,
  },
  templateIcon: {
    fontSize: '2rem',
    marginBottom: theme.spacing(1),
  },
  formSection: {
    marginTop: theme.spacing(2),
  },
  sshInfoBox: {
    padding: theme.spacing(1.5, 2),
    borderRadius: theme.shape.borderRadius,
    backgroundColor: theme.palette.background.default,
    border: `1px solid ${theme.palette.divider}`,
    marginTop: theme.spacing(2),
  },
}));

const AUTO_STOP_OPTIONS = [
  { value: '4h', label: '4 hours' },
  { value: '8h', label: '8 hours' },
  { value: '12h', label: '12 hours' },
  { value: '24h', label: '24 hours' },
  { value: '', label: 'Never' },
];

interface CreateWorkspaceDialogProps {
  open: boolean;
  clusters: Cluster[];
  api: ButlerApi;
  onSuccess: () => void;
  onClose: () => void;
}

export const CreateWorkspaceDialog = ({
  open,
  clusters,
  api,
  onSuccess,
  onClose,
}: CreateWorkspaceDialogProps) => {
  const classes = useStyles();

  // Cluster selector
  const [selectedCluster, setSelectedCluster] = useState('');

  // Template and image catalogs
  const [templates, setTemplates] = useState<WorkspaceTemplate[]>([]);
  const [images, setImages] = useState<WorkspaceImage[]>([]);
  const [loadingCatalogs, setLoadingCatalogs] = useState(false);

  // Form state
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(
    null,
  );
  const [name, setName] = useState('');
  const [image, setImage] = useState('');
  const [repositories, setRepositories] = useState<
    { url: string; branch: string }[]
  >([{ url: '', branch: '' }]);
  const [dotfilesRepo, setDotfilesRepo] = useState('');
  const [nvimConfigRepo, setNvimConfigRepo] = useState('');
  const [nvimInitLua, setNvimInitLua] = useState('');
  const [nvimConfigMode, setNvimConfigMode] = useState<
    'none' | 'repo' | 'file' | 'directory'
  >('none');
  const [nvimConfigArchive, setNvimConfigArchive] = useState('');
  const [nvimDirFileCount, setNvimDirFileCount] = useState(0);
  const [cpu, setCpu] = useState('2');
  const [memory, setMemory] = useState('4Gi');
  const [storageSize, setStorageSize] = useState('10Gi');
  const [autoStopAfter, setAutoStopAfter] = useState('8h');

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [savedSSHKeys, setSavedSSHKeys] = useState<string[]>([]);
  const [sshKeyInput, setSSHKeyInput] = useState('');

  // Load catalogs when dialog opens
  useEffect(() => {
    if (!open) return;
    setLoadingCatalogs(true);
    Promise.all([
      api.listWorkspaceTemplates().catch(() => ({ templates: [] })),
      api.listWorkspaceImages().catch(() => ({ images: [] })),
      api.listSSHKeys().catch(() => ({ sshKeys: [] })),
    ])
      .then(([tplResponse, imgResponse, sshResponse]) => {
        setTemplates(tplResponse.templates || []);
        setImages(imgResponse.images || []);
        setSavedSSHKeys(
          (sshResponse.sshKeys || []).map((k: any) => k.publicKey),
        );
      })
      .finally(() => setLoadingCatalogs(false));
  }, [open, api]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedCluster(clusters.length === 1 ? clusters[0].metadata.name : '');
      setSelectedTemplate(null);
      setName('');
      setImage('');
      setRepositories([{ url: '', branch: '' }]);
      setDotfilesRepo('');
      setNvimConfigRepo('');
      setNvimInitLua('');
      setNvimConfigMode('none');
      setNvimConfigArchive('');
      setNvimDirFileCount(0);
      setCpu('2');
      setMemory('4Gi');
      setStorageSize('10Gi');
      setAutoStopAfter('8h');
      setCreateError(null);
      setSSHKeyInput('');
    }
  }, [open, clusters]);

  const selectedClusterObj = clusters.find(
    c => c.metadata.name === selectedCluster,
  );

  const handleSelectTemplate = (template: WorkspaceTemplate) => {
    const tplName = template.metadata.name;
    if (selectedTemplate === tplName) {
      setSelectedTemplate(null);
      return;
    }
    setSelectedTemplate(tplName);

    const t = template.spec.template;
    setImage(t.image || '');
    if (t.repositories && t.repositories.length > 0) {
      setRepositories(
        t.repositories.map(r => ({
          url: r.url || '',
          branch: r.branch || '',
        })),
      );
    } else if (t.repository) {
      setRepositories([
        { url: t.repository.url || '', branch: t.repository.branch || '' },
      ]);
    } else {
      setRepositories([{ url: '', branch: '' }]);
    }
    if (t.dotfiles) {
      setDotfilesRepo(t.dotfiles.url || '');
    } else {
      setDotfilesRepo('');
    }
    if (t.resources) {
      setCpu(t.resources.cpu || '2');
      setMemory(t.resources.memory || '4Gi');
    } else {
      setCpu('2');
      setMemory('4Gi');
    }
    setStorageSize(t.storageSize || '10Gi');
  };

  const handleCreate = async () => {
    if (!selectedClusterObj) {
      setCreateError('Please select a cluster.');
      return;
    }
    if (!name.trim()) {
      setCreateError('Name is required.');
      return;
    }
    if (!image.trim()) {
      setCreateError('Image is required.');
      return;
    }

    setCreating(true);
    setCreateError(null);
    try {
      const data: CreateWorkspaceRequest = {
        name: name.trim(),
        image: image.trim(),
      };

      const validRepos = repositories.filter(r => r.url.trim());
      if (validRepos.length === 1) {
        data.repository = {
          url: validRepos[0].url.trim(),
          branch: validRepos[0].branch.trim() || undefined,
        };
      } else if (validRepos.length > 1) {
        data.repositories = validRepos.map(r => ({
          url: r.url.trim(),
          branch: r.branch.trim() || undefined,
        }));
      }

      if (dotfilesRepo.trim()) {
        data.dotfiles = {
          url: dotfilesRepo.trim(),
        };
      }

      if (nvimConfigMode === 'repo' && nvimConfigRepo.trim()) {
        data.editorConfig = { neovimConfigRepo: nvimConfigRepo.trim() };
      } else if (nvimConfigMode === 'directory' && nvimConfigArchive) {
        data.editorConfig = { neovimConfigArchive: nvimConfigArchive };
      } else if (nvimConfigMode === 'file' && nvimInitLua.trim()) {
        data.editorConfig = { neovimInitLua: nvimInitLua.trim() };
      }

      if (cpu.trim() || memory.trim()) {
        data.resources = {
          cpu: cpu.trim() || undefined,
          memory: memory.trim() || undefined,
        };
      }

      if (storageSize.trim()) {
        data.storageSize = storageSize.trim();
      }

      if (autoStopAfter) {
        data.autoStopAfter = autoStopAfter;
      }

      if (selectedTemplate) {
        data.templateName = selectedTemplate;
      }

      const allKeys = [...savedSSHKeys];
      if (sshKeyInput.trim()) {
        allKeys.push(sshKeyInput.trim());
      }
      if (allKeys.length > 0) {
        data.sshPublicKeys = allKeys;
      }

      await api.createWorkspace(
        selectedClusterObj.metadata.namespace,
        selectedClusterObj.metadata.name,
        data,
      );
      onSuccess();
    } catch (e) {
      setCreateError(
        e instanceof Error ? e.message : 'Failed to create workspace.',
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Create Workspace</DialogTitle>
      <DialogContent>
        {loadingCatalogs ? (
          <Box display="flex" justifyContent="center" p={4}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {/* Cluster selector */}
            <Box mb={2}>
              <TextField
                select
                label="Cluster"
                value={selectedCluster}
                onChange={e => setSelectedCluster(e.target.value)}
                fullWidth
                variant="outlined"
                size="small"
                required
                helperText="Select the cluster where your workspace will run."
              >
                {clusters.map(c => (
                  <MenuItem
                    key={c.metadata.name}
                    value={c.metadata.name}
                  >
                    {c.metadata.name}
                    {c.status?.phase && (
                      <Typography
                        variant="caption"
                        color="textSecondary"
                        style={{ marginLeft: 8 }}
                      >
                        ({c.status.phase})
                      </Typography>
                    )}
                  </MenuItem>
                ))}
              </TextField>
            </Box>

            {/* Template picker */}
            {templates.length > 0 && (
              <div>
                <Typography
                  variant="subtitle2"
                  gutterBottom
                  style={{ fontWeight: 600 }}
                >
                  Templates
                </Typography>
                <Typography
                  variant="body2"
                  color="textSecondary"
                  gutterBottom
                >
                  Select a template to pre-fill workspace settings, or
                  configure manually below.
                </Typography>
                <Grid container spacing={2}>
                  {templates.map(tpl => (
                    <Grid
                      item
                      xs={12}
                      sm={6}
                      md={4}
                      key={tpl.metadata.name}
                    >
                      <Card
                        variant="outlined"
                        className={`${classes.templateCard} ${
                          selectedTemplate === tpl.metadata.name
                            ? classes.templateCardSelected
                            : ''
                        }`}
                        onClick={() => handleSelectTemplate(tpl)}
                      >
                        <CardContent>
                          {tpl.spec.icon && (
                            <Typography
                              className={classes.templateIcon}
                            >
                              {tpl.spec.icon}
                            </Typography>
                          )}
                          <Typography
                            variant="subtitle2"
                            style={{ fontWeight: 500 }}
                          >
                            {tpl.spec.displayName}
                          </Typography>
                          {tpl.spec.description && (
                            <Typography
                              variant="body2"
                              color="textSecondary"
                              style={{ marginTop: 4 }}
                            >
                              {tpl.spec.description}
                            </Typography>
                          )}
                          {tpl.spec.category && (
                            <Chip
                              label={tpl.spec.category}
                              size="small"
                              variant="outlined"
                              style={{ marginTop: 8 }}
                            />
                          )}
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              </div>
            )}

            {/* Form fields */}
            <div className={classes.formSection}>
              <Typography
                variant="subtitle2"
                gutterBottom
                style={{ fontWeight: 600 }}
              >
                Configuration
              </Typography>

              <Box mt={1}>
                <TextField
                  label="Name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  fullWidth
                  variant="outlined"
                  size="small"
                  required
                  placeholder="my-workspace"
                />
              </Box>

              <Box mt={2}>
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

              {/* Repositories */}
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
                    Multiple repositories will be cloned as sibling
                    directories. A VS Code .code-workspace file will be
                    generated automatically.
                  </Typography>
                )}
              </Box>

              <Box mt={2}>
                <TextField
                  label="Dotfiles Repository URL"
                  value={dotfilesRepo}
                  onChange={e => setDotfilesRepo(e.target.value)}
                  fullWidth
                  variant="outlined"
                  size="small"
                  placeholder="https://github.com/user/dotfiles"
                />
              </Box>

              <Box mt={2}>
                <Typography
                  variant="body2"
                  color="textSecondary"
                  gutterBottom
                >
                  Neovim Configuration
                </Typography>
                <Box display="flex" style={{ gap: 8 }} mb={1}>
                  {(['none', 'repo', 'directory', 'file'] as const).map(mode => (
                    <Chip
                      key={mode}
                      label={
                        mode === 'none'
                          ? 'None'
                          : mode === 'repo'
                            ? 'Git Repository'
                            : mode === 'directory'
                              ? 'Upload Directory'
                              : 'Upload init.lua'
                      }
                      size="small"
                      color={
                        nvimConfigMode === mode ? 'primary' : 'default'
                      }
                      variant={
                        nvimConfigMode === mode ? 'default' : 'outlined'
                      }
                      onClick={() => setNvimConfigMode(mode)}
                      clickable
                    />
                  ))}
                </Box>
                {nvimConfigMode === 'repo' && (
                  <TextField
                    label="Neovim Config Repository"
                    value={nvimConfigRepo}
                    onChange={e => setNvimConfigRepo(e.target.value)}
                    fullWidth
                    variant="outlined"
                    size="small"
                    placeholder="https://github.com/user/nvim-config"
                    helperText="Cloned to ~/.config/nvim on workspace creation."
                  />
                )}
                {nvimConfigMode === 'directory' && (
                  <>
                    <Box mb={1}>
                      <Button
                        variant="outlined"
                        size="small"
                        component="label"
                        style={{ textTransform: 'none' }}
                      >
                        {nvimConfigArchive
                          ? `${nvimDirFileCount} files loaded`
                          : 'Choose nvim config directory'}
                        <input
                          type="file"
                          hidden
                          {...({ webkitdirectory: '', directory: '' } as any)}
                          onChange={async e => {
                            const files = e.target.files;
                            if (!files || files.length === 0) return;
                            try {
                              const archive = await createTarGzFromFiles(files);
                              setNvimConfigArchive(archive);
                              setNvimDirFileCount(files.length);
                            } catch (err) {
                              setCreateError(
                                `Failed to read directory: ${err instanceof Error ? err.message : String(err)}`,
                              );
                            }
                            e.target.value = '';
                          }}
                        />
                      </Button>
                    </Box>
                    <Typography
                      variant="caption"
                      color="textSecondary"
                    >
                      Select your ~/.config/nvim directory. All files
                      will be archived and extracted on workspace
                      creation.
                    </Typography>
                  </>
                )}
                {nvimConfigMode === 'file' && (
                  <>
                    <Box mb={1}>
                      <Button
                        variant="outlined"
                        size="small"
                        component="label"
                        style={{ textTransform: 'none' }}
                      >
                        Choose init.lua file
                        <input
                          type="file"
                          accept=".lua"
                          hidden
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) {
                              file.text().then(text =>
                                setNvimInitLua(text),
                              );
                            }
                            e.target.value = '';
                          }}
                        />
                      </Button>
                    </Box>
                    <TextField
                      label="init.lua content"
                      value={nvimInitLua}
                      onChange={e => setNvimInitLua(e.target.value)}
                      fullWidth
                      variant="outlined"
                      size="small"
                      placeholder="-- Paste your init.lua content here"
                      multiline
                      minRows={6}
                      helperText="Written to ~/.config/nvim/init.lua on workspace creation."
                      InputProps={{
                        style: {
                          fontFamily: 'monospace',
                          fontSize: '0.8rem',
                        },
                      }}
                    />
                  </>
                )}
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
                  label="Storage Size"
                  value={storageSize}
                  onChange={e => setStorageSize(e.target.value)}
                  variant="outlined"
                  size="small"
                  style={{ flex: 1 }}
                  placeholder="10Gi"
                />
              </Box>

              <Box mt={2}>
                <TextField
                  select
                  label="Auto-Stop Timeout"
                  value={autoStopAfter}
                  onChange={e => setAutoStopAfter(e.target.value)}
                  fullWidth
                  variant="outlined"
                  size="small"
                >
                  {AUTO_STOP_OPTIONS.map(opt => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>

              <div className={classes.sshInfoBox}>
                {savedSSHKeys.length > 0 ? (
                  <Typography variant="body2" color="textSecondary">
                    {savedSSHKeys.length} saved SSH key
                    {savedSSHKeys.length !== 1 ? 's' : ''} will be added
                    automatically.
                  </Typography>
                ) : (
                  <>
                    <Typography
                      variant="body2"
                      color="textSecondary"
                      gutterBottom
                    >
                      No saved SSH keys found. Load or paste a public
                      key to enable SSH access:
                    </Typography>
                    <Box mb={1}>
                      <Button
                        variant="outlined"
                        size="small"
                        component="label"
                        style={{ textTransform: 'none' }}
                      >
                        Load from file
                        <input
                          type="file"
                          accept=".pub"
                          hidden
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) {
                              file.text().then(text =>
                                setSSHKeyInput(text.trim()),
                              );
                            }
                            e.target.value = '';
                          }}
                        />
                      </Button>
                    </Box>
                    <TextField
                      value={sshKeyInput}
                      onChange={e => setSSHKeyInput(e.target.value)}
                      fullWidth
                      variant="outlined"
                      size="small"
                      placeholder="ssh-ed25519 AAAA... user@host"
                      multiline
                      minRows={2}
                    />
                  </>
                )}
              </div>
            </div>

            {createError && (
              <Box mt={2}>
                <Alert severity="error">{createError}</Alert>
              </Box>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={creating}>
          Cancel
        </Button>
        <Button
          onClick={handleCreate}
          color="primary"
          variant="contained"
          disabled={
            creating ||
            loadingCatalogs ||
            !name.trim() ||
            !image.trim() ||
            !selectedCluster
          }
          startIcon={
            creating ? (
              <CircularProgress size={16} color="inherit" />
            ) : undefined
          }
        >
          {creating ? 'Creating...' : 'Create Workspace'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
