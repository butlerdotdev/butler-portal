// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useContext } from 'react';
import { TeamContext } from '../contexts/TeamContext';

export const useTeamContext = () => {
  const ctx = useContext(TeamContext);
  if (!ctx) {
    throw new Error('useTeamContext must be used within a TeamProvider');
  }
  return ctx;
};
