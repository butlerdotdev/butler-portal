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
  isAdmin: boolean;
  mode: ViewMode;
}

export const TeamContext = createContext<TeamContextValue | undefined>(
  undefined,
);
