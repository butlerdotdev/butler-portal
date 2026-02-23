// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Box,
} from '@material-ui/core';
import { makeStyles, Theme, createStyles } from '@material-ui/core/styles';
import { Alert } from '@material-ui/lab';
import { usePipelineApi } from '../../hooks/usePipelineApi';
import type { PipelineDag } from '../../api/types/pipelines';

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    textarea: {
      fontFamily: '"Roboto Mono", "Fira Code", monospace',
      fontSize: '0.85rem',
    },
    formatSelect: {
      minWidth: 120,
      marginBottom: theme.spacing(2),
    },
    previewInfo: {
      marginTop: theme.spacing(2),
      padding: theme.spacing(1.5),
      backgroundColor: theme.palette.type === 'dark' ? '#1e1e1e' : '#f5f5f5',
      borderRadius: theme.shape.borderRadius,
    },
    actions: {
      display: 'flex',
      gap: theme.spacing(1),
    },
  }),
);

interface ImportPipelineDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (dag: PipelineDag) => void;
}

export function ImportPipelineDialog({
  open,
  onClose,
  onImport,
}: ImportPipelineDialogProps) {
  const classes = useStyles();
  const api = usePipelineApi();

  const [config, setConfig] = useState('');
  const [format, setFormat] = useState<'yaml' | 'toml'>('yaml');
  const [previewDag, setPreviewDag] = useState<PipelineDag | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePreview = useCallback(async () => {
    if (!config.trim()) {
      setError('Please paste a Vector configuration.');
      return;
    }

    setLoading(true);
    setError(null);
    setPreviewDag(null);

    try {
      const result = await api.importPreview(config, format);
      setPreviewDag(result.dag);
    } catch (err) {
      setError(
        `Preview failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setLoading(false);
    }
  }, [api, config, format]);

  const handleImport = useCallback(() => {
    if (previewDag) {
      onImport(previewDag);
      handleReset();
    }
  }, [previewDag, onImport]);

  const handleReset = useCallback(() => {
    setConfig('');
    setFormat('yaml');
    setPreviewDag(null);
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    handleReset();
    onClose();
  }, [onClose, handleReset]);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Import Vector Configuration</DialogTitle>
      <DialogContent>
        <FormControl
          variant="outlined"
          size="small"
          className={classes.formatSelect}
        >
          <InputLabel>Format</InputLabel>
          <Select
            value={format}
            onChange={e => setFormat(e.target.value as 'yaml' | 'toml')}
            label="Format"
          >
            <MenuItem value="yaml">YAML</MenuItem>
            <MenuItem value="toml">TOML</MenuItem>
          </Select>
        </FormControl>

        <TextField
          fullWidth
          multiline
          rows={12}
          variant="outlined"
          placeholder={
            format === 'yaml'
              ? '# Paste your Vector YAML config here...'
              : '# Paste your Vector TOML config here...'
          }
          value={config}
          onChange={e => setConfig(e.target.value)}
          InputProps={{
            classes: { input: classes.textarea },
          }}
        />

        {error && (
          <Alert severity="error" style={{ marginTop: 16 }}>
            {error}
          </Alert>
        )}

        {previewDag && (
          <Box className={classes.previewInfo}>
            <Typography variant="subtitle2">Import Preview</Typography>
            <Typography variant="body2" color="textSecondary">
              Components detected: {previewDag.components.length}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Edges detected: {previewDag.edges.length}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Sources:{' '}
              {
                previewDag.components.filter(c => c.type === 'source')
                  .length
              }{' '}
              | Transforms:{' '}
              {
                previewDag.components.filter(c => c.type === 'transform')
                  .length
              }{' '}
              | Sinks:{' '}
              {
                previewDag.components.filter(c => c.type === 'sink')
                  .length
              }
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          variant="outlined"
          color="primary"
          onClick={handlePreview}
          disabled={loading || !config.trim()}
        >
          {loading ? 'Previewing...' : 'Preview'}
        </Button>
        <Button
          variant="contained"
          color="primary"
          onClick={handleImport}
          disabled={!previewDag}
        >
          Import
        </Button>
      </DialogActions>
    </Dialog>
  );
}
