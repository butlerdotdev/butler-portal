// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import '@testing-library/jest-dom';
import { act, screen, waitFor, fireEvent } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { discoveryApiRef } from '@backstage/core-plugin-api';
import { ClusterWatchProvider } from '../../contexts/ClusterWatchProvider';
import {
  FakeWebSocket,
  fakeSocketFactory,
} from '../../contexts/fakeWebSocket.test-helper';
import { rootRouteRef } from '../../routes';
import { NotificationBell, formatRelativeTime } from './NotificationBell';

const discoveryApi = {
  getBaseUrl: async () => 'http://localhost:7007/api/butler',
};

const renderBell = () =>
  renderInTestApp(
    <TestApiProvider apis={[[discoveryApiRef, discoveryApi]]}>
      <ClusterWatchProvider socketFactory={fakeSocketFactory}>
        <NotificationBell />
      </ClusterWatchProvider>
    </TestApiProvider>,
    {
      routeEntries: ['/butler'],
      mountedRoutes: { '/butler': rootRouteRef },
    },
  );

describe('NotificationBell', () => {
  beforeEach(() => {
    FakeWebSocket.reset();
  });

  it('shows an empty state before any notification arrives', async () => {
    await renderBell();
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    fireEvent.click(screen.getByTestId('notification-bell'));
    expect(
      screen.getByRole('dialog', { name: 'Notifications' }),
    ).toBeInTheDocument();
    expect(screen.getByText('No notifications')).toBeInTheDocument();
    expect(screen.queryByText('Mark all read')).not.toBeInTheDocument();
  });

  it('lists notifications from the socket and marks them read', async () => {
    await renderBell();
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
    expect(screen.getByTestId('notification-badge')).toHaveTextContent('2');

    fireEvent.click(screen.getByTestId('notification-bell'));
    expect(screen.getByText('Cluster Ready')).toBeInTheDocument();
    expect(screen.getByText('demo failed')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Mark all read'));
    expect(screen.queryByTestId('notification-badge')).not.toBeInTheDocument();
    expect(screen.getByText('Cluster Ready')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Clear'));
    expect(screen.getByText('No notifications')).toBeInTheDocument();
  });

  it('formats relative time like the console', () => {
    const now = Date.parse('2026-08-22T12:00:00Z');
    expect(formatRelativeTime('2026-08-22T11:59:30Z', now)).toBe('just now');
    expect(formatRelativeTime('2026-08-22T11:45:00Z', now)).toBe('15m ago');
    expect(formatRelativeTime('2026-08-22T09:00:00Z', now)).toBe('3h ago');
    expect(formatRelativeTime('2026-08-20T12:00:00Z', now)).toBe('2d ago');
  });
});
