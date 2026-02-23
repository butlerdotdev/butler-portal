// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useNavigate } from 'react-router-dom';
import {
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Typography,
  Box,
} from '@material-ui/core';
import { makeStyles, Theme, createStyles } from '@material-ui/core/styles';
import type { Pipeline } from '../../api/types/pipelines';

const MAX_DESCRIPTION_LENGTH = 120;

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    card: {
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
    },
    actionArea: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'stretch',
    },
    content: {
      flex: 1,
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: theme.spacing(1),
    },
    name: {
      fontWeight: 600,
      wordBreak: 'break-word',
    },
    description: {
      color: theme.palette.text.secondary,
      marginBottom: theme.spacing(1.5),
      minHeight: 40,
    },
    footer: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: theme.spacing(1),
    },
    team: {
      color: theme.palette.text.secondary,
      fontSize: '0.75rem',
    },
    timestamp: {
      color: theme.palette.text.hint,
      fontSize: '0.75rem',
    },
    activeChip: {
      backgroundColor: theme.palette.success?.main ?? '#4caf50',
      color: '#fff',
    },
    archivedChip: {
      backgroundColor: theme.palette.grey[500],
      color: '#fff',
    },
  }),
);

function truncateDescription(text: string | null): string {
  if (!text) return 'No description';
  if (text.length <= MAX_DESCRIPTION_LENGTH) return text;
  return `${text.slice(0, MAX_DESCRIPTION_LENGTH)}...`;
}

function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

interface PipelineCardProps {
  pipeline: Pipeline;
}

export function PipelineCard({ pipeline }: PipelineCardProps) {
  const classes = useStyles();
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(pipeline.id);
  };

  return (
    <Card className={classes.card} variant="outlined">
      <CardActionArea className={classes.actionArea} onClick={handleClick}>
        <CardContent className={classes.content}>
          <Box className={classes.header}>
            <Typography variant="h6" className={classes.name}>
              {pipeline.name}
            </Typography>
            <Chip
              label={pipeline.status}
              size="small"
              className={
                pipeline.status === 'active'
                  ? classes.activeChip
                  : classes.archivedChip
              }
            />
          </Box>
          <Typography variant="body2" className={classes.description}>
            {truncateDescription(pipeline.description)}
          </Typography>
          <Box className={classes.footer}>
            <Typography className={classes.team}>
              {pipeline.team}
            </Typography>
            <Typography className={classes.timestamp}>
              Updated {formatTimestamp(pipeline.updated_at)}
            </Typography>
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
