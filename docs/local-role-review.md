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

## Platform providers: create and edit through one control plane

A platform admin creates, tests, validates, edits and deletes providers
from the admin providers page. There is one provider model: the
`ProviderConfig` the server writes, with credentials in a Secret it
manages and only a `credentialsRef` on the object. The plugin sends
secret material once, on create or when a replacement is typed into the
edit dialog, and never reads it back; nothing about a credential is
stored client side.

What the server does with an edit decides what the dialog sends:

- `PUT /providers/{ns}/{name}` is a merge. Only non-empty fields change;
  credentials are merged per key into the Secret; network and limits
  maps are merged. The dialog therefore sends only what differs from the
  provider it opened with, and sends nothing at all when nothing
  changed.
- Name, provider type and scope cannot change. The dialog shows them as
  facts. The insecure TLS flags are honoured only on create.
- `removeCABundle` is the only way to drop a CA bundle; an empty bundle
  field means "keep".

Readiness is not reachability. The controller sets `status.ready` and
`status.validated` when the credentials Secret is present, and reports
both true for an endpoint that does not answer (proven with
`127.0.0.1:1`). The detail view says so: readiness is shown as
"credentials present", and a Validate run is the only thing that shows
whether the endpoint answers. Validate results name the failing stage
from the server's `category` (auth, tls, network, parse).

Admission refuses a provider in `ipam` network mode without at least
one pool reference, and the server surfaces that denial as a 500. The
create page and the edit dialog refuse the same shape first, with the
field named.

Authorization, probed through the harness for all five identities:

| Endpoint                                                | platform admin | every other role |
| ------------------------------------------------------- | -------------- | ---------------- |
| `GET /providers`, `GET .../networks`, `GET .../ca-info` | 200            | 200              |
| `POST /providers`, `POST /providers/test`               | passes authz   | 403              |
| `PUT /providers/{ns}/{name}`, `DELETE ...`              | passes authz   | 403              |
| `POST /providers/{ns}/{name}/validate`                  | passes authz   | 403              |

The page offers Create, Edit, Test and Delete to the platform admin
only. That mirrors the server; it is not the gate.

Six provider types are offered. Harvester, Nutanix and Proxmox are the
ones this estate runs. AWS, Azure and GCP are accepted by the server
and covered by unit tests, but there is no cloud account here to create
one against, so treat those forms as unproven end to end.

To prove the flow yourself, create a throwaway `e2e-*` harvester
provider with a bogus kubeconfig. Confirm the object holds only the
`credentialsRef`, that Validate reports the endpoint unreachable while
readiness reads ready, that an edit of one field leaves the others
untouched, then delete it and confirm the ProviderConfig and its Secret
are gone from butler-beta. Do not leave it behind.

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

## Audit: what changed, who, when, where, and how the server answered

Two logs, both the server's own audit buffer (`internal/audit`, a
10,000-event in-memory ring that starts over on restart). The platform
log (`GET /admin/audit`) is every recorded event across teams; a team's
Activity (`GET /teams/{team}/audit`) is the events recorded while the
caller acted as that team, filtered on the request's team context
(`teamRef`), not on which team owns the resource. So a platform admin's
change made from the admin pages appears in the platform log, not in the
team's Activity, because it carried no team context.

The server records every mutation (POST/PUT/PATCH/DELETE), the two reads
that hand out material (kubeconfig, cluster export), and sign-in and
sign-out. Each event carries the actor email, an action verb, a
resource type derived from the path prefix ("Unknown" for nested admin
routes), the `{name}`/`{namespace}` path parameters, the HTTP method and
path, the status code, a scrubbed and truncated request body, the source
address, and the identity provider for sign-ins.

The page turns each event into a sentence from a bounded table of the
server's real router shapes (Added member, Changed group role, Scaled
workers, Removed addon, Created provider), reading the safe fields of the
request body for the object name. A path that matches none of those falls
back to the server's own action and resource type ("Updated network
pool"), and only then to the raw method and path; the raw request always
stays in the detail view. Outcome is read from the status code and kept
in three kinds: Refused (401/403, the server said no to this caller),
Rejected (other 4xx, malformed or conflicting), and Failed (5xx, the
server could not do it) — a refusal is not a failure.

