# Butler Portal Plugin vs butler-console: Comparative Gap Analysis

Date: 2026-05-27
Scope: the Butler plugin inside butler-portal (`plugins/butler` and `plugins/butler-backend`) compared to butler-console, backed by butler-server and butler-api.
Method: read of plugin source, console routes/components/API client, butler-server routes/handlers, and butler-api CRD types. File paths and line numbers cited throughout.

Repos (siblings under `butlerdotdev/`):
- Portal plugin: `butler-portal/plugins/butler`, `butler-portal/plugins/butler-backend`
- Console: `butler-console/src`
- Server: `butler-server/internal/api`
- API: `butler-api/api/v1alpha1`

A note on the premise. The brief framed this as bringing a developer-self-service plugin up to parity with an operator console, on the assumption the portal is behind. The code does not match that framing. The portal Butler plugin is a near copy of the console UI, admin surfaces included, wrapped in a single Backstage routable tab. It is not behind on features. It is behind on Backstage-native integration and on quality, and it is insecure by default. Those are three different problems with three different kinds of fix, and they are kept separate below.

---

## Section 0: Persona and Scope Boundaries

### The two surfaces

- Console persona: platform engineer operating the platform. Standalone React SPA (`butler-console/src/App.tsx`) that talks directly to butler-server over `/api` with an httpOnly JWT cookie (`butler-console/src/api/client.ts`, `butler-console/src/contexts/AuthProvider.tsx`).
- Portal persona, as originally stated: developer self-serving against the platform. Backstage plugin living inside an IDP shell.
- Portal UX: a Backstage frontend plugin (`plugins/butler/src/plugin.ts`) plus a backend proxy plugin (`plugins/butler-backend/src/router.ts`). The frontend mounts a single routable page at `/butler/*`.

### Working assumption for this audit: dual persona

Per explicit decision, this audit treats the portal as serving both developer self-service and operator administration, because that is what the code already does. `plugins/butler/src/components/ButlerPage/ButlerPage.tsx` registers developer routes (`/t/:team/clusters`, workspaces) and operator routes (`/admin/clusters`, `/admin/teams`, `/admin/users`, `/admin/identity-providers`, `/admin/providers`, `/admin/management`) in the same plugin. `plugins/butler/src/api/ButlerApiClient.ts` exposes both developer calls and operator calls (`createIdentityProvider`, `deleteUser`, `createProvider`, management addon install/uninstall).

Because the portal already exposes operator surfaces, those surfaces are in scope and assessed for parity and depth like any shared capability. The original console-only-by-design exclusion list is therefore not applied as an exclusion. This is a working assumption for assessment, not a settled product decision. Whether the portal should keep operator surfaces (dual persona, then harden) or shed them back to the console (developer-only) is an open Phase 2 decision and is surfaced in Section 7.

### Portal-only by design (correctly absent from console)

- Workspaces. Lives in the Butler plugin (`plugins/butler/src/components/workspaces/WorkspacesPage.tsx`, `plugins/butler/src/components/shared/WorkspaceTerminalDialog.tsx`, workspace methods in `ButlerApiClient.ts`). Console has no workspace concept (confirmed: console source contains no Workspace type or page; the only `workspace` strings are the Google Workspace IdP preset in `butler-console/src/api/identity-providers.ts`). Backed by `butler-api/api/v1alpha1/workspace_types.go` and `butler-server/internal/api/handlers/workspaces.go`.
- Developer SSH key self-service (`listSSHKeys`/`addSSHKey`/`removeSSHKey` in `ButlerApiClient.ts`, server routes `butler-server/internal/api/router.go:385-387`). Not surfaced in console.
- Workspace images and templates (`listWorkspaceImages`, `listWorkspaceTemplates` in `ButlerApiClient.ts`).
- mirrord config and cluster service listing for local development (`generateMirrordConfig`, `listClusterServices`).
- Backstage catalog entity model, software templates and scaffolder, tech docs. These belong only in the portal because they are Backstage constructs. They are all currently absent (Section 2).

### Console-only by design (kept minimal under the dual-persona assumption)

Under dual persona almost nothing is intrinsically console-only. The few items genuinely tied to platform-operator workflows that a developer should never touch (for example platform-wide IPAM pool deletion in `butler-console/src/pages/NetworkPoolDetailPage.tsx`, and ButlerConfig editing in `butler-console/src/api/config.ts`) are listed in the matrix as portal-behind with a note that their inclusion depends on the dual-persona decision. They are flagged, not assumed.

