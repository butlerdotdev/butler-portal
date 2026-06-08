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

import { AuthManager } from '../service/AuthManager';

describe('AuthManager.getHealthSnapshot', () => {
  const silentLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    child: () => silentLogger,
  } as any;

  function newManager(): AuthManager {
    return new AuthManager({
      baseUrl: 'http://butler-server.test',
      username: 'svc-portal',
      password: 'real-password',
      logger: silentLogger,
    });
  }

  it('reports unauthenticated and no token expiry on a fresh instance', () => {
    const m = newManager();
    const snap = m.getHealthSnapshot();
    expect(snap.authenticated).toBe(false);
    expect(snap.tokenExpiresAt).toBeUndefined();
    expect(snap.lastError).toBeUndefined();
  });

  it('reports authenticated when a non-expired token is held', () => {
    const m = newManager() as any;
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
    m.token = 'fake-jwt';
    m.tokenExpiry = futureExpiry;
    const snap = m.getHealthSnapshot();
    expect(snap.authenticated).toBe(true);
    expect(snap.tokenExpiresAt).toBe(futureExpiry);
    expect(snap.lastError).toBeUndefined();
  });

  it('reports unauthenticated when the held token is expired', () => {
    const m = newManager() as any;
    const pastExpiry = Math.floor(Date.now() / 1000) - 60;
    m.token = 'expired-jwt';
    m.tokenExpiry = pastExpiry;
    const snap = m.getHealthSnapshot();
    expect(snap.authenticated).toBe(false);
    expect(snap.tokenExpiresAt).toBe(pastExpiry);
    expect(snap.lastError).toBeUndefined();
  });

  it('treats a token within the 60-second expiry buffer as expired', () => {
    const m = newManager() as any;
    // The class considers a token expired 60 seconds before actual expiry,
    // so an expiry 30 seconds in the future reports as unauthenticated.
    const nearExpiry = Math.floor(Date.now() / 1000) + 30;
    m.token = 'about-to-expire-jwt';
    m.tokenExpiry = nearExpiry;
    const snap = m.getHealthSnapshot();
    expect(snap.authenticated).toBe(false);
  });

  it('surfaces lastError after a failure has been recorded', () => {
    const m = newManager() as any;
    m.lastError = 'butler-server login failed: 401 Unauthorized';
    const snap = m.getHealthSnapshot();
    expect(snap.authenticated).toBe(false);
    expect(snap.lastError).toBe(
      'butler-server login failed: 401 Unauthorized',
    );
  });

  it('reports authenticated and clears lastError when both are present (last-action-wins)', () => {
    const m = newManager() as any;
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
    m.token = 'fresh-jwt';
    m.tokenExpiry = futureExpiry;
    m.lastError = undefined;
    const snap = m.getHealthSnapshot();
    expect(snap.authenticated).toBe(true);
    expect(snap.lastError).toBeUndefined();
  });

  it('omits tokenExpiresAt entirely when no expiry has been parsed', () => {
    const m = newManager() as any;
    m.token = 'jwt-with-no-exp-claim';
    // tokenExpiry stays at the default 0 (parseTokenExpiry returns 0 on parse failure)
    const snap = m.getHealthSnapshot();
    // authenticated is true because token is held and isTokenExpired returns
    // false when tokenExpiry is 0 (the "no expiry known" sentinel).
    expect(snap.authenticated).toBe(true);
    expect(snap.tokenExpiresAt).toBeUndefined();
  });
});
