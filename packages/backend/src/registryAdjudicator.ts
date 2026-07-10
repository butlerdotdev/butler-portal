/*
 * Copyright 2026 The Butler Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { createBackendModule } from '@backstage/backend-plugin-api';
import {
  PolicyDecision,
  AuthorizeResult,
} from '@backstage/plugin-permission-common';
import {
  PolicyQuery,
  PolicyQueryUser,
} from '@backstage/plugin-permission-node';
import {
  resolveHighestRole,
  ADMIN_PERMISSIONS,
  OPERATOR_PERMISSIONS,
} from '@internal/plugin-registry-common';
import { authAdjudicatorExtensionPoint } from './authAdjudicator';

/**
 * Registry's role-based adjudication logic. Behaviorally identical to
 * the pre-delegation-seam inline body of the central PermissionPolicy;
 * the code has moved, the decisions have not. See
 * permissionPolicy.test.ts for the equivalence proof.
 *
 * Role rules:
 *   platform-admin / admin → all registry actions ALLOW
 *   operator → ADMIN_PERMISSIONS DENY, OPERATOR_PERMISSIONS ALLOW, reads ALLOW
 *   viewer  → ADMIN_PERMISSIONS DENY, OPERATOR_PERMISSIONS DENY, reads ALLOW
 *
 * The user's highest role across all ownership refs is used as a coarse
 * gate. Per-team enforcement (admin on team A but viewer on team B) is
 * handled by the registry backend's team middleware, not here.
 */
export function registryAdjudicator(
  request: PolicyQuery,
  user?: PolicyQueryUser,
): PolicyDecision {
  const refs = user?.info.ownershipEntityRefs ?? [];
  const role = resolveHighestRole(refs);

  if (role === 'platform-admin' || role === 'admin') {
    return { result: AuthorizeResult.ALLOW };
  }

  if (ADMIN_PERMISSIONS.has(request.permission.name)) {
    return { result: AuthorizeResult.DENY };
  }

  if (OPERATOR_PERMISSIONS.has(request.permission.name)) {
    return {
      result:
        role === 'operator' ? AuthorizeResult.ALLOW : AuthorizeResult.DENY,
    };
  }

  return { result: AuthorizeResult.ALLOW };
}

export default createBackendModule({
  pluginId: 'permission',
  moduleId: 'registry-adjudicator',
  register(reg) {
    reg.registerInit({
      deps: { adjudicators: authAdjudicatorExtensionPoint },
      async init({ adjudicators }) {
        adjudicators.register('registry.', registryAdjudicator);
      },
    });
  },
});