Filtering and paging are the server's: actor, action, resource type,
outcome, and a from/to date range, with offset paging at 25/50/100. The
Portal backend proxy was dropping the query string when it forwarded a
request (`req.path` carries none), so every server-side filter and page
size had been reaching the server empty; that is fixed, and a unit test
pins it.

Privacy: the server's scrubber redacts an exact list of keys (password,
token, secret, kubeconfig, ...). Butler's own request bodies use
prefixed keys the list does not match (`harvesterKubeconfig`,
`nutanixPassword`, `azureClientSecret`, `gcpServiceAccount`), so a
provider or identity-provider creation can leave its credential in the
stored summary. That is a server finding; the page additionally redacts
any credential-shaped key before rendering and never renders a body that
is not JSON, so no secret reaches the screen whatever the server stored.

Authorization, from the train's `audit.go` (#93 relaxed the platform log
to platform viewers) and probed live at the start of this slice, before
the harness dev-identity resolver degraded (see below):

| Endpoint                   | platform admin | platform viewer | team admin | team operator | team viewer |
| -------------------------- | -------------- | --------------- | ---------- | ------------- | ----------- |
| `GET /admin/audit`         | 200            | 200             | 403        | 403           | 403         |
| `GET /teams/{own}/audit`   | 200            | 200             | 200        | 403           | 403         |
| `GET /teams/{other}/audit` | 200            | 200             | 403        | 403           | 403         |

The platform Audit Log is offered to platform admins and viewers; a
team's Activity to that team's admins and to platform roles. Operators
and viewers are refused and are not offered the entry; a direct URL
shows the server's refusal as a plain note, not an error.

A harness caveat that shaped this proof: partway through the slice the
local dev-identity resolver began resolving every `x-butler-dev-identity`
to platformRole=admin (right email, wrong role), so a live probe taken
after that point returned 200 for every role and could not demonstrate
the team-role refusals. The matrix above is the pre-degradation probe,
which agrees with the server code; the browser captures of a team
operator seeing the team log are contaminated by the same degradation
and are not cited. The rule going forward: an authorization probe counts
only when a discriminating endpoint (such as `GET /admin/identity-providers`)
still refuses a team role at capture time.

## Teams: the authorization boundary, read from the server

A team is one `Team` object. The server never hands the CRD to a client;
`GET /teams/{name}` answers the flat `TeamResponse`: identity, phase,
counts, `resourceLimits` (spec), `resourceUsage` (status, written by the
controller), `clusterDefaults` and `environments`. The plugin reads that
shape and nothing else; the earlier `spec.resourceQuotas` reads matched
no field the server has ever returned, which is why limits and usage
rendered as absent.

Limits and usage are two maps and stay two things on the page. A limit
that is absent is unlimited; usage that is absent has not been reported
by the controller and is shown as "Not reported", never as zero. A bar
is drawn only where both exist. `status.quotaStatus` exists on the CRD
but is not in the response, so the page computes its summary from the
two maps rather than claiming a controller verdict.

Who has access, and why, is the server's verdict per member
(`GET /teams/{name}/members`): `direct` (listed on the team), `group`
(an IdP group the team maps, matched against the groups seen on the
user's last sign-in), or `elevated` (listed directly above the group's
role). `canRemove` and `removeNote` come from the server; removing a
direct member who also matches a group leaves them with the group's
role, and the response says so. Group members appear only after they
have signed in once, so a mapped group with zero observed members is
normal, not broken. Effective access is resolved by the server at
sign-in as the highest role across direct and group grants; the plugin
never computes a role the server has not stated.

Writes, as the running server enforces them (probed with bodies that
fail validation after the authorization check):

