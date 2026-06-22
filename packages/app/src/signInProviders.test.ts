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

// These tests pin the SignInPage providers list. The without-config
// case is the load-bearing regression guard for every existing
// butler-portal adopter: when no optional provider is configured the
// login screen must render exactly Guest + Google, unchanged from
// before optional providers were introduced.

const config = (data: unknown) => new ConfigReader(data as object);

describe('buildSignInProviders', () => {
  it('renders guest + google only when no optional provider is configured', () => {
    const providers = buildSignInProviders(config({}));
    expect(providers).toHaveLength(2);
    expect(providers[0]).toBe('guest');
    expect(providers[1]).toMatchObject({
      id: 'google-auth-provider',
      title: 'Google',
    });
  });

  it('renders guest + google + microsoft when auth.providers.microsoft is configured', () => {
    const providers = buildSignInProviders(
      config({
        auth: {
          providers: {
            microsoft: {
              production: {
                clientId: 'test-id',
                clientSecret: 'test-secret',
                tenantId: 'test-tenant',
              },
            },
          },
        },
      }),
    );
    expect(providers).toHaveLength(3);
    expect(providers[0]).toBe('guest');
    expect(providers[1]).toMatchObject({
      id: 'google-auth-provider',
      title: 'Google',
    });
    expect(providers[2]).toMatchObject({
      id: 'microsoft-auth-provider',
      title: 'Microsoft',
    });
  });

  it('does not render the microsoft card when only an unrelated auth provider is configured', () => {
    const providers = buildSignInProviders(
      config({
        auth: {
          providers: {
            google: { production: { clientId: 'x', clientSecret: 'y' } },
          },
        },
      }),
    );
    expect(providers).toHaveLength(2);
    expect(
      providers.find(
        p => typeof p !== 'string' && p.id === 'microsoft-auth-provider',
      ),
    ).toBeUndefined();
  });
});
