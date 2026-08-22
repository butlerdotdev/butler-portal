// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { Cluster } from './clusters';

export type NotificationSeverity = 'success' | 'warning' | 'error' | 'info';
export type NotificationCategory = 'cluster' | 'team' | 'infra' | 'security';

export interface ResourceRef {
  kind: string;
  name: string;
  namespace?: string;
  team?: string;
}

export interface ClusterUpdatePayload {
  cluster: Cluster;
}

export interface ClusterDeletePayload {
  name: string;
  namespace: string;
  team?: string;
}

export interface NotificationPayload {
  id?: string;
  title: string;
  message: string;
  severity?: string;
  category?: string;
  timestamp?: string;
  resourceRef?: ResourceRef;
}

/** Wire messages sent by butler-server on /ws/clusters. */
export type ButlerWsMessage =
  | { type: 'cluster_update'; payload: ClusterUpdatePayload }
  | { type: 'cluster_delete'; payload: ClusterDeletePayload }
  | { type: 'notification'; payload: NotificationPayload }
  | { type: 'ping' }
  | { type: 'pong' }
  | { type: 'error'; payload?: { message?: string } };

/** Normalised notification stored by the provider. */
export interface ButlerNotification {
  id: string;
  title: string;
  message: string;
  severity: NotificationSeverity;
  category: NotificationCategory;
  timestamp: string;
  resourceRef?: ResourceRef;
  read: boolean;
}

/** Cluster lifecycle event delivered to subscribe() listeners. */
export type ClusterWatchEvent =
  | { type: 'update'; cluster: Cluster }
  | { type: 'delete'; name: string; namespace: string; team?: string };
