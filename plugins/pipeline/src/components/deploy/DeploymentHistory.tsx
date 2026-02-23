// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useCallback } from 'react';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  IconButton,
  Tooltip,
  Typography,
  Box,
} from '@material-ui/core';
import { makeStyles, Theme, createStyles } from '@material-ui/core/styles';
import UndoIcon from '@material-ui/icons/Undo';
import RefreshIcon from '@material-ui/icons/Refresh';
import { Progress, WarningPanel, InfoCard } from '@backstage/core-components';
import { usePipelineApi } from '../../hooks/usePipelineApi';
import type { PipelineDeployment } from '../../api/types/fleet';

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    toolbar: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: theme.spacing(2),
    },
    activeChip: {
      backgroundColor: theme.palette.success?.main ?? '#4caf50',
      color: '#fff',
    },
    supersededChip: {
      backgroundColor: theme.palette.grey[500],
      color: '#fff',
    },
    rollbackChip: {
      borderColor: theme.palette.warning?.main ?? '#ff9800',
    },
  }),
);

interface DeploymentHistoryProps {
  pipelineId: string;
}

export function DeploymentHistory({ pipelineId }: DeploymentHistoryProps) {
  const classes = useStyles();
  const api = usePipelineApi();
  const [deployments, setDeployments] = useState<PipelineDeployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadDeployments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.listDeployments(pipelineId);
      setDeployments(result.items);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [api, pipelineId]);

  useEffect(() => {
    loadDeployments();
  }, [loadDeployments]);

  const handleRollback = async (deployment: PipelineDeployment) => {
    if (!window.confirm('Roll back this deployment? A new deployment will be created pointing to the previous version.')) return;
    try {
      await api.rollbackDeployment(pipelineId, deployment.id);
      loadDeployments();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  if (error) {
    return <WarningPanel title="Failed to load deployments" message={error.message} />;
  }

  return (
    <InfoCard title="Deployment History">
      <Box className={classes.toolbar}>
        <Typography variant="body2" color="textSecondary">
          {deployments.filter(d => d.status === 'active').length} active deployment{deployments.filter(d => d.status === 'active').length !== 1 ? 's' : ''}
        </Typography>
        <Tooltip title="Refresh">
          <IconButton onClick={loadDeployments} size="small">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>
      {loading ? (
        <Progress />
      ) : deployments.length === 0 ? (
        <Typography color="textSecondary" align="center">
          No deployments yet. Deploy this pipeline to fleet agents or groups.
        </Typography>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Status</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Target</TableCell>
              <TableCell>Deployed By</TableCell>
              <TableCell>Deployed At</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {deployments.map(deployment => (
              <TableRow key={deployment.id} hover>
                <TableCell>
                  <Chip
                    label={deployment.status}
                    size="small"
                    className={deployment.status === 'active' ? classes.activeChip : classes.supersededChip}
                  />
                </TableCell>
                <TableCell>
                  {deployment.type === 'rollback' ? (
                    <Chip label="rollback" size="small" variant="outlined" className={classes.rollbackChip} />
                  ) : (
                    deployment.type
                  )}
                </TableCell>
                <TableCell>
                  {deployment.target_type}: {deployment.target_id.slice(0, 8)}...
                </TableCell>
                <TableCell>{deployment.deployed_by}</TableCell>
                <TableCell>{new Date(deployment.deployed_at).toLocaleString()}</TableCell>
                <TableCell align="right">
                  {deployment.status === 'active' && (
                    <Tooltip title="Rollback">
                      <IconButton size="small" onClick={() => handleRollback(deployment)}>
                        <UndoIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </InfoCard>
  );
}
