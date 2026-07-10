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

import { AuthorizeResult } from '@backstage/plugin-permission-common';
import {
  PolicyQuery,
  PolicyQueryUser,
} from '@backstage/plugin-permission-node';
import {
  ADMIN_PERMISSIONS,
  OPERATOR_PERMISSIONS,
  resolveHighestRole,
} from '@internal/plugin-registry-common';
import {
  AuthAdjudicatorExtensionPointImpl,
  ButlerPortalDelegatingPolicy,
} from './permissionPolicy';
import { registryAdjudicator } from './registryAdjudicator';

// The reference implementation is the exact pre-delegation-seam inline
// body that used to live in permissionPolicy.ts. It is intentionally
// duplicated here so the test compares the new delegating shape against
// an independent copy of the old logic. If either implementation drifts,
// this test fails.
function referenceInlinePolicy(
  request: PolicyQuery,
  user?: PolicyQueryUser,
) {
  const refs = user?.info.ownershipEntityRefs ?? [];

  if (!request.permission.name.startsWith('registry.')) {
    return { result: AuthorizeResult.ALLOW };
  }

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

const buildUser = (refs: string[]): PolicyQueryUser =>
  ({
    info: { ownershipEntityRefs: refs },
  } as unknown as PolicyQueryUser);

const buildRequest = (name: string): PolicyQuery =>
  ({
    permission: { name, attributes: {} },
  } as unknown as PolicyQuery);

// Identity vectors span every role branch of resolveHighestRole.
const identities: Array<{ label: string; refs: string[] }> = [
  { label: 'platform-admin', refs: ['group:default/platform-admins'] },
  { label: 'admin (team-scoped)', refs: ['group:default/registry-admins'] },
  { label: 'admin (butler-platform-admins)', refs: ['group:default/butler-platform-admins'] },
  { label: 'operator', refs: ['group:default/registry-operators'] },
  { label: 'viewer (no matching group)', refs: ['group:default/some-team'] },
  { label: 'anonymous (no refs)', refs: [] },
];

// Permission vectors span every rule branch of the registry logic +
// two unclaimed namespaces to prove ALLOW-fallthrough.
const permissions: string[] = [
  // ADMIN_PERMISSIONS members (admin-only actions)
  'registry.environment.delete',
  'registry.environment.lock',
  'registry.cloud-integration.delete',
  'registry.variable-set.delete',
  'registry.token.create',
  'registry.token.revoke',
  // OPERATOR_PERMISSIONS members (operator + admin actions)
  'registry.artifact.create',
  'registry.artifact.update',
  'registry.version.publish',
  'registry.version.approve',
  'registry.version.yank',
  'registry.environment.create',
  'registry.environment.update',
  'registry.run.create',
  'registry.run.cancel',
  'registry.run.confirm',
  'registry.cloud-integration.create',
  'registry.cloud-integration.update',
  'registry.variable-set.create',
  'registry.variable-set.update',
  // Registry read-shaped (neither in ADMIN nor OPERATOR set)
  'registry.project.read',
  'registry.artifact.read',
  // Unclaimed namespaces (must fall through to ALLOW under both shapes)
  'catalog.entity.read',
  'catalog.entity.create',
  'scaffolder.action.execute',
  'techdocs.entity.build',
  'search.query.perform',
  'kubernetes.proxy',
];

// Behavioral equivalence: same (permission, identity) -> same PolicyDecision
// under the new delegating shape as under the pre-delegation reference body.
describe('ButlerPortalDelegatingPolicy - behavioral equivalence with the pre-delegation inline body', () => {
  const delegating = new ButlerPortalDelegatingPolicy([
    { namespace: 'registry.', adjudicator: registryAdjudicator },
  ]);

  for (const identity of identities) {
    for (const permission of permissions) {
      it(`${identity.label} + ${permission}`, async () => {
        const request = buildRequest(permission);
        const user = buildUser(identity.refs);
        const referenceResult = referenceInlinePolicy(request, user);
        const delegatingResult = await delegating.handle(request, user);
        expect(delegatingResult).toEqual(referenceResult);
      });
    }
  }
});

// Unclaimed-ALLOW: with the registry adjudicator registered, catalog /
// scaffolder / techdocs / search / kubernetes permissions still return
// ALLOW because no adjudicator claims their namespace prefix. This is
// the "no per-plugin edit needed for core Backstage plugins" property.
describe('ButlerPortalDelegatingPolicy - unclaimed namespaces pass through ALLOW', () => {
  const delegating = new ButlerPortalDelegatingPolicy([
    { namespace: 'registry.', adjudicator: registryAdjudicator },
  ]);

  const unclaimed = [
    'catalog.entity.read',
    'catalog.entity.create',
    'catalog.entity.delete',
    'catalog.location.create',
    'scaffolder.action.execute',
    'scaffolder.template.parameter.read',
    'techdocs.entity.build',
    'techdocs.entity.read',
    'search.query.perform',
    'kubernetes.proxy',
    'pe.metastore.read',
    'pe.tag.write',
  ];

  for (const permission of unclaimed) {
    it(`${permission} -> ALLOW even with no adjudicator claiming it`, async () => {
      const result = await delegating.handle(
        buildRequest(permission),
        buildUser([]),
      );
      expect(result).toEqual({ result: AuthorizeResult.ALLOW });
    });
  }
});

// Routing: the first-prefix-match-wins contract, and namespace
// scoping is inclusive of the trailing separator so "pe" cannot
// accidentally match "pe-other" traffic (the adjudicator's registered
// prefix is "pe." not "pe").
describe('ButlerPortalDelegatingPolicy - routing rules', () => {
  it('first prefix match wins', async () => {
    const orderA = jest.fn(() => ({ result: AuthorizeResult.ALLOW } as const));
    const orderB = jest.fn(() => ({ result: AuthorizeResult.DENY } as const));
    const delegating = new ButlerPortalDelegatingPolicy([
      { namespace: 'foo.', adjudicator: orderA },
      { namespace: 'foo.', adjudicator: orderB },
      // NB: registering the same namespace twice via the extension point
      // impl would throw at boot; this test constructs the array
      // directly to prove routing semantics.
    ]);
    const result = await delegating.handle(
      buildRequest('foo.bar'),
      buildUser([]),
    );
    expect(result).toEqual({ result: AuthorizeResult.ALLOW });
    expect(orderA).toHaveBeenCalledTimes(1);
    expect(orderB).not.toHaveBeenCalled();
  });

  it('separator-terminated namespaces do not swallow adjacent names', async () => {
    const peCalls = jest.fn(() => ({
      result: AuthorizeResult.DENY,
    } as const));
    const delegating = new ButlerPortalDelegatingPolicy([
      { namespace: 'pe.', adjudicator: peCalls },
    ]);
    // "pe.metastore.read" starts with "pe." -> the pe adjudicator runs
    const inside = await delegating.handle(
      buildRequest('pe.metastore.read'),
      buildUser([]),
    );
    expect(inside).toEqual({ result: AuthorizeResult.DENY });
    // "pe-other.thing" does not start with "pe." -> falls through to ALLOW
    const outside = await delegating.handle(
      buildRequest('pe-other.thing'),
      buildUser([]),
    );
    expect(outside).toEqual({ result: AuthorizeResult.ALLOW });
    expect(peCalls).toHaveBeenCalledTimes(1);
  });

  it('adjudicator that throws -> DENY (fail closed, not accidental ALLOW)', async () => {
    const throwingSync = jest.fn(() => {
      throw new Error('adjudicator blew up');
    });
    const delegatingSync = new ButlerPortalDelegatingPolicy([
      { namespace: 'boom.', adjudicator: throwingSync },
    ]);
    const syncResult = await delegatingSync.handle(
      buildRequest('boom.action'),
      buildUser([]),
    );
    expect(syncResult).toEqual({ result: AuthorizeResult.DENY });
    expect(throwingSync).toHaveBeenCalledTimes(1);

    const throwingAsync = jest.fn(async () => {
      throw new Error('adjudicator rejected');
    });
    const delegatingAsync = new ButlerPortalDelegatingPolicy([
      { namespace: 'boom.', adjudicator: throwingAsync },
    ]);
    const asyncResult = await delegatingAsync.handle(
      buildRequest('boom.action'),
      buildUser([]),
    );
    expect(asyncResult).toEqual({ result: AuthorizeResult.DENY });
    expect(throwingAsync).toHaveBeenCalledTimes(1);
  });

  it('empty adjudicator list -> all permissions ALLOW', async () => {
    const delegating = new ButlerPortalDelegatingPolicy([]);
    for (const name of [
      'registry.environment.delete',
      'catalog.entity.read',
      'pe.metastore.write',
      'anything.at.all',
    ]) {
      const result = await delegating.handle(
        buildRequest(name),
        buildUser([]),
      );
      expect(result).toEqual({ result: AuthorizeResult.ALLOW });
    }
  });
});

// Boot-time registration guards on the extension-point impl. Every
// class of ambiguous namespace registration must throw before boot
// completes so operators see it immediately, not silently at runtime.
describe('AuthAdjudicatorExtensionPointImpl - registration guards', () => {
  const noop = () => ({ result: AuthorizeResult.ALLOW } as const);

  it('accepts a first registration', () => {
    const impl = new AuthAdjudicatorExtensionPointImpl();
    expect(() => impl.register('registry.', noop)).not.toThrow();
    expect(impl.entries).toHaveLength(1);
  });

  it('accepts multiple non-overlapping namespaces', () => {
    const impl = new AuthAdjudicatorExtensionPointImpl();
    impl.register('registry.', noop);
    impl.register('pe.', noop);
    impl.register('myplugin.', noop);
    expect(impl.entries.map(e => e.namespace)).toEqual([
      'registry.',
      'pe.',
      'myplugin.',
    ]);
  });

  it('rejects an empty namespace (would swallow every permission)', () => {
    const impl = new AuthAdjudicatorExtensionPointImpl();
    expect(() => impl.register('', noop)).toThrow(/non-empty string/);
  });

  it('rejects duplicate namespace strings', () => {
    const impl = new AuthAdjudicatorExtensionPointImpl();
    impl.register('registry.', noop);
    expect(() => impl.register('registry.', noop)).toThrow(
      /already registered/,
    );
  });

  it('rejects a new namespace that is a prefix of an existing one', () => {
    const impl = new AuthAdjudicatorExtensionPointImpl();
    impl.register('registry.', noop);
    // "reg" is a prefix of "registry." - registering it later would
    // swallow all registry.* traffic on lookup order.
    expect(() => impl.register('reg', noop)).toThrow(/conflicts with/);
  });

  it('rejects a new namespace that has an existing namespace as its prefix', () => {
    const impl = new AuthAdjudicatorExtensionPointImpl();
    impl.register('pe.', noop);
    // "pe.tag." starts with "pe." - would never be reached in dispatch
    // because "pe." matches first.
    expect(() => impl.register('pe.tag.', noop)).toThrow(/conflicts with/);
  });

  it('allows namespaces that share an early prefix but do not conflict', () => {
    const impl = new AuthAdjudicatorExtensionPointImpl();
    // "pe." and "pe-other." share the two-character prefix "pe" but
    // neither is a prefix of the other. Both should be accepted.
    impl.register('pe.', noop);
    expect(() => impl.register('pe-other.', noop)).not.toThrow();
    expect(impl.entries).toHaveLength(2);
  });
});
