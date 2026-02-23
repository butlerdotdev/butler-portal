// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useContext } from 'react';
import { PipelineTeamContext } from '../contexts/PipelineTeamContext';

export function usePipelineTeam() {
  return useContext(PipelineTeamContext);
}
