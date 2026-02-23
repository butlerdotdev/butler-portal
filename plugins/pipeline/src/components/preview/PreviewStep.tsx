// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Chip,
  Box,
  Collapse,
  IconButton,
} from '@material-ui/core';
import { makeStyles, Theme, createStyles } from '@material-ui/core/styles';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import ExpandLessIcon from '@material-ui/icons/ExpandLess';
import ErrorIcon from '@material-ui/icons/Error';
import SkipNextIcon from '@material-ui/icons/SkipNext';
import type { PreviewStep as PreviewStepType } from '../../api/types/pipelines';

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    card: {
      borderLeft: (props: { hasErrors: boolean; skipped: boolean }) =>
        `4px solid ${
          props.hasErrors
            ? theme.palette.error.main
            : props.skipped
              ? theme.palette.grey[400]
              : theme.palette.success.main
        }`,
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    labelRow: {
      display: 'flex',
      alignItems: 'center',
      gap: theme.spacing(1),
    },
    counters: {
      display: 'flex',
      gap: theme.spacing(0.5),
    },
    jsonBlock: {
      backgroundColor: theme.palette.type === 'dark' ? '#1e1e1e' : '#f5f5f5',
      borderRadius: theme.shape.borderRadius,
      padding: theme.spacing(1.5),
      fontFamily: 'monospace',
      fontSize: '0.8rem',
      overflow: 'auto',
      maxHeight: 300,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-all',
    },
    errorMessage: {
      display: 'flex',
      alignItems: 'center',
      gap: theme.spacing(0.5),
      color: theme.palette.error.main,
      marginTop: theme.spacing(1),
    },
    skippedIndicator: {
      display: 'flex',
      alignItems: 'center',
      gap: theme.spacing(0.5),
      color: theme.palette.text.secondary,
    },
    expandSection: {
      marginTop: theme.spacing(1),
    },
  }),
);

interface PreviewStepProps {
  step: PreviewStepType;
}

export function PreviewStep({ step }: PreviewStepProps) {
  const hasErrors = step.errors.length > 0;
  const classes = useStyles({ hasErrors, skipped: step.skipped });
  const [expanded, setExpanded] = useState(false);

  const inputCount = step.inputEvents.length;
  const outputCount = step.outputEvents.length;
  const droppedCount = step.droppedEvents.length;

  return (
    <Card className={classes.card} variant="outlined">
      <CardContent>
        <Box className={classes.header}>
          <div className={classes.labelRow}>
            <Typography variant="subtitle2">{step.nodeLabel}</Typography>
            <Typography variant="caption" color="textSecondary">
              ({step.vectorType})
            </Typography>
            {step.skipped && (
              <span className={classes.skippedIndicator}>
                <SkipNextIcon fontSize="small" />
                <Typography variant="caption">
                  Skipped{step.skipReason ? `: ${step.skipReason}` : ''}
                </Typography>
              </span>
            )}
          </div>
          <div className={classes.counters}>
            <Chip label={`In: ${inputCount}`} size="small" variant="outlined" />
            <Chip label={`Out: ${outputCount}`} size="small" variant="outlined" />
            {droppedCount > 0 && (
              <Chip
                label={`Dropped: ${droppedCount}`}
                size="small"
                color="secondary"
                variant="outlined"
              />
            )}
          </div>
        </Box>

        {hasErrors &&
          step.errors.map((err, i) => (
            <div key={i} className={classes.errorMessage}>
              <ErrorIcon fontSize="small" />
              <Typography variant="body2">{err}</Typography>
            </div>
          ))}

        {!step.skipped && outputCount > 0 && (
          <div className={classes.expandSection}>
            <IconButton
              size="small"
              onClick={() => setExpanded(!expanded)}
              aria-label={expanded ? 'Collapse output' : 'Expand output'}
            >
              {expanded ? (
                <ExpandLessIcon fontSize="small" />
              ) : (
                <ExpandMoreIcon fontSize="small" />
              )}
            </IconButton>
            <Typography variant="caption" color="textSecondary">
              {expanded ? 'Hide' : 'Show'} output events
            </Typography>
            <Collapse in={expanded}>
              <pre className={classes.jsonBlock}>
                {JSON.stringify(step.outputEvents, null, 2)}
              </pre>
            </Collapse>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
