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
// Failures are remembered briefly so an unmapped user polling every few
// seconds does not cost a catalog round trip and a warning per request.
const FAILURE_TTL_MS = 60 * 1000;

/**
 * Thrown when an authenticated user has no resolvable butler-server email.
 */
export class UnresolvableIdentityError extends Error {
  readonly entityRef: string;
  constructor(entityRef: string) {
    super(
      `cannot resolve an email for ${entityRef}: no catalog User entity with spec.profile.email and butler.identity.emailDomain is not configured`,
    );
    this.name = 'UnresolvableIdentityError';
    this.entityRef = entityRef;
  }
}

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
  private readonly cache = new Map<
    string,
    { email?: string; error?: Error; cacheable: boolean; expires: number }
  >();

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
      if (cached.error) throw cached.error;
      return cached.email;
    }

    try {
      const { email, cacheable } = await this.lookup(entityRef, credentials);
      if (cacheable) {
        this.cache.set(entityRef, {
          email,
          cacheable,
          expires: Date.now() + CACHE_TTL_MS,
        });
      }
      return email;
    } catch (error) {
      if (error instanceof UnresolvableIdentityError) {
        this.logger.warn(
          'Backstage user has no resolvable butler-server email',
          {
            entityRef,
          },
        );
        this.cache.set(entityRef, {
          error,
          cacheable: true,
          expires: Date.now() + FAILURE_TTL_MS,
        });
      }
      throw error;
    }
  }

  // cacheable is false when the answer came from the domain fallback
  // after a catalog error: the catalog might have given a different
  // email, so that answer must not stick for five minutes.
  private async lookup(
    entityRef: string,
    credentials: BackstageCredentials,
  ): Promise<{ email: string; cacheable: boolean }> {
    const name = entityRef.split('/').pop() ?? '';
    if (name.includes('@')) {
      return { email: name.toLowerCase(), cacheable: true };
    }

    let catalogFailed = false;
    if (this.catalog) {
      try {
        const entity = await this.catalog.getEntityByRef(entityRef, {
          credentials,
        });
        const profileEmail = (
          entity?.spec as { profile?: { email?: string } } | undefined
        )?.profile?.email;
        if (profileEmail) {
          return { email: profileEmail.toLowerCase(), cacheable: true };
        }
      } catch (err) {
        catalogFailed = true;
        this.logger.warn('Catalog lookup for user entity failed', {
          entityRef,
          error: String(err),
        });
      }
    }

    if (this.emailDomain && name) {
      return {
        email: `${name}@${this.emailDomain}`.toLowerCase(),
        cacheable: !catalogFailed,
      };
    }

    // A catalog outage with no domain fallback is not a verdict about the
    // user; surface it without remembering it so the next request retries.
    if (catalogFailed) {
      throw new Error(
        `catalog lookup failed for ${entityRef} and no email domain is configured`,
      );
    }
    throw new UnresolvableIdentityError(entityRef);
  }
}
