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
 * Resolves the signed-in user against the Backstage catalog to pick up
 * group memberships (ownershipEntityRefs). Falls back to a bare token
 * if the user entity doesn't exist in the catalog yet.
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

              // Try catalog lookup first — resolves group memberships
              // into the token's ownershipEntityRefs (ent claim).
              try {
                return await ctx.signInWithCatalogUser({
                  entityRef: { name: localPart },
                });
              } catch {
                // User not in catalog — issue token without group memberships
                const userEntityRef = `user:default/${localPart}`;
                return ctx.issueToken({
                  claims: {
                    sub: userEntityRef,
                    ent: [userEntityRef],
                  },
                });
              }
            },
          }),
        });
      },
    });
  },
});