### Fuzzy lines flagged for decision

- Certificate rotation (`rotateCertificates` exists in `ButlerApiClient.ts` and in console `butler-console/src/api/certificates.ts`). Rotation is an operator action with cluster-wide impact. Present in the portal today. Flag: keep for operators or hide from the developer view.
- IdentityProvider create/edit and Provider create. Present in the portal (`plugins/butler/src/components/admin/CreateIdentityProviderPage.tsx`, `plugins/butler/src/components/providers/CreateProviderPage.tsx`). Cluster-admin-grade configuration. Flag under the trim-vs-harden decision.

---

## Section 1: Capability Matrix

Status values: parity, portal-behind, console-behind, portal-only-by-design, console-only-by-design.

Console component paths are under `butler-console/src/`. Portal paths are under `butler-portal/plugins/`.

### TenantCluster operations

| Capability | Console | Portal | Status | Notes |
|---|---|---|---|---|
| List clusters | `api/clusters.ts` list, `pages/ClustersPage.tsx`, `pages/AdminClustersPage.tsx` | `butler/src/api/ButlerApiClient.ts` listClusters, `butler/src/components/clusters/ClustersPage.tsx` | parity | Console adds environment grouping and phase chips (Section 3). |
| Get / detail | `pages/ClusterDetailPage.tsx` (9 tabs) | `butler/src/components/clusters/ClusterDetailPage.tsx` (7 tabs, lines 423-429) | portal-behind | Portal lacks Control Plane and Observability tabs. |
| Describe (full spec/status) | `pages/ClusterDetailPage.tsx` | `butler/src/components/clusters/ClusterDetailPage.tsx` | parity | Conditions rendered in portal Overview (lines 567-576). |
| Create | `pages/CreateClusterPage.tsx` | `butler/src/components/clusters/CreateClusterPage.tsx` | parity | Provider-specific forms present in both. |
| Scale workers | `components/clusters/ScaleWorkersModal.tsx` | `ButlerApiClient.ts` scaleCluster (PATCH) | parity | Console auto-polls to convergence; verify portal poll depth (Section 3). |
| Delete | `components/clusters/DeleteClusterModal.tsx` | `ButlerApiClient.ts` deleteCluster | parity | |
| Kubeconfig download | `api/clusters.ts` getKubeconfig | `ButlerApiClient.ts` getClusterKubeconfig | parity | Both gate on phase Ready. |
| Status / conditions | `components/.../StatusBadge`, OverviewTab | `butler/src/components/StatusBadge/StatusBadge.tsx`, ClusterDetailPage Overview | parity | |
| Events | `pages/ClusterDetailPage.tsx` EventsTab | ClusterDetailPage Events tab (index 5, lazy at line 212) | parity | |
| Nodes | NodesTab | ClusterDetailPage Nodes tab (index 1, lazy at line 209) | parity | |
| Addon enablement on cluster | `components/clusters/AddonsTab.tsx` | `butler/src/components/clusters/AddonsTab.tsx` | parity | |
| Control Plane (Steward TCP) detail | control-plane tab, `api/steward.ts` getClusterTCP | none (no tenantcontrolplane method in `ButlerApiClient.ts`) | portal-behind | Server has `router.go:329`. |
| Machine / LoadBalancer allocations | `components/clusters/NetworkAllocationsCard.tsx`, getMachineRequests/getLoadBalancerRequests | none in `ButlerApiClient.ts` | portal-behind | Server has `router.go:327-328`. |
| Export cluster YAML | `api/clusters.ts` exportYAML | none | portal-behind | Minor. Server `router.go:326`. |
| Real-time cluster updates | `contexts/WebSocketProvider.tsx` (`/ws/clusters`) + 5s poll | refresh-only useState/useEffect; WS only for terminal | portal-behind | Depth gap, Section 3. |

### Team membership

| Capability | Console | Portal | Status | Notes |
|---|---|---|---|---|
| View members (users/roles) | `pages/TeamMembersPage.tsx` | `butler/src/components/teams/TeamMembersPage.tsx` | parity | Portal also exposes add/remove/role-change methods. |
| View group sync | TeamMembersPage groups | TeamMembersPage groups | parity | |

### IdentityProvider

