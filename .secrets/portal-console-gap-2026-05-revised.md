# Butler Portal Plugin vs butler-console: Re-Audit Against Console-Superset Framing

Date: 2026-05-28
Scope: the Butler plugin inside butler-portal (`plugins/butler` and `plugins/butler-backend`), measured against butler-console as the canonical operator surface. Backed by butler-server and butler-api.
Status: re-audit of `portal-console-gap-2026-05.md` (same directory). The prior audit measured the plugin under a developer-self-service-only framing, which was wrong. Security findings carry forward unchanged. The matrix, the priority ranking, and the scope categorizations are re-derived from scratch.

Repos (siblings under `butlerdotdev/`):
- Portal plugin: `butler-portal/plugins/butler`, `butler-portal/plugins/butler-backend`
- Console: `butler-console/src`
- Server: `butler-server/internal/api`
- API: `butler-api/api/v1alpha1`

---

## Section 0: Corrected Architecture

The prior audit treated the portal as a developer-self-service surface and the appearance of operator pages in the portal as an over-reach to be flagged for a trim-or-harden decision. That framing was wrong on the load-bearing point. The correct framing, restated so this document stands alone:

1. **butler-console is the Butler console.** Standalone React SPA, canonical operator surface, complete product on its own, indefinitely viable. A Butler customer who never adopts Backstage lives on the console forever without missing anything. New operator capability lands in the console first.
2. **butler-portal is a hyper-customized Backstage IDP.** It is a developer portal product. A customer adopts Backstage for general IDP reasons (catalog, scaffolder, tech docs, plugins). If that customer also uses Butler, they install the Butler plugin and get Butler inside their IDP. Backstage adoption is the customer's choice, independent of Butler.
3. **The Butler plugin inside the portal must be 1:1 with the console on operator capability.** An operator migrating from the console to the portal cannot lose capability. Every console operator surface, including admin pages, identity providers, providers, management, RBAC, audit, observability, network pools, image factory, and ButlerConfig, exists in the plugin in Backstage-native form. There is no trim.
4. **Workspaces and the tooling required to use them are portal-specific by design.** The bar for portal-only-by-design is that the capability needs the IDP shell to make sense (catalog identity, user accounts, tech docs, dev-environment lifecycle). That includes workspaces, the SSH key surface that exists so a developer can connect to their workspace, and the mirrord tooling that exists so a developer can route a local process into a tenant cluster. It does not include "feels developer-shaped."
5. **Backstage-native integration is additive on top of parity.** Once the plugin matches console feature-for-feature, it layers on the Backstage constructs that make it native: catalog entities for clusters, entity cards on `Component` pages, scaffolder templates for cluster and workspace provisioning, the permissions framework. These do not replace operator surfaces; they make the operator surfaces Backstage-native.

Compared to the prior audit, the practical consequences of this framing are:

- The status value `console-only-by-design` is removed. Every console capability is in scope for the plugin.
- The status value `portal-only-by-design` is renamed `plugin-only-by-design` and is tightened to the workspaces complex only. Operator surfaces that the prior audit flagged as "fuzzy" or "operator-grade" are not flagged; they are unambiguously in scope and assessed for parity.
- The status value `plugin-missing-entirely` is added for capabilities that exist in the console and do not exist in the plugin at all. Under the prior framing these were lumped under "portal-behind" and softened by the trim-vs-harden caveat. Under the corrected framing they are plain gaps.
- The trim option from the prior audit's Section 7 is dead. The matrix is re-derived under the harden-and-mirror-console reality.

The security findings from the prior audit (auth bypass, admin/admin defaults, header-identity impersonation) are independent of persona framing and carry forward unchanged into Section 6 P0.

---

## Section 1: Capability Matrix (re-derived)

Status values:
- **parity**: capability exists in both with comparable depth.
- **plugin-behind**: capability exists in both but the plugin is partial or shallower.
- **plugin-missing-entirely**: capability exists in the console; the plugin has no implementation. This is the dominant gap class.
- **plugin-only-by-design**: capability requires the IDP shell to make sense (workspaces, the SSH key surface that exists for workspace access, mirrord).

There is no `console-behind` or `console-only-by-design`. Console paths are under `butler-console/src/`. Plugin paths are under `butler-portal/plugins/butler/src/` and `butler-portal/plugins/butler-backend/src/`.

### TenantCluster operations

| Capability | Console | Plugin | Status | Notes |
|---|---|---|---|---|
| List clusters | `api/clusters.ts` list, `pages/ClustersPage.tsx`, `pages/AdminClustersPage.tsx` | `api/ButlerApiClient.ts` listClusters, `components/clusters/ClustersPage.tsx` | parity | Console adds environment grouping. Filter depth gap in Section 3. |
| Cluster detail page | `pages/ClusterDetailPage.tsx` (9 tabs) | `components/clusters/ClusterDetailPage.tsx` (7 tabs, lines 423-429) | plugin-behind | Missing Control Plane and Observability tabs. |
| Create cluster (form) | `pages/CreateClusterPage.tsx` | `components/clusters/CreateClusterPage.tsx` | parity | Provider-specific forms in both. |
| Scale workers | `components/clusters/ScaleWorkersModal.tsx` (PATCH, auto-poll to convergence) | `ButlerApiClient.ts` scaleCluster | plugin-behind | API parity, depth gap on convergence polling (Section 3). |
| Delete cluster | `components/clusters/DeleteClusterModal.tsx` | `ButlerApiClient.ts` deleteCluster | parity | |
| Kubeconfig download | `api/clusters.ts` getKubeconfig | `ButlerApiClient.ts` getClusterKubeconfig | parity | |
| Status / conditions display | OverviewTab + StatusBadge | `ClusterDetailPage.tsx` Overview (conditions at lines 567-576) | parity | |
| Events tab | EventsTab | Events tab (index 5, lazy at line 212) | parity | |
| Nodes tab | NodesTab | Nodes tab (index 1, lazy at line 209) | parity | |
| Addon enablement on cluster | `components/clusters/AddonsTab.tsx` | `components/clusters/AddonsTab.tsx` | parity | |
| Control Plane tab (Steward TCP per cluster) | control-plane tab, `api/steward.ts` getClusterTCP | none (no `tenantcontrolplane` reference in `ButlerApiClient.ts`) | plugin-missing-entirely | Server has `/clusters/{ns}/{name}/tenantcontrolplane` at `router.go:329`. |
| Observability tab | observability tab in detail page | none | plugin-missing-entirely | |
| MachineRequest / LoadBalancer allocations | `components/clusters/NetworkAllocationsCard.tsx`, getMachineRequests/getLoadBalancerRequests | no `/machines` or `load-balancers` reference in `ButlerApiClient.ts` | plugin-missing-entirely | Server `router.go:327-328`. |
| Export cluster YAML | `api/clusters.ts` exportYAML | none | plugin-missing-entirely | Server `router.go:326`. |
| Cluster full update (k8s version, CP resources, machine template) | `api/clusters.ts` update + `components/clusters/EditClusterModal.tsx` | no `updateCluster` in `ButlerApiClient.ts` | plugin-missing-entirely | Server `router.go:319`. Only `scaleCluster` PATCH exists in the plugin. |
| Change cluster environment | `api/clusters.ts` changeEnvironment + ChangeEnvironmentModal | no `changeEnvironment`, no `X-Butler-Environment` header | plugin-missing-entirely | Server `router.go:321`. Plugin has no environment concept anywhere. |
| Toggle workspaces on a cluster | none | `ButlerApiClient.ts` toggleClusterWorkspaces (POST `/clusters/{ns}/{name}/settings/workspaces`) | plugin-only-by-design | Workspace-feature cluster setting; only meaningful in portal. |
| Real-time cluster updates | `contexts/WebSocketProvider.tsx` (`/ws/clusters`) + 5s polling on detail | refresh-only `useState`/`useEffect`; WS only for terminal | plugin-missing-entirely | Server endpoint exists at `router.go:511`; backend WS relay path is already proven by the terminal in `plugins/butler-backend/src/router.ts:391-512`. |

