// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useApi, discoveryApiRef } from '@backstage/core-plugin-api';
import { buildButlerWsUrl } from '../api/wsUrl';
import type {
  ButlerNotification,
  ButlerWsMessage,
  NotificationCategory,
  NotificationSeverity,
} from '../api/types/ws';
import {
  ClusterWatchContext,
  type ClusterWatchListener,
} from './ClusterWatchContext';

const MAX_RECONNECT_ATTEMPTS = 5;
const MAX_RECONNECT_DELAY_MS = 30000;
const MAX_NOTIFICATIONS = 50;
const SEVERITIES: NotificationSeverity[] = ['success', 'warning', 'error', 'info'];
const CATEGORIES: NotificationCategory[] = ['cluster', 'team', 'infra', 'security'];

export interface ClusterWatchProviderProps {
  children: React.ReactNode;
  /** Overrides socket construction so tests and dev harnesses can inject a fake. */
  socketFactory?: (url: string) => WebSocket;
  /** Overrides the relay path; defaults to /ws/clusters. */
  path?: string;
}

const defaultSocketFactory = (url: string) => new WebSocket(url);

let notificationCounter = 0;

const toNotification = (
  payload: Extract<ButlerWsMessage, { type: 'notification' }>['payload'],
): ButlerNotification => {
  const severity = SEVERITIES.find(s => s === payload.severity) ?? 'info';
  const category = CATEGORIES.find(c => c === payload.category) ?? 'cluster';
  notificationCounter += 1;
  return {
    id: payload.id || `local-${Date.now()}-${notificationCounter}`,
    title: payload.title,
    message: payload.message,
    severity,
    category,
    timestamp: payload.timestamp || new Date().toISOString(),
    resourceRef: payload.resourceRef,
    read: false,
  };
};

const parseMessage = (data: unknown): ButlerWsMessage | undefined => {
  if (typeof data !== 'string') return undefined;
  try {
    const parsed: unknown = JSON.parse(data);
    if (parsed && typeof parsed === 'object' && 'type' in parsed) {
      return parsed as ButlerWsMessage;
    }
  } catch {
    // Non-JSON frames are ignored.
  }
  return undefined;
};

export const ClusterWatchProvider = ({
  children,
  socketFactory = defaultSocketFactory,
  path = '/ws/clusters',
}: ClusterWatchProviderProps) => {
  const discoveryApi = useApi(discoveryApiRef);
  const [connected, setConnected] = useState(false);
  const [notifications, setNotifications] = useState<ButlerNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const listenersRef = useRef<Set<ClusterWatchListener>>(new Set());
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const disposedRef = useRef(false);
  const socketFactoryRef = useRef(socketFactory);
  socketFactoryRef.current = socketFactory;

  const subscribe = useCallback((listener: ClusterWatchListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => (n.read ? n : { ...n, read: true })));
    setUnreadCount(0);
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
    setUnreadCount(0);
  }, []);

  useEffect(() => {
    disposedRef.current = false;

    const emit: ClusterWatchListener = event => {
      listenersRef.current.forEach(listener => {
        try {
          listener(event);
        } catch {
          // One failing listener must not starve the others.
        }
      });
    };

    const handleMessage = (ws: WebSocket, message: ButlerWsMessage) => {
      switch (message.type) {
        case 'cluster_update':
          if (message.payload?.cluster?.metadata) {
            emit({ type: 'update', cluster: message.payload.cluster });
          }
          break;
        case 'cluster_delete':
          if (message.payload?.name && message.payload?.namespace) {
            emit({
              type: 'delete',
              name: message.payload.name,
              namespace: message.payload.namespace,
              team: message.payload.team,
            });
          }
          break;
        case 'notification':
          if (message.payload?.title) {
            const notification = toNotification(message.payload);
            setNotifications(prev =>
              [notification, ...prev].slice(0, MAX_NOTIFICATIONS),
            );
            setUnreadCount(prev => prev + 1);
          }
          break;
        case 'ping':
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'pong' }));
          }
          break;
        default:
          break;
      }
    };

    const scheduleReconnect = () => {
      if (disposedRef.current) return;
      if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) return;
      const delay = Math.min(
        1000 * 2 ** reconnectAttemptsRef.current,
        MAX_RECONNECT_DELAY_MS,
      );
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        reconnectAttemptsRef.current += 1;
        void connect();
      }, delay);
    };

    async function connect() {
      let url: string;
      try {
        const baseUrl = await discoveryApi.getBaseUrl('butler');
        url = buildButlerWsUrl(baseUrl, path);
      } catch {
        scheduleReconnect();
        return;
      }
      if (disposedRef.current) return;

      let ws: WebSocket;
      try {
        ws = socketFactoryRef.current(url);
      } catch {
        scheduleReconnect();
        return;
      }
      socketRef.current = ws;

      ws.onopen = () => {
        if (disposedRef.current) return;
        reconnectAttemptsRef.current = 0;
        setConnected(true);
      };
      ws.onmessage = (event: MessageEvent) => {
        const message = parseMessage(event.data);
        if (message) handleMessage(ws, message);
      };
      ws.onerror = () => {
        // The close event that follows drives reconnection.
      };
      ws.onclose = () => {
        if (socketRef.current === ws) socketRef.current = null;
        if (disposedRef.current) return;
        setConnected(false);
        scheduleReconnect();
      };
    }

    void connect();

    return () => {
      disposedRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [discoveryApi, path]);

  const value = useMemo(
    () => ({
      connected,
      notifications,
      unreadCount,
      markAllRead,
      clearNotifications,
      subscribe,
    }),
    [connected, notifications, unreadCount, markAllRead, clearNotifications, subscribe],
  );

  return (
    <ClusterWatchContext.Provider value={value}>
      {children}
    </ClusterWatchContext.Provider>
  );
};
