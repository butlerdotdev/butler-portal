// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import React from 'react';
import { ErrorPanel } from '@backstage/core-components';
import { useApi, errorApiRef, ErrorApi } from '@backstage/core-plugin-api';
import { Button, Box } from '@material-ui/core';
import RefreshIcon from '@material-ui/icons/Refresh';

interface ErrorBoundaryClassProps {
  errorApi: ErrorApi;
  onReset?: () => void;
  children?: React.ReactNode;
}

type ErrorBoundaryState = { kind: 'ok' } | { kind: 'failed'; error: Error };

// React only exposes render-error capture through a class component, so this
// is the single class allowed in the plugin. Everything else stays functional.
export class ErrorBoundaryClass extends React.Component<
  ErrorBoundaryClassProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { kind: 'ok' };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { kind: 'failed', error };
  }

  componentDidCatch(error: Error) {
    this.props.errorApi.post(error);
  }

  handleReset = () => {
    this.setState({ kind: 'ok' });
    this.props.onReset?.();
  };

  render() {
    if (this.state.kind === 'failed') {
      return (
        <Box>
          <ErrorPanel
            title="Something went wrong"
            error={this.state.error}
            defaultExpanded
          />
          <Box mt={2}>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={this.handleReset}
            >
              Retry
            </Button>
          </Box>
        </Box>
      );
    }
    return this.props.children ?? null;
  }
}

export interface ButlerErrorBoundaryProps {
  onReset?: () => void;
  children?: React.ReactNode;
}

export const ButlerErrorBoundary = ({
  onReset,
  children,
}: ButlerErrorBoundaryProps) => {
  const errorApi = useApi(errorApiRef);
  return (
    <ErrorBoundaryClass errorApi={errorApi} onReset={onReset}>
      {children}
    </ErrorBoundaryClass>
  );
};
