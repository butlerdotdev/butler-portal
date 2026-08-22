// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { createContext } from 'react';
import type { TeamInfo } from '../api/types/teams';

export type ViewMode = 'admin' | 'team';

export interface TeamContextValue {
  teams: TeamInfo[];
  activeTeam: string | null;
  activeTeamDisplayName: string | null;
  activeTeamRole: string | null;
  isTeamAdmin: boolean;
  switchTeam: (teamName: string) => void;
  switchToAdmin: () => void;
  loading: boolean;
  /** Platform role from the server: 'admin', 'viewer' or empty. */
  platformRole: string;
  /** Platform admin: may read and mutate every platform surface. */
  isAdmin: boolean;
  /** Platform admin or platform viewer: may read every platform surface. */
  canAccessAdmin: boolean;
  mode: ViewMode;
}

export const TeamContext = createContext<TeamContextValue | undefined>(
  undefined,
);