| Endpoint                                            | platform admin | platform viewer | team admin    | team operator | team viewer |
| --------------------------------------------------- | -------------- | --------------- | ------------- | ------------- | ----------- |
| `GET /teams`, `GET /teams/{name}`, `GET .../groups` | 200            | 200             | 200           | 200           | 200         |
| `GET /teams/{name}/members`                         | 200            | 200             | 200 (own)     | 200 (own)     | 200 (own)   |
| `PUT /teams/{name}` displayName/description         | passes         | 403             | passes        | 403           | 403         |
| `PUT /teams/{name}` resourceLimits                  | passes         | 403             | 403 (webhook) | 403           | 403         |
| `POST/PATCH/DELETE /admin/teams/{name}/members/...` | passes         | 403             | 403           | 403           | 403         |
| `POST/PATCH/DELETE /admin/teams/{name}/groups/...`  | passes         | 403             | 403           | 403           | 403         |
| `POST /admin/teams`, `DELETE /admin/teams/{name}`   | passes         | 403             | 403           | 403           | 403         |

Two consequences the pages follow. Membership and group mappings are
administered by platform admins only; a team admin is refused at the
API, so the team members page offers no add or remove to them and says
why (the console offers the controls and they fail). Any authenticated
user can read any team's record and group mappings, and the member list
of their own teams; that is the server's choice, recorded as a finding,
and the plugin does not pretend otherwise.

Safety the server does not provide: nothing stops removing the last
direct admin of a team or demoting yourself; the remove dialog says so
when the target is the team's only direct admin, and the server's
`canRemove` is false for your own direct membership. Writes update the
object they read, so a concurrent write is refused by the apiserver's
resourceVersion check, but the handler reports that as 500 rather than 409. Membership changes emit no Kubernetes events; the audit trail is
the server log.

Live proof on `platform-engineering` used the disposable principal
`e2e-parity-nobody@butlerlabs.dev` (a user record with no teams) and an
unused mapping `e2e-parity-nogroup`: add, duplicate (409), role change,
invalid role (400), remove, remove again (404); group add, unknown IdP
(400), duplicate (409), role change, remove. `spec.access` was
byte-identical to the baseline afterwards. Limits were not changed on
the live team.

## Cluster detail: desired, targeted and observed are three numbers

A TenantCluster carries what was asked for in `spec` and what the
controller has done in `status`, and the two disagree for as long as an
operation runs. The detail page keeps them apart:

- `spec.workers.replicas` is what was requested. `status.workerNodesDesired`
  is what the controller is currently working toward. `status.workerNodesReady`
  is what is Ready. While requested differs from targeted the page says
  "Scaling to N"; while ready differs from targeted it says "x/y ready";
  neither is reported as done because the HTTP call returned 200.
- The control plane is read from the `ControlPlaneReady` condition and,
  on its tab, from the Steward TenantControlPlane projection (phase,
  version, endpoint, replicas ready, datastore, konnectivity, bootstrap).
  It is never inferred from the cluster phase.
- Workers are read from the `WorkersReady` condition. The console
  upgrades `WorkersReady=False` to "Ready" whenever the phase is Ready;
  this page does not. On 2026-08-28 the live `e2e-talos` was phase Ready
  with `WorkersReady=False, 1/2 ready` for fifteen days, one CAPI
  machine's node NodeHealthy Unknown; the console shows it as healthy.
- Banners are for states that need a person: Cluster Failed, Cluster
  Degraded (`Ready` reason `ReconcileDegraded`), Stale Nodes (ready >
  desired on a Ready cluster), and Workers have not converged (ready <
  desired on a Ready cluster for more than thirty minutes, measured from
  the condition's `lastTransitionTime` the controller wrote, not from
  the browser). Ordinary provisioning gets no banner.
- Polling runs at 5 seconds only while the phase is not Ready, workers
  are converging, or a requested scale has not been targeted yet; a
  stable cluster is not polled.

Machine requests and load balancer requests are records of Butler
provisioning machines and load balancers itself. On this estate only
butler-bootstrap creates MachineRequests (management provisioning);
tenant clusters get workers as Cluster API machines through the
provider and addresses from the platform pool (`status.lbAllocationRef`,
NetworkReady "LB IPs allocated"). Both lists are therefore empty for
every tenant cluster, which is normal, and the cards say so instead of
rendering nothing.

Export YAML is the TenantCluster with `status` and server-side metadata
stripped by the server. It carries secret references only; the
kubeconfig secret name lives in `status` and is not exported.

