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

import { Config } from '@backstage/config';
import type { SignInProviderConfig } from '@backstage/core-components';
import {
  googleAuthApiRef,
  microsoftAuthApiRef,
} from '@backstage/core-plugin-api';

// Pure builder for the SignInPage providers array. Extracted so the
// regression guard (no-microsoft-config adopters render Guest + Google
// only, unchanged) can be tested with a ConfigReader, matching the
// existing pure-config-function test pattern used elsewhere in this
// distribution (see packages/backend/src/butlerLabsPluginGates.ts).
//
// Optional provider cards (Microsoft today; future OIDC, Okta, etc.)
// follow the same conditional shape: card renders only when the
// adopter has the corresponding auth.providers.<key> subtree wired in
// app-config. Default render is always Guest + Google.
export function buildSignInProviders(
  config: Config,
): Array<'guest' | SignInProviderConfig> {
  const googleProvider: SignInProviderConfig = {
    id: 'google-auth-provider',
    title: 'Google',
    message: 'Sign in with your Google account',
    apiRef: googleAuthApiRef,
  };
  const microsoftProvider: SignInProviderConfig = {
    id: 'microsoft-auth-provider',
    title: 'Microsoft',
    message: 'Sign in with your Microsoft Entra account',
    apiRef: microsoftAuthApiRef,
  };

  const providers: Array<'guest' | SignInProviderConfig> = [
    'guest',
    googleProvider,
  ];

  // Render the Microsoft card only when the adopter wired the microsoft
  // auth provider in app-config. Keeps the default sign-in page from
  // showing a card whose backend route 404s.
  if (config.getOptionalConfig('auth.providers.microsoft')) {
    providers.push(microsoftProvider);
  }

  return providers;
}
