// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useCallback } from 'react';
import {
  Box,
  Button,
  Typography,
  Divider,
} from '@material-ui/core';
import { makeStyles, Theme, createStyles } from '@material-ui/core/styles';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import { Alert } from '@material-ui/lab';
import { usePipelineApi } from '../../hooks/usePipelineApi';
import type {
  PipelineDag,
  PreviewResult,
  PreviewStep as PreviewStepType,
} from '../../api/types/pipelines';
import { PreviewStep } from './PreviewStep';
import { SampleEventEditor } from './SampleEventEditor';

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    root: {
      padding: theme.spacing(2),
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: theme.spacing(2),
    },
    editorSection: {
      marginBottom: theme.spacing(2),
    },
    resultsSection: {
      marginTop: theme.spacing(2),
    },
    stepList: {
      display: 'flex',
      flexDirection: 'column',
      gap: theme.spacing(1.5),
    },
  }),
);

interface PipelinePreviewProps {
  pipelineId: string;
  dag: PipelineDag;
}

export function PipelinePreview({ pipelineId, dag }: PipelinePreviewProps) {
  const classes = useStyles();
  const api = usePipelineApi();

  const [sampleEvents, setSampleEvents] = useState('[\n  {\n    "message": "test event",\n    "timestamp": "2026-01-01T00:00:00Z"\n  }\n]');
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRunPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    let events: Record<string, unknown>[];
    try {
      events = JSON.parse(sampleEvents);
      if (!Array.isArray(events)) {
        throw new Error('Sample events must be a JSON array.');
      }
    } catch (err) {
      setError(
        `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      );
      setLoading(false);
      return;
    }

    try {
      const previewResult = await api.previewPipeline(pipelineId, {
        sampleEvents: events,
        dag,
      });
      setResult(previewResult);
    } catch (err) {
      setError(
        `Preview failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setLoading(false);
    }
  }, [api, pipelineId, dag, sampleEvents]);

  return (
    <div className={classes.root}>
      <Box className={classes.header}>
        <Typography variant="h6">Pipeline Preview</Typography>
        <Button
          variant="contained"
          color="primary"
          size="small"
          startIcon={<PlayArrowIcon />}
          onClick={handleRunPreview}
          disabled={loading}
        >
          {loading ? 'Running...' : 'Run Preview'}
        </Button>
      </Box>

      <div className={classes.editorSection}>
        <SampleEventEditor value={sampleEvents} onChange={setSampleEvents} />
      </div>

      {error && (
        <Alert severity="error" style={{ marginBottom: 16 }}>
          {error}
        </Alert>
      )}

      {result && (
        <div className={classes.resultsSection}>
          <Divider />
          <Typography variant="subtitle2" style={{ margin: '12px 0 8px' }}>
            Step-by-step results
          </Typography>
          <div className={classes.stepList}>
            {result.steps.map((step: PreviewStepType, index: number) => (
              <PreviewStep key={`${step.nodeId}-${index}`} step={step} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
