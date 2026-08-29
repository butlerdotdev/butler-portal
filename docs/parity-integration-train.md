# Parity train: what eventual integration would actually produce

Recorded 2026-08-28 after the Teams/RBAC slice, before any further
surface is added. This is the answer to one question: if a maintainer
integrated the intended parity train, would every behaviour the audit
scores PARITY or PORTAL-BETTER still hold? It is derived from commit
identity and code, not from branch names or from what the local harness
happened to answer.

## The frozen train

| Repository                                    | Ref                                                                                                  | SHA                                              |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| butler-portal `main`                          | deployed base                                                                                        | `616678e`                                        |
| butler-portal `integration/train2`            | base of PR #79; 43 commits ahead of main, 0 behind; made of PRs #70 to #78, each open against main   | `6cf3f27`                                        |
| butler-portal `feat/butler-visual-foundation` | PR #79 head; 57 ahead of train2, 100 ahead of main, 0 behind either                                  | `4ae746d` (last implementation commit `4e24b16`) |
| butler-server `main`                          | deployed on butler-beta as image `20260712022648-sha-4dd6f37`                                        | `4dd6f37`                                        |
| butler-server `integration/train1`            | 17 commits ahead of main, 0 behind; the merge of PRs #92 to #99; exists only locally (not on origin) | `77e7b57`                                        |
| butler-server PR #100                         | `fix/team-providers-read-authz`, based on main                                                       | `1f1c4be`                                        |
| butler-server PR #101                         | `fix/idp-update-scopes`, based on main                                                               | `3fdd1a7`                                        |
| butler-controller on butler-beta              | carries the Team, TenantCluster, ProviderConfig and policy admission webhooks                        | image `sha-9596ead`                              |

Nothing from any of these is merged, released, deployed or promoted.

## What the harness server actually is

The Portal's `app-config.local.yaml` points the proxy at
`http://localhost:8081`. That port is served by the process started on
2026-08-22 13:46 from a binary built from `validation/train1-local`
(`4ee86b0`, committed 11:26 that day), whose tree is byte-identical to
`integration/train1`. Two facts pin it: the refusals "Platform admin
required to change resourceLimits", "... to delete teams" and "... to
create teams" exist in no branch except the train1 set (#92), and the
two defects fixed by #100 and #101 were both reproduced live against it.
Port 8080, the app-config default, is the kind `butler-bootstrap`
container and was not used by any proof.

So: every live proof in the parity program ran against
**main + #92 + #93 + #94 + #95 + #96 + #97 + #98 + #99**, without #100 or
#101. There are no unpublished commits in the harness build.

## The intended integration set and its synthetic result

