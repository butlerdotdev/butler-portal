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
  PermissionPolicy,
  PolicyQuery,
  PolicyQueryUser,
} from '@backstage/plugin-permission-node';
import { policyExtensionPoint } from '@backstage/plugin-permission-node/alpha';
import {
  AuthAdjudicator,
  AuthAdjudicatorExtensionPoint,
  authAdjudicatorExtensionPoint,
} from './authAdjudicator';

/**
 * The single instance-wide policy Backstage's framework requires. It owns
 * routing only; the decision logic lives in plugin-registered adjudicators
 * (see AuthAdjudicatorExtensionPoint). This is butler-portal's delegation
 * seam and the reason plugins can gate their own authz without editing
 * core.
 *
 * Behavior on each authorize() call:
 *   1. Walk registered (namespace, adjudicator) pairs.
 *   2. First adjudicator whose namespace is a prefix of the permission's
 *      name is invoked; its PolicyDecision is returned.
 *   3. No match: return ALLOW. This preserves upstream Backstage plugin
 *      behavior (catalog / scaffolder / techdocs / search / kubernetes /
 *      etc.) that predates any butler-portal adjudicator being registered.
 */
export class ButlerPortalDelegatingPolicy implements PermissionPolicy {
  constructor(
    private readonly adjudicators: ReadonlyArray<{
      readonly namespace: string;
      readonly adjudicator: AuthAdjudicator;
    }>,
  ) {}

  async handle(
    request: PolicyQuery,
    user?: PolicyQueryUser,
  ): Promise<PolicyDecision> {
    const name = request.permission.name;
    for (const entry of this.adjudicators) {
      if (name.startsWith(entry.namespace)) {
        // Fail closed on a broken adjudicator. A thrown exception must
        // NOT bubble out and become an accidental ALLOW downstream.
        try {
          return await entry.adjudicator(request, user);
        } catch {
          return { result: AuthorizeResult.DENY };
        }
      }
    }
    return { result: AuthorizeResult.ALLOW };
  }
}

class AuthAdjudicatorExtensionPointImpl
  implements AuthAdjudicatorExtensionPoint
{
  readonly entries: Array<{
    readonly namespace: string;
    readonly adjudicator: AuthAdjudicator;
  }> = [];

  register(namespace: string, adjudicator: AuthAdjudicator): void {
    if (this.entries.some(e => e.namespace === namespace)) {
      throw new Error(
        `Adjudicator already registered for namespace "${namespace}". Two ` +
          `plugins may not claim the same permission-name prefix.`,
      );
    }
    this.entries.push({ namespace, adjudicator });
  }
}

export default createBackendModule({
  pluginId: 'permission',
  moduleId: 'butler-portal-delegating-policy',
  register(reg) {
    const adjudicators = new AuthAdjudicatorExtensionPointImpl();
    reg.registerExtensionPoint(authAdjudicatorExtensionPoint, adjudicators);
    reg.registerInit({
      deps: { policy: policyExtensionPoint },
      async init({ policy }) {
        policy.setPolicy(
          new ButlerPortalDelegatingPolicy(adjudicators.entries),
        );
      },
    });
  },
});