Authorization, probed through the harness for all five identities on
`e2e-talos` (bodies that fail validation after the authorization check,
so nothing mutated):

| Endpoint                                                                                | platform admin | platform viewer | team admin   | team operator | team viewer |
| --------------------------------------------------------------------------------------- | -------------- | --------------- | ------------ | ------------- | ----------- |
| `GET .../{ns}/{name}`, `/tenantcontrolplane`, `/machines`, `/load-balancers`, `/export` | 200            | 200             | 200          | 200           | 200         |
| `PATCH .../scale`, `PUT .../environment`, `PUT .../{ns}/{name}`                         | passes (400)   | 403             | passes (400) | passes (400)  | 403         |

The team boundary is `checkClusterAccess`: a platform role reads every
cluster; a team member reads only their team's clusters; every read and
mutation on the detail page goes through it. The harness has a single
team, so the cross-team refusal is proven against the mock, which
mirrors that check on every cluster method, and against the server's
code, not against a second live team.

Live mutations this slice: a no-op environment change (same
environment) returned 200 and left the object untouched
(resourceVersion and generation unchanged). Scaling was not executed:
the cluster's MachineDeployment has been `ScalingUp` 1/2 for months, so
a +1 would join a stuck queue and prove nothing; scale and environment
moves were proven live on 2026-08-26 when the cluster was quiet.

## Identity providers: one OIDC record, edited by merge

An identity provider is a cluster-scoped `IdentityProvider` of type
`oidc` (the only type the CRD allows) whose client secret lives in a
Secret the server manages; the object carries only `clientSecretRef`.
The server never returns the secret value, and the plugin never asks
for it: the detail view says "Configured in secret <name>" because the
reference is there, and the edit dialog leaves the secret field blank.

The update the server performs (`PUT /admin/identity-providers/{name}`)
is a merge with one exception:

- every non-empty string in the request replaces the stored one
  (display name, issuer, client ID, redirect, hosted domain, claims);
  `scopes` replaces when non-empty; the client secret is rewritten only
  when `clientSecret` is sent. Nothing can be cleared by sending it
  empty; the dialog says so when an optional field is emptied.
- `insecureSkipVerify` is written from the request on every update,
  empty request or not. The plugin resends the current value whenever
  it sends anything, so an unrelated edit cannot silently reset it. The
  console's edit modal never sends it, so every console edit sets it to
  false.
- name and type are not part of the request; they are shown as facts.
- `platformRoleGroups` and `googleWorkspace` are not touched by create
  or update at all and are not offered.

The plugin sends only fields that differ from the loaded provider and
issues no request when nothing changed. Test Connection runs the
server's OIDC discovery against the stored issuer: it proves the
discovery document was fetched and parsed and nothing more, and the
result says so. With no controller on this estate the object has no
status, and the detail shows "No status reported" rather than a phase.

Authorization, probed through the harness for all five identities:

| Endpoint                                    | platform admin | platform viewer | team roles |
| ------------------------------------------- | -------------- | --------------- | ---------- |
| `GET /admin/identity-providers[/{name}]`    | 200            | 200             | 403        |
| `PUT /admin/identity-providers/{name}`      | passes authz   | 403             | 403        |
| `POST .../{name}/validate`, `POST .../test` | 200            | 403             | 403        |
| `DELETE /admin/identity-providers/{name}`   | passes authz   | 403             | 403        |

Known server defect, staged as a separate butler-server PR and not
merged: an update whose body carries `scopes` answers an empty 500,
because the handler stores a Go string slice in the unstructured object
and the deep copy inside `SetNestedMap` panics on it. Until that lands,
editing scopes from the plugin fails with the server's 500; every other
field updates.

To prove editing without touching the login path: open the real
provider, save the dialog unchanged and confirm no request is sent;
then change only the display name, save, change it back, and confirm
`GET` returns a spec identical to the one you started from and the
Secret's resourceVersion did not move. Do not change the issuer, client
ID, redirect URL, secret or claims of the provider people sign in with.

## Platform observability: the pipeline the collectors send to

Three related systems, kept apart on purpose:

