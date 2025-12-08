// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import {
  StatusOK,
  StatusError,
  StatusWarning,
  StatusAborted,
  StatusPending,
  StatusRunning,
} from '@backstage/core-components';
import { getStatusType } from '../../utils/statusColors';

export const StatusBadge = ({ status }: { status: string }) => {
  const type = getStatusType(status);

  switch (type) {
    case 'ok':
      return <StatusOK>{status}</StatusOK>;
    case 'error':
      return <StatusError>{status}</StatusError>;
    case 'warning':
      return <StatusWarning>{status}</StatusWarning>;
    case 'running':
      return <StatusRunning>{status}</StatusRunning>;
    case 'pending':
      return <StatusPending>{status}</StatusPending>;
    default:
      return <StatusAborted>{status}</StatusAborted>;
  }
};
