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
  typeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1.5),
    marginTop: theme.spacing(1),
    flexWrap: 'wrap' as const,
  },
  typeLabel: {
    fontSize: '0.7rem',
    color: theme.palette.text.secondary,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  typeDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    display: 'inline-block',
  },
  stats: {
    display: 'flex',
    gap: theme.spacing(1),
    flexWrap: 'wrap' as const,
    marginTop: 'auto',
    paddingTop: theme.spacing(1.5),
  },
}));

const TYPE_COLORS: Record<string, string> = {
  'terraform-module': '#7B42BC',
  'terraform-provider': '#5C4EE5',
  'helm-chart': '#0F1689',
  'opa-bundle': '#566366',
  'oci-artifact': '#2496ED',
};

const TYPE_SHORT_LABELS: Record<string, string> = {
  'terraform-module': 'Terraform',
  'terraform-provider': 'Provider',
  'helm-chart': 'Helm',
  'opa-bundle': 'OPA',
  'oci-artifact': 'OCI',
};

export interface TeamArtifactSummary {
  team: string;
  artifactCount: number;
  typeBreakdown: Record<string, number>;
}

interface TeamArtifactCardProps {
  summary: TeamArtifactSummary;
  onClick: () => void;
}

export function TeamArtifactCard({ summary, onClick }: TeamArtifactCardProps) {
  const classes = useStyles();
  const isPlatform = summary.team === '__platform__';

  return (
    <Card className={classes.card} variant="outlined">
      <CardActionArea className={classes.actionArea} onClick={onClick}>
        <CardContent className={classes.content}>
          <Box className={classes.header}>
            <Box className={classes.avatar}>
              <span className={classes.avatarLetter}>
                {isPlatform ? 'P' : summary.team.charAt(0)}
              </span>
            </Box>
            <Box>
              <Typography variant="subtitle1" style={{ fontWeight: 600, lineHeight: 1.2 }}>
                {isPlatform ? 'Platform' : summary.team}
              </Typography>
              <Typography variant="caption" color="textSecondary">
                {summary.artifactCount} artifact{summary.artifactCount !== 1 ? 's' : ''}
              </Typography>
            </Box>
          </Box>

          <Box className={classes.typeRow}>
            {Object.entries(summary.typeBreakdown).map(([type, count]) => (
              <span key={type} className={classes.typeLabel}>
                <span
                  className={classes.typeDot}
                  style={{ backgroundColor: TYPE_COLORS[type] ?? '#999' }}
                />
                {count} {TYPE_SHORT_LABELS[type] ?? type}
              </span>
            ))}
          </Box>

          <Box className={classes.stats}>
            <Chip
              label={`${Object.keys(summary.typeBreakdown).length} type${Object.keys(summary.typeBreakdown).length !== 1 ? 's' : ''}`}
              size="small"
              variant="outlined"
            />
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
