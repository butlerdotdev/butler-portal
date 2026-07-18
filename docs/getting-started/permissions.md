---
sidebar_position: 2
sidebar_label: Getting Started with Permissions
---

# Getting Started with Permissions

This walkthrough takes an adopter from a fresh butler-portal install to
a working plugin whose writes are gated by RBAC and whose gaps are
caught at boot. Every step is copyable; every command runs against the
runnable reference at
[`examples/adopter-plugin`](https://github.com/butlerdotdev/butler-portal/tree/main/examples/adopter-plugin).

For the underlying framework and the shipped default policy, see
[Architecture: Permissions](../architecture/permissions.md). For the
plugin-author contract in isolation, see
[Plugin Authoring: Authorization](../plugin-authoring/authorization.md).
This page is the sequenced path that ties both together.

## Prerequisites

- A Kubernetes cluster you can `kubectl apply` to (or `helm install`
  against). Local (kind, k3d) is fine for the walkthrough; a real
  cluster is fine for a production shape.
- `helm` 3.14+ and `kubectl` in your `PATH`.
- An SSO provider or a break-glass identity you can sign in as. The
  walkthrough uses two identities: an **admin** (in your platform-
  admins group) and a **non-admin** (any other authenticated user).
  Guest auth works for local walkthroughs but resolves to
  `user:development/guest` — see the [failure modes](../plugin-authoring/authorization.md#failure-modes-to-know)
  note.

## Step 1 — Pull chart 0.6.1 and pin image 0.6.2

Chart 0.6.1 ships the `pluginsWithPermission` structural guard and
warn-loudly helper. Image 0.6.2 ships the runtime audit module. They
release on different channels; the chart's `appVersion: 0.6.0` is
stale-referencing after 0.6.2, so pin `image.tag` explicitly:

```yaml
# values.yaml
image:
  tag: "0.6.2"

chart:
  # Only used if pulling via HelmRelease; direct `helm install` uses
  # the CLI-passed version.
  spec:
    version: "0.6.1"
```

Install with:

```sh
helm install butler-portal \
  oci://ghcr.io/butlerdotdev/charts/butler-portal \
  --version 0.6.1 \
  -f values.yaml
```

## Step 2 — Configure superUsers and admin groups

The chart ships `permission.rbac.admin.users: []` and
`permission.rbac.admin.superUsers: []` empty by default, and its
policy CSV binds `group:default/PLACEHOLDER-ADMIN-GROUP` to
`role:default/butler-portal-admin`. Out of the box no identity has
either administrative access or a real admin binding.

Set three fields in `values.yaml`:

```yaml
permission:
  enabled: true
  rbac:
    admin:
      # One break-glass identity that bypasses policy evaluation
      # entirely. Bootstrap only; keep this list tight.
      superUsers:
        - name: user:default/on-call
      # Groups that can manage RBAC via the /rbac admin UI and the
      # RBAC HTTP API. Do NOT get automatic access to other plugins'
      # write permissions — they still need role assignments.
      users:
        - name: group:default/platform-admins
    policy:
      csv: |
        # Copy the chart-shipped CSV verbatim and REPLACE
        # PLACEHOLDER-ADMIN-GROUP on the last line with your real
        # admin group. Do not remove the p rows above it.
        p, role:default/butler-portal-admin, scaffolder.task.create, use, allow
        p, role:default/butler-portal-admin, scaffolder.task.cancel, use, allow
        p, role:default/butler-portal-admin, scaffolder.action.execute, use, allow
        p, role:default/butler-portal-admin, scaffolder.template.management, use, allow
        p, role:default/butler-portal-admin, catalog.location.create, create, allow

        g, group:default/platform-admins, role:default/butler-portal-admin
```

`superUsers` and the `g,` binding are independent unblockers — either
alone lets your admin group perform gated writes. Setting both plus
`admin.users` is the standard shape; see
[Architecture: Permissions § Bootstrap access](../architecture/permissions.md#a-bootstrap-access-recovery-mechanics--makes-the-portal-usable-at-all)
for the full breakdown.

Redeploy:

```sh
helm upgrade butler-portal \
  oci://ghcr.io/butlerdotdev/charts/butler-portal \
  --version 0.6.1 \
  -f values.yaml
```

## Step 3 — Copy the adopter-plugin reference as your plugin's starting shape

The runnable reference at
[`examples/adopter-plugin`](https://github.com/butlerdotdev/butler-portal/tree/main/examples/adopter-plugin)
declares one BasicPermission-shaped read and one ResourcePermission-
shaped read with a rule. Clone the file layout into your own plugin
repository:

```
my-plugin/
  backend/
    .npmrc             # legacy-peer-deps=true (see #57)
    package.json
    tsconfig.json
    src/
      index.ts
      module.ts
      permissions.ts
      plugin.ts
      rule.ts
```

The reference's `permissions.ts` declares the shape:

```ts noCompile="illustrative — full runnable version in examples/adopter-plugin/backend/src/permissions.ts"
import { createPermission } from '@backstage/plugin-permission-common';

export const thingReadPermission = createPermission({
  name: 'example.thing.read',
  attributes: { action: 'read' },
  resourceType: 'example-thing',
});
```

And the reference's `plugin.ts` registers the permission with
`permissionsRegistry.addPermissions([...])` — this is the load-bearing
convention. A plugin that only calls `createPermission` + `authorize`
never populates `/.well-known/backstage/permissions/metadata`, and
without that endpoint the runtime audit (Step 8 below) cannot see the
plugin. **Always call `addPermissions()` at plugin init.** See
[Plugin Authoring: Authorization § Minimal example](../plugin-authoring/authorization.md#minimal-example).

Build and package your plugin as an OCI artifact (see
[Dynamic Plugins: Publishing](../dynamic-plugins/publishing.md) for
the packaging path).

## Step 4 — Wire the plugin id into `pluginsWithPermission`

RBAC does not auto-discover plugins that declare permissions. If your
plugin id is missing from `permission.rbac.pluginsWithPermission`, RBAC
returns `[]` from its discovery API for the plugin AND every
`authorize()` call for its permissions passes through as ALLOW
regardless of what your CSV says. Not a lint nit — silent
passthrough of every authorization check.

Add the plugin id AND opt into the chart-time structural guard:

```yaml
permission:
  rbac:
    pluginsWithPermission:
      - catalog
      - scaffolder
      - permission
      - my-plugin       # your plugin's pluginId (from package.json backstage.pluginId)

dynamicPlugins:
  enabled: true
  plugins:
    - package: oci://your-registry/my-plugin:1.0.0
      integrity: sha512-...
      # Structural guard: if the pluginId below is missing from
      # pluginsWithPermission, `helm template` fails at install/upgrade.
      # See docs/architecture/permissions.md § Known gotchas.
      permissions:
        pluginId: my-plugin
        enforced: true
```

For purely-UI plugins (catalog providers, frontend widgets) that do
not declare permissions, use `permissions.declared: false` instead of
`enforced: true` — that silences the NOTES.txt warn without opting
into the guard.

## Step 5 — Bind the permission to a role and the role to a group

Extend the policy CSV from Step 2 with rows for your plugin's
permissions:

```yaml
permission:
  rbac:
    policy:
      csv: |
        # ... chart-default rows for butler-portal-admin ...
        p, role:default/butler-portal-admin, scaffolder.task.create, use, allow
        # ... etc.

        # Add: grant the plugin's write permissions to a new privileged role,
        # bind that role to your admin group.
        p, role:default/my-plugin-writer, myplugin.thing.write, update, allow
        p, role:default/my-plugin-writer, myplugin.thing.delete, delete, allow

        g, group:default/platform-admins, role:default/butler-portal-admin
        g, group:default/platform-admins, role:default/my-plugin-writer
```

Reads are granted through the shipped `defaultPermissions.basicPermissions`
already (every authenticated user gets `catalog.entity.read` etc.).
Extend that block if you want your plugin's reads open to all
authenticated users:

```yaml
permission:
  rbac:
    defaultPermissions:
      defaultRole: role:default/butler-portal-user
      basicPermissions:
        # ... chart-default reads ...
        - permission: myplugin.thing.read
          action: read
```

Redeploy. If `pluginsWithPermission` is missing the id you just wired,
`helm upgrade` **fails** with an actionable error naming both the
plugin package and the missing id — the guard from
[#42](https://github.com/butlerdotdev/butler-portal/pull/42) doing its
job.

## Step 6 — Boot the portal and confirm the audit clears

Boot the pod. Within 5 seconds of dynamic plugins finishing their
init, the pluginsWithPermission audit module runs. Watch the backend
logs:

```sh
kubectl logs -n butler-portal deploy/butler-portal -c backstage \
  | grep '[pluginsWithPermission audit]'
```

You should see:

```
[pluginsWithPermission audit] auditing 3 loaded dynamic backend plugin(s) against permission.rbac.pluginsWithPermission (4 entries)
[pluginsWithPermission audit] audit complete: no gaps found (every plugin that declared permissions at runtime is listed in permission.rbac.pluginsWithPermission)
```

If instead you see:

```
[pluginsWithPermission audit] plugin 'my-plugin' declared 2 permission(s) at runtime and is NOT in permission.rbac.pluginsWithPermission. Authz is NOT running for this plugin: RBAC's discovery API returns [] for it, and every authorize() call for its permissions passes through as ALLOW regardless of your policy CSV. Add 'my-plugin' to permission.rbac.pluginsWithPermission.
```

your Step 4 didn't land — the plugin id is not in the listing. Fix
the values file, `helm upgrade`, and the audit re-runs at next boot.
For the full audit story see
[Architecture: Permissions § Runtime audit](../architecture/permissions.md#runtime-audit-for-pluginswithpermission-gaps).

## Step 7 — Verify from an admin identity

Sign in through your SSO provider as a member of `platform-admins`.
Verify RBAC sees your plugin and its permissions:

```sh
# 1. Grab the identity token from your browser's DevTools console:
#    fetch('/api/auth/microsoft/refresh?env=production&scope=openid',
#      {credentials:'include',headers:{'X-Requested-With':'XMLHttpRequest'}})
#      .then(r => r.json())
#      .then(b => console.log(b.backstageIdentity.token))
#    Replace 'microsoft' with your provider id.
TOKEN=<paste-the-token>

# 2. Confirm the plugin id + its declared permissions appear in RBAC's discovery:
curl -H "Authorization: Bearer $TOKEN" \
  https://portal.example.com/api/permission/plugins/condition-rules \
  | jq '.[] | select(.pluginId=="my-plugin")'
```

If the response for `my-plugin` returns non-empty rules or the pluginId
appears in the listing, RBAC has discovered the plugin. Missing =
`pluginsWithPermission` is wrong or the audit's info-level "listed but
404" case fired (see [Architecture: Permissions](../architecture/permissions.md#if-you-see-the-log)).

## Step 8 — Verify from a non-admin identity

Sign in as any authenticated user who is NOT in `platform-admins`. Hit
the gated route:

```sh
TOKEN=<non-admin-token>

# Should be 403 — RBAC evaluated + denied per the CSV.
curl -w '\nstatus: %{http_code}\n' \
  -H "Authorization: Bearer $TOKEN" \
  -X POST https://portal.example.com/api/my-plugin/things/some-id \
  -d '{"owner":"someone-else"}' \
  -H 'Content-Type: application/json' \
  -H 'X-Requested-With: XMLHttpRequest'
```

Expected: `status: 403` with a body like `{"error":"forbidden"}` or
Backstage's `NotAllowedError` shape. A `401` means the caller isn't
authenticated (session cookie missing — see the
[addAuthPolicy footgun](../plugin-authoring/authorization.md#minimal-example)).
A `500` means RBAC or the plugin handler crashed; check backend logs.
A `200` means the gate is not firing — either `pluginsWithPermission`
is missing the plugin id (return to Step 4 and re-check the audit
output) or the CSV grants this permission to a role the caller
inherits.

## Step 9 — Add a conditional policy (optional, for owner-scoped gating)

If your plugin declared a permission RULE (via
`permissionsRegistry.addResourceType({ resourceRef, rules, ...})`)
alongside the permission, you can gate the permission on properties of
the target resource: "any user in `readers` can read a thing, but only
if they own it."

Write a conditional policy YAML file (mounted at
`permission.rbac.conditionalPoliciesFile` — separate ConfigMap from the
CSV):

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

The `---` at the top is load-bearing; the conditional-policies file
expects YAML documents separated by `---`, not a top-level YAML list.
The list form fails with a misleading `'roleEntityRef' must be
specified` error even when the field is present.

`$currentUser` is a built-in RBAC alias substituted at authorize-time
with the caller's user entity ref. `$ownerRefs` is available for the
caller's ownership refs (their groups, plus themselves).

Redeploy. The plugin's rule gets fetched by RBAC at authorize-time,
invoked with the specific resource, and returns true/false — RBAC
converts to ALLOW/DENY per resource.

## Verification checklist

Everything on this list should be true at the end of the walkthrough.
If any item is not, back-reference the step that establishes it.

- [ ] Chart 0.6.1 installed with `image.tag: "0.6.2"` (Step 1)
- [ ] `permission.rbac.admin.superUsers` contains at least one identity (Step 2)
- [ ] `PLACEHOLDER-ADMIN-GROUP` in the CSV replaced with a real group (Step 2)
- [ ] Your admin group in `permission.rbac.admin.users` (Step 2)
- [ ] Your plugin calls `permissionsRegistry.addPermissions([...])` at init (Step 3)
- [ ] Your plugin id in `permission.rbac.pluginsWithPermission` (Step 4)
- [ ] Your plugin entry in `dynamicPlugins.plugins[]` sets `permissions.enforced: true` + `permissions.pluginId` (Step 4)
- [ ] CSV rows binding your plugin's permissions to a role, and the role to your admin group (Step 5)
- [ ] Boot log shows `[pluginsWithPermission audit] audit complete: no gaps found` (Step 6)
- [ ] Admin identity: RBAC discovery shows your plugin (Step 7)
- [ ] Non-admin identity: gated route returns 403 (Step 8)
- [ ] Optionally: conditional policy against a rule returns 403 for non-owners, 200 for owners (Step 9)

## Where to go next

- [Architecture: Permissions](../architecture/permissions.md) — the framework, the shipped policy, the migration story
- [Plugin Authoring: Authorization](../plugin-authoring/authorization.md) — the plugin-author contract, minimal example, conditional-rules pattern
- [examples/adopter-plugin/](https://github.com/butlerdotdev/butler-portal/tree/main/examples/adopter-plugin) — the runnable reference this walkthrough mirrors
- [chart values reference](../reference/) — every knob the chart exposes, with defaults
