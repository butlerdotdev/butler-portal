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

import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import { WebSocketServer } from 'ws';
import { createButlerUpgradeHandler } from '../router';

// Behavioral pin for the upgrade-handler guard. The HTTP credentialsBarrier
// is the primary auth gate for plugin routes today; this guard is the
// defense-in-depth check that authenticates raw WebSocket upgrades on
// /api/butler/ws/* directly. Tests target the extracted factory so the
// auth/path/payload contract is locked regardless of where the listener
// gets attached.

describe('createButlerUpgradeHandler', () => {
  const silentLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    child: () => silentLogger,
  } as any;

  function mockSocket() {
    const state = { writes: [] as string[], ended: false, destroyed: false };
    const socket = {
      get writes() {
        return state.writes;
      },
      get ended() {
        return state.ended;
      },
      get destroyed() {
        return state.destroyed;
      },
      end: (chunk?: any) => {
        if (typeof chunk === 'string') {
          state.writes.push(chunk);
        }
        state.ended = true;
        return socket;
      },
      destroy: () => {
        state.destroyed = true;
      },
    };
    return socket as unknown as Duplex & {
      writes: string[];
      ended: boolean;
      destroyed: boolean;
    };
  }

  function mockRequest(url: string): IncomingMessage {
    return { url, headers: {} } as any;
  }

  function build(opts: {
    credentialsResolves: boolean;
    handleUpgradeSpy?: jest.Mock;
  }) {
    const httpAuth = {
      credentials: jest.fn(() =>
        opts.credentialsResolves
          ? Promise.resolve({ principal: { type: 'user' } } as any)
          : Promise.reject(new Error('unauthenticated')),
      ),
    } as any;
    const handleUpgradeSpy =
      opts.handleUpgradeSpy ??
      jest.fn((_req, _socket, _head, cb) => {
        cb({} as any);
      });
    const wss = {
      handleUpgrade: handleUpgradeSpy,
    } as unknown as WebSocketServer;
    const authManager = {
      getToken: jest.fn(() => Promise.resolve('test-token')),
    } as any;
    const handler = createButlerUpgradeHandler({
      httpAuth,
      wss,
      targetUrl: 'http://butler-server.test',
      authManager,
      logger: silentLogger,
    });
    return { handler, httpAuth, handleUpgradeSpy, authManager };
  }

  it('rejects unauthenticated upgrade on /api/butler/ws/ with 401 and does not hand off to wss', async () => {
    const { handler, httpAuth, handleUpgradeSpy } = build({
      credentialsResolves: false,
    });
    const socket = mockSocket();

    handler(mockRequest('/api/butler/ws/clusters'), socket, Buffer.alloc(0));
    // Drain the rejected credentials() promise + the .catch() chain.
    await Promise.resolve();
    await Promise.resolve();

    expect(httpAuth.credentials).toHaveBeenCalledTimes(1);
    expect(handleUpgradeSpy).not.toHaveBeenCalled();
    expect(socket.ended).toBe(true);
    const payload = socket.writes.join('');
    expect(payload).toContain('HTTP/1.1 401 Unauthorized');
    expect(payload).toContain('WWW-Authenticate: Bearer');
    expect(payload).toContain('Connection: close');
    expect(payload).toContain('Content-Length: 0');
  });

  it('hands an authenticated upgrade off to wss.handleUpgrade with the original request', async () => {
    const handleUpgradeSpy = jest.fn((_req, _socket, _head, cb) => {
      // Synthesize a fake clientWs to satisfy the relay-open call site.
      cb({
        on: () => {},
        readyState: 0,
        close: () => {},
        send: () => {},
      } as any);
    });
    const { handler, httpAuth } = build({
      credentialsResolves: true,
      handleUpgradeSpy,
    });
    const socket = mockSocket();
    const request = mockRequest('/api/butler/ws/clusters');

    handler(request, socket, Buffer.alloc(0));
    await Promise.resolve();
    await Promise.resolve();

    expect(httpAuth.credentials).toHaveBeenCalledTimes(1);
    expect(handleUpgradeSpy).toHaveBeenCalledTimes(1);
    expect(handleUpgradeSpy.mock.calls[0][0]).toBe(request);
    expect(socket.ended).toBe(false);
  });

  it('leaves non-butler upgrade paths untouched so other listeners (webpack HMR, etc.) can handle them', async () => {
    const { handler, httpAuth, handleUpgradeSpy } = build({
      credentialsResolves: true,
    });
    const socket = mockSocket();

    handler(mockRequest('/sockjs-node/xyz'), socket, Buffer.alloc(0));
    handler(mockRequest('/api/catalog/ws/entities'), socket, Buffer.alloc(0));
    handler(mockRequest('/'), socket, Buffer.alloc(0));
    await Promise.resolve();

    expect(httpAuth.credentials).not.toHaveBeenCalled();
    expect(handleUpgradeSpy).not.toHaveBeenCalled();
    expect(socket.ended).toBe(false);
    expect(socket.destroyed).toBe(false);
    expect(socket.writes).toHaveLength(0);
  });

  it('treats a request with no url as a non-match (defensive default)', async () => {
    const { handler, httpAuth, handleUpgradeSpy } = build({
      credentialsResolves: true,
    });
    const socket = mockSocket();
    handler({ headers: {} } as any, socket, Buffer.alloc(0));
    await Promise.resolve();

    expect(httpAuth.credentials).not.toHaveBeenCalled();
    expect(handleUpgradeSpy).not.toHaveBeenCalled();
    expect(socket.ended).toBe(false);
  });
});

describe('createButlerUpgradeHandler credential options', () => {
  it('accepts limited-access (cookie) credentials on the upgrade request', async () => {
    const credentials = jest.fn(async () => ({ principal: { type: 'user' } }));
    const handler = createButlerUpgradeHandler({
      httpAuth: { credentials } as any,
      wss: { handleUpgrade: jest.fn() } as any,
      targetUrl: 'http://butler',
      authManager: { getToken: async () => 't' } as any,
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      } as any,
    });
    const socket = { end: jest.fn() } as any;
    handler(
      { url: '/api/butler/ws/clusters', headers: {} } as any,
      socket,
      Buffer.alloc(0),
    );
    await new Promise(r => setTimeout(r, 0));
    expect(credentials).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ allowLimitedAccess: true }),
    );
  });
});

describe('createButlerUpgradeHandler identity', () => {
  it('consults the provided resolver when the signer is active', async () => {
    const resolveEmail = jest.fn(async () => 'dev@example.com');
    const handleUpgrade = jest.fn();
    const handler = createButlerUpgradeHandler({
      httpAuth: {
        credentials: jest.fn(async () => ({ principal: { type: 'user' } })),
      } as any,
      wss: { handleUpgrade } as any,
      targetUrl: 'http://butler',
      authManager: { getToken: async () => 't' } as any,
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      } as any,
      portalSigner: { sign: () => 'proof' } as any,
      identityResolver: { resolveEmail } as any,
    });
    handler(
      { url: '/api/butler/ws/clusters', headers: {} } as any,
      { end: jest.fn() } as any,
      Buffer.alloc(0),
    );
    await new Promise(r => setTimeout(r, 0));
    expect(resolveEmail).toHaveBeenCalled();
    expect(handleUpgrade).toHaveBeenCalled();
  });
});
