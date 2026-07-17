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

This section shows the pattern for UNCONDITIONAL gating: a role
either has the permission or it does not, regardless of properties of
the target resource. The permissions declared below are
`BasicPermission` values from `@backstage/plugin-permission-common`.

For CONDITIONAL gating (permission granted only when the caller
satisfies some property of the target resource — "is the owner",
"is in the workspace", etc.), skip ahead to
[Conditional policies and permission rules](#conditional-policies-and-permission-rules).
A plugin can and often does declare both kinds — pick per permission,
not per plugin. Both live in the same `permissions.ts`.

Two files inside a plugin at `my-plugin/backend/src/`:

`permissions.ts` (declarations):

```ts title="permissions.ts"
import { createPermission } from '@backstage/plugin-permission-common';

// Unconditional gates. A role either has these or does not.
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

```ts title="router.ts"
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
import { myPluginThingWritePermission } from './permissions';

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

```ts title="module.ts"
import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { createRouter } from './router';

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

This section covers a DIFFERENT pattern from the minimal example
above — pick one per permission, not one per plugin:

- **`BasicPermission`** (the minimal example): unconditional gating.
  A role either has the permission or it does not. Suitable for
  reads and writes that do not depend on any property of the target
  resource.
- **`ResourcePermission` + rule** (this section): conditional gating.
  Permission granted only when the caller satisfies some property of
  the target resource ("is the owner", "is in the workspace"). The
  plugin declares a rule that returns a boolean per (resource,
  params) pair; the adopter references the rule from a conditional
  policy YAML.

Both kinds coexist in the same `permissions.ts`. The example below
adds a NEW conditional permission (`myplugin.thing.delete`) alongside
the two unconditional permissions from the minimal example — it does
not replace them. Delete is a natural fit for conditional gating
because delete permissions typically scope to the resource's owner:
any user can list things they can see, but only the owner can delete
one.

For the samples below, add these dependencies to your plugin's
`backend/package.json`. The versions match the working reference at
[examples/adopter-plugin/backend/package.json](https://github.com/butlerdotdev/butler-portal/blob/main/examples/adopter-plugin/backend/package.json):

```jsonc title="package.json fragment"
"dependencies": {
  "@backstage/backend-plugin-api": "^1.9.3",
  "@backstage/plugin-permission-common": "^0.9.9",
  "@backstage/plugin-permission-node": "^0.11.2",
  "@backstage/errors": "^1.3.1"
}
```

`@backstage/errors` supplies `NotAllowedError` used by the minimal
example's `requirePermission` helper.

Declare the rule with `createPermissionRule` (typically in a
`backend/src/rule.ts`). The example below types the callback
parameters explicitly rather than deriving them from a
`paramsSchema`, because `plugin-permission-node@0.11.2`'s inference
through `zod`'s type outputs currently produces `TS2589: Type
instantiation is excessively deep` on both the working reference and
any adopter code following the reference shape. Tracked in
[butlerdotdev/butler-portal#52](https://github.com/butlerdotdev/butler-portal/issues/52).
Explicit generic parameters on `createPermissionRule` are required
under `plugin-permission-node@0.11.2`; without them TypeScript picks
the deprecated overload and infers `TParams` as `undefined`, which
breaks the callback signatures. The shape below is compile-checked by
`docs-compile-check` CI workflow on every push (see
[`.github/workflows/docs-compile-check.yml`](https://github.com/butlerdotdev/butler-portal/blob/main/.github/workflows/docs-compile-check.yml)):

```ts title="rule.ts"
import {
  createPermissionResourceRef,
  createPermissionRule,
} from '@backstage/plugin-permission-node';

// owner is optional so a resource with a missing owner field does
// not throw when apply() dereferences it. Match the working
// reference at examples/adopter-plugin/backend/src/rule.ts:7.
export type Thing = { id: string; owner?: string };
export type ThingQuery = { ownerFilter?: string };

export const thingResourceRef = createPermissionResourceRef<
  Thing,
  ThingQuery
>().with({ pluginId: 'my-plugin', resourceType: 'my-thing' });

export const isThingOwnerRule = createPermissionRule<
  typeof thingResourceRef,
  { expectedOwner: string }
>({
  name: 'IS_THING_OWNER',
  description: 'Allow when the caller owns the thing',
  resourceRef: thingResourceRef,
  apply: (resource, params) =>
    resource?.owner === params.expectedOwner,
  toQuery: params => ({ ownerFilter: params.expectedOwner }),
});
```

**If [#52](https://github.com/butlerdotdev/butler-portal/issues/52)
lands** and you want runtime schema validation of the rule params,
add `"zod": "^3.25.76"` to your dependencies and a `paramsSchema:
z.object({ expectedOwner: z.string() })` field to the rule above.
Until #52 lands, adding those reintroduces the `TS2589` error the
explicit-generics shape works around.

**If the rule stops compiling in a way you cannot resolve**, treat
that as an early warning rather than a nuisance to cast past. The
compile error is the friction that surfaces a type mismatch between
your rule and the plugin-permission-node contract. Silencing it with
`@ts-ignore` or an `as any` cast lets the plugin build but leaves the
rule in a broken state — the callback types no longer match what the
framework passes at runtime, so `apply()` may see `undefined` where
you expected the resource, or the wrong shape for `params`. Combined
with the opt-in guard from
[#42](https://github.com/butlerdotdev/butler-portal/pull/42) being
OFF for a plugin the adopter did not explicitly enable, the failure
is silent: permissions are declared, `authorize()` runs, and RBAC
either evaluates the wrong result or passes through as ALLOW because
the rule never registers correctly.

Add the conditional permission to your existing `permissions.ts`
alongside the unconditional ones. `resourceType` is what makes this a
`ResourcePermission` — the type the framework needs to route the
permission to the resource type registered below:

```ts title="permissions.ts" append
// Add these lines to the same permissions.ts alongside the
// unconditional ones from the minimal example.
export const myPluginThingDeletePermission = createPermission({
  name: 'myplugin.thing.delete',
  attributes: { action: 'delete' },
  resourceType: 'my-thing',
});
```

Register the rule and its resource type in your plugin's `init`, then
call `authorize()` with a `resourceRef`. `getResources` is the plugin-
supplied loader that resolves a batch of resource refs to their live
values so `apply()` can inspect them:

```ts noCompile
async function loadThingsById(
  refs: string[],
): Promise<Array<Thing | undefined>> {
  // Your storage / API lookup, keyed by the resource ref you pass
  // in the authorize() call. Return one entry per input ref;
  // undefined for refs that do not resolve. The rule's apply()
  // above uses `resource?.owner` so an undefined resource returns
  // false; a false result means the rule does not authorize the
  // caller, so this permission ends up DENY unless another policy
  // row grants it unconditionally.
  return refs.map(id => YOUR_STORE.get(id));
}

env.registerInit({
  deps: {
    /* ...as before... */
    permissionsRegistry: coreServices.permissionsRegistry,
  },
  async init({ /* ... */ permissions, permissionsRegistry }) {
    permissionsRegistry.addResourceType({
      resourceRef: thingResourceRef,
      permissions: [myPluginThingDeletePermission],
      rules: [isThingOwnerRule],
      getResources: loadThingsById,
    });

    router.delete('/things/:id', async (req, res) => {
      const credentials = await httpAuth.credentials(req);
      const [decision] = await permissions.authorize(
        [
          {
            permission: myPluginThingDeletePermission,
            resourceRef: req.params.id,
          },
        ],
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
YAML document per policy separated by `---`. The `---` separator is
load-bearing; the wrong shape fails with a misleading error — see
[Failure modes](#failure-modes-to-know):

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

```tsx noCompile
// Frontend snippet — lives in your plugin's frontend package, not
// the backend package the samples above target. `Button` here is
// a stand-in for your app's button component.
import { usePermission } from '@backstage/plugin-permission-react';
import { myPluginThingWritePermission } from './permissions';

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

Shared helpers for both patterns (`mockPermissionsService()` and a
fixture-CSV RBAC boot harness) are tracked in
[butlerdotdev/butler-portal#43](https://github.com/butlerdotdev/butler-portal/issues/43).
Until they land, adopters write the mock and fixture boot from scratch
per plugin.

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
  entry loudly in your plugin's `PERMISSIONS.md`. Adopters using the
  butler-portal chart can opt each plugin entry into a structural
  guard from
  [butlerdotdev/butler-portal#42](https://github.com/butlerdotdev/butler-portal/pull/42)
  (`permissions.enforced: true` + `permissions.pluginId`) that fails
  `helm template` when the id is missing from `pluginsWithPermission`.
  The guard is OPT-IN per plugin entry, not default-on: an adopter
  who does not set it gets the same silent pass-through this bullet
  describes. Recommend it in your plugin's `PERMISSIONS.md` as the
  wiring adopters should apply for your plugin specifically.
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
  form fails with a misleading `'roleEntityRef' must be specified`
  error even when the field is present. See
  [Conditional policies and permission rules](#conditional-policies-and-permission-rules)
  above for a working example of the YAML shape.

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