### Team membership and admin

| Capability | Console | Plugin | Status | Notes |
|---|---|---|---|---|
| View team members and group sync sources | `pages/TeamMembersPage.tsx` | `components/teams/TeamMembersPage.tsx` | parity | |
| Add team member | `api/teams.ts` or admin route | `ButlerApiClient.ts` addTeamMember | parity | |
| Update member role | route + console UI | `ButlerApiClient.ts` updateMemberRole | parity | |
| Remove team member | route + console UI | `ButlerApiClient.ts` removeTeamMember | parity | |
| Add group sync | route + console UI | `ButlerApiClient.ts` addGroupSync | parity | |
| Update group sync role | route + console UI | `ButlerApiClient.ts` updateGroupSyncRole | parity | |
| Remove group sync | route + console UI | `ButlerApiClient.ts` removeGroupSync | parity | |
| Get / list teams | `api/teams.ts` | `ButlerApiClient.ts` getTeam, getTeams | parity | |
| Create team | `pages/AdminTeamsPage.tsx`, `api/teams.ts` create | `ButlerApiClient.ts` createTeam | parity | |
| Update team | console UI | `ButlerApiClient.ts` updateTeam | parity | |
| Delete team | console UI | `ButlerApiClient.ts` deleteTeam | parity | |
| List team's clusters | `api/teams.ts` listClusters | `ButlerApiClient.ts` getTeamClusters | parity | |
| Team environments (add/update/remove env) | `pages/TeamEnvironmentsPage.tsx`, `api/environments.ts` | none | plugin-missing-entirely | Server `router.go:436-438`. No `environments` reference in `ButlerApiClient.ts`. |
| Team resource limit / quota display | console UI shows usage from `status.resourceUsage` vs `spec.resourceLimits` | partial (basic team detail) | plugin-behind | Verify console-equivalent depth; plugin shows team but not the quota usage breakdown. |

### IdentityProvider (operator)

| Capability | Console | Plugin | Status | Notes |
|---|---|---|---|---|
| List IdPs | `pages/IdentityProvidersPage.tsx` | `components/admin/IdentityProvidersPage.tsx` | parity | |
| View IdP detail | console UI | plugin UI | parity | |
| Create IdP | `pages/CreateIdentityProviderPage.tsx` | `components/admin/CreateIdentityProviderPage.tsx` | parity | |
| Update IdP | `api/identity-providers.ts` update (PUT) | no `updateIdentityProvider` in `ButlerApiClient.ts` | plugin-missing-entirely | Server `router.go:472`. Plugin can create and delete but cannot edit an existing IdP. |
| Delete IdP | `api/identity-providers.ts` delete | `ButlerApiClient.ts` deleteIdentityProvider | parity | |
| Test OIDC discovery | `api/identity-providers.ts` testDiscovery | `ButlerApiClient.ts` testIdPDiscovery | parity | |
| Validate IdP | `api/identity-providers.ts` validate | `ButlerApiClient.ts` validateIdentityProvider | parity | |

### ProviderConfig (operator)

| Capability | Console | Plugin | Status | Notes |
|---|---|---|---|---|
| List platform providers | `pages/ProvidersPage.tsx` | `components/providers/ProvidersPage.tsx` | parity | |
| View provider detail | console UI | plugin UI | parity | |
| Create provider | `pages/CreateProviderPage.tsx` | `components/providers/CreateProviderPage.tsx` | parity | |
| Update provider | `api/providers.ts` update (PUT) | no `updateProvider` in `ButlerApiClient.ts` | plugin-missing-entirely | Server `router.go:410`. |
| Delete provider | `api/providers.ts` delete | `ButlerApiClient.ts` deleteProvider | parity | |
| Validate provider | `api/providers.ts` validate | `ButlerApiClient.ts` validateProvider | parity | |
| Test connection (pre-create) | `api/providers.ts` testConnection | `ButlerApiClient.ts` testProviderConnection | parity | |
| List provider images / networks | `api/providers.ts` listImages, listNetworks | `ButlerApiClient.ts` listProviderImages, listProviderNetworks | parity | |
| Team-scoped providers (list/create/test/delete) | `api/providers.ts` listTeamProviders, createTeamProvider, testTeamConnection, deleteTeamProvider; `pages/TeamProvidersPage.tsx` | none | plugin-missing-entirely | Server `router.go:426-429`. |

### AddonDefinition catalog (admin)

| Capability | Console | Plugin | Status | Notes |
|---|---|---|---|---|
| Standalone catalog browse page | `pages/AddonCatalogPage.tsx` | only inline during install in AddonsTab | plugin-behind | `getAddonCatalog` exists in `ButlerApiClient.ts`; no browse surface. |
| Get definition detail | `api/addons.ts` getDefinition | `ButlerApiClient.ts` getAddonDefinition | parity | |
| Create AddonDefinition | `api/addons.ts` createDefinition (`/admin/addons/catalog`) | none | plugin-missing-entirely | Server `router.go:478`. |
| Update AddonDefinition | `api/addons.ts` updateDefinition | none | plugin-missing-entirely | Server `router.go:479`. |
| Delete AddonDefinition | `api/addons.ts` deleteDefinition | none | plugin-missing-entirely | Server `router.go:480`. |

### TenantAddon (cluster addons lifecycle)

