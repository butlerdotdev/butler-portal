---
sidebar_position: 1
sidebar_label: Authorization
---

# Authorization

How a plugin declares and enforces its own permissions inside
butler-portal.

Read [Architecture: Permissions](../architecture/permissions.md) first
for the framework overview. This page is the plugin-author contract:
what you write in your plugin so the adopter's RBAC policy can gate
your surface.

## Contract at a glance

1. Pick a permission-name prefix for your plugin. End it with a
   separator so it cannot accidentally collide (`myplugin.` not
   `myplugin`).
2. Declare your permissions with
   `createPermission({ name: 'myplugin.<resource>.<action>', attributes: { action: '...' } })`.
3. In each route you want to gate, resolve credentials via `httpAuth`,
   call `permissions.authorize()`, and 403 on non-ALLOW.
4. Tell adopters to list your plugin ID in
   `permission.rbac.pluginsWithPermission`. Without it, your
   `authorize()` calls silently pass through — no boot warning, no
   audit trail, no signal.
5. Ship a `PERMISSIONS.md` in your plugin repo listing every
   permission, what surface it gates, and the shipped default role
   that grants it.

Nothing in butler-portal core changes when you add or modify a
plugin's permissions. RBAC handles evaluation centrally.

## Minimal example

Two files inside a plugin at `my-plugin/backend/src/`:

`permissions.ts` (declarations):

```ts
import { createPermission } from '@backstage/plugin-permission-common';

export const myPluginThingReadPermission = createPermission({
  name: 'myplugin.thing.read',
  attributes: { action: 'read' },
});

export const myPluginThingWritePermission = createPermission({
  name: 'myplugin.thing.write',
  attributes: { action: 'update' },
});
```

`router.ts` (enforcement at request time):

```ts
import express from 'express';
import Router from 'express-promise-router';
import {
  HttpAuthService,
  LoggerService,
  PermissionsService,
} from '@backstage/backend-plugin-api';
import {
  AuthorizeResult,
  BasicPermission,
} from '@backstage/plugin-permission-common';
import { NotAllowedError } from '@backstage/errors';
import {
  myPluginThingWritePermission,
} from '../permissions';

type Deps = {
  logger: LoggerService;
  httpAuth: HttpAuthService;
  permissions: PermissionsService;
};

async function requirePermission(
  req: express.Request,
  permission: BasicPermission,
  permissions: PermissionsService,
  httpAuth: HttpAuthService,
): Promise<void> {
  const credentials = await httpAuth.credentials(req);
  const [decision] = await permissions.authorize(
    [{ permission }],
    { credentials },
  );
  if (decision.result !== AuthorizeResult.ALLOW) {
    throw new NotAllowedError(`Permission denied: ${permission.name}`);
  }
}

export async function createRouter(deps: Deps): Promise<express.Router> {
  const { httpAuth, permissions } = deps;
  const router = Router();

  router.post('/things/:id', async (req, res, next) => {
    try {
      await requirePermission(
        req,
        myPluginThingWritePermission,
        permissions,
        httpAuth,
      );
      // ... write
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
```

`module.ts` (thread `permissions` into the router):

```ts
import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { createRouter } from './routes/router';

export const myPlugin = createBackendPlugin({
  pluginId: 'my-plugin',
  register(env) {
    env.registerInit({
      deps: {
        logger: coreServices.logger,
        httpRouter: coreServices.httpRouter,
        httpAuth: coreServices.httpAuth,
        permissions: coreServices.permissions,
      },
      async init({ logger, httpRouter, httpAuth, permissions }) {
        const router = await createRouter({ logger, httpAuth, permissions });
        httpRouter.use(router);
      },
    });
  },
});
```

`NotAllowedError` from `@backstage/errors` serializes as HTTP 403 by
default when thrown from an Express handler.

## Adopter configuration

Two chart-values entries are required for your plugin's permissions
to be evaluated. Document both in your plugin's `PERMISSIONS.md`.

**Register the plugin with RBAC** so `authorize()` calls are
evaluated instead of passing through:

