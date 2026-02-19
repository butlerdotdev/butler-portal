// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useApi } from '@backstage/core-plugin-api';
import { registryApiRef } from '../api/RegistryApi';

export function useRegistryApi() {
  return useApi(registryApiRef);
}
