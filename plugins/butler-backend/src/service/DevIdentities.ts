// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { Request } from 'express';
import type { Config } from '@backstage/config';
import type { LoggerService } from '@backstage/backend-plugin-api';

/** Cookie a local review session carries to name the identity it acts as. */
export const DEV_IDENTITY_COOKIE = 'butler-dev-identity';
/** Header form, for scripted callers that cannot hold a cookie jar. */
export const DEV_IDENTITY_HEADER = 'x-butler-dev-identity';

export interface DevIdentity {
  /** Stable key used in URLs and by the review harness. */
  key: string;
  /** butler-server user this key acts as. */
  email: string;
  /** Human label for the launcher. */
  label?: string;
}

/**
 * Local review only: lets five browser sessions act as five different
 * butler-server users against one running portal.
 *
 * This replaces the Backstage sign-in step and nothing else. The email it
 * returns flows into the same resolveCallerEmail path a real session uses,
 * so the portal still mints a proof for that user and butler-server still
 * makes every authorization decision. It cannot grant a capability the
 * chosen user does not already have.
 *
 * It is inert unless the process is outside production AND the operator
 * opted in through config, and it will only ever return an email from the
 * configured list.
 */
export class DevIdentities {
  private readonly byKey: Map<string, DevIdentity>;

  private constructor(identities: DevIdentity[]) {
    this.byKey = new Map(identities.map(i => [i.key, i]));
  }

  /**
   * Returns null unless dev auth is both permitted by the environment and
   * requested by config. A production process never gets an instance, even
   * if the config asks for one.
   */
  static load(opts: {
    config: Config;
    logger: LoggerService;
    nodeEnv?: string;
  }): DevIdentities | null {
    const { config, logger } = opts;
    const nodeEnv = opts.nodeEnv ?? process.env.NODE_ENV;
    const requested =
      config.getOptionalBoolean('butler.devAuth.enabled') ?? false;
    if (!requested) {
      return null;
    }
    if (nodeEnv === 'production') {
      logger.error(
        'butler.devAuth.enabled is set in a production process. The local ' +
          'role harness is disabled: dev identities never load outside ' +
          'development.',
      );
      return null;
    }
    const configured =
      config.getOptionalConfigArray('butler.devAuth.identities') ?? [];
    const identities: DevIdentity[] = configured.map(entry => ({
      key: entry.getString('key'),
      email: entry.getString('email'),
      label: entry.getOptionalString('label'),
    }));
    if (identities.length === 0) {
      logger.warn(
        'butler.devAuth.enabled is set but no identities are configured; ' +
          'the local role harness has nothing to act as.',
      );
      return null;
    }
    logger.warn(
      `LOCAL ROLE HARNESS ACTIVE: ${identities.length} dev identities can be ` +
        'selected per session. Never enable butler.devAuth outside local ' +
        'development.',
    );
    return new DevIdentities(identities);
  }

  /** Identities offered to the launcher, without leaking anything else. */
  list(): DevIdentity[] {
    return [...this.byKey.values()];
  }

  get(key: string): DevIdentity | undefined {
    return this.byKey.get(key);
  }

  /**
   * The email this request acts as, or undefined to fall through to the
   * real Backstage identity. An unknown key falls through rather than
   * failing, so a stale cookie cannot lock a session out.
   */
  emailFor(req: Request): string | undefined {
    const header = req.headers[DEV_IDENTITY_HEADER];
    const fromHeader = Array.isArray(header) ? header[0] : header;
    const key = fromHeader || readCookie(req, DEV_IDENTITY_COOKIE);
    if (!key) return undefined;
    return this.byKey.get(key)?.email;
  }
}

/** Express is not configured with a cookie parser on this router. */
function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}
