---
sidebar_position: 3
sidebar_label: Permissions
---

# Permissions

Butler Portal 0.6.0+ uses the community RBAC backend
([`@backstage-community/plugin-rbac-backend`](https://www.npmjs.com/package/@backstage-community/plugin-rbac-backend))
as the single authorization surface. This page covers the framework
choice, the shipped default policy shape, and where adopters plug in.

Plugin authors writing a permission-declaring plugin should read
[Plugin Authoring: Authorization](../plugin-authoring/authorization.md)
after this page.

The runnable reference for everything on this page lives at
[examples/adopter-plugin](https://github.com/butlerdotdev/butler-portal/tree/main/examples/adopter-plugin) —
a minimal end-to-end plugin declaring a permission, registering a
permission rule via `permissionsRegistry.addResourceType`, and
exposing a gated route. Every code snippet below has a working
counterpart there.

## Framework

Backstage's upstream permission framework enforces one
`PermissionPolicy` per instance. Butler Portal delegates that policy
to RBAC — a Casbin-backed engine that stores role assignments as CSV
rows and exposes an admin UI at `/rbac` for policy admins to create,
edit, and delete role bindings.

Every `authorize()` call from any plugin flows through RBAC's central
policy check. RBAC decides ALLOW / DENY / CONDITIONAL based on:

1. Whether the caller's identity resolves into an entity ref listed
   under `permission.rbac.admin.superUsers` (bypass everything);
2. Whether any role the caller holds has an ALLOW row for the
   requested permission in `permission.rbac.defaultPermissions` or
   the loaded policy CSV;
3. Otherwise DENY.

Plugins register their permissions by declaring them with
`createPermission()` and calling `permissions.authorize()` in their
request handlers. No plugin-level policy object is needed. RBAC
evaluates the calls centrally.

## Frontend + backend packages

RBAC ships as two separate packages that must both be installed and
wired for the `/rbac` UI to appear:

- **Backend**: `@backstage-community/plugin-rbac-backend`, added in
  `packages/backend/src/index.ts` (butler-portal already does this at
  `packages/backend/src/index.ts:62`). Handles authorization
  evaluation.
- **Frontend**: `@backstage-community/plugin-rbac`, added in
  `packages/app/` and wired as a route. Butler-portal wires it at
  `packages/app/src/baselineRoutes.tsx:44` (import) and mounts
  `<RbacPage />` at path `/rbac`.

Installing only the backend gives you policy evaluation with no admin
UI — signed-in admins have no way to inspect or edit role bindings
outside the CSV. Adopters starting from butler-portal's shipped
`packages/app/` inherit the frontend wiring automatically; adopters
who bring their own Backstage app must add both packages themselves.

## Two admin tiers

RBAC distinguishes two admin populations:

- `permission.rbac.admin.users` — **policy admins**. Manage RBAC via
  the `/rbac` UI and API. Can create, edit, and delete role bindings.
  Do NOT get automatic access to other plugins' write permissions;
  they still need role assignments like any other user.
- `permission.rbac.admin.superUsers` — **unrestricted**. Bypass
  policy evaluation entirely for every plugin. Bootstrap identities
  live here so an operator can configure RBAC through the UI before
  the policy CSV is populated.

Both fields accept user or group refs. Keep both lists tight; the
`superUsers` list in particular should contain one or two identities,
not a broad group.

## Shipped default policy

The chart's default values ship a fail-safe policy that any adopter
can override:

- `permission.enabled: true` — permission enforcement is on.
- `permission.rbac.admin.users: []` and
  `permission.rbac.admin.superUsers: []` — both empty by default.
- `permission.rbac.defaultPermissions.defaultRole:
  role:default/butler-portal-user` — every authenticated user is
  implicitly a member of `butler-portal-user`.
- `permission.rbac.defaultPermissions.basicPermissions` — grants
  `butler-portal-user` five reads: `catalog.entity.read`,
  `catalog.location.read`, `scaffolder.task.read`,
  `scaffolder.template.parameter.read`, `scaffolder.template.step.read`.
  Read-only self-service surface works for any signed-in user out of
  the box; every write requires a role binding via the CSV.
- `permission.rbac.policy.csv` — CSV rows granting
  `role:default/butler-portal-admin` the privileged Backstage-core
  writes: `scaffolder.task.create`, `scaffolder.task.cancel`,
  `scaffolder.action.execute`, `scaffolder.template.management`,
  `catalog.location.create`.
- The shipped CSV binds `group:default/PLACEHOLDER-ADMIN-GROUP` to
  `role:default/butler-portal-admin`. That group does not exist in
  any tenant's directory; the binding is a placeholder.

The two-role split (`butler-portal-user` for reads,
`butler-portal-admin` for writes) is the reference shape. Adopters can
flatten it, extend it, or replace it wholesale — the role names are
conventions the chart establishes, not hard-coded framework names.

### First-boot state and two paths to unblock writes

Out of the box, `superUsers` is empty AND the `PLACEHOLDER-ADMIN-GROUP`
binding names a group that no directory resolves. In that state,
signed-in users can read via `defaultPermissions` but nobody can
perform gated writes AND nobody can reach the `/rbac` admin UI to
grant themselves a role (because `admin.users` is also empty). Safe
by default, bricked for bootstrap. You cannot unbrick from the UI —
you edit the chart values.

Two separate blocks of work, in this order. Do NOT treat them as one
checklist — Block A unbricks access; Block B is what makes enforcement
actually work.

**A. Bootstrap access** (recovery mechanics — makes the portal
usable at all):

There are two independent levers that unblock writes: populating
`superUsers` (bypass everything for a break-glass identity) or
replacing `PLACEHOLDER-ADMIN-GROUP` in the policy CSV with a real
group your directory resolves. Either alone is sufficient. The
typical setup uses both, plus `admin.users` for policy management:

1. Set `permission.rbac.admin.superUsers` to one break-glass identity
   (a service-team on-call user ref). This is bypass access, so keep
   it to one or two refs.
2. Replace `PLACEHOLDER-ADMIN-GROUP` in the policy CSV with your real
   admin group ref (e.g. an SSO-provisioned platform team). Members
   inherit `role:default/butler-portal-admin`'s privileged writes.
3. Add the same admin group to `permission.rbac.admin.users` so its
   members can manage RBAC through `/rbac`. Step 2 alone does NOT
   grant UI access; step 3 is what does.

After block A, admins can sign in and perform gated writes. It is
tempting to stop here — the portal appears to work. It is not
enforced.

**B. Wire plugin enforcement** (required for enforcement to work at
all — skipping this leaves every plugin's writes silently allowed
regardless of your CSV):

Block B assumes Block A is complete. Step 5 in particular requires
signing in as an admin-group member, which only exists after Block A
steps 2-3.

4. **REQUIRED.** List every plugin that declares permissions under
   `permission.rbac.pluginsWithPermission` — including your own
   adopter dynamic plugins. Unlisted plugins return `[]` from RBAC's
   discovery API and every `authorize()` call for them passes
   through as ALLOW no matter what the CSV says. No boot warning is
   emitted. This is a near-security failure, not a convenience item.
5. Deploy. Sign in as an admin-group member. Confirm
   `GET /api/permission/plugins/condition-rules` returns every plugin
   ID you listed. Missing IDs from the response = enforcement is off
   for those plugins. Blocking the rollout on this check is a norm
   today, not a mechanism — no chart-side gate stops a deploy where
   `pluginsWithPermission` is missing entries unless the operator
   opts each plugin entry into the structural guard from
   [butlerdotdev/butler-portal#42](https://github.com/butlerdotdev/butler-portal/pull/42)
   (`permissions.enforced: true` per plugin entry).

Block A without block B = "safe by default, but every plugin's writes
are unenforced." Block B alone (skipping A) leaves the portal locked
down but adopters cannot administer it.

## What adopters must configure

For any plugin's permissions to be evaluated, the plugin ID MUST
appear under `permission.rbac.pluginsWithPermission` in
`app-config.yaml`. RBAC does not auto-discover plugins that declare
permissions or rules. If the list is empty or missing, RBAC's
discovery endpoint returns `[]` and every `authorize()` call for
that plugin silently passes through as ALLOW, regardless of what
the policy CSV says. Confusingly, no boot warning is emitted.

The chart values expose this as an array:

```yaml
permission:
  enabled: true
  rbac:
    admin:
      superUsers:
        - name: group:default/your-admin-group
    pluginsWithPermission:
      - catalog
      - scaffolder
      - permission
      # Add every additional first-party or dynamic plugin
      # whose permissions should be enforced.
```

The chart default lists `catalog`, `scaffolder`, and `permission`.
Adopter dynamic plugins that declare permissions (e.g. `pe.*`,
`myplugin.*`) must add their own plugin ID.

## Role binding: policy CSV vs admin UI

Two paths ship a CSV binding of a group to a role:

1. **In-chart values** — the operator writes CSV rows directly under
   `permission.rbac.policy.csv`. Gitops-friendly; changes flow
   through the standard chart-values MR path. Recommended for
   production adopters.
2. **RBAC admin UI** — a policy admin or superuser edits role
   assignments through the `/rbac` UI. State lives in the RBAC
   database. Useful for experimentation; less auditable than gitops.

Both paths compose. CSV changes hot-reload without a pod restart:
Helm rewrites the ConfigMap when values change, kubelet updates the
mounted file at `permission.rbac.policies-csv-file` (chart default
`/etc/butler-portal-rbac/policy.csv`), and RBAC's file watcher
re-reads the file because `permission.rbac.policyFileReload` is
`true` by chart default. UI-created entries are stored in the RBAC
database independently of the CSV mount.

To make gitops the sole source of truth, keep
`permission.rbac.admin.users: []`. Only identities listed under
`admin.superUsers` can then reach `/rbac`, so day-to-day operators
cannot make policy edits that would drift from the CSV. RBAC has no
dedicated toggle to disable UI writes; empty `admin.users` is the
lever.

## Migration from the pre-0.6.0 adjudicator seam

> **Pre-upgrade warning.** Before bumping Butler Portal past 0.5.x,
> migrate any plugin that imports `authAdjudicatorExtensionPoint` from
> `packages/backend/src/authAdjudicator.ts` — that file is deleted in
> 0.6.0. In-tree plugins fail at TypeScript build. Pre-built dynamic-
> plugin OCI artifacts compiled against pre-0.6.0 fail at runtime when
> the dynamic-plugin loader tries to resolve the removed import; the
> loader error may not be prominent in boot output, so a plugin can
> appear to load and silently register no routes. Migrate the plugin
> and republish the OCI artifact BEFORE upgrading the portal.

Butler Portal versions prior to 0.6.0 shipped `ButlerPortalDelegatingPolicy`
in `packages/backend/src/permissionPolicy.ts`. Plugins registered a
per-namespace adjudicator function via `authAdjudicatorExtensionPoint`;
the delegating policy routed each `authorize()` to the matching
adjudicator based on the permission-name prefix.

That seam is removed as of 0.6.0. Plugins that used it must migrate
to the RBAC pattern:

- Delete the `createBackendModule` that registered the adjudicator.
- Move the role/group check logic out of the adjudicator function
  into RBAC policy CSV rows.
- Keep the `createPermission()` declarations; they are still the
  canonical way to name what gets gated.
- If your adjudicator did conditional decisions (e.g. "user can edit
  only the entity they own"), express those via RBAC's
  `permission.rbac.conditionalPoliciesFile`, and declare the rule
  itself via `permissionsRegistry.addResourceType({ resourceRef,
  permissions, rules, getResources })` in your plugin's `init`. See
  [examples/adopter-plugin/backend/src/plugin.ts](https://github.com/butlerdotdev/butler-portal/blob/main/examples/adopter-plugin/backend/src/plugin.ts)
  for a working `createPermissionRule` + `addResourceType` +
  conditional-policy end-to-end.

The migration is mechanical for boolean allow/deny adjudicators.
Conditional adjudicators require a small refactor to expose the
condition as a `createPermissionRule()` and register it via
`permissionsRegistry.addResourceType`.

## Known gotchas

- **`pluginsWithPermission` is required.** Empty list means silent
  pass-through. Every rollout should verify
  `GET /api/permission/plugins/condition-rules` (with a superuser
  identity) returns the expected plugin IDs. The chart offers an
  opt-in structural guard from
  [butlerdotdev/butler-portal#42](https://github.com/butlerdotdev/butler-portal/pull/42):
  set `permissions.enforced: true` with `permissions.pluginId: <id>`
  on each plugin entry in `dynamicPlugins.plugins` and `helm template`
  fails at install/upgrade when the id is missing from
  `pluginsWithPermission`. The guard defaults to OFF per plugin
  entry — an adopter who does not opt in gets no structural
  protection, only this doc.
- **`typeorm-adapter` transitively requires `mongodb`.** RBAC's
  Casbin adapter does a top-level `require('mongodb')` even when
  configured for SQLite or PostgreSQL. `packages/backend/package.json`
  includes `mongodb` for this reason; the dep is not loaded at
  runtime.
- **Guest auth resolves to `user:development/guest`** (namespace
  `development`, not `default`). A superusers list containing
  `user:default/guest` will silently not match. This affects only
  local dev; SSO adopters see their own resolved identities.
- **Conditional policies file uses `---` document separators**, not
  a YAML list. The list form fails with a misleading `'roleEntityRef'
  must be specified` error even when the field is present.
