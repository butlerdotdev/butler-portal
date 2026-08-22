// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import {
  MockErrorApi,
  renderInTestApp,
  TestApiProvider,
} from '@backstage/test-utils';
import { errorApiRef } from '@backstage/core-plugin-api';
import { ButlerErrorBoundary } from './ErrorBoundary';

const Thrower = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('boom');
  }
  return <div>child content</div>;
};

describe('ButlerErrorBoundary', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    // React logs caught render errors to console.error; keep test output clean.
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('renders the fallback and posts the error to the error API', async () => {
    const errorApi = new MockErrorApi({ collect: true });
    await renderInTestApp(
      <TestApiProvider apis={[[errorApiRef, errorApi]]}>
        <ButlerErrorBoundary>
          <Thrower shouldThrow />
        </ButlerErrorBoundary>
      </TestApiProvider>,
    );

    expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(errorApi.getErrors()).toHaveLength(1);
    expect(errorApi.getErrors()[0].error.message).toBe('boom');
  });

  it('re-renders children after Retry and calls onReset', async () => {
    const errorApi = new MockErrorApi({ collect: true });
    const onReset = jest.fn();

    const Harness = () => {
      const [shouldThrow, setShouldThrow] = useState(true);
      return (
        <ButlerErrorBoundary
          onReset={() => {
            onReset();
            setShouldThrow(false);
          }}
        >
          <Thrower shouldThrow={shouldThrow} />
        </ButlerErrorBoundary>
      );
    };

    await renderInTestApp(
      <TestApiProvider apis={[[errorApiRef, errorApi]]}>
        <Harness />
      </TestApiProvider>,
    );

    expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    expect(onReset).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('child content')).toBeInTheDocument();
    expect(screen.queryByText(/Something went wrong/)).not.toBeInTheDocument();
  });
});
