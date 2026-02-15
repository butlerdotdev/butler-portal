// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { createContext } from 'react';

export interface WorkspaceTeamContextValue {
  teams: Array<{ name: string; displayName?: string; role: string }>;
  activeTeam: string | null;
  switchTeam: (name: string) => void;
  loading: boolean;
  userEmail: string | null;
  isAdmin: boolean;
  adminView: boolean;
  toggleAdminView: () => void;
}

export const WorkspaceTeamContext = createContext<
  WorkspaceTeamContextValue | undefined
>(undefined);
