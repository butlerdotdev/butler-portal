// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Snackbar } from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import VisibilityIcon from '@material-ui/icons/Visibility';
import { makeStyles, Theme, createStyles } from '@material-ui/core/styles';

import { usePipelineApi } from '../../hooks/usePipelineApi';
import type {
  PipelineDag,
  CreateVersionRequest,
} from '../../api/types/pipelines';
import { ConfigEditor } from './ConfigEditor';
import { PipelinePreview } from '../preview/PipelinePreview';

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    previewPanel: {
      borderTop: `1px solid ${theme.palette.divider}`,
      maxHeight: 300,
      overflowY: 'auto',
    },
  }),
);

export function PipelineBuilder() {
  const classes = useStyles();
  const { id: pipelineId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const api = usePipelineApi();

  const [pipelineName, setPipelineName] = useState('');
  const [initialDag, setInitialDag] = useState<PipelineDag | undefined>();
  const [showPreview, setShowPreview] = useState(false);
  const [currentDag, setCurrentDag] = useState<PipelineDag | undefined>();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'warning' | 'info';
  }>({ open: false, message: '', severity: 'info' });

  // Load existing pipeline for edit mode
  useEffect(() => {
    if (!pipelineId) return;
    let cancelled = false;

    const load = async () => {
      try {
        const [pipeline, versions] = await Promise.all([
          api.getPipeline(pipelineId),
          api.listVersions(pipelineId),
        ]);
        if (cancelled) return;

        setPipelineName(pipeline.name);

        if (versions.length > 0) {
          setInitialDag(versions[0].dag);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : String(err),
          );
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [api, pipelineId]);

  const handleSave = useCallback(
    async (dag: PipelineDag) => {
      if (!pipelineName.trim()) {
        throw new Error('Pipeline name is required.');
      }

      let targetId = pipelineId;

      if (!targetId) {
        const created = await api.createPipeline({ name: pipelineName });
        targetId = created.id;
      }

      const request: CreateVersionRequest = {
        dag,
        change_summary: 'Saved from pipeline builder',
      };
      await api.createVersion(targetId, request);

      if (!pipelineId) {
        navigate(`../${targetId}`, { replace: true });
      }
    },
    [api, pipelineName, pipelineId, navigate],
  );

  const handleValidate = useCallback(async () => {
    if (!currentDag) {
      setSnackbar({
        open: true,
        message: 'No components on canvas to validate.',
        severity: 'warning',
      });
      return;
    }

    if (currentDag.components.length === 0) {
      setSnackbar({
        open: true,
        message: 'Add at least one component before validating.',
        severity: 'warning',
      });
      return;
    }

    setValidating(true);
    try {
      if (pipelineId) {
        const result = await api.validatePipeline(pipelineId, currentDag);
        if (result.valid) {
          setSnackbar({
            open: true,
            message: result.warnings?.length
              ? `Valid with ${result.warnings.length} warning(s): ${result.warnings.join(', ')}`
              : 'Pipeline structure is valid. Full config validation runs on agents when deployed.',
            severity: result.warnings?.length ? 'warning' : 'success',
          });
        } else {
          setSnackbar({
            open: true,
            message: `Validation failed: ${result.errors.join(', ')}`,
            severity: 'error',
          });
        }
      } else {
        // No pipeline saved yet — do a basic local check
        const hasSource = currentDag.components.some(c => c.type === 'source');
        const hasSink = currentDag.components.some(c => c.type === 'sink');
        const issues: string[] = [];
        if (!hasSource) issues.push('No source component');
        if (!hasSink) issues.push('No sink component');

        if (issues.length > 0) {
          setSnackbar({
            open: true,
            message: `Validation issues: ${issues.join(', ')}`,
            severity: 'warning',
          });
        } else {
          setSnackbar({
            open: true,
            message: 'Pipeline structure looks valid. Save and deploy for full agent-side validation.',
            severity: 'success',
          });
        }
      }
    } catch (err) {
      setSnackbar({
        open: true,
        message: `Validation error: ${err instanceof Error ? err.message : String(err)}`,
        severity: 'error',
      });
    } finally {
      setValidating(false);
    }
  }, [api, pipelineId, currentDag]);

  if (loadError) {
    return <div>Failed to load pipeline: {loadError}</div>;
  }

  return (
    <>
      <ConfigEditor
        initialDag={initialDag}
        onSave={handleSave}
        onDagChange={setCurrentDag}
        showNameField
        name={pipelineName}
        onNameChange={setPipelineName}
        toolbarActions={
          <>
            <Button
              variant="outlined"
              size="small"
              startIcon={<CheckCircleIcon />}
              onClick={handleValidate}
              disabled={validating}
            >
              {validating ? 'Validating...' : 'Validate'}
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={<VisibilityIcon />}
              onClick={() => setShowPreview(prev => !prev)}
            >
              Preview
            </Button>
          </>
        }
      />
      {showPreview && pipelineId && currentDag && (
        <div className={classes.previewPanel}>
          <PipelinePreview
            pipelineId={pipelineId}
            dag={currentDag}
          />
        </div>
      )}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
      >
        <Alert
          onClose={() => setSnackbar(s => ({ ...s, open: false }))}
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}
