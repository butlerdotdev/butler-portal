// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import {
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  CircularProgress,
} from '@material-ui/core';
import { Alert } from '@material-ui/lab';

interface DeleteWorkspaceDialogProps {
  open: boolean;
  name: string | null;
  connected: boolean;
  deleting: boolean;
  onDelete: () => void;
  onClose: () => void;
}

export const DeleteWorkspaceDialog = ({
  open,
  name,
  connected,
  deleting,
  onDelete,
  onClose,
}: DeleteWorkspaceDialogProps) => {
  if (!name) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Delete Workspace</DialogTitle>
      <DialogContent>
        <Typography>
          Are you sure you want to delete workspace{' '}
          <strong>{name}</strong>?
        </Typography>
        <Box mt={1}>
          <Typography variant="body2" color="textSecondary">
            This action is irreversible. The workspace and all its
            associated storage will be permanently removed.
          </Typography>
        </Box>
        {connected && (
          <Box mt={2}>
            <Alert severity="warning">
              This workspace is currently connected. It will be forcefully
              disconnected before deletion.
            </Alert>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={deleting}>
          Cancel
        </Button>
        <Button
          onClick={onDelete}
          color="secondary"
          variant="contained"
          disabled={deleting}
          startIcon={
            deleting ? (
              <CircularProgress size={16} color="inherit" />
            ) : undefined
          }
        >
          {deleting ? 'Deleting...' : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
