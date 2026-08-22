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

import {
  AuthService,
  BackstageCredentials,
  LoggerService,
  UserInfoService,
} from '@backstage/backend-plugin-api';
import { CatalogService } from '@backstage/plugin-catalog-node';

const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Resolves the butler-server identity (an email) for a Backstage caller.
 *
 * Order: the user entity ref already carries an email; otherwise the
 * catalog User entity's spec.profile.email; otherwise the configured
 * butler.identity.emailDomain appended to the entity name. With none of
 * those the caller is unresolvable and the request must not be forwarded
 * under any identity, so resolveEmail throws.
 *
 * Service principals and unauthenticated callers resolve to undefined;
 * the proxy decides what that means per route.
 */
export class IdentityResolver {
  private readonly userInfo: UserInfoService;
  private readonly auth: AuthService;
  private readonly catalog?: CatalogService;
  private readonly emailDomain?: string;
  private readonly logger: LoggerService;
  private readonly cache = new Map<string, { email: string; expires: number }>();

  constructor(opts: {
    userInfo: UserInfoService;
    auth: AuthService;
    catalog?: CatalogService;
    emailDomain?: string;
    logger: LoggerService;
  }) {
    this.userInfo = opts.userInfo;
    this.auth = opts.auth;
    this.catalog = opts.catalog;
    this.emailDomain = opts.emailDomain?.trim() || undefined;
    this.logger = opts.logger;
  }

  async resolveEmail(
    credentials: BackstageCredentials,
  ): Promise<string | undefined> {
    if (!this.auth.isPrincipal(credentials, 'user')) {
      return undefined;
    }
    const info = await this.userInfo.getUserInfo(credentials);
    const entityRef = info.userEntityRef;

    const cached = this.cache.get(entityRef);
    if (cached && cached.expires > Date.now()) {
      return cached.email;
    }

    const email = await this.lookup(entityRef, credentials);
    this.cache.set(entityRef, { email, expires: Date.now() + CACHE_TTL_MS });
    return email;
  }

  private async lookup(
    entityRef: string,
    credentials: BackstageCredentials,
  ): Promise<string> {
    const name = entityRef.split('/').pop() ?? '';
    if (name.includes('@')) {
      return name.toLowerCase();
    }

    if (this.catalog) {
      try {
        const entity = await this.catalog.getEntityByRef(entityRef, {
          credentials,
        });
        const profileEmail = (entity?.spec as { profile?: { email?: string } } | undefined)
          ?.profile?.email;
        if (profileEmail) {
          return profileEmail.toLowerCase();
        }
      } catch (err) {
        this.logger.warn('Catalog lookup for user entity failed', {
          entityRef,
          error: String(err),
        });
      }
    }

    if (this.emailDomain && name) {
      return `${name}@${this.emailDomain}`.toLowerCase();
    }

    throw new Error(
      `cannot resolve an email for ${entityRef}: no catalog User entity with spec.profile.email and butler.identity.emailDomain is not configured`,
    );
  }
}
