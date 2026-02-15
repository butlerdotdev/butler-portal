// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useContext } from 'react';
import { WorkspaceTeamContext } from '../contexts/WorkspaceTeamContext';

export const useWorkspaceTeam = () => {
  const ctx = useContext(WorkspaceTeamContext);
  if (!ctx) {
    throw new Error(
      'useWorkspaceTeam must be used within a WorkspaceTeamProvider',
    );
  }
  return ctx;
};
