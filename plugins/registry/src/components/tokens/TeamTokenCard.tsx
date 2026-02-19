// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import {
  Card,
  CardActionArea,
  CardContent,
  Typography,
  Box,
  Chip,
  makeStyles,
} from '@material-ui/core';

const useStyles = makeStyles(theme => ({
  card: {
    height: '100%',
    transition: 'box-shadow 0.2s ease',
    '&:hover': {
      boxShadow: theme.shadows[4],
    },
  },
  actionArea: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'stretch',
  },
  content: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1.5),
    marginBottom: theme.spacing(2),
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarLetter: {
    fontSize: '1.1rem',
    fontWeight: 700,
    color: '#a78bfa',
    textTransform: 'uppercase' as const,
  },
  stats: {
    display: 'flex',
    gap: theme.spacing(1),
    flexWrap: 'wrap' as const,
    marginTop: 'auto',
    paddingTop: theme.spacing(1.5),
  },
  scopeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1.5),
    marginTop: theme.spacing(1),
  },
  scopeLabel: {
    fontSize: '0.7rem',
    color: theme.palette.text.secondary,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  scopeDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    display: 'inline-block',
  },
}));

export interface TeamTokenSummary {
  team: string;
  tokenCount: number;
  readCount: number;
  writeCount: number;
  adminCount: number;
  creatorCount: number;
}

interface TeamTokenCardProps {
  summary: TeamTokenSummary;
  onClick: () => void;
}

export function TeamTokenCard({ summary, onClick }: TeamTokenCardProps) {
  const classes = useStyles();

  return (
    <Card className={classes.card} variant="outlined">
      <CardActionArea className={classes.actionArea} onClick={onClick}>
        <CardContent className={classes.content}>
          <Box className={classes.header}>
            <Box className={classes.avatar}>
              <span className={classes.avatarLetter}>
                {summary.team === '__platform__' ? 'P' : summary.team.charAt(0)}
              </span>
            </Box>
            <Box>
              <Typography variant="subtitle1" style={{ fontWeight: 600, lineHeight: 1.2 }}>
                {summary.team === '__platform__' ? 'Platform' : summary.team}
              </Typography>
              <Typography variant="caption" color="textSecondary">
                {summary.tokenCount} token{summary.tokenCount !== 1 ? 's' : ''}
              </Typography>
            </Box>
          </Box>

          <Box className={classes.scopeRow}>
            {summary.readCount > 0 && (
              <span className={classes.scopeLabel}>
                <span className={classes.scopeDot} style={{ backgroundColor: '#4ade80' }} />
                {summary.readCount} read
              </span>
            )}
            {summary.writeCount > 0 && (
              <span className={classes.scopeLabel}>
                <span className={classes.scopeDot} style={{ backgroundColor: '#60a5fa' }} />
                {summary.writeCount} write
              </span>
            )}
            {summary.adminCount > 0 && (
              <span className={classes.scopeLabel}>
                <span className={classes.scopeDot} style={{ backgroundColor: '#a78bfa' }} />
                {summary.adminCount} admin
              </span>
            )}
          </Box>

          <Box className={classes.stats}>
            <Chip
              label={`${summary.creatorCount} creator${summary.creatorCount !== 1 ? 's' : ''}`}
              size="small"
              variant="outlined"
            />
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