| Capability | Console | Portal | Status | Notes |
|---|---|---|---|---|
| List / view | `pages/IdentityProvidersPage.tsx` | `butler/src/components/admin/IdentityProvidersPage.tsx` | parity | |
| Create / edit / validate | `pages/CreateIdentityProviderPage.tsx` | `butler/src/components/admin/CreateIdentityProviderPage.tsx` | parity | Operator-grade; flagged in Section 0. |

### AddonDefinition browsing

| Capability | Console | Portal | Status | Notes |
|---|---|---|---|---|
| Catalog browsing | `pages/AddonCatalogPage.tsx` | only inline during install in AddonsTab; no standalone page | portal-behind | API `getAddonCatalog` exists but no browse surface. |
| AddonDefinition admin CRUD | `api/addons.ts` create/update/deleteDefinition (`/admin/addons/catalog`) | none (`admin/addons/catalog` absent from `ButlerApiClient.ts`) | portal-behind | Server `router.go:478-480`. |

### TenantAddon enable/disable

| Capability | Console | Portal | Status | Notes |
|---|---|---|---|---|
| Install / update / uninstall | AddonsTab | `butler/src/components/clusters/AddonsTab.tsx` | parity | |

### Certificates

| Capability | Console | Portal | Status | Notes |
|---|---|---|---|---|
| Visibility | `components/clusters/certificates/CertificatesTab.tsx` | `butler/src/components/clusters/CertificatesTab.tsx` | parity | |
| Rotation | `api/certificates.ts` rotateCertificates | `ButlerApiClient.ts` rotateCertificates | parity | Operator action present in portal; flagged Section 0. |

### GitProvider and GitOps

| Capability | Console | Portal | Status | Notes |
|---|---|---|---|---|
| Git provider config | `api/gitops.ts` | `ButlerApiClient.ts` gitops methods, GitOpsTab | parity | |
| Cluster GitOps lifecycle | GitOpsTab (enable/discover/export/migrate) | `butler/src/components/clusters/GitOpsTab.tsx` | parity | One disabled tool labeled "Coming soon" (GitOpsTab.tsx:1349). |
| Management GitOps | `api/gitops.ts` management methods | `ButlerApiClient.ts` management gitops | parity | |

### Providers

| Capability | Console | Portal | Status | Notes |
|---|---|---|---|---|
| List / view | `pages/ProvidersPage.tsx` | `butler/src/components/providers/ProvidersPage.tsx` | parity | |
| Create / test / validate / delete | `pages/CreateProviderPage.tsx` | `butler/src/components/providers/CreateProviderPage.tsx` | parity | Operator-grade; flagged Section 0. |
| Images / networks listing | listImages/listNetworks | listProviderImages/listProviderNetworks | parity | |
| Team-scoped providers | `api/providers.ts` listTeamProviders/createTeamProvider | none | portal-behind | Server `router.go:426-429`. |

### Management cluster and Steward

| Capability | Console | Portal | Status | Notes |
|---|---|---|---|---|
| Management overview/nodes/pods | `pages/ManagementPage.tsx` | `butler/src/components/admin/ManagementPage.tsx` | parity | |
| Management addons | ManagementPage | ManagementPage | parity | |
| Steward TCP / DataStore visibility | `api/steward.ts` (listTCPs, getDataStore) | none | portal-behind | Server `router.go:305-308`. |

### Other operator domains

| Capability | Console | Portal | Status | Notes |
|---|---|---|---|---|
| NetworkPool / IPAM | `pages/NetworkPoolsPage.tsx`, `pages/NetworkPoolDetailPage.tsx`, `api/networks.ts` | none (no networks/ipallocations methods) | portal-behind | Server `router.go:483-490`. Operator-heavy; trim-vs-harden. |
| Audit log | `pages/AuditLogPage.tsx`, `api/audit.ts` | none | portal-behind | Server `router.go:497`, `router.go:423`. |
| RBAC view | `pages/RBACPage.tsx` | none | portal-behind | |
| Observability pipeline | `pages/ObservabilityPage.tsx`, `api/observability.ts` | none | portal-behind | Server `router.go:500-503`. |
| Team environments | `pages/TeamEnvironmentsPage.tsx`, `api/environments.ts`, changeEnvironment | none | portal-behind | Server `router.go:436-438`, `router.go:321`. |
| Image sync / Talos factory | `pages/ImagesPage.tsx`, `api/images.ts` | none | portal-behind | Server `router.go:393-401`. |
| User management | `pages/UsersPage.tsx` | `butler/src/components/admin/UsersPage.tsx` | parity | |
| ButlerConfig editing | `pages/SettingsPage.tsx`, `api/config.ts` (`/admin/config`) | SettingsPage maps to `/admin/settings`; no `/admin/config` editing | portal-behind | Operator-only; trim-vs-harden. |

