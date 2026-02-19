// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { createContext } from 'react';
import type { RegistryRole } from '@internal/plugin-registry-common';

export interface RegistryTeamContextValue {
  teams: string[];
  activeTeam: string | null;
  activeRole: RegistryRole;
  userEmail: string | null;
  isPlatformAdmin: boolean;
  loading: boolean;
  switchTeam: (team: string | null) => void;
}

export const RegistryTeamContext =
  createContext<RegistryTeamContextValue | null>(null);
