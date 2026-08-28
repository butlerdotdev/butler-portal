# Local role review

Butler behaves differently for five kinds of user. This harness puts all
five on screen at once, against one running portal and one set of data, so
a change can be reviewed through every authorization perspective without
logging in and out.

## Start it

```bash
yarn dev:roles:server   # portal with the role config layered
yarn dev:roles          # five windows, one per identity
```

The first command is the normal dev server plus `app-config.roles.yaml`.
The second opens a browser profile per identity and prints where each one
is. Give it a route to start them all somewhere specific:

```bash
yarn dev:roles /butler/admin/clusters
```

## Drive all five at once

The launcher stays attached. Type a route and press enter to send every
window there:

```
roles> /butler/t/platform-engineering/clusters
roles> /butler/admin/teams
roles> shot        # screenshot all five
roles> q
```

## Identities

| Key               | Acts as                              | Scope                                       |
| ----------------- | ------------------------------------ | ------------------------------------------- |
| `platform-admin`  | `e2e-parity-padmin@butlerlabs.dev`   | `platformRole: admin`, no team memberships  |
| `platform-viewer` | `e2e-parity-pviewer@butlerlabs.dev`  | `platformRole: viewer`, no team memberships |
| `team-admin`      | `e2e-parity-tadmin@butlerlabs.dev`   | admin of `platform-engineering`             |
| `team-operator`   | `e2e-parity-operator@butlerlabs.dev` | operator of `platform-engineering`          |
| `team-viewer`     | `e2e-parity-viewer@butlerlabs.dev`   | viewer of `platform-engineering`            |

The three team roles share one team on purpose, so the differences between
them are the only thing that changes between those windows.

The mapping lives in `app-config.roles.yaml`. Point it at your own
butler-server users if you are not running against butler-beta.

## What it does and does not do

Selecting an identity replaces the Backstage sign-in step and nothing
else. The chosen email travels the same path a real session's email
travels: the portal backend mints a proof for that user and butler-server
answers for that user's real roles. A viewer who reaches a mutation gets
the same refusal a real viewer gets.

So the harness cannot grant a capability the user does not have, and the
authorization you see is the authorization that ships.

## Screenshots and the capability matrix

```bash
yarn roles:shots        # every role, every reviewed route, light and dark
node scripts/role-audit.mjs   # what each role can reach and act on
```

Both write under `screenshots/`, which is ignored by git. The audit prints
a table and writes `screenshots/role-audit.json`.

## Safety

`DevIdentities` returns null when `NODE_ENV` is `production`, and logs an
error if config asks for it there. It also stays inert unless
`butler.devAuth.enabled` is set, and it will only ever act as an email
from the configured list, so a stale or invented cookie falls through to
the real session rather than escalating.

The frontend half compiles out of production bundles: the header is only
attached when `process.env.NODE_ENV !== 'production'`.

Do not enable `butler.devAuth` anywhere but a local machine.

## Shared fixtures the harness depends on

These live in the development estate, not in this repository, and the
review scripts assume them. Removing one breaks the harness rather than
tidying it.

- `e2e-talos`, a tenant cluster in the `platform-engineering` team. It is
  the default `BUTLER_ROLE_CLUSTER` for both `role-screenshots.mjs` and
  `role-audit.mjs`, so the cluster detail captures are of this cluster.
  Override with `BUTLER_ROLE_CLUSTER` rather than renaming it.
- `e2e-dev` and `e2e-staging`, environments on that team. `e2e-dev`
  carries limits and cluster defaults, `e2e-staging` deliberately carries
  neither, so the environments page shows both a capped and an uncapped
  row and the create form has a team default to inherit.
- `e2e-talos` is labelled into `e2e-dev`. That is what gives the
  environments page a non-zero cluster count and the release and delete
  confirmations something real to name.

Deleting the environments would also change how cluster creation behaves:
the TenantCluster admission webhook requires an environment label only
for a team that defines environments, so an estate with none silently
stops exercising that path.

Anything created while reviewing should be named `e2e-*` and removed
afterwards. The three fixtures above are the exception: they are meant to
persist.

## Providers: what a team may create against

A provider (`ProviderConfig`) carries a scope. `platform`, the default,
is usable by every team. `team` names exactly one team, and the
TenantCluster admission webhook refuses a cluster from any other team
that references it. A team provider is the same kind of object with a
narrower scope, not a reference to or a copy of a platform one.