### Portal-only by design

| Capability | Console | Portal | Status | Notes |
|---|---|---|---|---|
| Workspaces lifecycle | none | `butler/src/components/workspaces/WorkspacesPage.tsx`, workspace methods | portal-only-by-design | Backed by `butler-api` Workspace CRD and server `router.go:363-371`. |
| Workspace images/templates | none | `ButlerApiClient.ts` | portal-only-by-design | |
| SSH key self-service | none | `ButlerApiClient.ts` ssh-keys methods | portal-only-by-design | Developer persona. |
| mirrord / cluster services | none | `ButlerApiClient.ts` | portal-only-by-design | Developer persona. |

### Matrix totals

Shared in-scope capabilities (rows excluding portal-only-by-design): 40.
- parity: 24
- portal-behind: 16
- console-behind: 0

Parity rate across shared in-scope capabilities: 24/40 = 60 percent. No capability is console-behind; everything the portal adds beyond the console is developer self-service that is portal-only by design. Of the 16 portal-behind rows, 9 are operator-facing domains (IPAM, audit, RBAC, observability, image factory, Steward TCP, team environments, ButlerConfig edit, AddonDefinition CRUD) whose priority depends on the trim-vs-harden decision in Section 7.

---

## Section 2: Backstage Integration Depth

This is the section with no analog in a CLI audit, and it is where the plugin is weakest. The frontend plugin definition is the whole story: `plugins/butler/src/plugin.ts` imports only `createPlugin`, `createApiFactory`, `discoveryApiRef`, `fetchApiRef`, and `createRoutableExtension`. It exports exactly one routable extension (`ButlerPage`) and one API factory. There is nothing else.

- Catalog integration: absent. No entity provider, processor, or catalog-backend module exists for Butler. Searched `plugins/` for `EntityProvider`, `CatalogProcessor`, `catalog-backend-module`; found none for Butler. TenantClusters are not registered as catalog entities or related entities. Convention missing: a Backstage plugin that owns infrastructure normally registers it in the catalog (entity provider) so it appears as a resource and relates to components. What a developer expects and does not get: if their `Component` in the catalog runs on a Butler-managed cluster, there is no relation, no "deployed to" link, nothing connecting the two.
- Entity page cards: absent. There is no `EntityButlerClusterCard`, no `EntityButlerOverviewCard`, no `isButlerClusterAvailable` predicate anywhere in `plugins/butler`. The plugin contributes no card to `packages/app/src/components/catalog/EntityPage.tsx`. Convention missing: `createComponentExtension` cards mounted on entity pages. The Butler view is reachable only as the standalone `/butler` tab.
- Software templates and scaffolder: absent. No scaffolder backend module, no custom scaffolder actions, no software template YAML under the Butler plugin. Convention missing: scaffolder templates that provision a workspace or onboard a team. This is portal-only by design and is the clearest "should exist, does not" gap for the developer persona. The form-based `CreateClusterPage` covers the capability but not the Backstage-native self-service entry point.
- Permissions framework: not integrated. Neither `plugins/butler/package.json` nor `plugins/butler-backend/package.json` declares `@backstage/plugin-permission-common`, `-node`, or `-react` as a direct dependency. No `createPermission` exists in Butler source. Authorization is ad hoc: the frontend derives an `isPlatformAdmin` flag and view mode from `_identity` (`plugins/butler-backend/src/router.ts:145-242`), and the backend forwards a `X-Butler-User-Email` header to butler-server. See Section 6 for why the auth model is a P0 security problem, not just a convention gap.
- Extension points: none. No `createExtensionPoint` or `registerExtensionPoint` in `plugins/butler` or `plugins/butler-backend`. The plugin neither exposes extension points for others nor consumes catalog/scaffolder/permission extension points.
- Tech docs: absent. No Butler techdocs content. Not a hard requirement; state of the world is none.
- App config: handled correctly. The backend reads `butler.baseUrl`, `butler.auth.username`, `butler.auth.password` via `config.getString` (`plugins/butler-backend/src/plugin.ts:62-64`). No hardcoded butler-server URL in plugin source. The defaults are the problem, not the mechanism (Section 6).

