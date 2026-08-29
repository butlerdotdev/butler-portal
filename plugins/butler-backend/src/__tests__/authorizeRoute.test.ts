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
import { authorizeRoute } from '../router';

const credentials = { $$type: '@backstage/BackstageCredentials' } as any;

function permissionsAnswering(result: AuthorizeResult) {
  const authorize = jest.fn(async () => [{ result }]);
  return { service: { authorize } as any, authorize };
}

describe('authorizeRoute', () => {
  it('allows when the policy allows the mapped permission', async () => {
    const { service, authorize } = permissionsAnswering(AuthorizeResult.ALLOW);
    const decision = await authorizeRoute({
      permissions: service,
      credentials,
      method: 'GET',
      path: '/clusters/ns/c1',
    });
    expect(decision).toEqual({ kind: 'allow' });
    expect(authorize).toHaveBeenCalledWith(
      [
        {
          permission: expect.objectContaining({ name: 'butler.cluster.read' }),
        },
      ],
      { credentials },
    );
  });

  it('denies with the permission name when the policy denies', async () => {
    const { service } = permissionsAnswering(AuthorizeResult.DENY);
    const decision = await authorizeRoute({
      permissions: service,
      credentials,
      method: 'DELETE',
      path: '/clusters/ns/c1',
    });
    expect(decision).toEqual({
      kind: 'deny',
      permission: 'butler.cluster.delete',
    });
  });

  it('reports unmapped routes without consulting the policy', async () => {
    const { service, authorize } = permissionsAnswering(AuthorizeResult.ALLOW);
    const decision = await authorizeRoute({
      permissions: service,
      credentials,
      method: 'POST',
      path: '/auth/login/legacy',
    });
    expect(decision).toEqual({ kind: 'unmapped' });
    expect(authorize).not.toHaveBeenCalled();
  });

  it('maps WebSocket upgrades separately from HTTP methods', async () => {
    const { service, authorize } = permissionsAnswering(AuthorizeResult.ALLOW);
    await authorizeRoute({
      permissions: service,
      credentials,
      method: 'WS',
      path: '/ws/terminal/tenant/ns/c1',
    });
    expect(authorize).toHaveBeenCalledWith(
      [
        {
          permission: expect.objectContaining({
            name: 'butler.cluster.terminal',
          }),
        },
      ],
      { credentials },
    );
  });
});
