// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

// React not needed with JSX transform
import {
  Card,
  CardContent,
  CardActionArea,
  Typography,
  Chip,
  Box,
  makeStyles,
} from '@material-ui/core';
import GetAppIcon from '@material-ui/icons/GetApp';
import PublicIcon from '@material-ui/icons/Public';
import { useNavigate } from 'react-router-dom';
import type { Artifact } from '../../api/types/artifacts';
import { getArtifactTypeInfo } from '../../utils/artifactTypeInfo';

const useStyles = makeStyles(theme => ({
  card: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
  typeChip: {
    marginBottom: theme.spacing(1),
  },
  name: {
    fontWeight: 600,
  },
  description: {
    marginTop: theme.spacing(0.5),
    color: theme.palette.text.secondary,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing(1),
  },
  downloads: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    color: theme.palette.text.secondary,
    fontSize: '0.75rem',
  },
}));

interface ArtifactCardProps {
  artifact: Artifact;
}

export function ArtifactCard({ artifact }: ArtifactCardProps) {
  const classes = useStyles();
  const navigate = useNavigate();
  const typeInfo = getArtifactTypeInfo(artifact.type);

  return (
    <Card className={classes.card} variant="outlined">
      <CardActionArea
        onClick={() =>
          navigate(`artifact/${artifact.namespace}/${artifact.name}`)
        }
      >
        <CardContent>
          <Chip
            label={typeInfo.shortLabel}
            size="small"
            className={classes.typeChip}
            style={{ backgroundColor: typeInfo.color, color: '#fff' }}
          />
          <Typography variant="subtitle1" className={classes.name}>
            {artifact.namespace}/{artifact.name}
          </Typography>
          {artifact.description && (
            <Typography variant="body2" className={classes.description}>
              {artifact.description}
            </Typography>
          )}
          <Box className={classes.footer}>
            {artifact.team ? (
              <Typography variant="caption" color="textSecondary">
                {artifact.team}
              </Typography>
            ) : (
              <Box
                component="span"
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <PublicIcon style={{ fontSize: 12, opacity: 0.6 }} />
                <Typography variant="caption" color="textSecondary">
                  Platform
                </Typography>
              </Box>
            )}
            <Box className={classes.downloads}>
              <GetAppIcon style={{ fontSize: 14 }} />
              {artifact.download_count.toLocaleString()}
            </Box>
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
