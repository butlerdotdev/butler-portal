// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { createContext } from 'react';
import type { PipelineRole } from '@internal/plugin-pipeline-common';

export interface PipelineTeamContextValue {
  teams: string[];
  activeTeam: string | null;
  activeRole: PipelineRole | null;
  userEmail: string | null;
  isPlatformAdmin: boolean;
  ownershipRefs: string[];
  loading: boolean;
  switchTeam: (team: string | null) => void;
}

export const PipelineTeamContext = createContext<PipelineTeamContextValue>({
  teams: [],
  activeTeam: null,
  activeRole: null,
  userEmail: null,
  isPlatformAdmin: false,
  ownershipRefs: [],
  loading: true,
  switchTeam: () => {},
});
