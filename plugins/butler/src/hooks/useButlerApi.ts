// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useApi } from '@backstage/core-plugin-api';
import { butlerApiRef } from '../api/ButlerApi';

export const useButlerApi = () => useApi(butlerApiRef);
