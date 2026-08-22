// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useContext } from 'react';
import {
  ClusterWatchContext,
  ClusterWatchContextValue,
} from '../contexts/ClusterWatchContext';

// Pages render inside ClusterWatchProvider under ButlerPage. Outside it
// (component tests, the dev harness, a host that mounts a single page)
// the hook reports a disconnected watch with no events rather than
// failing the render; the page then behaves as it did before live
// updates existed.
const detached: ClusterWatchContextValue = {
  connected: false,
  notifications: [],
  unreadCount: 0,
  markAllRead: () => {},
  clearNotifications: () => {},
  subscribe: () => () => {},
};

export const useClusterWatch = (): ClusterWatchContextValue =>
  useContext(ClusterWatchContext) ?? detached;
