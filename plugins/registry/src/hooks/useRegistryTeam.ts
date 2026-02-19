// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useContext } from 'react';
import { RegistryTeamContext } from '../contexts/RegistryTeamContext';

export function useRegistryTeam() {
  const ctx = useContext(RegistryTeamContext);
  if (!ctx) {
    throw new Error('useRegistryTeam must be used within RegistryTeamProvider');
  }
  return ctx;
}