Net: the plugin is config-clean but otherwise a standalone tab that reimplements the console inside Backstage. None of the Backstage constructs that make a plugin feel native are present.

---

## Section 3: Depth Gaps Within Shared Capabilities

- Output completeness, cluster detail. Console `pages/ClusterDetailPage.tsx` exposes 9 tabs including Control Plane (Steward TCP phase, version, endpoint, replicas, datastore, konnectivity) and Observability. Portal `plugins/butler/src/components/clusters/ClusterDetailPage.tsx` exposes 7 tabs (Overview, Nodes, Addons, GitOps, Certificates, Events, Terminal; lines 423-429). Missing: Control Plane and Observability. Conditions are present in the portal Overview tab (lines 567-576), so the headline status surface is comparable.
- Filtering and querying. Console `pages/ClustersPage.tsx` supports name/namespace search, phase chips, and environment grouping (flat/env/team views). Portal `plugins/butler/src/components/clusters/ClustersPage.tsx` lists with team scope but lacks the environment grouping (the portal has no environment concept at all, see matrix). Filter depth is lower.
- Real-time updates. Console subscribes to `/ws/clusters` (`butler-console/src/contexts/WebSocketProvider.tsx`) and additionally polls every 5s on the detail Overview while a cluster is converging. Portal uses raw `useState`/`useEffect` with no react-query, no polling, and no `/ws/clusters` subscription; cluster WebSocket use is limited to the terminal relay (`plugins/butler-backend/src/router.ts:391-512`). A developer watching a provisioning cluster in the portal sees no change until they reload. Console component: `WebSocketProvider.tsx`. Portal component: `ClustersPage.tsx` and `ClusterDetailPage.tsx` data effects.
- Error surface. The portal renders an error state per page via try/catch plus an `EmptyState`. It surfaces conditions in the Overview tab, so a degraded cluster shows its condition reason. What it does not have is any app-level resilience: there is no `ErrorBoundary` (Section 5), so a thrown render error in a Butler tab is not contained.
- Empty states. Portal uses Backstage `EmptyState` with a title and description (for example the clusters list). These are informative rather than a bare "no data," though they do not yet route a developer into a create flow the way a scaffolder entry point would.

---

## Section 4: Developer Workflow Gaps

| Workflow | State | Blocker |
|---|---|---|
| Request a tenant cluster for my team | implemented end-to-end | Works via the form `CreateClusterPage` and `createCluster`. Not Backstage-native: no scaffolder/software template (Section 2). |
| View clusters my team owns | implemented | Team scope via `X-Butler-Team`. Depth: no environment grouping. |
| Download kubeconfig for a cluster I can access | implemented | `getClusterKubeconfig`, phase-gated. |
| Enable an addon on my team's cluster | implemented | `AddonsTab` + install/update/uninstall. |
| See the status of a cluster I am waiting on | partially implemented | Status renders, but no live updates. Blocker: portal frontend does not subscribe to `/ws/clusters` and does not poll. Server endpoint exists (`router.go:511`); the backend already relays WS for the terminal, so the relay path is proven. |
| Create or join a workspace | partially implemented | Create works (`WorkspacesPage` + `createWorkspace`). "Join" (shared or team workspace) has no obvious surface; flag for verification of server/CRD semantics in `workspace_types.go`. |
| See which addons are available and what they do | partially implemented | Catalog data is available (`getAddonCatalog`) and shown inline during install, but there is no standalone browse page like console `AddonCatalogPage`. Blocker: missing UI surface. |

---

## Section 5: Quality Gaps

- Storybook / component examples: none. No `*.stories.tsx` in `plugins/butler` or `plugins/butler-backend` source.
- Tests: none. No `*.test.ts(x)` in either plugin's `src`. The console has been audited; the portal plugin has zero test coverage of components, the API client, or the proxy router and AuthManager.
- Error boundaries: none. No `ErrorBoundary` usage in plugin source (the only matches are inside `node_modules`). A thrown error in a Butler component is not contained, and a butler-server outage can degrade the surrounding IDP page rather than the Butler tab alone.
- Accessibility: not assessed by the authors and no evidence of attention. Components are Material UI and Backstage core components, which gives a baseline, but there is no a11y test, no documented keyboard-nav or ARIA review. State: unknown, likely baseline-only.
- Loading states: present and reasonable. Backstage `Progress` plus conditional render is used consistently (for example in the clusters list and on tab-gated fetches in `ClusterDetailPage.tsx:209-215`). They are spinners rather than skeletons, but they are wired correctly.
- Documentation: no plugin README. There is no `plugins/butler/README.md` or `plugins/butler-backend/README.md`. A Backstage admin cannot learn how to install and configure the Butler plugin in their own portal. This matters for OSS adoption.