A disposable worktree took `origin/main`, merged `integration/train1`,
then #100, then #101. Every merge was clean (zero conflicts), `go build
./...` passed, and `go test ./...` passed in every package. Started on a
spare port with the butler-beta kubeconfig, that binary answered all 102
server paths the Portal client calls with exactly the same status the
harness gives (unauthenticated: 401 where the route exists, 405 for
method mismatches, none 404). The only 404 is `/_identity`, which is a
Portal backend route, not a server route.

The Portal branch descends from both `main` and `integration/train2`
with nothing behind, so its synthetic result is the branch itself:
`tsc:full` exit 0, 93 suites and 1430 tests, `build:all` exit 0, CI run
33212273345 green on the tip.

Required backend set, closed: **#92, #93, #94, #95, #96, #97, #98, #99,
#100, #101**. No hidden dependency remains. Not every one of those is a
Portal dependency (see the matrix); they are listed because the harness
carried all of them and the train is integrated as a set.

## Dependency matrix

Only rows where the server side matters are listed. "main" means the
behaviour exists on `origin/main` today.

| Feature (audit rows)                                                   | Portal                    | Server contract                                                                                                                                         | main                                                                                               | needs                                                                                        | What the staged PR changes                                                                                                                                                     |
| ---------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Create cluster, day-two ops, cluster detail reads (19 to 39, 64 to 81) | #79                       | `POST/PUT/PATCH/DELETE /clusters...`, `/tenantcontrolplane`, `/machines`, `/load-balancers`, `/export`; `checkClusterAccess` + `checkOperatePermission` | yes                                                                                                | none                                                                                         | #95 additionally requires the operate role for `/kubeconfig` and audits it (main: any member); #97 stops an admin of any team from passing platform checks in cluster handlers |
| Kubeconfig download (24)                                               | #79                       | `GET .../kubeconfig`                                                                                                                                    | yes (any member)                                                                                   | #95 for the operate-role gate                                                                | Portal already disables the button unless Ready; server-side role gate is staged                                                                                               |
| Team providers (104)                                                   | #79                       | `GET/POST/DELETE /teams/{t}/providers`, `POST .../providers/test`                                                                                       | reads unscoped on main                                                                             | **#100** (read gated on `CanViewTeam`), #97 (`TestTeamConnection` gated on `CanOperateTeam`) | without #100 any user can enumerate another team's scoped providers; the Portal's team boundary claim in row 104 needs #100                                                    |
| Platform providers (120 to 122)                                        | #79                       | `POST/PUT/DELETE /providers...`, `/test`, `/validate`                                                                                                   | mutations behind adminMiddleware (admin of any team)                                               | #93 (platform admin only)                                                                    | Portal offers mutations to platform admins only, which is stricter than main and equal to the train                                                                            |
| Policies read (123)                                                    | #79                       | `GET /admin/policies`                                                                                                                                   | yes (platform viewer+)                                                                             | none                                                                                         |                                                                                                                                                                                |
| Cluster observability (62) and addons (45 to 48)                       | #79                       | `/clusters/{ns}/{n}/addons...`, `GET /observability/config`                                                                                             | yes                                                                                                | none                                                                                         |                                                                                                                                                                                |
| Platform observability (114)                                           | #79                       | `GET /admin/observability/status`, `PUT .../config`, `POST .../pipeline/setup`, `DELETE .../pipeline`                                                   | behind adminMiddleware                                                                             | #93 (platform admin only)                                                                    | on main a platform viewer who is admin of some team would pass; Portal reads status only if the server serves it                                                               |
| Identity providers (117, 118)                                          | #79                       | `PUT /admin/identity-providers/{name}`                                                                                                                  | update exists; `scopes` in the body answers 500                                                    | **#101**                                                                                     | scopes edits from the Portal 500 until #101 lands; every other field works on main                                                                                             |
| Teams list, detail, settings (91, 101, 102)                            | #79                       | `GET /teams`, `GET/PUT /teams/{name}`                                                                                                                   | reads open; PUT has no role check on main (H1)                                                     | #92 for the server-side gate                                                                 | Portal gates the settings form on team admin or platform admin, which #92 makes the server rule too                                                                            |
| Team limits and defaults edit (94, 96)                                 | #79                       | `PUT /teams/{name}` with `resourceLimits` / `clusterDefaults`                                                                                           | limits refused for non-platform-admins by the Team admission webhook (butler-controller, deployed) | #92 adds the same refusal in the handler before the apiserver                                | works on main through the webhook; #92 gives the 403 message the Portal shows inline                                                                                           |
| Team delete (97)                                                       | #79                       | `DELETE /admin/teams/{name}`                                                                                                                            | platform admin (adminMiddleware under RequirePlatformViewer)                                       | #92 also gates the unguarded `DELETE /teams/{name}` (P0 D1)                                  | Portal uses the admin route; D1 is closed by #92                                                                                                                               |
| Members and groups (92, 93, 103, 109)                                  | #79                       | `POST/PATCH/DELETE /admin/teams/{name}/members                                                                                                          | groups...`                                                                                         | RequirePlatformViewer + adminMiddleware (admin of any team)                                  | #93 narrows the handlers to `IsAdminOfTeam(name)` or platform admin                                                                                                            | on main a platform viewer who is admin of another team could mutate this team's membership; the Portal offers these to platform admins only |
| Users (105 to 107)                                                     | #79                       | `GET /users`, `/admin/users...`                                                                                                                         | yes                                                                                                | none                                                                                         |                                                                                                                                                                                |
| Management page (83, 84)                                               | #79                       | `GET /management...`                                                                                                                                    | open to any session on main                                                                        | #96 (platform viewer or above)                                                               | Portal already hides it from team roles                                                                                                                                        |
| WebSocket relays                                                       | #79 (train2 PRs #75, #77) | `/ws/clusters`, `/ws/terminal/...`                                                                                                                      | portal proof accepted only when `BUTLER_PORTAL_PUBKEY` is set                                      | #98 (portal proofs at upgrade, disabled users refused), #94 (per-team filtering)             | not exercised by the parity slices; recorded for the train                                                                                                                     |

Everything else the Portal calls is on `main` unchanged.

## Live harness versus eventual train

| Contract                                                                                                                                | Verdict                                       |
| --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Every route shape and status the Portal depends on                                                                                      | SAME                                          |
| Team write gates, member-route narrowing, platform-admin-only platform mutations, management reads for viewers, kubeconfig operate gate | SAME (harness carries #92 to #99)             |
| Team-scoped provider read boundary                                                                                                      | MISSING FROM HARNESS, present in train (#100) |
| Identity provider update with scopes                                                                                                    | MISSING FROM HARNESS, present in train (#101) |
| Anything harness-only                                                                                                                   | NONE                                          |

## Authorization, as the synthetic server enforces it

Roles: PA platform admin, PV platform viewer, TA/TO/TV team admin,
operator, viewer of the named team. "own" means the caller's own team.

| Resource                 | List / read                                                               | Create                                 | Update                                                                                  | Delete                                       | Special                                                                                      |
| ------------------------ | ------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Clusters                 | any session, filtered by `checkClusterAccess` (PA/PV all; team roles own) | PA, TA, TO (`checkOperatePermission`)  | PA, TA, TO                                                                              | PA, TA, TO                                   | scale, environment: PA, TA, TO; kubeconfig: operate role (#95); terminal WS: team view or PA |
| Providers (platform)     | any session                                                               | PA (#93)                               | PA                                                                                      | PA                                           | test, validate: PA                                                                           |
| Providers (team)         | team view or PA/PV (#100)                                                 | PA, TA, TO                             | n/a                                                                                     | PA, TA, TO                                   | test: PA, TA, TO (#97)                                                                       |
| Policies                 | PA, PV                                                                    | PA                                     | PA                                                                                      | PA                                           | resolved inside option-list reads for team roles                                             |
| Addons (cluster)         | cluster readers                                                           | PA, TA, TO                             | PA, TA, TO                                                                              | PA, TA, TO                                   | values exposed to readers (finding kept)                                                     |
| Observability (platform) | config: any session; status: PA (#93)                                     | setup: PA                              | config: PA                                                                              | deregister: PA                               |                                                                                              |
| Identity providers       | PA, PV                                                                    | PA                                     | PA (#101 for scopes)                                                                    | PA                                           | test, validate: PA                                                                           |
| Teams                    | any session (record, groups); members: own team or PA/PV                  | PA (#92)                               | displayName/description: PA or TA (#92); limits: PA (webhook + #92); defaults: PA or TA | PA (#92 on `/teams`, admin route already PA) |                                                                                              |
| Members and groups       | as teams                                                                  | PA, or TA of that team (#93 narrowing) | same                                                                                    | same                                         |                                                                                              |
| Users                    | any session                                                               | PA                                     | PA (enable/disable/invite)                                                              | PA                                           |                                                                                              |
| Management cluster       | PA, PV (#96)                                                              | addons/gitops: PA (#93)                | PA                                                                                      | PA                                           | terminal: PA                                                                                 |

The Portal offers each action to exactly these roles, with one
deliberate difference: it offers member and group mutations to platform
admins only, not to admins of the named team, because in the train the
`/admin` prefix still sits under `RequirePlatformViewer`, so a team admin
without a platform role is refused before the handler's narrowing runs.

## D8: team records and group mappings are readable by any session

Behaviour on `main`, in the train and in the harness: `GET /teams`,
`GET /teams/{name}` and `GET /teams/{name}/groups` perform no team check;
any authenticated user reads every team's display name, description,
limits, usage, cluster defaults, environments and IdP group mappings.
Members need membership or a platform role; mutations need a platform
admin (or a team admin for members in the train).

Evidence for intent: ADR-014 defines `CanViewTeam` and states that a
platform viewer may view all teams, and the handler comment reads "List
returns all teams". No ADR or document says that ordinary users may
enumerate other teams. PR #100 shows the maintainer treating team-scoped
providers as not enumerable by other teams, which is the opposite
instinct for adjacent data. `CanViewTeam` exists and is not applied to
these three reads.

Classification: **PRODUCT GAP, documented; not a security gap by the
project's own stated model, and not an integration blocker.** The data
is organisational metadata and quota, not credentials, and the console
has served it to every user since the handler was written. It is a
decision request, not something a Portal branch should change:

> Should team records and group mappings be visible platform-wide, or
> only to members and platform roles (`CanViewTeam`)? If the latter, the
> change is a `CanViewTeam` check in `List`, `Get` and `ListGroupSyncs`,
> and the Portal's Access page and team pickers would then show only what
> the caller may see, which they already tolerate.

## Self and last-admin safety

- The server's `canRemove` is false for your own direct-only membership,
  but `RemoveMember` does not enforce it: a platform admin can remove
  themselves from a team through the API. Not an integration blocker; a
  platform admin keeps platform access regardless.
- Nothing prevents removing or demoting the last direct admin of a team.
  Afterwards only platform admins administer it, which is recoverable.
  The Portal warns; it does not claim the server prevents it.
- Team, member and group writes read the object, change it and update it
  with the resourceVersion they read, so a concurrent write is refused by
  the apiserver. The handler does not recognise that conflict and answers
  500 "Failed to update team" rather than 409. Concurrent state is never
  overwritten; the caller sees an unhelpful status. Not a blocker.
- Membership changes write no Kubernetes event; the audit trail is the
  server log (structured `Member added to team` and similar entries) and
  the audit middleware where a route is under it.

## PR hygiene and merge order

All ten server PRs are focused, based on `main@4dd6f37`, mergeable and
clean, carry a description and passing checks, and touch only the files
their titles name. #100 and #101 conflict with nothing in train1.

Server first, in this order, because the Portal offers actions the
train's server accepts and hides none the current server would accept
that the train refuses (the Portal is never more permissive than either):

1. #92 team write gates (closes D1), #93 platform-admin gates and member
   narrowing, #97 any-team-admin bypass: the authorization core.
2. #94, #98: WebSocket routing and portal proofs (no Portal parity row
   depends on them; they matter for the train2 relays).
3. #95, #96: kubeconfig operate gate, management reads for viewers.
4. #99: invite fields.
5. #100, #101: the two parity companions.

Then the Portal: PRs #70 to #78 (or `integration/train2` as one merge),
then #79. Merging Portal `main` builds the image tagged
`<timestamp>-sha-<sha>` and Flux's ImageUpdateAutomation on
butler-portal-live deploys it within five minutes, so the Portal merge is
the deployment. Merging server `main` does the same for butler-beta's
`butler-console-server` through butler-mgmt-live. Branch and PR pushes
produce only `sha-`, `pr-` and `branch-` tags, which the image policies
ignore; nothing staged has reached a cluster.

## Version compatibility

The Portal train against server `main` today: every route exists; two
behaviours degrade honestly (scopes edit answers the server's 500, which
the dialog shows; team-scoped providers of other teams are readable
through the API, which the Portal never requests). Everything else works.
The server train against the deployed Portal (`main@616678e`): additive;
no request shape changes; stricter refusals only where the old Portal
already hid the control. Server first is therefore safe, and there is no
window in which an incompatible pair is deployed. Minimum server for the
full audit claims: `main` + the ten PRs; the next server tag after that
merge is the version to record in the Portal's compatibility note.

## Audit rows whose claim depends on a staged server PR

118 (needs #101), 104 (needs #100 for the boundary it claims), 97 (D1
closed by #92), 92 and 93 (team-admin narrowing by #93), 94 (403 message
from #92; refusal itself from the deployed webhook). The audit rows carry
these annotations; no classification changed.

## Addendum 2026-08-28: audit closure and a harness caveat

Rows 110 and 111 (audit log, team audit) closed to PARITY. The platform
log needs #93 in the train (main serves `/admin/audit` to platform admins
only; #93 relaxes it to platform viewers); the Portal reads it as the
train serves it. A backend proxy bug was fixed on the Portal side
(`req.path` dropped the query string, so server-side filters and paging
never reached the server); it is a plugin-backend change inside PR #79,
not a server dependency.

Two server findings recorded, neither a blocker: D9, the audit scrubber
misses Butler's prefixed credential keys (the Portal redacts them
itself); D10, the local dev-identity harness intermittently resolves
every identity as platform admin, which invalidates live authorization
probes taken while degraded — authorization for this slice was taken from
`audit.go` and a pre-degradation probe. Neither changes the required
backend set (#92 to #101) or the merge order.

## Release-candidate closure gate 2026-08-28

The train was reviewed as one increment for merge readiness. Verdict:
PASS WITH CONDITIONS — one security fix (D9) is a new companion PR that
should merge with the train; the harness needs a restart before any
future live authority re-proof.

### Required backend set (updated)

`#92 #93 #94 #95 #96 #97 #98 #99 #100 #101` plus **#102**
(`fix/audit-scrub-credential-keys`, the D9 fix, based on `main`). All
OPEN, all based on `main@4dd6f37`, all mergeable/clean. The synthetic
integration of main + train1 + #100 + #101 + #102 merges with zero
conflicts, `go build ./...` and `go test ./...` pass, and answers all
102 Portal-required paths identically.