- The platform pipeline is one record on the ButlerConfig singleton
  (`spec.observability.pipeline`): a reference to an existing Ready
  cluster that runs the aggregation stack, plus the log, metric and
  trace endpoints collectors send to. There is one pipeline per platform,
  not one per team or environment. The admin Observability page is about
  this record and the fleet seen from it.
- Cluster collectors are three addons on each tenant cluster
  (`vector-agent`, `prometheus-operator`, `otel-collector`), enabled,
  configured and disabled on that cluster's Observability tab. The
  platform page links to them and manages none of them.
- Generic addons are the same TenantAddon objects on the Addons tab. The
  server's fleet status is a read of those objects across every cluster;
  the platform page renders that read and never lists addons itself.

What the server reports, and how the page words it:

- `GET /observability/config` (any authenticated role): registered or
  not, the pipeline cluster and endpoints, and the collection defaults.
- `GET /admin/observability/status` (platform admin only): the pipeline
  cluster's phase, an aggregator status, one row per tenant cluster with
  its three collectors, and summary counts. The aggregator status is
  either a vector-aggregator addon phase on the pipeline cluster or the
  result of the server probing the log endpoint host's Vector API on port 8686. Registered, cluster Ready and aggregator reachable are three
  facts and stay three facts on the page. On this estate the aggregator
  reports Unreachable because port 8686 is not answered, while logs
  still arrive at the log endpoint.
- Every write is platform admin only: `PUT /admin/observability/config`
  (pipeline endpoints or collection defaults; empty strings are ignored,
  so an endpoint can be replaced but not removed by editing),
  `POST /admin/observability/pipeline/setup` (registers a Ready cluster,
  labels it, writes the record) and `DELETE /admin/observability/pipeline`
  (clears the record and the label; deletes no cluster, addon or
  collector). The page asks for confirmation before deregistering and
  says exactly that.

Authorization, probed through the harness for all five identities:

| Endpoint                                   | platform admin | platform viewer | team roles |
| ------------------------------------------ | -------------- | --------------- | ---------- |
| `GET /observability/config`                | 200            | 200             | 200        |
| `GET /admin/observability/status`          | 200            | 403             | 403        |
| `PUT /admin/observability/config`          | passes authz   | 403             | 403        |
| `POST /admin/observability/pipeline/setup` | passes authz   | 403             | 403        |
| `DELETE /admin/observability/pipeline`     | passes authz   | 403             | 403        |

A platform viewer therefore sees the pipeline record and the collection
defaults read-only, with a note that the fleet view needs a platform
admin. Team roles are sent to their team dashboard by the admin route
guard, which matches the server refusing them everything under `/admin`.

The proxy's route table already classified `/admin/*`; the plugin simply
never called the status route or offered a page. The earlier note that
`/observability/status` was unclassified came from probing a path the
server does not serve.

To prove the page yourself without touching the estate: open it as
platform admin and as platform viewer, save the collection defaults
unchanged and confirm `GET /observability/config` is byte-identical
before and after. Do not deregister the live pipeline to prove the
button; the mock covers that flow and the live estate depends on it.

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

## Addons: values are replaced, then merged over defaults

Installing an addon creates a TenantAddon with a version and an optional
values object. One `PUT` sets values, version, or both. The server
replaces the values object wholesale; the controller deep-merges it over
the catalog's own defaults and reconciles whenever the spec changes. So
the editor holds the entire override set, an empty editor clears every
override, and omitted keys fall back to the catalog default rather than
being preserved.

The catalog exposes versions but not its default values, so the
effective merged configuration cannot be read through the API; the
editor shows overrides only.

Reads are served to every role. Install, reconfigure, change version and
remove are allowed for platform admin, team admin and team operator, and
refused for both viewers; the tab offers actions on that basis.

The fixture cluster carries the platform's auto-enrolled `vector-agent`.
Opening its configure dialog is a safe read; do not save it. To prove a
lifecycle, install `otel-collector` at an older catalog version with the
export endpoint cleared, change one harmless value and confirm the
version stayed put, restore it, change only the version and watch
desired and installed diverge then converge, then remove it.
