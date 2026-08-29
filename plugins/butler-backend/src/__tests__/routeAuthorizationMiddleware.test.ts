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

import { AuthorizeResult } from '@backstage/plugin-permission-common';
import { createRouteAuthorizationMiddleware } from '../router';

const logger = {
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  child: () => logger,
} as any;

function run(opts: {
  principalType: 'user' | 'service' | 'reject';
  result?: AuthorizeResult;
  method?: string;
  path?: string;
  allowUnmapped?: boolean;
  authorizeError?: Error;
}) {
  const credentials = { principal: { type: opts.principalType } } as any;
  const httpAuth = {
    credentials: jest.fn(async () => {
      if (opts.principalType === 'reject') throw new Error('no credentials');
      return credentials;
    }),
  } as any;
  const permissions = {
    authorize: jest.fn(async () => {
      if (opts.authorizeError) throw opts.authorizeError;
      return [{ result: opts.result ?? AuthorizeResult.ALLOW }];
    }),
  } as any;
  const mw = createRouteAuthorizationMiddleware({
    httpAuth,
    permissions,
    logger,
    allowUnmappedRoutes: opts.allowUnmapped ?? false,
  });
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  const next = jest.fn();
  return new Promise<{ res: any; next: jest.Mock; permissions: any }>(
    resolve => {
      mw(
        { method: opts.method ?? 'GET', path: opts.path ?? '/clusters' } as any,
        res,
        (...args: unknown[]) => {
          next(...args);
          resolve({ res, next, permissions });
        },
      );
      // Deny paths never call next; settle on the next tick instead.
      setTimeout(() => resolve({ res, next, permissions }), 20);
    },
  );
}

describe('createRouteAuthorizationMiddleware', () => {
  it('forwards when the policy allows', async () => {
    const { next, res } = await run({ principalType: 'user' });
    expect(next).toHaveBeenCalledWith();
    expect(res.body).toBeUndefined();
  });

  it('refuses with the permission name when the policy denies', async () => {
    const { next, res } = await run({
      principalType: 'user',
      result: AuthorizeResult.DENY,
      method: 'DELETE',
      path: '/clusters/ns/c1',
    });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({
      error: 'forbidden',
      permission: 'butler.cluster.delete',
    });
  });

  it('refuses unmapped routes by default and forwards them when allowed', async () => {
    const denied = await run({
      principalType: 'user',
      path: '/auth/login/legacy',
      method: 'POST',
    });
    expect(denied.res.statusCode).toBe(403);
    expect(denied.res.body.reason).toMatch(/not classified/);
    expect(denied.permissions.authorize).not.toHaveBeenCalled();
    const allowed = await run({
      principalType: 'user',
      path: '/auth/login/legacy',
      method: 'POST',
      allowUnmapped: true,
    });
    expect(allowed.next).toHaveBeenCalledWith();
  });

  it('refuses service principals explicitly', async () => {
    const { res, permissions } = await run({ principalType: 'service' });
    expect(res.statusCode).toBe(403);
    expect(res.body.reason).toMatch(/user principals/);
    expect(permissions.authorize).not.toHaveBeenCalled();
  });

  it('passes authentication and policy failures to next(err)', async () => {
    const a = await run({ principalType: 'reject' });
    expect(a.next).toHaveBeenCalledWith(expect.any(Error));
    const b = await run({
      principalType: 'user',
      authorizeError: new Error('rbac down'),
    });
    expect(b.next).toHaveBeenCalledWith(expect.any(Error));
    expect(b.res.body).toBeUndefined();
  });
});
