// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useApi } from '@backstage/core-plugin-api';
import { pipelineApiRef } from '../api/PipelineApi';

export function usePipelineApi() {
  return useApi(pipelineApiRef);
}
