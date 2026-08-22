// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { discoveryApiRef } from '@backstage/core-plugin-api';
import { ClusterWatchProvider } from './ClusterWatchProvider';
import { useClusterWatch } from '../hooks/useClusterWatch';
import type { ClusterWatchEvent } from '../api/types/ws';
import type { Cluster } from '../api/types/clusters';
import { FakeWebSocket, fakeSocketFactory } from './fakeWebSocket.test-helper';

const discoveryApi = {
  getBaseUrl: async () => 'http://localhost:7007/api/butler',
};

const cluster: Cluster = {
  metadata: { name: 'demo', namespace: 'team-a' },
  spec: { kubernetesVersion: '1.31.0' },
  status: { phase: 'Ready' },
} as Cluster;

const events: ClusterWatchEvent[] = [];

const Probe = () => {
  const { connected, notifications, unreadCount, subscribe, markAllRead } =
    useClusterWatch();
  React.useEffect(() => subscribe(e => events.push(e)), [subscribe]);
  return (
    <div>
      <span data-testid="connected">{String(connected)}</span>
      <span data-testid="unread">{unreadCount}</span>
      <span data-testid="count">{notifications.length}</span>
      <span data-testid="first">{notifications[0]?.title ?? ''}</span>
      <button onClick={markAllRead}>read</button>
    </div>
  );
};

const renderProvider = () =>
  render(
    <TestApiProvider apis={[[discoveryApiRef, discoveryApi]]}>
      <ClusterWatchProvider socketFactory={fakeSocketFactory}>
        <Probe />
      </ClusterWatchProvider>
    </TestApiProvider>,
  );

const latestSocket = () =>
  FakeWebSocket.instances[FakeWebSocket.instances.length - 1];

describe('ClusterWatchProvider', () => {
  beforeEach(() => {
    FakeWebSocket.reset();
    events.length = 0;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('opens a socket to /ws/clusters and reports connection state', async () => {
    renderProvider();
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    expect(latestSocket().url).toBe(
      'ws://localhost:7007/api/butler/ws/clusters',
    );
    expect(screen.getByTestId('connected').textContent).toBe('false');
    act(() => latestSocket().emitOpen());
    expect(screen.getByTestId('connected').textContent).toBe('true');
  });

  it('delivers cluster_update and cluster_delete to subscribers', async () => {
    renderProvider();
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    act(() => {
      latestSocket().emitOpen();
      latestSocket().emitMessage({
        type: 'cluster_update',
        payload: { cluster },
      });
      latestSocket().emitMessage({
        type: 'cluster_delete',
        payload: { name: 'demo', namespace: 'team-a', team: 'team-a' },
      });
    });
    expect(events).toEqual([
      { type: 'update', cluster },
      { type: 'delete', name: 'demo', namespace: 'team-a', team: 'team-a' },
    ]);
  });

  it('buffers notifications, tracks unread count, and marks all read', async () => {
    renderProvider();
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    act(() => {
      latestSocket().emitOpen();
      latestSocket().emitMessage({
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
      latestSocket().emitMessage({
        type: 'notification',
        payload: { title: 'Second', message: 'no id', severity: 'bogus' },
      });
    });
    expect(screen.getByTestId('count').textContent).toBe('2');
    expect(screen.getByTestId('unread').textContent).toBe('2');
    expect(screen.getByTestId('first').textContent).toBe('Second');
    act(() => {
      screen.getByText('read').click();
    });
    expect(screen.getByTestId('unread').textContent).toBe('0');
    expect(screen.getByTestId('count').textContent).toBe('2');
  });

  it('caps the notification buffer at 50', async () => {
    renderProvider();
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    act(() => {
      latestSocket().emitOpen();
      for (let i = 0; i < 60; i += 1) {
        latestSocket().emitMessage({
          type: 'notification',
          payload: { id: `n${i}`, title: `t${i}`, message: 'm' },
        });
      }
    });
    expect(screen.getByTestId('count').textContent).toBe('50');
    expect(screen.getByTestId('unread').textContent).toBe('60');
  });

  it('answers ping with pong', async () => {
    renderProvider();
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    act(() => {
      latestSocket().emitOpen();
      latestSocket().emitMessage({ type: 'ping' });
    });
    expect(latestSocket().sent).toEqual([JSON.stringify({ type: 'pong' })]);
  });

  it('reconnects with exponential backoff after close', async () => {
    renderProvider();
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    act(() => {
      latestSocket().emitOpen();
      latestSocket().emitServerClose();
    });
    expect(screen.getByTestId('connected').textContent).toBe('false');

    // First retry after 1s.
    act(() => {
      jest.advanceTimersByTime(999);
    });
    expect(FakeWebSocket.instances).toHaveLength(1);
    act(() => {
      jest.advanceTimersByTime(1);
    });
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));

    // Second retry after 2s.
    act(() => latestSocket().emitServerClose());
    act(() => {
      jest.advanceTimersByTime(1999);
    });
    expect(FakeWebSocket.instances).toHaveLength(2);
    act(() => {
      jest.advanceTimersByTime(1);
    });
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(3));

    // A short-lived open (the relay accepts the upgrade, the server hop
    // fails) does not reset the backoff: next retry waits 4s, not 1s.
    act(() => {
      latestSocket().emitOpen();
      latestSocket().emitServerClose();
    });
    act(() => {
      jest.advanceTimersByTime(3999);
    });
    expect(FakeWebSocket.instances).toHaveLength(3);
    act(() => {
      jest.advanceTimersByTime(1);
    });
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(4));

    // A connection that stays up for 10s resets the backoff to 1s.
    act(() => {
      latestSocket().emitOpen();
      jest.advanceTimersByTime(10000);
      latestSocket().emitServerClose();
    });
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(5));
  });

  it('keeps retrying at the 30s cap after short-lived connections', async () => {
    renderProvider();
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    for (let attempt = 0; attempt < 8; attempt += 1) {
      act(() => {
        latestSocket().emitOpen();
        latestSocket().emitServerClose();
      });
      act(() => {
        jest.advanceTimersByTime(30000);
      });
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() =>
        expect(FakeWebSocket.instances).toHaveLength(attempt + 2),
      );
    }
  });

  it('stops after five upgrades that never opened', async () => {
    renderProvider();
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    for (let attempt = 0; attempt < 4; attempt += 1) {
      act(() => latestSocket().emitServerClose());
      act(() => {
        jest.advanceTimersByTime(30000);
      });
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() =>
        expect(FakeWebSocket.instances).toHaveLength(attempt + 2),
      );
    }
    act(() => latestSocket().emitServerClose());
    act(() => {
      jest.advanceTimersByTime(60000);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(FakeWebSocket.instances).toHaveLength(5);
  });

  it('closes the socket and cancels reconnects on unmount', async () => {
    const { unmount } = renderProvider();
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const socket = latestSocket();
    act(() => socket.emitOpen());
    unmount();
    expect(socket.readyState).toBe(FakeWebSocket.CLOSED);
    act(() => {
      jest.advanceTimersByTime(60000);
    });
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