Two reads exist and they mean different things:

- `GET /providers` is the whole estate, every scope, no filtering. It is
  the platform admin's inventory.
- `GET /teams/{team}/providers` is the platform providers plus the ones
  scoped to that team. It is what a team may actually create against.

The plugin reads the team list through `useTeamProviders`, and both the
create form and the team providers page consume that one hook. The
global list is used only by the platform admin's providers page.

Authorization, probed through the harness for all five identities:

| Endpoint                            | platform admin | platform viewer | team admin | team operator | team viewer |
| ----------------------------------- | -------------- | --------------- | ---------- | ------------- | ----------- |
| `GET /providers`                    | 200            | 200             | 200        | 200           | 200         |
| `GET /teams/{own}/providers`        | 200            | 200             | 200        | 200           | 200         |
| `POST /teams/{own}/providers`       | passes authz   | 403             | passes     | passes        | 403         |
| `DELETE /teams/{own}/providers/...` | passes authz   | 403             | passes     | passes        | 403         |
| `POST /providers` (platform)        | passes authz   | 403             | 403        | 403           | 403         |

Removal is therefore offered to team admin, team operator and platform
admin, and only for a provider scoped to this team. Connecting a cloud
account is not offered yet: the console's flow is AWS/Azure/GCP only and
this estate has no cloud provider to verify it against.

Before butler-server PR #100 the team read had no authorization, so any
user could list another team's scoped providers by naming that team in
the path. The harness server is the user's own build and will not carry
that fix until it is rebuilt.

To prove the scope boundary yourself, create a throwaway provider scoped
to a team you are not a member of, named `e2e-*`, and confirm it appears
in the global list, is absent from your team's list, and is refused at
admission when a cluster references it. Delete it and confirm the
ProviderConfig and its Secret are gone. Do not leave it behind.

## Cluster creation policy: seen by effect, read by platform roles

A `ClusterCreationPolicy` narrows or orders the images, networks, and for
Nutanix the clusters and storage containers a cluster may be created
with. The server resolves it inside those four list reads, most specific
scope first (team and environment, then team, then platform wide), from
the `X-Butler-Team` and `X-Butler-Environment` headers on the request.
There is no endpoint that returns an effective policy; each list's
`policy` object is the whole observable outcome, and the plugin never
evaluates policy itself.

`GET /admin/policies` and its detail answer platform admin and platform
viewer; every team role gets 403. So the Policies pages sit in the admin
rail for both platform roles, and a team sees only the note above each
list on the create form. A platform role gets a link from that note to
the policy.

The create form reads every list in the environment the cluster will be
created in and reads again when that choice changes. That matters: with
the team header alone a team-and-environment rule does not apply to the
list, while it does apply to the create.

To prove it yourself, create two `e2e-*` policies as a platform admin,
one platform wide and one for a team and environment on the same option
type, then read that option list as a team member with and without
`X-Butler-Environment` and compare the `policy.name` in each answer.
Delete both afterwards and confirm `GET /admin/policies` reports zero.

## Cluster observability: three addons and a pipeline

A cluster's logs, metrics and traces are collected by three ordinary
addons, `vector-agent`, `prometheus-operator` and `otel-collector`, which
Butler installs on the cluster and points at the platform pipeline named
by `GET /observability/config`. The Observability tab on a cluster is an
interface to those addons and nothing more: their status comes from the
cluster's `observedState`, an accepted install shows as enabling until
the platform reports it installed, and the tab polls only while a
collector is moving.

Reads are served to every role. Enable and Disable are offered to
platform admin, team admin and team operator, which is what the server's
`checkOperatePermission` allows; both viewers get 403 from the server
and see no buttons. Disable is confirmed here even though the console
removes on a bare click.

The fixture cluster carries a platform auto-enrolled `vector-agent` that
has been Installing for a long time. Leave it alone; it belongs to the
platform's auto-enrolment, not to this harness. To prove the lifecycle
yourself, enable traces with the export endpoint cleared so the debug
exporter is used and nothing leaves the cluster, watch it reach
Installed, then disable it and confirm the addon list no longer carries
it and butler-beta has no `otel-collector-e2e-talos` TenantAddon.

`/observability/status` and the pipeline routes are not in the portal's
route table and answer 403 for everyone through the portal; that is the
platform observability page's dependency, not this tab's.
