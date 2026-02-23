// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
} from '@material-ui/core';
import { makeStyles, Theme, createStyles } from '@material-ui/core/styles';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import { usePipelineApi } from '../../hooks/usePipelineApi';
import type { PipelineAgent } from '../../api/types/pipelines';

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    error: {
      color: theme.palette.error.main,
      marginTop: theme.spacing(1),
      whiteSpace: 'pre-wrap',
    },
    success: {
      display: 'flex',
      alignItems: 'center',
      gap: theme.spacing(1),
      color: theme.palette.success?.main ?? '#4caf50',
      marginTop: theme.spacing(2),
    },
    agentList: {
      marginTop: theme.spacing(1),
      paddingLeft: theme.spacing(2),
      '& li': {
        marginBottom: theme.spacing(0.5),
        fontSize: '0.875rem',
      },
    },
  }),
);

interface DeployDialogProps {
  open: boolean;
  onClose: () => void;
  pipelineId: string;
  pipelineName: string;
  agents: PipelineAgent[];
}

export function DeployDialog({
  open,
  onClose,
  pipelineId,
  pipelineName,
  agents,
}: DeployDialogProps) {
  const classes = useStyles();
  const api = usePipelineApi();
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deployed, setDeployed] = useState(false);
  const [deployCount, setDeployCount] = useState(0);

  const handleDeploy = async () => {
    setDeploying(true);
    setError(null);
    setDeployed(false);
    try {
      // No targets — backend auto-resolves from pipeline_agents
      const result = await api.deployPipeline(pipelineId, {});
      const count = result.deployments?.length ?? 1;
      setDeployCount(count);
      setDeployed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeploying(false);
    }
  };

  const handleClose = () => {
    setDeployed(false);
    setError(null);
    onClose();
  };

  const onlineCount = agents.filter(a => a.status === 'online').length;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Deploy &quot;{pipelineName}&quot;</DialogTitle>
      <DialogContent>
        {!deployed ? (
          <>
            <Typography variant="body1" gutterBottom>
              This will push the latest pipeline configuration to{' '}
              <strong>
                {agents.length} aggregator agent{agents.length !== 1 ? 's' : ''}
              </strong>{' '}
              ({onlineCount} online).
            </Typography>
            {agents.length > 0 && (
              <ul className={classes.agentList}>
                {agents.map(a => (
                  <li key={a.id}>
                    <strong>{a.agent_id}</strong>
                    {a.hostname ? ` (${a.hostname})` : ''} —{' '}
                    <span
                      style={{
                        color: a.status === 'online' ? '#4caf50' : '#ff9800',
                      }}
                    >
                      {a.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Typography variant="body2" color="textSecondary">
              Each agent will validate the new config and apply it on its next
              poll cycle (~15s). Monitor sync status on the Deployments tab.
            </Typography>
          </>
        ) : (
          <>
            <div className={classes.success}>
              <CheckCircleIcon />
              <Typography variant="body1">
                Successfully deployed to {deployCount} agent{deployCount !== 1 ? 's' : ''}.
              </Typography>
            </div>
            <Typography variant="body2" color="textSecondary" style={{ marginTop: 8 }}>
              Each agent will validate the config with its local Vector binary
              and apply it on the next poll cycle (~15s). Check agent sync
              status on the Fleet tab for validation results.
            </Typography>
          </>
        )}
        {error && (
          <Typography className={classes.error}>{error}</Typography>
        )}
      </DialogContent>
      <DialogActions>
        {deployed ? (
          <Button onClick={handleClose} color="primary" variant="contained">
            Done
          </Button>
        ) : (
          <>
            <Button onClick={handleClose}>Cancel</Button>
            <Button
              onClick={handleDeploy}
              color="primary"
              variant="contained"
              disabled={deploying || agents.length === 0}
            >
              {deploying
                ? 'Deploying...'
                : `Deploy to ${agents.length} Agent${agents.length !== 1 ? 's' : ''}`}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