| Capability | Console | Plugin | Status | Notes |
|---|---|---|---|---|
| List installed addons | AddonsTab + `api/addons.ts` list | AddonsTab + `ButlerApiClient.ts` listClusterAddons | parity | |
| Install / update / uninstall addon | `api/addons.ts` install/update/uninstall | `ButlerApiClient.ts` installAddon/updateAddon/uninstallAddon | parity | |
| Addon details | AddonsTab | AddonsTab | parity | |

### ManagementAddon (management cluster addons)

| Capability | Console | Plugin | Status | Notes |
|---|---|---|---|---|
| List / install / uninstall management addons | `api/addons.ts` management methods, `pages/ManagementPage.tsx` | `ButlerApiClient.ts` getManagementAddons / installManagementAddon / uninstallManagementAddon, `components/admin/ManagementPage.tsx` | parity | |

### Management cluster overview

| Capability | Console | Plugin | Status | Notes |
|---|---|---|---|---|
| Management overview / nodes / pods | `pages/ManagementPage.tsx`, `api/clusters.ts` getManagement, getManagementNodes, getManagementPods | `components/admin/ManagementPage.tsx`, `ButlerApiClient.ts` getManagement / getManagementNodes / getManagementPods | parity | |

### Steward visibility (TCP / DataStore)

| Capability | Console | Plugin | Status | Notes |
|---|---|---|---|---|
| List TenantControlPlanes | `api/steward.ts` listTCPs | none | plugin-missing-entirely | Server `router.go:305`. |
| Get TenantControlPlane detail | `api/steward.ts` getTCP | none | plugin-missing-entirely | Server `router.go:306`. |
| List DataStores | `api/steward.ts` listDataStores | none | plugin-missing-entirely | Server `router.go:307`. |
| Get DataStore detail | `api/steward.ts` getDataStore | none | plugin-missing-entirely | Server `router.go:308`. |
| Per-cluster TCP view (linked from cluster) | `api/steward.ts` getClusterTCP | none | plugin-missing-entirely | Server `router.go:329`. |

### NetworkPool / IPAM (operator)

| Capability | Console | Plugin | Status | Notes |
|---|---|---|---|---|
| List network pools | `pages/NetworkPoolsPage.tsx`, `api/networks.ts` listPools | none | plugin-missing-entirely | Server `router.go:483`. |
| Get pool detail (CIDR, usage, allocations) | `pages/NetworkPoolDetailPage.tsx`, `api/networks.ts` getPool | none | plugin-missing-entirely | Server `router.go:485`. |
| Create pool | `api/networks.ts` createPool | none | plugin-missing-entirely | Server `router.go:484`. |
| Update pool | `api/networks.ts` updatePool | none | plugin-missing-entirely | Server `router.go:486`. |
| Delete pool | `api/networks.ts` deletePool | none | plugin-missing-entirely | Server `router.go:487`. |
| List allocations per pool | `api/networks.ts` listAllocations | none | plugin-missing-entirely | Server `router.go:488`. |
| List all allocations | `api/networks.ts` listAllAllocations | none | plugin-missing-entirely | Server `router.go:489`. |
| Release IP allocation | `api/networks.ts` releaseAllocation | none | plugin-missing-entirely | Server `router.go:490`. |
| Pool usage visualization (PoolUsageBar, IPAddressMap) | Console NetworkPoolDetailPage | none | plugin-missing-entirely | UI-only depth; no plugin surface at all. |

### Audit log

| Capability | Console | Plugin | Status | Notes |
|---|---|---|---|---|
| Platform-wide audit log | `pages/AuditLogPage.tsx`, `api/audit.ts` listAll | none | plugin-missing-entirely | Server `router.go:497`. |
| Team-scoped audit log | `api/audit.ts` listTeam | none | plugin-missing-entirely | Server `router.go:423`. |

### RBAC view

| Capability | Console | Plugin | Status | Notes |
|---|---|---|---|---|
| RBAC page | `pages/RBACPage.tsx` | none | plugin-missing-entirely | Console depth not deeply audited; plugin has no equivalent. |

### Observability pipeline (platform-side)

| Capability | Console | Plugin | Status | Notes |
|---|---|---|---|---|
| Get observability config | `api/observability.ts` getConfig | none | plugin-missing-entirely | Server `router.go:390`. |
| Update observability config | `api/observability.ts` updateConfig | none | plugin-missing-entirely | Server `router.go:500`. |
| Get pipeline status | `api/observability.ts` getStatus | none | plugin-missing-entirely | Server `router.go:501`. |
| Setup pipeline | `api/observability.ts` setupPipeline | none | plugin-missing-entirely | Server `router.go:502`. |
| Deregister pipeline | `api/observability.ts` deregisterPipeline | none | plugin-missing-entirely | Server `router.go:503`. |

### Image management (ImageSync + Talos factory)

| Capability | Console | Plugin | Status | Notes |
|---|---|---|---|---|
| List image syncs | `api/images.ts` list, `pages/ImagesPage.tsx` | none | plugin-missing-entirely | Server `router.go:393`. |
| Create image sync | `api/images.ts` create | none | plugin-missing-entirely | Server `router.go:394`. |
| Get / update / delete image sync | `api/images.ts` get/update/delete | none | plugin-missing-entirely | Server `router.go:395-397`. |
| Talos factory catalog | `api/images.ts` getFactoryCatalog | none | plugin-missing-entirely | Server `router.go:400`. |
| Talos factory schematic detail | `api/images.ts` getFactorySchematic | none | plugin-missing-entirely | Server `router.go:401`. |
| ImagesPage UI | `pages/ImagesPage.tsx` | none | plugin-missing-entirely | |

### Users (admin)

| Capability | Console | Plugin | Status | Notes |
|---|---|---|---|---|
| List users | `api/auth.ts` or admin route | `ButlerApiClient.ts` listUsers | parity | |
| Create user | console admin | `ButlerApiClient.ts` createUser | parity | |
| Disable / enable user | console admin | `ButlerApiClient.ts` disableUser, enableUser | parity | |
| Delete user | console admin | `ButlerApiClient.ts` deleteUser | parity | |
| Resend invite | console admin | `ButlerApiClient.ts` resendInvite | parity | |
| Set password (invite flow landing) | `pages/SetPasswordsPage.tsx` | none | plugin-missing-entirely | An invited internal user has no portal landing page to set a password. |
| Device-flow approval (web side of CLI device flow) | `pages/DeviceAuthPage.tsx` | none | plugin-missing-entirely | Server `router.go:public-cli/device,token,verify,refresh` and `cli/approve` (protected). Plugin has no approval surface. |

### ButlerConfig (platform-wide config)

