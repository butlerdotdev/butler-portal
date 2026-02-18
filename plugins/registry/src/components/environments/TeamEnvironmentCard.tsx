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
import LockIcon from '@material-ui/icons/Lock';

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
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1.5),
    marginTop: theme.spacing(1),
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    display: 'inline-block',
  },
  statusLabel: {
    fontSize: '0.7rem',
    color: theme.palette.text.secondary,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  lockIcon: {
    fontSize: '0.8rem',
    color: theme.palette.warning.main,
  },
}));

export interface TeamSummary {
  team: string;
  environmentCount: number;
  moduleCount: number;
  resourceCount: number;
  activeCount: number;
  pausedCount: number;
  archivedCount: number;
  lockedCount: number;
}

interface TeamEnvironmentCardProps {
  summary: TeamSummary;
  onClick: () => void;
}

export function TeamEnvironmentCard({ summary, onClick }: TeamEnvironmentCardProps) {
  const classes = useStyles();

  return (
    <Card className={classes.card} variant="outlined">
      <CardActionArea className={classes.actionArea} onClick={onClick}>
        <CardContent className={classes.content}>
          <Box className={classes.header}>
            <Box className={classes.avatar}>
              <span className={classes.avatarLetter}>
                {summary.team === '__no_team__' ? '?' : summary.team.charAt(0)}
              </span>
            </Box>
            <Box>
              <Typography variant="subtitle1" style={{ fontWeight: 600, lineHeight: 1.2 }}>
                {summary.team === '__no_team__' ? 'Unassigned' : summary.team}
              </Typography>
              <Typography variant="caption" color="textSecondary">
                {summary.environmentCount} environment{summary.environmentCount !== 1 ? 's' : ''}
              </Typography>
            </Box>
          </Box>

          {/* Status breakdown */}
          <Box className={classes.statusRow}>
            {summary.activeCount > 0 && (
              <span className={classes.statusLabel}>
                <span className={classes.statusDot} style={{ backgroundColor: '#4ade80' }} />
                {summary.activeCount} active
              </span>
            )}
            {summary.pausedCount > 0 && (
              <span className={classes.statusLabel}>
                <span className={classes.statusDot} style={{ backgroundColor: '#9ca3af' }} />
                {summary.pausedCount} paused
              </span>
            )}
            {summary.archivedCount > 0 && (
              <span className={classes.statusLabel}>
                <span className={classes.statusDot} style={{ backgroundColor: '#fbbf24' }} />
                {summary.archivedCount} archived
              </span>
            )}
            {summary.lockedCount > 0 && (
              <span className={classes.statusLabel}>
                <LockIcon className={classes.lockIcon} />
                {summary.lockedCount} locked
              </span>
            )}
          </Box>

          {/* Metric chips */}
          <Box className={classes.stats}>
            <Chip
              label={`${summary.moduleCount} modules`}
              size="small"
              variant="outlined"
            />
            <Chip
              label={`${summary.resourceCount} resources`}
              size="small"
              variant="outlined"
            />
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
