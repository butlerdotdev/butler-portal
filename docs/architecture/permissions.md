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
  Adopters MUST populate `superUsers` at install time or nobody can
  perform gated writes.
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
  `role:default/butler-portal-admin`. **This is a placeholder that
  MUST be replaced.** Fresh adopters overwrite the group ref with
  their real admin group (e.g. their SSO-provisioned platform team)
  before non-superUser writes become possible.

The two-role split (`butler-portal-user` for reads,
`butler-portal-admin` for writes) is the reference shape. Adopters can
flatten it, extend it, or replace it wholesale — the role names are
conventions the chart establishes, not hard-coded framework names.

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
2. **RBAC admin UI** — a superuser edits role assignments through
   the `/rbac` UI. State lives in the RBAC database. Useful for
   experimentation; less auditable than gitops.

Both paths compose; the chart CSV is applied on every reload and the
UI-created entries persist independently. Adopters who want gitops
as the sole source of truth should disable admin-UI writes and
manage everything through the chart values.

## Migration from the pre-0.6.0 adjudicator seam

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
- If your adjudicator did conditional decisions (e.g., "user can edit
  only the entity they own"), express those as conditional policies
  via RBAC's `permission-rules` API and `permission.rbac.conditionalPoliciesFile`.

The migration is mechanical for boolean allow/deny adjudicators.
Conditional adjudicators require a small refactor to expose the
condition as a `createPermissionRule()` and reference it from the
policy file.

## Known gotchas

- **`pluginsWithPermission` is required.** Empty list means silent
  pass-through. Every rollout should verify
  `GET /api/permission/plugins/condition-rules` (with a superuser
  identity) returns the expected plugin IDs.
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
