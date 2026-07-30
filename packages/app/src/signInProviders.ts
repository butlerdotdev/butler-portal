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
// regression guard can be tested with a ConfigReader, matching the
// existing pure-config-function test pattern used elsewhere in this
// distribution (see packages/backend/src/butlerLabsPluginGates.ts).
//
// Guest is the default sign-in affordance: it renders unless an adopter
// opts out with `signInPage.disableGuest: true` (e.g. an SSO-only
// production deployment). Every identity-provider card (Google,
// Microsoft, future OIDC/Okta) is opt-in: it renders only when the
// adopter has the corresponding `auth.providers.<key>` subtree wired in
// app-config, which also keeps the sign-in page from showing a card whose
// backend route 404s. So the default render is Guest only, and each
// provider is added the same conditional way.
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

  const providers: Array<'guest' | SignInProviderConfig> = [];

  // Guest renders by default. Read the opt-out via getOptional (raw value)
  // so a legacy scalar `signInPage` value can never throw a type error.
  const signInPage = config.getOptional('signInPage');
  const disableGuest =
    typeof signInPage === 'object' &&
    signInPage !== null &&
    (signInPage as { disableGuest?: unknown }).disableGuest === true;
  if (!disableGuest) {
    providers.push('guest');
  }

  // Opt-in identity providers: a card renders only when its
  // auth.providers.<key> subtree is present in app-config.
  if (config.getOptionalConfig('auth.providers.google')) {
    providers.push(googleProvider);
  }
  if (config.getOptionalConfig('auth.providers.microsoft')) {
    providers.push(microsoftProvider);
  }

  return providers;
}
