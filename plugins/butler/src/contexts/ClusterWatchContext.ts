// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { createContext } from 'react';
import type { ButlerNotification, ClusterWatchEvent } from '../api/types/ws';

export type ClusterWatchListener = (event: ClusterWatchEvent) => void;

export interface ClusterWatchContextValue {
  connected: boolean;
  notifications: ButlerNotification[];
  unreadCount: number;
  markAllRead: () => void;
  clearNotifications: () => void;
  subscribe: (listener: ClusterWatchListener) => () => void;
}

export const ClusterWatchContext = createContext<
  ClusterWatchContextValue | undefined
>(undefined);
