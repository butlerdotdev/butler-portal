// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { ButlerStatusBadge, statusStyle } from './ButlerStatusBadge';

describe('statusStyle', () => {
  it('maps console phases to tones and pulse', () => {
    expect(statusStyle('Ready')).toEqual({ tone: 'green' });
    expect(statusStyle('Provisioning')).toEqual({
      tone: 'yellow',
      pulse: true,
    });
    expect(statusStyle('Updating')).toEqual({ tone: 'blue', pulse: true });
    expect(statusStyle('Deleting')).toEqual({ tone: 'orange', pulse: true });
    expect(statusStyle('Degraded')).toEqual({ tone: 'orange' });
    expect(statusStyle('Failed')).toEqual({ tone: 'red' });
    expect(statusStyle('NotReady')).toEqual({ tone: 'red' });
    expect(statusStyle('Not Ready')).toEqual({ tone: 'red' });
  });

  it('falls back to neutral for unknown and missing phases', () => {
    expect(statusStyle('Something')).toEqual({ tone: 'neutral' });
    expect(statusStyle(undefined)).toEqual({ tone: 'neutral' });
  });
});

describe('ButlerStatusBadge', () => {
  it('renders the phase text and a pulse dot for transitional phases', () => {
    const { container } = render(<ButlerStatusBadge status="Provisioning" />);
    expect(screen.getByText('Provisioning')).toBeInTheDocument();
    expect(container.querySelector('[aria-hidden]')).not.toBeNull();
  });

  it('renders no pulse dot for settled phases and Unknown when empty', () => {
    const { container } = render(<ButlerStatusBadge status={undefined} />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(container.querySelector('[aria-hidden]')).toBeNull();
  });
});
