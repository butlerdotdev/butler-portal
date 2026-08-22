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

import { IdentityResolver, UnresolvableIdentityError } from '../service/IdentityResolver';

const userCreds = { $$type: '@backstage/BackstageCredentials', principal: { type: 'user' } } as any;
const serviceCreds = { $$type: '@backstage/BackstageCredentials', principal: { type: 'service' } } as any;

const auth = {
  isPrincipal: (creds: any, type: string) => creds.principal.type === type,
} as any;
const logger = { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn(), child: () => logger } as any;

function userInfoFor(ref: string) {
  return { getUserInfo: jest.fn(async () => ({ userEntityRef: ref, ownershipEntityRefs: [ref] })) } as any;
}

describe('IdentityResolver', () => {
  it('returns undefined for service principals', async () => {
    const r = new IdentityResolver({ userInfo: userInfoFor('user:default/x'), auth, logger });
    await expect(r.resolveEmail(serviceCreds)).resolves.toBeUndefined();
  });

  it('uses an entity name that already is an email', async () => {
    const r = new IdentityResolver({ userInfo: userInfoFor('user:default/Dev@Example.com'), auth, logger });
    await expect(r.resolveEmail(userCreds)).resolves.toBe('dev@example.com');
  });

  it('prefers the catalog profile email over the domain fallback', async () => {
    const catalog = { getEntityByRef: jest.fn(async () => ({ spec: { profile: { email: 'Dev@Corp.Example' } } })) } as any;
    const r = new IdentityResolver({ userInfo: userInfoFor('user:default/dev'), auth, catalog, emailDomain: 'other.example', logger });
    await expect(r.resolveEmail(userCreds)).resolves.toBe('dev@corp.example');
    expect(catalog.getEntityByRef).toHaveBeenCalledWith('user:default/dev', { credentials: userCreds });
  });

  it('falls back to the configured domain when the catalog has no entity', async () => {
    const catalog = { getEntityByRef: jest.fn(async () => undefined) } as any;
    const r = new IdentityResolver({ userInfo: userInfoFor('user:development/guest'), auth, catalog, emailDomain: 'butlerlabs.dev', logger });
    await expect(r.resolveEmail(userCreds)).resolves.toBe('guest@butlerlabs.dev');
  });

  it('tolerates a failing catalog and still applies the domain', async () => {
    const catalog = { getEntityByRef: jest.fn(async () => { throw new Error('catalog down'); }) } as any;
    const r = new IdentityResolver({ userInfo: userInfoFor('user:default/dev'), auth, catalog, emailDomain: 'example.com', logger });
    await expect(r.resolveEmail(userCreds)).resolves.toBe('dev@example.com');
    expect(logger.warn).toHaveBeenCalled();
  });

  it('throws when neither the catalog nor a domain can resolve the user', async () => {
    const r = new IdentityResolver({ userInfo: userInfoFor('user:default/dev'), auth, logger });
    await expect(r.resolveEmail(userCreds)).rejects.toThrow(/cannot resolve an email/);
  });

  it('remembers an unresolvable user briefly and throws the typed error', async () => {
    const catalog = { getEntityByRef: jest.fn(async () => undefined) } as any;
    const r = new IdentityResolver({ userInfo: userInfoFor('user:default/dev'), auth, catalog, logger });
    await expect(r.resolveEmail(userCreds)).rejects.toBeInstanceOf(UnresolvableIdentityError);
    await expect(r.resolveEmail(userCreds)).rejects.toBeInstanceOf(UnresolvableIdentityError);
    expect(catalog.getEntityByRef).toHaveBeenCalledTimes(1);
  });

  it('does not cache a domain fallback produced by a catalog error', async () => {
    let fail = true;
    const catalog = { getEntityByRef: jest.fn(async () => { if (fail) throw new Error('down'); return { spec: { profile: { email: 'real@corp.example' } } }; }) } as any;
    const r = new IdentityResolver({ userInfo: userInfoFor('user:default/dev'), auth, catalog, emailDomain: 'fallback.example', logger });
    await expect(r.resolveEmail(userCreds)).resolves.toBe('dev@fallback.example');
    fail = false;
    await expect(r.resolveEmail(userCreds)).resolves.toBe('real@corp.example');
  });

  it('caches the resolved email per entity ref', async () => {
    const catalog = { getEntityByRef: jest.fn(async () => ({ spec: { profile: { email: 'dev@example.com' } } })) } as any;
    const r = new IdentityResolver({ userInfo: userInfoFor('user:default/dev'), auth, catalog, logger });
    await r.resolveEmail(userCreds);
    await r.resolveEmail(userCreds);
    expect(catalog.getEntityByRef).toHaveBeenCalledTimes(1);
  });

});