---

## Section 6: Honest Priority Ranking

P0 bar: a developer evaluating Butler in a Backstage demo would not ship it because of this. P1 bar: this blocks daily developer self-service. Effort is a rough LOC order of magnitude.

### P0 (launch-blockers)

1. Default service-account credentials are admin/admin. Surface: butler-portal app-config and butler-backend. Effort: ~40 LOC. `app-config.yaml:65-66` defaults `butler.auth.username`/`password` to `admin`/`admin`, and `AuthManager` logs in through the legacy admin endpoint (`plugins/butler-backend/src/service/AuthManager.ts:52-53`). A plugin that ships defaulting to admin/admin against the backend is a public-launch blocker. This is a security-default gap, not a polish item. Fix direction: no default, fail fast if unset, document required config. (`app-config.local.yaml` holds a non-default password locally and is not git-tracked, so it is not a leaked credential, but it confirms the admin login path.)
2. Service-account proxy with header-based impersonation and no permission checks. Surface: butler-backend and butler-server. Effort: ~300 LOC. Every request is proxied to butler-server with a platform-admin service-account bearer token (`plugins/butler-backend/src/router.ts:247-258`), and the only thing distinguishing the caller is a `X-Butler-User-Email` header derived from the Backstage entity ref (`router.ts:265-271`). The proxy route has no explicit Backstage user-auth gate (`router.all('/*')` at `router.ts:245`); `resolveUserEmail` swallows the unauthenticated case and falls through (`router.ts:114-117`), so requests proceed as the admin service account regardless. butler-server trusts that email header for platform admins. A developer (or an unauthenticated caller, depending on the framework default auth policy) can act with admin-scoped backend access. This is a security gap, not a Backstage-integration nicety. Fix direction: require an authenticated Backstage user on the proxy, adopt the permissions framework, stop trusting an email header as identity.
3. No catalog or entity-page integration. Surface: butler frontend and a new butler catalog backend module. Effort: ~600 LOC. In a Backstage demo the expectation is that infrastructure shows up in the catalog and relates to components. The plugin contributes nothing to the catalog and no entity cards (Section 2). Without this the plugin is the console in an iframe, which undercuts the reason to be in Backstage at all.

### P1 (blocks daily developer self-service)

4. No scaffolder/software template for cluster or workspace provisioning. Surface: scaffolder backend module plus template YAML. Effort: ~400 LOC. The capability exists via forms, but the Backstage-native self-service entry point does not. Rationale: requesting a cluster or workspace is the core developer self-service action and developers expect it in the scaffolder.
5. No real-time cluster status. Surface: butler frontend. Effort: ~150 LOC. Subscribe to `/ws/clusters` (relay already proven for the terminal) or add polling. Rationale: a developer waiting on a cluster should see it reach Ready without reloading.
6. No ErrorBoundary. Surface: butler frontend. Effort: ~60 LOC. Rationale: a backend hiccup should degrade the Butler tab, not the IDP page, during daily use and demos.
7. No tests. Surface: butler frontend and butler-backend. Effort: ~600 LOC for a meaningful first pass (API client, proxy router, AuthManager, key pages). Rationale: zero coverage on a proxy that holds admin credentials is a maintenance and safety risk.

### P2 (90-day)

8. Operator-domain parity, pending the trim-vs-harden decision: IPAM/NetworkPools, audit log, RBAC view, observability pipeline, Steward TCP/DataStore visibility, team environments, ButlerConfig editing, AddonDefinition admin CRUD. Surface: butler frontend (server endpoints already exist). Effort: ~1,500 LOC combined if all retained. Rationale: only matters if the portal keeps the operator persona.
9. Control Plane and Observability cluster-detail tabs. Surface: butler frontend. Effort: ~250 LOC. 
10. Standalone addon catalog browse page. Surface: butler frontend. Effort: ~150 LOC.
11. Plugin README for external Backstage admins. Surface: docs. Effort: ~1 day. Rationale: OSS adoption.
12. Permissions framework adoption beyond the P0 security fix (per-action permissions, policy). Surface: butler-backend and frontend. Effort: ~300 LOC.

