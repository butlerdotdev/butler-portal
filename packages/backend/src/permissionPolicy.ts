// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { createBackendModule } from '@backstage/backend-plugin-api';
import {
  PolicyDecision,
  AuthorizeResult,
} from '@backstage/plugin-permission-common';
import {
  PermissionPolicy,
  PolicyQuery,
  PolicyQueryUser,
} from '@backstage/plugin-permission-node';
import { policyExtensionPoint } from '@backstage/plugin-permission-node/alpha';
import {
  resolveHighestRole,
  ADMIN_PERMISSIONS,
  OPERATOR_PERMISSIONS,
} from '@internal/plugin-registry-common';

/**
 * Role-based permission policy for the registry plugin.
 *
 * Uses the user's Backstage group memberships to determine their highest
 * role, then maps permissions to minimum required roles:
 *
 *   platform-admin / admin → all actions
 *   operator → create, update, plan, apply (no delete, force-unlock, tokens)
 *   viewer → read-only (all mutations denied)
 *
 * Note: this uses the user's highest role across all teams as a coarse gate.
 * Per-team enforcement (admin on team A but viewer on team B) is handled by
 * the registry backend's team middleware.
 */
class RegistryPermissionPolicy implements PermissionPolicy {
  async handle(
    request: PolicyQuery,
    user?: PolicyQueryUser,
  ): Promise<PolicyDecision> {
    const refs = user?.info.ownershipEntityRefs ?? [];

    // Non-registry permissions: allow (other plugins handle their own)
    if (!request.permission.name.startsWith('registry.')) {
      return { result: AuthorizeResult.ALLOW };
    }

    const role = resolveHighestRole(refs);

    // Platform admin and admin: full access
    if (role === 'platform-admin' || role === 'admin') {
      return { result: AuthorizeResult.ALLOW };
    }

    // Admin-only actions
    if (ADMIN_PERMISSIONS.has(request.permission.name)) {
      return { result: AuthorizeResult.DENY };
    }

    // Operator actions
    if (OPERATOR_PERMISSIONS.has(request.permission.name)) {
      return {
        result: role === 'operator'
          ? AuthorizeResult.ALLOW
          : AuthorizeResult.DENY,
      };
    }

    // Read operations: allow for everyone
    return { result: AuthorizeResult.ALLOW };
  }
}

export default createBackendModule({
  pluginId: 'permission',
  moduleId: 'registry-rbac-policy',
  register(reg) {
    reg.registerInit({
      deps: { policy: policyExtensionPoint },
      async init({ policy }) {
        policy.setPolicy(new RegistryPermissionPolicy());
      },
    });
  },
});