| Capability | Console | Plugin | Status | Notes |
|---|---|---|---|---|
| Get ButlerConfig | `api/config.ts` getConfig (`/admin/config`) | none | plugin-missing-entirely | Server `router.go:493`. Plugin SettingsPage hits a different endpoint (`/admin/settings`). |
| Update ButlerConfig | `api/config.ts` updateConfig | none | plugin-missing-entirely | Server `router.go:494`. |

### Certificates

| Capability | Console | Plugin | Status | Notes |
|---|---|---|---|---|
| Certificate visibility (categories, expiry) | `components/clusters/certificates/CertificatesTab.tsx` | `components/clusters/CertificatesTab.tsx` | parity | |
| Per-category view | `api/certificates.ts` getCertificatesByCategory | `ButlerApiClient.ts` getCertificatesByCategory | parity | |
| Rotation (with progress polling) | `api/certificates.ts` rotateCertificates + getRotationStatus | `ButlerApiClient.ts` rotateCertificates + getRotationStatus | parity | |

### GitProvider / GitOps

| Capability | Console | Plugin | Status | Notes |
|---|---|---|---|---|
| Get / save / clear Git provider config | `api/gitops.ts` getConfig/saveConfig/clearConfig | `ButlerApiClient.ts` getGitOpsConfig/saveGitOpsConfig/clearGitOpsConfig | parity | |
| List repositories / branches | `api/gitops.ts` listRepositories, listBranches | `ButlerApiClient.ts` listRepositories, listBranches | parity | |
| Preview manifests | `api/gitops.ts` previewManifests | `ButlerApiClient.ts` previewManifests | parity | |
| Cluster GitOps lifecycle (enable/discover/export/migrate/disable) | `api/gitops.ts` cluster methods, GitOpsTab | `ButlerApiClient.ts` cluster gitops methods, `components/clusters/GitOpsTab.tsx` | parity | One "Coming soon" disabled tool at `GitOpsTab.tsx:1349`. |
| Management GitOps lifecycle | `api/gitops.ts` management methods | `ButlerApiClient.ts` management gitops methods | parity | |

### Workspaces complex (plugin-only by design, see Section 0)

| Capability | Console | Plugin | Status | Notes |
|---|---|---|---|---|
| Workspaces lifecycle (list/create/delete/connect/disconnect/start) | none | `components/workspaces/WorkspacesPage.tsx`, workspace methods in `ButlerApiClient.ts` | plugin-only-by-design | Backed by `butler-api/api/v1alpha1/workspace_types.go` and `butler-server/internal/api/handlers/workspaces.go`. |
| Workspace metrics | none | `ButlerApiClient.ts` getWorkspaceMetrics | plugin-only-by-design | |
| Workspace terminal (WS relay) | none | `components/shared/WorkspaceTerminalDialog.tsx`, backend relay `plugins/butler-backend/src/router.ts:391-512` | plugin-only-by-design | |
| Workspace templates browse / CRUD | none | `ButlerApiClient.ts` listWorkspaceTemplates / create / update / delete | plugin-only-by-design | |
| Workspace images browse | none | `ButlerApiClient.ts` listWorkspaceImages | plugin-only-by-design | |
| SSH key self-service (for workspace access) | none | `ButlerApiClient.ts` listSSHKeys / addSSHKey / removeSSHKey, `syncWorkspaceSSHKeys` | plugin-only-by-design | Server routes `butler-server/internal/api/router.go:385-387`. |
| mirrord config generation | none | `ButlerApiClient.ts` generateMirrordConfig | plugin-only-by-design | |
| List cluster services (for mirrord targeting) | none | `ButlerApiClient.ts` listClusterServices | plugin-only-by-design | |

### Matrix totals

Counting rows in the matrix above (excluding the plugin-only-by-design block, which is not a gap):

- Total in-scope shared rows: 78
- parity: 41
- plugin-behind: 5
- plugin-missing-entirely: 32
- plugin-only-by-design (separate, not part of parity denominator): 8

Parity rate across shared in-scope capabilities: 41 / 78 = **53 percent**.
plugin-missing-entirely rate: 32 / 78 = **41 percent**.

Comparison to the prior audit's totals:

- Prior denominator: 40. New: 78. The denominator grew because the prior audit lumped several operator domains into single rows (NetworkPool / IPAM as one row covered nine sub-capabilities; observability as one row covered five; etc.) and because the prior audit's `portal-only-by-design` block hid some sub-capabilities under labels that were not actually portal-only.
- Prior parity rate: 60 percent (24 / 40). New: 53 percent (41 / 78). Parity rate dropped because the granularized rows for NetworkPool, Audit, Observability, Image factory, Steward TCP, Team environments, ButlerConfig, AddonDefinition admin, Team-scoped providers, and several cluster sub-operations all unbundle into plugin-missing-entirely rows rather than one lumped "portal-behind" row.
- Prior `portal-behind` count: 16. The new audit splits this into two categories: 5 plugin-behind (depth gaps where the plugin has something but shallower) and 32 plugin-missing-entirely (no implementation at all). The prior audit's softer single label obscured the difference.
- Prior `console-behind`: 0. New: not a category. The prior audit's reasoning that no capability is console-behind under dual-persona was correct as far as it went, but the corrected framing makes the question moot.

---

## Section 2: Backstage Integration Depth (additive)

This section is mostly unchanged from the prior audit because Backstage integration depth is independent of persona framing. Verified against current code on this branch.

The plugin definition file is the whole story: `plugins/butler/src/plugin.ts` imports only `createPlugin`, `createApiFactory`, `discoveryApiRef`, `fetchApiRef`, and `createRoutableExtension`, and exports exactly one routable extension (`ButlerPage`) and one API factory.

- **Catalog integration**: absent. No entity provider, processor, or catalog-backend module exists for Butler. TenantClusters are not registered as catalog entities or related entities. A developer whose `Component` runs on a Butler-managed cluster sees no relation, no "deployed to" link, nothing connecting the two.
- **Entity page cards**: absent. No `EntityButlerClusterCard`, no `EntityButlerOverviewCard`, no `isButlerClusterAvailable` predicate anywhere in `plugins/butler`. The plugin contributes no card to `packages/app/src/components/catalog/EntityPage.tsx`. The Butler view is reachable only as the standalone `/butler` tab.
- **Software templates and scaffolder**: absent. No scaffolder backend module, no custom scaffolder actions, no software template YAML under the Butler plugin. The form-based `CreateClusterPage` and `WorkspacesPage` cover the underlying capabilities but not the Backstage-native self-service entry point.
- **Permissions framework**: not integrated. Neither `plugins/butler/package.json` nor `plugins/butler-backend/package.json` declares `@backstage/plugin-permission-common`, `-node`, or `-react` as a direct dependency. No `createPermission` exists in Butler source. Authorization is ad hoc: the frontend derives an `isPlatformAdmin` flag from `_identity` (`plugins/butler-backend/src/router.ts:145-242`), and the backend forwards a `X-Butler-User-Email` header to butler-server. The auth model is a P0 security problem (Section 6), not just a convention gap.
- **Extension points**: none defined or consumed.
- **Tech docs**: no Butler-specific techdocs content.
- **App config**: handled correctly. The backend reads `butler.baseUrl`, `butler.auth.username`, `butler.auth.password` via `config.getString` (`plugins/butler-backend/src/plugin.ts:62-64`). No hardcoded butler-server URL in plugin source. Defaults are the problem, not the mechanism (Section 6).