```yaml
permission:
  enabled: true
  rbac:
    pluginsWithPermission:
      - catalog
      - scaffolder
      - permission
      - my-plugin        # your plugin ID
```

**Bind the permission to a role** via the policy CSV or the RBAC
admin UI:

```yaml
permission:
  rbac:
    policy:
      csv: |
        p, role:default/portal-privileged, myplugin.thing.write, update, allow
        g, group:default/portal-admins, role:default/portal-privileged
```

The `p, ...` row grants the permission to a role. The `g, ...` row
binds a group to that role. Adopters replace `portal-admins` with
their own group name; the role name is a butler-portal convention
that any adopter can override.

## Frontend visibility

Gate UI controls with `usePermission()` from
`@backstage/plugin-permission-react` so users do not see buttons
they cannot use:

```tsx
import { usePermission } from '@backstage/plugin-permission-react';
import { myPluginThingWritePermission } from '../permissions';

export const WriteButton = () => {
  const { allowed } = usePermission({
    permission: myPluginThingWritePermission,
  });
  if (!allowed) return null;
  return <Button>Save</Button>;
};
```

Frontend gating is UX, not security. The backend `authorize()` call
is the security boundary. Do not skip backend enforcement because
the button is hidden.

## Testing

The two tests worth writing:

1. **Handler-level authorize integration**: mock the
   `PermissionsService` to return DENY, hit the route, assert 403.
   Then flip to ALLOW, assert 200. Covers the `requirePermission`
   wiring without depending on RBAC's policy engine.
2. **End-to-end policy test against a fixture RBAC config**: boot
   RBAC with a fixture CSV that grants your permission to a fixture
   role bound to a fixture user, sign in as that user, hit the
   route. Repeat with a user not in the role, assert 403. Slower
   but covers the full stack.

## Prefix conventions

- One prefix per plugin, terminated with a separator (`.` conventional).
- Short and specific: `myplugin.`, `pe.`, not `backstage.myplugin.`.
- Do not shadow another plugin's prefix. Check other plugins'
  `PERMISSIONS.md` files before choosing.
- Use `<subject>.<action>` for the tail (`thing.read`, `thing.write`,
  `admin.settings.update`).

## Failure modes to know

- **Silent pass-through when `pluginsWithPermission` omits your
  plugin ID**: your `authorize()` call returns ALLOW regardless of
  policy. No warning is emitted at boot. This is a real
  near-security failure: adopters can forget the list entry and
  believe they are enforced when they are not. Document the required
  entry loudly in your plugin's `PERMISSIONS.md`.
- **Superusers bypass everything**: an identity resolved into
  `permission.rbac.admin.superUsers` skips all evaluation. If your
  denial test uses a superuser, it will spuriously pass.
- **Guest identity resolves to `user:development/guest`**: local
  dev with the guest auth provider uses namespace `development`,
  not `default`. A superusers list with `user:default/guest` will
  not match. This bites only local dev.
- **Conditional policies YAML uses `---` separators**, not a list:
  if you introduce a `createPermissionRule()` and adopters want to
  wire conditional policies against it, the file format is YAML
  documents separated by `---`, not a top-level YAML list. The list
  form fails with a misleading error.

## PERMISSIONS.md contract for your plugin

Every plugin that declares permissions should ship a top-level
`PERMISSIONS.md` in its repository. The format:

```markdown
# my-plugin permissions

## Permissions

| Permission name | Action | UI/API surface gated | Default role granting |
|---|---|---|---|
| `myplugin.thing.write` | update | POST /api/my-plugin/things/:id | role:default/portal-privileged |

## Enforcement mechanism

Route handlers call `requirePermission(req, <perm>, permissions, httpAuth)` before mutating state.

## Adopter configuration

Add `my-plugin` to `permission.rbac.pluginsWithPermission` and bind
the desired role to `role:default/portal-privileged` (or override).
```

The doc lands in the same PR as the permission declaration. Reviewers
should block PRs that add a permission without updating the plugin's
`PERMISSIONS.md`.
