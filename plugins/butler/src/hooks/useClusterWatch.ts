// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useContext } from 'react';
import { ClusterWatchContext } from '../contexts/ClusterWatchContext';

export const useClusterWatch = () => {
  const ctx = useContext(ClusterWatchContext);
  if (!ctx) {
    throw new Error('useClusterWatch must be used within a ClusterWatchProvider');
  }
  return ctx;
};