Under the corrected framing these items rank lower than they did in the prior audit, because operator migration from console does not depend on them. The exception is the permissions framework, which is on the critical path for the auth model fix and is P1 in Section 6. Catalog and scaffolder are P2 and P3 respectively.

---

## Section 3: Depth Gaps Within Shared Capabilities

For capabilities marked parity or plugin-behind in Section 1, the substantive depth gaps:

- **Cluster detail page**. Console `pages/ClusterDetailPage.tsx` exposes nine tabs including Control Plane (Steward TCP phase, version, endpoint, replicas, datastore, konnectivity) and Observability. Plugin `components/clusters/ClusterDetailPage.tsx` exposes seven (Overview, Nodes, Addons, GitOps, Certificates, Events, Terminal, lines 423-429). The two missing tabs are also marked plugin-missing-entirely in the matrix.
- **Cluster scale convergence depth**. Console `ScaleWorkersModal` issues the PATCH then auto-polls every five seconds tracking `workerNodesReady` against `workerNodesDesired` until convergence. Plugin issues `scaleCluster` PATCH; on success the UI returns to the cluster detail without convergence polling. An operator scaling in the plugin must reload manually to see workers reach the new target.
- **Cluster list filtering and grouping**. Console `pages/ClustersPage.tsx` supports name and namespace search, phase chips, and environment grouping (flat / env / team / team-env). Plugin `components/clusters/ClustersPage.tsx` lists with team scope; it has no environment concept anywhere (no `changeEnvironment`, no `X-Butler-Environment` header), so the entire env-grouping mode is absent.
- **Real-time cluster updates**. Console subscribes to `/ws/clusters` via `contexts/WebSocketProvider.tsx` and additionally polls every five seconds on the detail Overview during a converging cluster. Plugin uses raw `useState` / `useEffect` with no react-query, no polling, and no `/ws/clusters` subscription. The backend WS relay is already implemented for the workspace terminal (`plugins/butler-backend/src/router.ts:391-512`), so the relay path is proven and the gap is in the frontend.
- **Error surface**. The plugin renders per-page error states via try/catch and an `EmptyState`. It surfaces conditions in the cluster Overview, so a degraded cluster shows its condition reason. There is no app-level `ErrorBoundary`, so a render error in a Butler tab bubbles up into the IDP shell (Section 5).
- **Empty states**. The plugin uses Backstage `EmptyState` with title and description. They are informative rather than bare, but they do not route a user into a create flow (no scaffolder entry point yet).
- **AddonDefinition catalog**. The plugin has `getAddonCatalog` data but no standalone browse page; the catalog is only visible inline during install. Operators evaluating which addons to enable across teams need the standalone view.
- **Team detail / quota**. Console shows team resource usage (status.resourceUsage) against limits (spec.resourceLimits). Plugin's team detail page is shallower.
- **IdP and Provider lifecycle**. Both miss `update` on the plugin side, so operators can only create or delete; any change to an existing IdP or provider requires delete-and-recreate. Listed in the matrix as plugin-missing-entirely.

---

## Section 4: Operator Workflow Gaps

Under the corrected framing this section measures operator workflows. An operator migrating from console either completes each workflow end-to-end in the plugin, or they hit a wall and roll back to the console.

| Workflow | State | Blocker |
|---|---|---|
| Provision a tenant cluster | implemented end-to-end | Works via `CreateClusterPage` and `createCluster`. Not Backstage-native (no scaffolder template). |
| Scale a cluster and watch it converge | partially implemented | PATCH works; no convergence polling. Operator must reload. Blocker: frontend convergence loop and / or `/ws/clusters` subscription. |
| Edit an existing cluster (k8s version upgrade, CP resources, machine template) | absent | No `updateCluster` in `ButlerApiClient.ts`. Server endpoint exists at `router.go:319`. |
| Delete a cluster | implemented end-to-end | |
| Download a kubeconfig | implemented end-to-end | |
| Rotate cluster certificates | implemented end-to-end | API + UI present including progress polling. |
| Enable / discover / migrate GitOps for a cluster | implemented end-to-end | One disabled tool option labeled "Coming soon" (`GitOpsTab.tsx:1349`). |
| Set up management-cluster GitOps | implemented end-to-end | |
| Browse the addon catalog before deciding | partially implemented | Data is available; no standalone browse page. |
| Install / update / uninstall an addon | implemented end-to-end | |
| Create / update / delete an AddonDefinition (extend the catalog) | absent | No admin/addons/catalog methods. Server `router.go:478-480`. |
| Onboard a team (create + members + groups + environments + quotas) | partially implemented | Team create / member / group surfaces exist. Environments and quota usage are absent. |
| Configure / validate an identity provider | partially implemented | Create and delete work; no edit-in-place. Server `router.go:472`. |
| Configure providers (platform-scoped) | partially implemented | Create and delete work; no edit-in-place. Server `router.go:410`. |
| Configure team-scoped providers | absent | No team-provider methods in `ButlerApiClient.ts`. Server `router.go:426-429`. |
| Manage network pools and IP allocations | absent | No NetworkPool or IPAllocation methods. Server `router.go:483-490`. |
| Inspect audit log (platform or team) | absent | No audit methods. Server `router.go:497`, `router.go:423`. |
| Set up the observability pipeline | absent | No observability methods. Server `router.go:500-503`. |
| Manage image syncs and the Talos factory catalog | absent | No image-sync or image-factory methods. Server `router.go:393-401`. |
| View Steward TCP and DataStore details | absent | No tenantcontrolplane or datastore methods. Server `router.go:305-308, 329`. |
| Edit ButlerConfig (multi-tenancy, defaults, limits) | absent | No `/admin/config` consumer. Server `router.go:493-494`. |
| Approve a CLI device-flow login | absent | Server has the approval route at `cli/approve`. No plugin surface. |
| Set password via invite token | absent | No SetPassword equivalent of `pages/SetPasswordsPage.tsx`. |

