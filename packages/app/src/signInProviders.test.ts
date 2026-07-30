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

import { ConfigReader } from '@backstage/config';
import { buildSignInProviders } from './signInProviders';

// These tests pin the SignInPage providers list. Guest is the default
// card; every identity provider (Google, Microsoft, future OIDC) is
// opt-in, rendered only when its auth.providers.<key> subtree is wired.
// The load-bearing guard is that a plain config renders Guest only — no
// provider card whose backend route would 404.

const config = (data: unknown) => new ConfigReader(data as object);

const google = { production: { clientId: 'x', clientSecret: 'y' } };
const microsoft = {
  production: { clientId: 'x', clientSecret: 'y', tenantId: 'z' },
};
const ids = (ps: ReturnType<typeof buildSignInProviders>) =>
  ps.map(p => (typeof p === 'string' ? p : p.id));

describe('buildSignInProviders', () => {
  it('renders guest only when no identity provider is configured', () => {
    expect(ids(buildSignInProviders(config({})))).toEqual(['guest']);
  });

  it('renders guest + google only when auth.providers.google is configured', () => {
    const providers = buildSignInProviders(
      config({ auth: { providers: { google } } }),
    );
    expect(ids(providers)).toEqual(['guest', 'google-auth-provider']);
    expect(providers[1]).toMatchObject({ id: 'google-auth-provider', title: 'Google' });
  });

  it('renders guest + microsoft only when auth.providers.microsoft is configured', () => {
    const providers = buildSignInProviders(
      config({ auth: { providers: { microsoft } } }),
    );
    expect(ids(providers)).toEqual(['guest', 'microsoft-auth-provider']);
    expect(providers[1]).toMatchObject({ id: 'microsoft-auth-provider', title: 'Microsoft' });
  });

  it('renders guest + google + microsoft when both are configured', () => {
    const providers = buildSignInProviders(
      config({ auth: { providers: { google, microsoft } } }),
    );
    expect(ids(providers)).toEqual([
      'guest',
      'google-auth-provider',
      'microsoft-auth-provider',
    ]);
  });

  it('omits the guest card when signInPage.disableGuest is true', () => {
    const providers = buildSignInProviders(
      config({ signInPage: { disableGuest: true }, auth: { providers: { microsoft } } }),
    );
    expect(ids(providers)).toEqual(['microsoft-auth-provider']);
  });

  it('keeps guest and does not throw when signInPage is a legacy scalar', () => {
    // Older adopters set `signInPage: <string>`, which is unread; it must
    // neither throw nor be mistaken for the disableGuest opt-out.
    expect(ids(buildSignInProviders(config({ signInPage: 'microsoft' })))).toEqual([
      'guest',
    ]);
  });
});
