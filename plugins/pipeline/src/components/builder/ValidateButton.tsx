// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useCallback } from 'react';
import { Button, Snackbar } from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import type { PipelineDag } from '../../api/types/pipelines';

interface ValidateButtonProps {
  /** Returns the current DAG to validate. */
  getDag: () => PipelineDag | undefined;
}

/**
 * Reusable validate button that performs structural validation on a DAG.
 * Checks for source/sink presence and component completeness.
 * Full Vector config validation happens agent-side when deployed.
 */
export function ValidateButton({ getDag }: ValidateButtonProps) {
  const [validating, setValidating] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'warning' | 'info';
  }>({ open: false, message: '', severity: 'info' });

  const handleValidate = useCallback(() => {
    const dag = getDag();

    if (!dag) {
      setSnackbar({
        open: true,
        message: 'No components on canvas to validate.',
        severity: 'warning',
      });
      return;
    }

    if (dag.components.length === 0) {
      setSnackbar({
        open: true,
        message: 'Add at least one component before validating.',
        severity: 'warning',
      });
      return;
    }

    setValidating(true);
    try {
      const hasSource = dag.components.some(c => c.type === 'source');
      const hasSink = dag.components.some(c => c.type === 'sink');
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
          message:
            'Pipeline structure is valid. Full config validation runs on agents when deployed.',
          severity: 'success',
        });
      }
    } finally {
      setValidating(false);
    }
  }, [getDag]);

  return (
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
