// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

export type StatusType =
  | 'ok'
  | 'error'
  | 'warning'
  | 'pending'
  | 'running'
  | 'aborted';

export function getStatusType(phase: string): StatusType {
  switch (phase?.toLowerCase()) {
    case 'ready':
    case 'active':
    case 'running':
    case 'healthy':
    case 'installed':
      return 'ok';
    case 'failed':
    case 'error':
    case 'degraded':
      return 'error';
    case 'provisioning':
    case 'scaling':
    case 'installing':
    case 'updating':
    case 'rotating':
      return 'running';
    case 'pending':
    case 'waiting':
      return 'pending';
    case 'deleting':
    case 'terminating':
      return 'warning';
    default:
      return 'aborted';
  }
}
