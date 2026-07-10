---
sidebar_position: 1
sidebar_label: Authorization
---

# Authorization

How a plugin gates its own authorization inside butler-portal without
editing butler-portal core.

## Why the seam exists

Backstage's upstream permission framework enforces exactly one
`PermissionPolicy` per instance. The framework's
`PolicyExtensionPointImpl.setPolicy` throws `Policy already set` if
two modules try to register a policy. Without help, that leaves every
plugin's authorization living inside the integrator's central policy
file, which defeats the plugin ecosystem.

Butler-portal provides a namespace-delegated seam on top of the
framework so plugins own their own decision logic. The central policy
(`ButlerPortalDelegatingPolicy`) routes each `authorize()` call to a
plugin-registered adjudicator based on the permission-name prefix.
Unclaimed namespaces fall through to `ALLOW`, so Backstage core plugins
(catalog, scaffolder, techdocs, search, kubernetes) continue to work
with no per-plugin edit.

This seam is butler-portal's, not Backstage's. If upstream Backstage
ships an official namespace-delegated policy, migrate to it and delete
this page.

## Contract at a glance

1. Pick a permission-name prefix for your plugin. End it with a
   separator so it cannot accidentally match another plugin
   (`myplugin.` not `myplugin`).
2. Declare your permissions with `createPermission({ name: 'myplugin.<resource>.<action>', attributes: { action: '...' } })`.
3. Write an adjudicator function that maps a `(request, user)` pair to
   a `PolicyDecision`. Reads may return `ALLOW` for any authenticated
   user; writes should check group membership on
   `user.info.ownershipEntityRefs`.
4. Register the adjudicator via `authAdjudicatorExtensionPoint` in a
   `createBackendModule` that lives inside your plugin package.
5. Call `authorize()` in the routes you want to gate. Cache the
   `PermissionsService` from `coreServices` at plugin init.

Every step happens in your plugin package. Nothing in butler-portal
core needs to change.

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

`adjudicator.ts` (decision logic + registration):

```ts
import { createBackendModule } from '@backstage/backend-plugin-api';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import { authAdjudicatorExtensionPoint } from 'butler-portal/authAdjudicator';

const ADMIN_GROUP = 'group:default/butler-platform-admins';

export default createBackendModule({
  pluginId: 'permission',
  moduleId: 'my-plugin-adjudicator',
  register(reg) {
    reg.registerInit({
      deps: { adjudicators: authAdjudicatorExtensionPoint },
      async init({ adjudicators }) {
        adjudicators.register('myplugin.', (request, user) => {
          const refs = user?.info.ownershipEntityRefs ?? [];
          const name = request.permission.name;
          const isAdmin = refs.includes(ADMIN_GROUP);

          if (name.endsWith('.read')) {
            return { result: AuthorizeResult.ALLOW };
          }
          return {
            result: isAdmin ? AuthorizeResult.ALLOW : AuthorizeResult.DENY,
          };
        });
      },
    });
  },
});
```

Export the module from your plugin's backend entry point alongside
the plugin itself:

```ts
export { default as myPluginPlugin } from './plugin';
export { default as myPluginAdjudicator } from './adjudicator';
```

The RHDH dynamic-plugin loader picks up both. Your adjudicator
registers the `myplugin.` namespace at boot.

## Enforcing at the route

In a route handler, resolve the caller's credentials via the
`httpAuth` core service and call `authorize()`:

```ts
router.post('/things', async (req, res) => {
  const credentials = await httpAuth.credentials(req, { allow: ['user'] });
  const decision = await permissions.authorize(
    [{ permission: myPluginThingWritePermission }],
    { credentials },
  );
  if (decision[0].result !== AuthorizeResult.ALLOW) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  // ... proceed
});
```

## Testing

Two tests worth writing:

1. Unit test of the adjudicator function: pass in constructed
   `PolicyQuery` + `PolicyQueryUser` shapes and assert the returned
   `PolicyDecision`. This gives fast coverage of every role branch.
2. Behavioral-equivalence test if you migrate an existing inline
   policy into a namespaced adjudicator: exercise the same
   `(permission, identity)` matrix under both shapes and assert equal
   outcomes. `packages/backend/src/permissionPolicy.test.ts` in
   butler-portal does this for the registry adjudicator; use it as
   the template.

## Frontend gating (UX only)

The backend `authorize()` call is the security boundary. Frontend
gating is UX - it hides buttons and pages the user cannot act on to
avoid confusing 403 loops. Use `usePermission()` from
`@backstage/plugin-permission-react`:

```tsx
import { usePermission } from '@backstage/plugin-permission-react';
import { myPluginThingWritePermission } from '../permissions';

export const WriteButton = () => {
  const { allowed } = usePermission({
    permission: myPluginThingWritePermission,
  });
  return <Button disabled={!allowed}>Save</Button>;
};
```

Do not rely on frontend gating for security. Do not skip the backend
`authorize()` because the button is hidden.

## Choosing a prefix

Recommendations:

- One prefix per plugin, terminated with a separator (`.` conventional).
- Short and specific: `pe.`, `myplugin.`, not `backstage.myplugin.`.
- Do not shadow another plugin: check
  `packages/backend/src/*` and other adjudicators in the tree before
  registering.
- Registering the same prefix twice throws at boot with an explicit
  error naming the collision.

## When to graduate

If Backstage ships an official namespace-delegated policy interface,
migrate off this seam so the plugin stays on framework grain. The
migration is mechanical (swap the extension point, keep the
adjudicator function shape). Track this in the note at the top of
`packages/backend/src/authAdjudicator.ts`.
