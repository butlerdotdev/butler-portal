# Adopter Plugin: RBAC-Gated Backend

Reference for adopters wiring their own dynamic plugin into butler-portal's
RBAC. Not a test fixture; kept in the tree because the extension surface is
only usable when a working end-to-end example exists.

## What this plugin does

- Declares a permission: `example.thing.read`.
- Declares a resource type: `example-thing`.
- Registers a permission rule: `IS_THING_OWNER` — parameterized on
  `expectedOwner`, checks the resource's `owner` against it.
- Exposes one gated route: `GET /api/example/things/:id` that authorizes
  against `example.thing.read` and returns 200 or 403 depending on the
  policy attached to the caller's role.

Nothing else. It is deliberately small so an adopter can read all of
`backend/src/` in one sitting.

## How to wire it into RBAC

Two things have to be present in the deployment's `permission.rbac.*` config:

1. Add `example` to `permission.rbac.pluginsWithPermission`.
   **RBAC does NOT auto-discover plugins.** If you skip this step,
   `GET /api/permission/plugins/condition-rules` returns an empty array for
   this plugin and enforcement silently passes through with no boot warning.
   This is the single most common misconfiguration; the chart's default
   values list Backstage's core plugins for the same reason.

2. Write a policy that references the permission and (optionally) the rule.

   Permission-only policy (grant `example.thing.read` to a role, unconditionally):

   ```csv
   p, role:default/thing-reader, example.thing.read, read, allow
   g, group:default/my-team, role:default/thing-reader
   ```

   Conditional policy (grant `example.thing.read` only when the caller is
   the resource's owner, via the `IS_THING_OWNER` rule):

   ```yaml
   ---
   result: CONDITIONAL
   roleEntityRef: role:default/thing-reader
   pluginId: example
   resourceType: example-thing
   permissionMapping:
     - read
   conditions:
     rule: IS_THING_OWNER
     resourceType: example-thing
     params:
       expectedOwner: $currentUser
   ```

   `$currentUser` is a built-in RBAC alias substituted at authorize-time
   with the caller's user entity ref. `$ownerRefs` is available for the
   caller's ownership refs (their groups, plus themselves).

   The conditional-policy file uses `---` document separators between
   entries, not YAML list syntax. Using `- result: CONDITIONAL` produces a
   misleading `'roleEntityRef' must be specified` error even when
   roleEntityRef is present.

## How to make RBAC discover the rule

The rule is registered via `permissionsRegistry.addResourceType({ rules: [
IS_THING_OWNER ], ... })` inside the plugin's `init`. After boot, the
rule appears at `GET /api/permission/plugins/condition-rules` under
`pluginId: example` — verify with a policy-admin identity:

```
$ curl -H "Authorization: Bearer <token>" \
    http://localhost:7007/api/permission/plugins/condition-rules \
  | jq '.[] | select(.pluginId=="example")'
```

If the response is empty, `pluginsWithPermission` almost certainly doesn't
list `example`.

## Files

- `backend/src/permissions.ts` — `createPermission` declaration.
- `backend/src/rule.ts` — `createPermissionRule` for `IS_THING_OWNER`.
- `backend/src/plugin.ts` — the plugin's `createBackendPlugin`. Registers
  the resource + rule, mounts the gated route.
- `backend/src/index.ts` — module entrypoint.
- `backend/package.json` — dependencies pinned to the shape a real adopter
  plugin would use (peer-scoped Backstage APIs, own transitives bundled by
  `rhdh-cli plugin export`).