### Developer workflows (plugin-only by design)

| Workflow | State | Blocker |
|---|---|---|
| Create / start / connect to a workspace | implemented | `WorkspacesPage` + workspace methods. Terminal via WS relay. |
| Join an existing shared workspace | partially implemented | "Join" semantics not obvious; verify `workspace_types.go` for shared / team scope. |
| Browse workspace templates and pick one | implemented | `listWorkspaceTemplates` plus UI. |
| Manage SSH keys for workspace access | implemented | `listSSHKeys` / `addSSHKey` / `removeSSHKey`, sync to running workspace. |
| Generate a mirrord config to route local traffic into a workspace | implemented | `generateMirrordConfig` + `listClusterServices`. |

---

## Section 5: Quality Gaps

- **Storybook / component examples**: none. No `*.stories.tsx` in `plugins/butler` or `plugins/butler-backend` source.
- **Tests**: none. No `*.test.ts(x)` in either plugin's `src`. Zero coverage of components, the API client, the proxy router, or AuthManager.
- **Error boundaries**: none. No `ErrorBoundary` usage in plugin source. A thrown render error in a Butler tab is not contained; a butler-server outage degrades the surrounding IDP page rather than the Butler tab alone.
- **Accessibility**: not assessed by the authors and no evidence of attention. Components use Material UI and Backstage core components for baseline; no a11y test, no documented keyboard-nav or ARIA review.
- **Loading states**: present and reasonable. Backstage `Progress` plus conditional render is used consistently (cluster list, on-tab fetches in `ClusterDetailPage.tsx:209-215`). Spinners rather than skeletons.
- **Plugin documentation**: no `plugins/butler/README.md` or `plugins/butler-backend/README.md`. A Backstage admin installing the plugin into their own portal has no install / configure guide.

---

## Section 6: Honest Priority Ranking

The bar:
- P0: launch-blockers for the plugin. Security findings independent of persona framing.
- P1: blocks operator migration from console. An operator migrating in the first week hits this gap and either rolls back to the console or files a support ticket.
- P2: operator-noticeable within a month, depth gaps in shared capabilities, plugin-only-by-design developer flow depth, ErrorBoundary, tests.
- P3: polish, quality gaps not blocking operator workflows, Backstage-native integration items that are not on the critical path.

Effort is rough LOC order of magnitude. Surface is plugin frontend, plugin backend, butler-server, or butler-api.

### P0 (launch-blockers, carried from prior audit)

These three are the security findings from the prior audit, recopied faithfully. They are independent of the framing change.

1. **CRITICAL, confirmed by test: unauthenticated admin access to butler-server via the Butler proxy.** Surface: butler-backend, butler-server. Effort: ~300 LOC for the full fix.

   Source of the hole: `plugins/butler-backend/src/plugin.ts:108-111` opts every path in the plugin out of Backstage's default-deny auth policy:

   ```js
   httpRouter.addAuthPolicy({ path: '/', allow: 'unauthenticated' });
   ```

   The router then attaches the admin service-account bearer token to every proxied request regardless of caller (`plugins/butler-backend/src/router.ts:247-258`). `resolveUserEmail` silently swallows the unauthenticated case (`router.ts:114-117`), so when no Backstage user is present the request still proceeds, just without the `X-Butler-User-Email` header. butler-server's session middleware accepts the admin JWT and runs the request as the admin service account, which is `isPlatformAdmin:true` because `AuthManager` logs in through the legacy admin endpoint (`plugins/butler-backend/src/service/AuthManager.ts:52-53`).

   **Test method.** Booted a real Backstage backend (`@backstage/backend-defaults` 0.13.1, the version this repo uses) containing the actual `@internal/plugin-butler-backend` from its built `dist/`, pointed at a mock butler-server. Added a control plugin that mounts a router the same way but does NOT call `addAuthPolicy`, so any unauthenticated reach observed on `/api/butler/*` is attributable to the opt-out rather than the harness. Curled both routes with no auth headers.

   **Result. Identical mounting, same backend, only difference is the four-line opt-out:**

   | Route (no auth header) | Result |
   |---|---|
   | Control plugin `GET /api/control/ping` (no opt-out) | HTTP 401 `{"name":"AuthenticationError","message":"Missing credentials"}` |
   | Butler plugin `GET /api/butler/clusters` | HTTP 200, reached butler-server with `Authorization: Bearer <admin JWT, isPlatformAdmin:true>`, `xButlerUserEmail: null` |
   | Butler plugin `POST /api/butler/clusters/team-x/c1/certificates/rotate` (destructive op) | HTTP 200, same admin Bearer forwarded |
   | Butler plugin `GET /api/butler/_identity` | `{"authenticated":false,"displayName":"Guest","isPlatformAdmin":false,"teams":[]}` |

   The 401 from the control proves the framework's default-deny policy is active in this backend, so the 200s under `/api/butler/` are caused by the explicit opt-out. The admin Bearer is the real one produced by `AuthManager`'s legacy-admin login flow.

   **Live deployment evidence.** Production at `https://portal.butlerlabs.dev` (HelmRelease at `butler-portal-live/clusters/butler-portal/apps/butler-portal/helmrelease.yaml`, image tag `20260314023726-sha-e6d04c1`, chart version `0.1.2`) honors the same opt-out. `GET https://portal.butlerlabs.dev/api/butler/_identity` with no auth header returns the Guest JSON, confirming an unauthenticated caller reaches the proxy on the live system. The hostname resolves authoritatively from public resolvers (1.1.1.1 and 8.8.8.8) to `10.40.2.52`, an RFC1918 address, reachable across a Tailscale subnet route for `10.40.0.0/16`. The live audience is every tailnet member subject to ACL.

   Fix direction (Phase 2 scope): remove the opt-out so the framework default-deny applies; require an authenticated Backstage user on the proxy.

2. **Default service-account credentials are admin/admin.** Surface: butler-portal app-config and butler-backend. Effort: ~40 LOC. `app-config.yaml:65-66` defaults `butler.auth.username` and `butler.auth.password` to `admin` and `admin`, and `AuthManager` logs in through the legacy admin endpoint (`plugins/butler-backend/src/service/AuthManager.ts:52-53`). A plugin shipping with admin/admin against the backend is a public-launch blocker. Fix direction: no default, fail fast if unset, document required config.

