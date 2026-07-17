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
rows and exposes an admin UI for read-only inspection at `/rbac`.

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

## Shipped default policy

The chart's default values ship a fail-safe policy that any adopter
can override:

- `permission.enabled: true` — permission enforcement is on.
- `permission.rbac.admin.superUsers` — empty by default; adopters set
  this to their admin group ref (e.g. `group:default/portal-admins`)
  to bootstrap policy-management access.
- `permission.rbac.defaultPermissions.defaultRole:
  role:default/portal-user` — every authenticated user is implicitly
  a member of `portal-user`.
- `permission.rbac.defaultPermissions.basicPermissions` — grants
  `portal-user` catalog read, scaffolder template read, and scaffolder
  task read/create/cancel/execute. Read-heavy self-service surface
  works for any signed-in user out of the box.
- `permission.rbac.policy.csv` — additional CSV rows binding a
  privileged role (`role:default/portal-privileged`) to
  scaffolder template management and catalog location creation. The
  shipped CSV expects adopters to add their own `g,` binding lines
  mapping their groups to `role:default/portal-privileged`.

The two-role split (`portal-user` for reads plus low-risk writes,
`portal-privileged` for template management and catalog mutation) is
the reference shape. Adopters can flatten it, extend it, or replace
it wholesale. See the RBAC docs for role authoring.

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

Superusers bypass all evaluation; keep the group tight.

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
- **Backstage's DB-backed scheduler persists `next_run_start_at`**
  across pod rolls for same-version tasks. This is unrelated to
  RBAC directly but affects any operator changing permission-adjacent
  configuration that depends on a scheduled sync (e.g., msgraph
  catalog provider syncing group members that policy CSV bindings
  target).
