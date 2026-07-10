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

import { createExtensionPoint } from '@backstage/backend-plugin-api';
import {
  PolicyDecision,
} from '@backstage/plugin-permission-common';
import {
  PolicyQuery,
  PolicyQueryUser,
} from '@backstage/plugin-permission-node';

// This seam is butler-portal's, not Backstage's. The upstream permission
// framework enforces exactly one PermissionPolicy per instance (see
// @backstage/plugin-permission-backend PolicyExtensionPointImpl.setPolicy
// which throws "Policy already set" on second registration). That leaves
// no upstream path for a plugin to gate its own authz without a per-plugin
// edit to the integrator's central policy, which defeats the plugin
// ecosystem. This extension point provides namespace-delegated adjudication
// so a plugin (first-party, corteva-internal, or third-party) can register
// its own decision logic against its own permission-name prefix. The
// central ButlerPortalDelegatingPolicy loops registered adjudicators, first
// prefix match wins, and unclaimed namespaces fall through to ALLOW so
// core Backstage plugins (catalog, scaffolder, techdocs, search) keep
// working with no per-plugin edit.
//
// Revisit if the Backstage community lands an official namespace-delegated
// policy interface; the goal is to stay on the framework's grain.

export type AuthAdjudicator = (
  request: PolicyQuery,
  user?: PolicyQueryUser,
) => Promise<PolicyDecision> | PolicyDecision;

export interface AuthAdjudicatorExtensionPoint {
  /**
   * Register an adjudicator for a permission-name prefix (e.g. "registry.",
   * "pe."). The prefix should end with a separator so that no plugin can
   * accidentally claim another plugin's namespace by shortening its prefix
   * (e.g. "registry" would match "registry-other.*" too).
   *
   * First registered prefix wins on a match. Ties are not expected;
   * registering the same prefix twice will throw at boot to catch
   * accidental double-registration.
   */
  register(namespace: string, adjudicator: AuthAdjudicator): void;
}

export const authAdjudicatorExtensionPoint =
  createExtensionPoint<AuthAdjudicatorExtensionPoint>({
    id: 'butlerPortal.authAdjudicator',
  });
