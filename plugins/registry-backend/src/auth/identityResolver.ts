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

import { Request } from 'express';
import {
  HttpAuthService,
  UserInfoService,
  AuthService,
} from '@backstage/backend-plugin-api';

export interface ResolvedIdentity {
  email: string;
  userRef: string;
  ownershipRefs: string[];
}

/**
 * Resolves the Backstage user identity from request credentials.
 * Follows the same pattern as butler-backend's resolveUserEmail.
 */
export async function resolveIdentity(
  req: Request,
  httpAuth: HttpAuthService,
  userInfo: UserInfoService,
  auth: AuthService,
): Promise<ResolvedIdentity | null> {
  try {
    const credentials = await httpAuth.credentials(req, {
      allow: ['user'],
    });

    if (auth.isPrincipal(credentials, 'user')) {
      const info = await userInfo.getUserInfo(credentials);
      const entityRef = info.userEntityRef;
      const name = entityRef.split('/').pop();

      if (!name) return null;

      const email = name.includes('@') ? name : `${name}@butlerlabs.dev`;
      return {
        email,
        userRef: entityRef,
        ownershipRefs: info.ownershipEntityRefs ?? [],
      };
    }
  } catch {
    // Not authenticated or guest user
  }
  return null;
}