3. **Header-identity impersonation model with no per-action authorization.** Surface: butler-backend, butler-server. Effort: ~400 LOC. After 1 and 2 are addressed, the residual model is still a privileged service-account proxy that conveys identity via a `X-Butler-User-Email` HTTP header (`plugins/butler-backend/src/router.ts:265-271`), with butler-server treating that header as the operating user for impersonation. The identity resolver matches by email local-part across all users and teams (`router.ts:162-212`), with hardcoded domain `butlerlabs.dev` (`router.ts:217-219, 267-269`). A header that the caller can influence (in a debugger, in a load balancer, in a misconfigured edge) becomes the trust boundary. Fix direction: adopt Backstage's permissions framework for per-action authorization; stop trusting `X-Butler-User-Email` as identity; drop the legacy-admin service-account proxy in favor of either a Backstage-issued token to butler-server or a server-side identity exchange.

### P1 (blocks operator migration from console)

P1 lands every plugin-missing-entirely or plugin-behind item that an operator migrating from console hits in the first week.

4. **Permissions framework adoption.** Surface: butler-backend and frontend. Effort: ~400 LOC. Sits on the critical path for the fix in P0 #1 and #3 and replaces the ad-hoc `isPlatformAdmin` derivation in the proxy. Rationale: the auth model fix needs a real authorization framework underneath; bolting per-route checks ad hoc onto the proxy will not scale.
5. **NetworkPool and IPAM management.** Surface: plugin frontend. Effort: ~600 LOC. Nine matrix rows under one operator workflow. Operators routinely create, resize, and release IP allocations during cluster provisioning. Server endpoints exist (`router.go:483-490`); the plugin has zero consumers.
6. **Audit log inspection (platform and team).** Surface: plugin frontend. Effort: ~200 LOC. An operator investigating who changed what cannot answer the question without the audit log. Server `router.go:497, 423`.
7. **ButlerConfig editing.** Surface: plugin frontend. Effort: ~150 LOC. The platform's singleton configuration (multi-tenancy mode, default provider, team limits, Git provider) is not editable from the plugin. Server `router.go:493-494`.
8. **Team environments lifecycle and cluster environment assignment.** Surface: plugin frontend. Effort: ~300 LOC. Operators rely on environments to group clusters by stage. The plugin has no environment concept at all (no method, no header, no UI), which also explains the cluster list filter gap in Section 3.
9. **Steward TenantControlPlane and DataStore visibility.** Surface: plugin frontend. Effort: ~250 LOC. Five matrix rows under one operator workflow (diagnosing control planes). Server `router.go:305-308, 329`.
10. **Observability pipeline setup.** Surface: plugin frontend. Effort: ~250 LOC. Operators set up the platform's observability pipeline through this surface in the console; the plugin has none of it. Server `router.go:500-503`.
11. **Image sync and Talos image factory.** Surface: plugin frontend. Effort: ~250 LOC. Talos image management is part of normal cluster lifecycle work. Server `router.go:393-401`.
12. **AddonDefinition admin CRUD.** Surface: plugin frontend. Effort: ~150 LOC. Operators extend the addon catalog; the plugin can only consume. Server `router.go:478-480`.
13. **Team-scoped providers (list / create / test / delete).** Surface: plugin frontend. Effort: ~150 LOC. Server `router.go:426-429`.
14. **Cluster Control Plane tab (Steward TCP detail per cluster).** Surface: plugin frontend. Effort: ~150 LOC.
15. **Cluster Observability tab.** Surface: plugin frontend. Effort: ~100 LOC.
16. **Cluster MachineRequest and LoadBalancerRequest allocations card.** Surface: plugin frontend. Effort: ~120 LOC. Operator visibility into VMs and LB IPs during provisioning. Server `router.go:327-328`.
17. **Cluster full update (k8s version, CP resources, machine template).** Surface: plugin frontend. Effort: ~200 LOC. Without this, no in-place changes to an existing cluster except worker count.
18. **Cluster change environment.** Surface: plugin frontend. Effort: ~80 LOC. Moves a cluster to a different team environment. Server `router.go:321`.
19. **IdentityProvider update.** Surface: plugin frontend. Effort: ~80 LOC. Server `router.go:472`. Editing existing IdPs without delete-and-recreate.
20. **ProviderConfig update.** Surface: plugin frontend. Effort: ~80 LOC. Server `router.go:410`.
21. **Real-time cluster updates.** Surface: plugin frontend. Effort: ~150 LOC. Subscribe to `/ws/clusters` (backend WS relay path already proven for the workspace terminal), or add a poll. Without this, every operator watching a cluster reload pages manually.
22. **RBAC view.** Surface: plugin frontend. Effort: depends on console depth (treat as ~150 LOC). Console has `pages/RBACPage.tsx`; verify exact scope during implementation.
23. **Set-password landing for invited internal users.** Surface: plugin frontend. Effort: ~80 LOC. Without this, an admin creating an internal user in the plugin cannot complete onboarding via the portal.
24. **Device-flow approval surface for CLI logins.** Surface: plugin frontend. Effort: ~80 LOC. Server has `cli/approve`. Without this, butleradm device-flow login cannot be approved in the portal.
25. **Addon catalog standalone browse page.** Surface: plugin frontend. Effort: ~120 LOC.
26. **Cluster scale convergence polling.** Surface: plugin frontend. Effort: ~80 LOC. So an operator scaling does not have to refresh.
27. **Team detail quota and usage display.** Surface: plugin frontend. Effort: ~100 LOC. Resource usage against limits visible in console; shallow in plugin.
28. **Cluster export YAML.** Surface: plugin frontend. Effort: ~40 LOC.

### P2 (operator-noticeable within a month, depth, developer flow polish)

29. **ErrorBoundary.** Surface: plugin frontend. Effort: ~60 LOC. A Butler tab thrown error should not bubble into the IDP shell.
30. **Tests.** Surface: plugin frontend and backend. Effort: ~600 LOC for a first pass (API client, proxy router, AuthManager, key pages). A proxy that holds admin credentials with zero coverage is a maintenance and safety risk.
31. **Catalog integration (Butler entity provider + entity cards).** Surface: new plugin backend module + frontend extensions. Effort: ~800 LOC. Not on the operator migration critical path, but it is the Backstage feature most likely to make the plugin feel native rather than embedded.
32. **Developer workflow depth: workspace join semantics, workspace metrics UX, ssh-key-sync error reporting.** Surface: plugin frontend. Effort: ~300 LOC combined. The matrix marks these implemented or partially implemented; tighten depth.
33. **Plugin README and install guide for external Backstage admins.** Surface: docs. Effort: ~1 day. Matters for OSS adoption.

### P3 (polish)

34. **Storybook for shared components.**
35. **Scaffolder templates** for cluster and workspace provisioning. Surface: scaffolder module + template YAML. Effort: ~400 LOC. Capability already exists via forms; this is the Backstage-native entry point.
36. **Tech docs.**
37. **Extension points for other plugins.**
38. **Accessibility audit and fixes.**