### D9 — audit scrubber credential retention: CLOSED (server-side, PR #102)

Root cause: `internal/audit/scrub.go` redacted an exact key list;
Butler's prefixed credential fields (`harvesterKubeconfig`,
`nutanixPassword`, `proxmoxTokenSecret`, `azureClientSecret`,
`gcpServiceAccount`, `awsSecretAccessKey`) never matched, so a provider
or IdP request retained its credential in the in-memory audit ring,
which `GET /admin/audit` serves to any platform viewer. Confirmed live:
`POST /providers/test` with a sentinel kubeconfig stored the sentinel
verbatim. A second, subtler path: the middleware pre-truncated the body
to 2048 bytes before scrubbing, so a larger body (a kubeconfig is
multi-KB) became invalid JSON and fell through to a raw-body summary
that was never scrubbed.

Fix (PR #102): match secret-bearing keys by normalized substring at any
depth (subsumes the old list, covers the prefixed fields; public CA
bundles deliberately not redacted), scrub top-level arrays, and never
return a raw non-JSON body — an unparseable or oversized body is
summarized as omitted. The middleware no longer pre-truncates into
invalid JSON. Tests assert a sentinel never survives, for every Butler
credential field and for nested/array/truncated/oversized/top-level
bodies, asserting the _stored_ summary. The Portal keeps its own
render-time redaction as defence in depth.

Existing in-memory events (the 10,000-entry ring) still hold
pre-fix summaries; they are lost on the next server restart, and no
restart happens in this pass. After PR #102 deploys, newly recorded
events cannot retain the identified credentials.

### D10 — dev-identity harness degradation: root cause found, not repaired this pass

The 6-day-old local harness process resolves every `x-butler-dev-identity`
to `platformRole=admin` (correct email, wrong role). The User CRDs on
butler-beta are correct (padmin=admin, pviewer=viewer, team roles carry
no platform role), so this is stale in-process state, not a data change:
when the long-running user-service's CRD lookup goes stale, the session
middleware's legacy-admin fallback ("User CRD not found ... legacy admin
has no User CRD") grants admin. A fresh process resolves correctly.

Repair is a restart, but a safe in-place restart is blocked: the old
binary is unlinked (cannot be re-run) and the portal signer's private
key file (`scratchpad/harness/portal-signing.key`, kid
`local-harness-2026-08-22`) was cleaned from scratchpad, so the matching
`BUTLER_PORTAL_PUBKEY` cannot be reconstructed to make a new server verify
the running portal's proofs. Restoring the harness therefore requires
regenerating the keypair and restarting BOTH the portal dev server and
the butler-server — heavier than a bounded state repair, and it would
interrupt the running dev environment. Not done here.

Consequence: the live authority matrix cannot be re-proven against this
harness in this pass. The authority evidence used is the server source
(read directly), the pre-degradation live probe captured at the start of
the audit slice, and the automated tests, which all agree. The all-admin
harness was not used to "prove" anything.

Restart recipe for a maintainer or next session: rebuild the release
candidate (`main` + `#92..#102`), generate a fresh Ed25519 keypair, write
the private key to `butler.signing.keyPath`, set `BUTLER_PORTAL_PUBKEY`
to the SPKI public key with kid matching `butler.signing.kid`, restart
the portal dev server and the butler-server together, then confirm role
differentiation with a discriminating endpoint (`GET /admin/identity-providers`
must 403 a team role) before trusting any probe.

### Proxy query-forwarding fix is cross-cutting

The plugin-backend proxy forwarded `req.path`, which drops the query
string, so every server-side query reached the server empty. `upstreamPath`
now carries it. Affected callers: `listClusters` (`?team=`, intended
narrowing), both audit lists (filters/paging, proven), and
`gitops/repos/branches` (`?repo=`, which the server _requires_ — so
branch selection had always returned 400; the fix repairs that latent
defect too, row #57). The helper slices the already-encoded query
verbatim: no double-encoding, repeated params and encoded slashes
preserved (unit test), no fragment handling needed.

### Remaining MISSING rows, classified (none block the RC)

- Release-required: none. Nav is honest — every rail entry reads real
  data (Settings row 88 was stale; it reads the real `/admin/config`
  read-only, re-scored PARTIAL).
- Post-release P1: 54/55 (GitOps v2 preview/export-cluster), 75 (quota
  pre-checks), 112 (Images), 113 (Addon catalog admin), 129
  (NotificationBell realtime), 88-edit (PUT /admin/config by section).
  Row 41 (Control Plane tab) is implemented; its MISSING is likely stale
  and should be re-checked, not a blocker.
- P2: 3, 5, 6, 15, 16 (cluster-list filters/grouping/owner column, team
  create modal), 76 (per-member cap), 100 (env migration), 127 (device
  auth), 132 (shadow mode, partially present).
- P3: 108 (bulk user delete), 131 (permission-change warning).

### Merge order (unchanged, + D9)

Server: (#92, #93, #97) then (#94, #98) then (#95, #96) then #99 then
(#100, #101), and **#102** any time (independent, based on main; merge it
with or before the train so the audit log ships without the credential
leak). Then Portal: #70–#78 (or `integration/train2`) then #79.
Server-first stays safe; the Portal is never more permissive than either
server. Only a default-branch push builds the timestamped tag Flux
auto-deploys, so each merge is its own deployment.

### Rollback

Each repo rolls back independently by reverting the merge (or pinning the
previous `<ts>-sha` image via the Flux ImagePolicy override). Because
server-first is additive, rolling back the Portal alone leaves the newer
server serving the older Portal, which is compatible. Rolling back the
server while the new Portal stands degrades gracefully: scopes edits 500
(shown), team-scoped provider reads widen, audit still works. No
schema/persistent migration is involved (audit is in-memory; Team/Provider
changes are CRD-compatible), so rollback is a redeploy, not a data repair.

### Post-merge smoke checklist (for the maintainer, after they deploy)

1. Auth: each of the five roles resolves with the right platformRole
   (`/auth/me`), and `GET /admin/identity-providers` 403s a team role.
2. Clusters: list, detail, scale/edit/environment offered to admin/operator
   only; kubeconfig requires operate.
3. Providers: platform create/edit/validate platform-admin only; team
   providers scoped (a team cannot read another team's, #100).
4. Policies read; observability status platform-admin only; addons values
   round-trip.
5. Identity providers: update a non-scope field, then a scopes field
   (must not 500, #101).
6. Teams: limits editable by platform admin only (webhook), members/groups
   by platform admin; another team admin refused.
7. Audit: platform log to admin+viewer, team activity to team admins;
   operators/viewers refused; a provider-create event shows `[REDACTED]`,
   not a credential (#102); a filter and a page change the result.
8. Cross-team denial holds on providers, members, audit.
