// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { discoveryApiRef } from '@backstage/core-plugin-api';
import { ClusterWatchProvider } from '../../contexts/ClusterWatchProvider';
import {
  FakeWebSocket,
  fakeSocketFactory,
} from '../../contexts/fakeWebSocket.test-helper';
import { NotificationBell } from './NotificationBell';

const discoveryApi = {
  getBaseUrl: async () => 'http://localhost:7007/api/butler',
};

const renderBell = () =>
  render(
    <TestApiProvider apis={[[discoveryApiRef, discoveryApi]]}>
      <ClusterWatchProvider socketFactory={fakeSocketFactory}>
        <NotificationBell />
      </ClusterWatchProvider>
    </TestApiProvider>,
  );

describe('NotificationBell', () => {
  beforeEach(() => {
    FakeWebSocket.reset();
  });

  it('shows an empty state before any notification arrives', async () => {
    renderBell();
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    fireEvent.click(screen.getByTestId('notification-bell'));
    expect(screen.getByText('No notifications yet')).toBeInTheDocument();
  });

  it('lists notifications from the socket and marks them read', async () => {
    renderBell();
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const socket = FakeWebSocket.instances[0];
    act(() => {
      socket.emitOpen();
      socket.emitMessage({
        type: 'notification',
        payload: {
          id: 'n1',
          title: 'Cluster Ready',
          message: 'demo is ready',
          severity: 'success',
          category: 'cluster',
          timestamp: '2026-08-22T10:00:00Z',
        },
      });
      socket.emitMessage({
        type: 'notification',
        payload: {
          id: 'n2',
          title: 'Cluster Failed',
          message: 'demo failed',
          severity: 'error',
          category: 'cluster',
          timestamp: '2026-08-22T10:05:00Z',
        },
      });
    });
    expect(screen.getByText('2')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('notification-bell'));
    expect(screen.getByText('Cluster Ready')).toBeInTheDocument();
    expect(screen.getByText('demo failed')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Mark all read'));
    expect(screen.queryByText('2')).not.toBeInTheDocument();
    expect(screen.getByText('Cluster Ready')).toBeInTheDocument();
  });
});
