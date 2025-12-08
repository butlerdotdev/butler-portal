// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { createBackendModule } from '@backstage/backend-plugin-api';
import {
  authProvidersExtensionPoint,
  createOAuthProviderFactory,
} from '@backstage/plugin-auth-node';
import { googleAuthenticator } from '@backstage/plugin-auth-backend-module-google-provider';

/**
 * Custom Google auth module for Butler Portal.
 *
 * Issues Backstage tokens directly from the Google profile email
 * without requiring User entities in the catalog. The user entity ref
 * is derived from the email local part (e.g., abagan@butlerlabs.dev → user:default/abagan).
 */
export default createBackendModule({
  pluginId: 'auth',
  moduleId: 'butler-google-provider',
  register(reg) {
    reg.registerInit({
      deps: {
        providers: authProvidersExtensionPoint,
      },
      async init({ providers }) {
        providers.registerProvider({
          providerId: 'google',
          factory: createOAuthProviderFactory({
            authenticator: googleAuthenticator,
            async signInResolver(info, ctx) {
              const { profile } = info;

              if (!profile.email) {
                throw new Error(
                  'Google sign-in failed: no email in profile',
                );
              }

              const localPart = profile.email.split('@')[0];
              const userEntityRef = `user:default/${localPart}`;

              return ctx.issueToken({
                claims: {
                  sub: userEntityRef,
                  ent: [userEntityRef],
                },
              });
            },
          }),
        });
      },
    });
  },
});
