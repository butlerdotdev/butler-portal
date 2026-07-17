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

Runnable reference:
[examples/adopter-plugin](https://github.com/butlerdotdev/butler-portal/tree/main/examples/adopter-plugin).
Every pattern below has a working counterpart there.

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
        // Backstage's default HTTP auth policy for backend routes does
        // NOT accept the browser's user session cookie. Without this,
        // browser-originating requests to /api/my-plugin/things/:id
        // return 401 BEFORE authorize() runs, and the caller sees an
        // auth failure they cannot resolve. Declare the paths that
        // accept the user cookie explicitly.
        httpRouter.addAuthPolicy({ path: '/things/:id', allow: 'user-cookie' });
      },
    });
  },
});
```

`NotAllowedError` from `@backstage/errors` serializes as HTTP 403 by
default when thrown from an Express handler.

## Conditional policies and permission rules

The `permissions.authorize()` pattern above supports only unconditional
allow/deny. To gate a permission on properties of the target resource
(e.g., "user can edit only entities they own"), the plugin declares a
permission RULE, registers it with the permissions registry, and the
adopter references it from RBAC's `conditionalPoliciesFile`.

Declare the rule with `createPermissionRule` (typically in a
`backend/src/rule.ts`):

```ts
import { createPermissionResourceRef } from '@backstage/plugin-permission-node';
import { createPermissionRule } from '@backstage/plugin-permission-node';
import { z } from 'zod';

export type Thing = { id: string; owner: string };

export const thingResourceRef = createPermissionResourceRef<
  Thing,
  { expectedOwner: string }
>().with({ pluginId: 'my-plugin', resourceType: 'my-thing' });

export const isThingOwnerRule = createPermissionRule({
  name: 'IS_THING_OWNER',
  description: 'Allow when the caller owns the thing',
  resourceRef: thingResourceRef,
  paramsSchema: z.object({ expectedOwner: z.string() }),
  apply: (resource, { expectedOwner }) => resource.owner === expectedOwner,
  toQuery: () => ({}),
});
```

Register the rule and its resource type in your plugin's `init`, then
call `authorize()` with a `resourceRef`:

```ts
env.registerInit({
  deps: {
    /* ...as before... */
    permissionsRegistry: coreServices.permissionsRegistry,
  },
  async init({ /* ... */ permissions, permissionsRegistry }) {
    permissionsRegistry.addResourceType({
      resourceRef: thingResourceRef,
      permissions: [myPluginThingReadPermission],
      rules: [isThingOwnerRule],
      getResources: async refs => refs.map(loadThingById),
    });

    router.get('/things/:id', async (req, res) => {
      const credentials = await httpAuth.credentials(req);
      const [decision] = await permissions.authorize(
        [{ permission: myPluginThingReadPermission, resourceRef: req.params.id }],
        { credentials },
      );
      if (decision.result === AuthorizeResult.DENY) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }
      // ... proceed
    });
  },
});
```

Adopters then reference the rule from a conditional policy file, one
YAML document per policy separated by `---`:

```yaml
---
result: CONDITIONAL
roleEntityRef: role:default/thing-reader
pluginId: my-plugin
resourceType: my-thing
permissionMapping:
  - read
conditions:
  rule: IS_THING_OWNER
  resourceType: my-thing
  params:
    expectedOwner: $currentUser
```

`$currentUser` and `$ownerRefs` are built-in RBAC aliases substituted
at authorize-time with the caller's user ref and ownership refs.
Point adopters at
[`permission.rbac.conditionalPoliciesFile`](../architecture/permissions.md#shipped-default-policy)
for where the file mounts.

Working end-to-end reference (permission + rule + resource type +
gated route + conditional policy YAML):
[examples/adopter-plugin/backend/src/plugin.ts](https://github.com/butlerdotdev/butler-portal/blob/main/examples/adopter-plugin/backend/src/plugin.ts)
and
[examples/adopter-plugin/backend/src/rule.ts](https://github.com/butlerdotdev/butler-portal/blob/main/examples/adopter-plugin/backend/src/rule.ts).

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
        p, role:default/butler-portal-admin, myplugin.thing.write, update, allow
        g, group:default/your-admin-group, role:default/butler-portal-admin
```

The `p, ...` row grants the permission to a role. The `g, ...` row
binds a group to that role. `role:default/butler-portal-admin` is
the privileged role the chart ships by default; adopters who split
roles further (e.g. `role:default/myplugin-writer`) reference their
custom roles the same way.

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
| `myplugin.thing.write` | update | POST /api/my-plugin/things/:id | role:default/butler-portal-admin |

## Enforcement mechanism

Route handlers call `requirePermission(req, <perm>, permissions, httpAuth)` before mutating state.

## Adopter configuration

Add `my-plugin` to `permission.rbac.pluginsWithPermission` and bind
the desired role to `role:default/butler-portal-admin` (or override).
```

The doc lands in the same PR as the permission declaration. Reviewers
should block PRs that add a permission without updating the plugin's
`PERMISSIONS.md`.
