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

import fetch from 'node-fetch';
import { LoggerService } from '@backstage/backend-plugin-api';

/**
 * AuthManager handles authentication to butler-server.
 *
 * It authenticates using the legacy admin login endpoint and manages
 * the JWT session token, automatically refreshing before expiry.
 */
export class AuthManager {
  private readonly baseUrl: string;
  private readonly username: string;
  private readonly password: string;
  private readonly logger: LoggerService;

  private token: string | null = null;
  private tokenExpiry: number = 0;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: {
    baseUrl: string;
    username: string;
    password: string;
    logger: LoggerService;
  }) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.username = options.username;
    this.password = options.password;
    this.logger = options.logger;
  }

  /**
   * Authenticates to butler-server via POST /api/auth/login/legacy.
   * Extracts the JWT from the butler_session Set-Cookie header.
   */
  async login(): Promise<void> {
    const loginUrl = `${this.baseUrl}/api/auth/login/legacy`;

    this.logger.info('Authenticating to butler-server', {
      url: loginUrl,
      username: this.username,
    });

    const response = await fetch(loginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: this.username,
        password: this.password,
      }),
      redirect: 'manual',
    });

    if (!response.ok) {
      const body = await response.text().catch(() => 'unknown');
      throw new Error(
        `butler-server login failed: ${response.status} ${response.statusText} - ${body}`,
      );
    }

    // Extract JWT from Set-Cookie header
    const setCookieHeaders = response.headers.raw()['set-cookie'];
    if (!setCookieHeaders) {
      throw new Error(
        'butler-server login response missing Set-Cookie header',
      );
    }

    let sessionToken: string | null = null;
    for (const cookie of setCookieHeaders) {
      const match = cookie.match(/butler_session=([^;]+)/);
      if (match) {
        sessionToken = match[1];
        break;
      }
    }

    if (!sessionToken) {
      throw new Error(
        'butler-server login response missing butler_session cookie',
      );
    }

    this.token = sessionToken;

    // Parse JWT expiry from the token payload (base64url-encoded middle segment)
    const expiry = this.parseTokenExpiry(sessionToken);
    if (expiry > 0) {
      this.tokenExpiry = expiry;
      this.scheduleRefresh();
    }

    this.logger.info('Authenticated to butler-server successfully');
  }

  /**
   * Returns the current JWT token.
   * If the token is missing or expired, triggers a fresh login.
   */
  async getToken(): Promise<string> {
    if (!this.token || this.isTokenExpired()) {
      await this.login();
    }
    return this.token!;
  }

  /**
   * Stops the automatic refresh timer. Call this on shutdown.
   */
  stop(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private isTokenExpired(): boolean {
    if (this.tokenExpiry === 0) {
      return false;
    }
    // Consider the token expired 60 seconds before actual expiry
    return Date.now() / 1000 >= this.tokenExpiry - 60;
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    if (this.tokenExpiry === 0) {
      return;
    }

    // Refresh 2 minutes before expiry, or in 30 seconds if that is sooner
    const nowSec = Date.now() / 1000;
    const refreshInSec = Math.max(this.tokenExpiry - nowSec - 120, 30);

    this.logger.info('Scheduling butler-server token refresh', {
      refreshInSeconds: Math.round(refreshInSec),
    });

    this.refreshTimer = setTimeout(async () => {
      try {
        await this.login();
      } catch (err) {
        this.logger.error('Failed to refresh butler-server token', {
          error: String(err),
        });
        // Retry in 30 seconds on failure
        this.refreshTimer = setTimeout(() => this.login(), 30_000);
      }
    }, refreshInSec * 1000);

    // Prevent the timer from keeping Node.js alive on shutdown
    if (this.refreshTimer && typeof this.refreshTimer === 'object' && 'unref' in this.refreshTimer) {
      this.refreshTimer.unref();
    }
  }

  /**
   * Parses the `exp` claim from a JWT without validating the signature.
   * Returns the expiry as a Unix timestamp in seconds, or 0 if unparseable.
   */
  private parseTokenExpiry(jwt: string): number {
    try {
      const parts = jwt.split('.');
      if (parts.length !== 3) {
        return 0;
      }
      // base64url decode the payload
      const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
      const claims = JSON.parse(payload);
      if (typeof claims.exp === 'number') {
        return claims.exp;
      }
    } catch {
      this.logger.warn('Failed to parse JWT expiry, refresh scheduling disabled');
    }
    return 0;
  }
}