### P3 (nice-to-have)

13. Storybook for shared components. 
14. Tech docs integration.
15. Extension points for other plugins.
16. Accessibility audit and fixes.
17. Minor parity: export cluster YAML, team-scoped providers, machine/LB allocation view.

### Two (really three) kinds of Phase 2 work

- Feature and depth parity (P2 items 8-10, P3 item 17): more React plus proxy plumbing against endpoints that already exist. Low architectural risk.
- Backstage-native integration depth (P0 item 3, P1 item 4, P2 item 12, P3 items 14-15): turning a tab into a real Backstage plugin (catalog, scaffolder, permissions, extension points). This is the work that changes the plugin's character.
- Security hardening (P0 items 1-2, P1 item 6-7): defaults, auth model, resilience. This is independent of both and must not wait for either.

---

## Section 7: Anti-Drift Check

- Orphaned TODO/FIXME/coming-soon: effectively clean. No `TODO`, `FIXME`, `WIP`, `stub`, or `not implemented` strings in `plugins/butler/src` or `plugins/butler-backend/src`. One "Coming soon" label at `plugins/butler/src/components/clusters/GitOpsTab.tsx:1349`, attached to a disabled GitOps tool option. All other `placeholder` hits are legitimate form input placeholders.
- Scaffolds never wired up: none found. Every page lazy-loaded in `ButlerPage.tsx` has a matching route; no dead component files.
- Server endpoints with no portal consumer: several, all on the operator side. The portal's `ButlerApiClient.ts` has zero references to networks/ipallocations (`router.go:483-490`), `/admin/audit` (`router.go:497`), observability (`router.go:500-503`), image-syncs and image-factory (`router.go:393-401`), tenantcontrolplane and datastores (`router.go:305-308, 329`), team environments (`router.go:436-438`), `admin/addons/catalog` (`router.go:478-480`), and `admin/config` (`router.go:493-494`). These are consumed by the console but not the portal.
- Terminology drift: the portal correctly uses Workspace for the developer environment concept and Team for tenancy. No console contradiction found: the console surfaces no workspace concept (the only `workspace` strings in console are the Google Workspace IdP preset). The standing decision that Workspace lives in the portal holds on both sides.
- Stale architecture references: clean. No `Kamaji`, `Concierge`, or `LINSTOR` strings in `plugins/butler` or `plugins/butler-backend`. Steward, Butler Portal, and Longhorn naming is consistent.
- One config-drift note: the backend hardcodes the email domain `butlerlabs.dev` when reconstructing a user email from a local-part entity ref (`plugins/butler-backend/src/router.ts:217-219, 267-269`). This is an assumption baked into identity resolution, not config-driven, and is fragile for any deployment whose users are not at that domain. The same `_identity` resolver matches users by email local-part across all users and teams (`router.ts:162-212`), which can mis-match two people who share a local part at different domains.

### Phase 2 decision this audit surfaces (not for the audit to make)

The portal is over-scoped, under-integrated, and insecure by default at the same time. The over-scope creates a fork that belongs to Phase 2 planning:

- Trim: treat the operator surfaces (admin clusters/teams/users, IdP and provider creation, management, and the missing operator domains in the matrix) as console territory and remove them from the portal, returning the portal to a developer-self-service plugin. This shrinks the parity gap by design and narrows the security surface.
- Harden: accept the dual-persona portal and invest in the permissions framework, real auth, and the remaining operator parity so the operator surfaces are safe and complete.

This audit assesses against the dual-persona assumption so nothing is hidden, but the choice between trim and harden is a product decision and is left open.

---

## Document note on commit policy

This audit was asked to be committed without any AI attribution. The standing project policy that says so lives at `butler-controller/CLAUDE.md:550` ("Do not add Claude/AI mentions in commits, code, or Co-Authored-By lines."). It is not present in the workspace-root `butlerdotdev/CLAUDE.md`, which is likely why it has not been applied consistently. No CLAUDE.md or `~/.claude` config file contains an instruction to add a Co-Authored-By trailer; that trailer originates in the assistant's harness defaults, not a project file. Recommendation: hoist the no-AI-attribution rule from `butler-controller/CLAUDE.md` to the workspace-root `CLAUDE.md` so it governs every repo in this workspace.