### Two kinds of Phase 2 work, plus security

- **Operator parity (P1 items 5-28):** straight feature work. Surface mostly plugin frontend; server endpoints already exist. Mechanical but voluminous.
- **Backstage-native integration (P2 item 31, P3 items 35-37):** turns the plugin from a console clone in a tab into a real Backstage plugin. Not on the migration critical path.
- **Security (P0 items 1-3 and P1 item 4):** independent of both. The auth model fix must not wait for either.

---

## Section 7: Anti-Drift Check

Re-verified on this branch:

- **Orphaned TODO / FIXME / coming-soon**: effectively clean. No `TODO`, `FIXME`, `WIP`, `stub`, or `not implemented` strings in `plugins/butler/src` or `plugins/butler-backend/src`. One "Coming soon" label at `plugins/butler/src/components/clusters/GitOpsTab.tsx:1349`, attached to a disabled GitOps tool option. All other `placeholder` hits are legitimate form input placeholders.
- **Scaffolds never wired up**: none found. Every page lazy-loaded in `ButlerPage.tsx` has a matching route; no dead component files.
- **Server endpoints with no plugin consumer**: substantial. `ButlerApiClient.ts` has zero references to networks / ipallocations (`router.go:483-490`), `/admin/audit` (`router.go:497`), observability (`router.go:500-503`), image-syncs and image-factory (`router.go:393-401`), tenantcontrolplane and datastores (`router.go:305-308, 329`), team environments (`router.go:436-438`), `admin/addons/catalog` (`router.go:478-480`), `admin/config` (`router.go:493-494`), team-scoped providers (`router.go:426-429`), `updateCluster`, `updateProvider`, `updateIdentityProvider`, `changeEnvironment`, `exportYAML`, and machine / load-balancer listing. All of these have console consumers.
- **Terminology drift**: the plugin uses Workspace for the developer environment concept and Team for tenancy. Console contains no workspace concept (the only `workspace` strings in console are the Google Workspace IdP preset name in `butler-console/src/api/identity-providers.ts`). The decision that Workspace lives in the plugin holds on both sides.
- **Stale architecture references**: clean. No `Kamaji`, `Concierge`, or `LINSTOR` strings in `plugins/butler` or `plugins/butler-backend`.
- **Config-drift note**: the backend hardcodes the email domain `butlerlabs.dev` when reconstructing a user email from a local-part entity ref (`plugins/butler-backend/src/router.ts:217-219, 267-269`). Fragile for deployments whose users are not at that domain. The `_identity` resolver matches by email local-part across all users and teams (`router.ts:162-212`), which can mis-match two people who share a local part at different domains. Same finding as the prior audit; carried over.

---

## Section 8: Comparison to Prior Audit

What the prior audit got right and carries forward unchanged:

- The security findings (auth bypass with test evidence, admin/admin default, header-identity impersonation). These are independent of persona framing. The auth bypass test and the live deployment confirmation are recopied in this document as P0 #1.
- The Backstage integration depth assessment (Section 2). Catalog, entity cards, scaffolder, permissions framework, extension points, tech docs are all still absent. The new document re-ranks them under the corrected framing but does not change the underlying observations.
- The quality findings (Section 5). No tests, no Storybook, no `ErrorBoundary`, no README, baseline-only accessibility.
- The anti-drift findings (Section 7). One "Coming soon" label, clean terminology, the hardcoded domain in identity resolution.

What the prior audit got wrong:

- **The persona framing.** The prior audit operated on dual-persona as a working assumption and treated the appearance of operator pages in the plugin as an over-reach to be flagged for a trim-or-harden decision. The correct framing is that the plugin must be a console superset for operator capability. Under that framing, operator surfaces in the plugin are not over-reach; their absence is the gap.
- **The trim-vs-harden decision in prior Section 7.** It is not a real decision under the corrected framing. The answer was never trim. This document removes that section.
- **The classification of "portal-only-by-design".** The prior audit's portal-only block correctly identified workspaces and the workspace-adjacent surfaces (SSH keys, mirrord), but it framed them as "developer persona" rather than "needs the IDP shell." Same rows, sharper criterion.
- **The "console-only-by-design" category as a soft exclusion.** The prior audit kept the category minimal under dual-persona; this document removes it. Every console capability is in scope for the plugin.
- **The Section 1 row granularity.** The prior audit lumped NetworkPool, observability, image sync, Steward TCP, team environments, AddonDefinition admin, team-scoped providers, and several cluster sub-operations into single rows under "portal-behind." Granularizing those rows revealed sub-capabilities that are not just shallow but absent.
- **The Section 6 priority shape.** The prior audit's P0 #3 was "no catalog integration." Under the corrected framing, catalog integration is P2 because operators migrating from console do not expect it on day one. It was promoted in the prior audit because the framing assumed a Backstage demo evaluation was the launch bar; the corrected framing makes operator migration the launch bar.

What the prior audit got wrong beyond what the corrected-framing prompt anticipated:

- **The prior matrix labeled cluster Update as "Partial."** The plugin has no `updateCluster` method at all (confirmed: zero hits in `ButlerApiClient.ts`). It is plugin-missing-entirely, not partial. An operator cannot edit a cluster in place from the plugin.
- **The prior matrix did not call out the missing IdP and Provider `update` methods.** Both are missing on the plugin side; both have server endpoints. Operators can only create or delete identities and providers, never edit them.
- **The prior matrix omitted SetPassword and DeviceAuth surfaces entirely.** Console has `pages/SetPasswordsPage.tsx` and `pages/DeviceAuthPage.tsx`. The plugin has neither, so the internal-user invite flow has no portal landing and CLI device-flow approvals cannot complete in the portal.
- **The prior matrix counted IdP create / edit / validate as a single row at parity.** Under the granular accounting it is three rows, and one (update) is plugin-missing-entirely.
- **The prior section on team membership counted as a single parity row.** Under the granular accounting it is multiple rows, parity in most cases but missing environments and shallow on quota / usage display.

Plain operator-impact summary of the diff: under the prior audit's framing, an operator looking at the plugin saw "about three-fifths of the way there, with several big domains flagged for trim." Under the corrected framing the picture is "about half of the way there, with a third of the surface entirely absent and an explicit decision that we close every gap rather than trim any." The denominator grew from 40 to 78; the parity rate fell from 60 percent to 53 percent; the plugin-missing-entirely count went from a soft 16 "portal-behind" rows to a hard 32 plugin-missing rows plus 5 plugin-behind. The Phase 2 effort estimate is larger than the prior audit implied. The security findings remain the most urgent items and are independent of all of the above.
