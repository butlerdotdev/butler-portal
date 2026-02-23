// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useCallback } from 'react';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Button,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
} from '@material-ui/core';
import { makeStyles, Theme, createStyles } from '@material-ui/core/styles';
import VisibilityIcon from '@material-ui/icons/Visibility';
import CompareArrowsIcon from '@material-ui/icons/CompareArrows';
import { InfoCard } from '@backstage/core-components';
import { usePipelineApi } from '../../hooks/usePipelineApi';
import type { PipelineVersion, DiffResult } from '../../api/types/pipelines';

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    table: {
      minWidth: 600,
    },
    hashCell: {
      fontFamily: 'monospace',
      fontSize: '0.85rem',
    },
    actionCell: {
      whiteSpace: 'nowrap',
    },
    actionButton: {
      marginRight: theme.spacing(1),
    },
    diffBlock: {
      fontFamily: 'monospace',
      fontSize: '0.85rem',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-all',
      maxHeight: 500,
      overflow: 'auto',
    },
    diffAdded: {
      backgroundColor: '#e6ffec',
      color: '#1a7f37',
    },
    diffRemoved: {
      backgroundColor: '#ffebe9',
      color: '#cf222e',
    },
    diffUnchanged: {
      color: theme.palette.text.primary,
    },
    versionConfigBlock: {
      backgroundColor: theme.palette.type === 'dark' ? '#1e1e1e' : '#f5f5f5',
      borderRadius: theme.shape.borderRadius,
      padding: theme.spacing(2),
      fontFamily: 'monospace',
      fontSize: '0.85rem',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-all',
      maxHeight: 500,
      overflow: 'auto',
    },
  }),
);

interface VersionHistoryProps {
  pipelineId: string;
  versions: PipelineVersion[];
}

export function VersionHistory({ pipelineId, versions }: VersionHistoryProps) {
  const classes = useStyles();
  const api = usePipelineApi();

  const [viewVersion, setViewVersion] = useState<PipelineVersion | null>(null);
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [diffDialogOpen, setDiffDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);

  const handleView = useCallback((version: PipelineVersion) => {
    setViewVersion(version);
    setViewDialogOpen(true);
  }, []);

  const handleDiff = useCallback(
    async (version: PipelineVersion) => {
      const previousVersion = version.version - 1;
      if (previousVersion < 1) return;

      try {
        const result = await api.getVersionDiff(
          pipelineId,
          version.version,
          previousVersion,
        );
        setDiffResult(result);
        setDiffDialogOpen(true);
      } catch {
        // Diff failed silently
      }
    },
    [api, pipelineId],
  );

  if (versions.length === 0) {
    return (
      <InfoCard title="Version History">
        <Typography color="textSecondary">
          No versions available yet.
        </Typography>
      </InfoCard>
    );
  }

  return (
    <>
      <InfoCard title="Version History">
        <Table className={classes.table} size="small">
          <TableHead>
            <TableRow>
              <TableCell>Version</TableCell>
              <TableCell>Author</TableCell>
              <TableCell>Timestamp</TableCell>
              <TableCell>Summary</TableCell>
              <TableCell>Hash</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {versions.map(version => (
              <TableRow key={version.id} hover>
                <TableCell>
                  <Typography variant="body2" style={{ fontWeight: 600 }}>
                    v{version.version}
                  </Typography>
                </TableCell>
                <TableCell>{version.created_by}</TableCell>
                <TableCell>
                  {new Date(version.created_at).toLocaleString()}
                </TableCell>
                <TableCell>
                  {version.change_summary || '--'}
                </TableCell>
                <TableCell className={classes.hashCell}>
                  {version.config_hash.slice(0, 12)}
                </TableCell>
                <TableCell className={classes.actionCell}>
                  <Button
                    className={classes.actionButton}
                    size="small"
                    variant="outlined"
                    startIcon={<VisibilityIcon />}
                    onClick={() => handleView(version)}
                  >
                    View
                  </Button>
                  {version.version > 1 && (
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<CompareArrowsIcon />}
                      onClick={() => handleDiff(version)}
                    >
                      Diff
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </InfoCard>

      <Dialog
        open={viewDialogOpen}
        onClose={() => setViewDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Version {viewVersion?.version} Configuration
        </DialogTitle>
        <DialogContent>
          {viewVersion && (
            <pre className={classes.versionConfigBlock}>
              {viewVersion.vector_config}
            </pre>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={diffDialogOpen}
        onClose={() => setDiffDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {diffResult
            ? `Diff: v${diffResult.versionA.version} vs v${diffResult.versionB.version}`
            : 'Version Diff'}
        </DialogTitle>
        <DialogContent>
          {diffResult && (
            <Box className={classes.diffBlock}>
              {diffResult.diff.map((part, index) => {
                let className = classes.diffUnchanged;
                if (part.added) className = classes.diffAdded;
                if (part.removed) className = classes.diffRemoved;

                return (
                  <span key={index} className={className}>
                    {part.value}
                  </span>
                );
              })}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDiffDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
