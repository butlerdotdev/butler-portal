# Butler plugin permissions

The Butler backend plugin gates every request it proxies to butler-server with one of the permissions below, evaluated by the portal's permission policy (the community RBAC backend in butler-portal 0.6.0 and later). The plugin id `butler` must appear in `permission.rbac.pluginsWithPermission`; the chart lists it by default. Without that entry RBAC returns ALLOW for every call and only butler-server's own team and environment roles apply.

butler-server still authorizes every call with the caller's team role (admin, operator, viewer) and platform role. A portal permission decides which surfaces a portal user may reach; it never grants more than butler-server allows for that identity.

| Permission | Action | Gates | Shipped default |
|---|---|---|---|
| `butler.cluster.read` | read | cluster lists and detail, nodes, events, addons, certificates, GitOps status, export YAML, addon catalog, Git provider config read, `/ws/clusters` | every authenticated user |
| `butler.cluster.create` | create | `POST /clusters` | `butler-portal-admin` |
| `butler.cluster.update` | update | edit, scale, change environment, workspace toggle, addon install/update/remove, certificate rotation, cluster GitOps enable/export/disable | `butler-portal-admin` |
| `butler.cluster.delete` | delete | `DELETE /clusters/{ns}/{name}` | `butler-portal-admin` |
| `butler.cluster.kubeconfig` | read | kubeconfig download (tenant cluster-admin credential) | `butler-portal-admin` |
| `butler.cluster.terminal` | update | tenant terminal WebSocket | `butler-portal-admin` |
| `butler.team.read` | read | team lists and detail, members, group syncs, team audit, team providers, user list, session endpoints | every authenticated user |
| `butler.team.manage` | update | team settings, members, group syncs, environments, team providers | `butler-portal-admin` |
| `butler.provider.read` | read | provider lists, detail and option lists | every authenticated user |
| `butler.provider.manage` | update | provider create, update, delete, validate, test | `butler-portal-admin` |
| `butler.admin.read` | read | management cluster, Steward objects, image syncs and factory, `/admin/*` reads | `butler-portal-admin` |
| `butler.admin.manage` | update | users, identity providers, policies, network pools and allocations, addon catalog, platform config, observability, image syncs, management addons and GitOps, Git provider config writes, management terminal | `butler-portal-admin` |
| `butler.workspace.read` | read | workspaces, templates, images, SSH keys, services, mirrord config | every authenticated user |
| `butler.workspace.manage` | update | workspace lifecycle, template writes, SSH key writes | `butler-portal-admin` |

Routes absent from the table in `src/routeAuthorization.ts` are refused by the proxy with 403 and logged at error level. `butler.authorization.allowUnmappedRoutes: true` forwards them instead (logged at warn); use it only while classifying a new butler-server route.

The `butler-portal-admin` role is the reference shape from the chart; adopters bind their own groups or split the writes across roles in the policy CSV or the `/rbac` UI.
