// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { BasicPermission } from '@backstage/plugin-permission-common';
import {
  butlerAdminManagePermission,
  butlerAdminReadPermission,
  butlerClusterCreatePermission,
  butlerClusterDeletePermission,
  butlerClusterKubeconfigPermission,
  butlerClusterReadPermission,
  butlerClusterTerminalPermission,
  butlerClusterUpdatePermission,
  butlerProviderManagePermission,
  butlerProviderReadPermission,
  butlerTeamManagePermission,
  butlerTeamReadPermission,
  butlerWorkspaceManagePermission,
  butlerWorkspaceReadPermission,
} from './permissions';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'WS';

interface RouteRule {
  methods: Method[];
  path: RegExp;
  permission: BasicPermission;
}

const READ: Method[] = ['GET'];
const WRITE: Method[] = ['POST', 'PUT', 'PATCH', 'DELETE'];

const seg = '[^/]+';
const cluster = `/clusters/${seg}/${seg}`;

// Ordered: the first rule whose method and path match wins, so the
// specific entries (kubeconfig, workspaces, member routes) come before
// the broad ones. Paths are relative to the proxy mount, i.e. the
// butler-server route without its /api prefix. Public login routes are
// deliberately absent: the proxy must never forward them under the
// service-account credential.
const rules: RouteRule[] = [
  // Session and self-service
  { methods: READ, path: /^\/auth\/(me|teams|providers)$/, permission: butlerTeamReadPermission },
  { methods: ['POST'], path: /^\/auth\/(logout|refresh|refresh-permissions)$/, permission: butlerTeamReadPermission },
  { methods: ['POST'], path: /^\/auth\/cli\/approve$/, permission: butlerTeamReadPermission },
  { methods: READ, path: /^\/auth\/ssh-keys$/, permission: butlerWorkspaceReadPermission },
  { methods: ['POST', 'DELETE'], path: /^\/auth\/ssh-keys(\/.+)?$/, permission: butlerWorkspaceManagePermission },

  // Workspaces (plugin-only surface)
  { methods: READ, path: new RegExp(`^${cluster}/workspaces(/${seg}(/metrics)?)?$`), permission: butlerWorkspaceReadPermission },
  { methods: READ, path: new RegExp(`^${cluster}/services$`), permission: butlerWorkspaceReadPermission },
  { methods: ['POST'], path: new RegExp(`^${cluster}/mirrord-config$`), permission: butlerWorkspaceReadPermission },
  { methods: WRITE, path: new RegExp(`^${cluster}/workspaces(/.*)?$`), permission: butlerWorkspaceManagePermission },
  { methods: READ, path: /^\/workspace-(images|templates)(\/.*)?$/, permission: butlerWorkspaceReadPermission },
  { methods: WRITE, path: /^\/workspace-templates(\/.*)?$/, permission: butlerWorkspaceManagePermission },

  // Clusters
  { methods: READ, path: new RegExp(`^${cluster}/kubeconfig$`), permission: butlerClusterKubeconfigPermission },
  { methods: READ, path: /^\/clusters(\/.*)?$/, permission: butlerClusterReadPermission },
  { methods: ['POST'], path: /^\/clusters$/, permission: butlerClusterCreatePermission },
  { methods: ['DELETE'], path: new RegExp(`^${cluster}$`), permission: butlerClusterDeletePermission },
  { methods: WRITE, path: new RegExp(`^${cluster}(/.*)?$`), permission: butlerClusterUpdatePermission },

  // Addon catalog and Git provider config reads are needed by cluster pages
  { methods: READ, path: /^\/addons\/catalog(\/.*)?$/, permission: butlerClusterReadPermission },
  { methods: READ, path: /^\/gitops\/(config|repos|repos\/branches)$/, permission: butlerClusterReadPermission },
  { methods: WRITE, path: /^\/gitops\/(config|preview)$/, permission: butlerAdminManagePermission },
  { methods: READ, path: /^\/observability\/config$/, permission: butlerClusterReadPermission },

  // Teams
  { methods: READ, path: /^\/teams(\/.*)?$/, permission: butlerTeamReadPermission },
  { methods: READ, path: /^\/users$/, permission: butlerTeamReadPermission },
  { methods: WRITE, path: /^\/teams(\/.*)?$/, permission: butlerTeamManagePermission },
  { methods: WRITE, path: new RegExp(`^/admin/teams/${seg}/(members|groups)(/.*)?$`), permission: butlerTeamManagePermission },

  // Providers
  { methods: READ, path: /^\/providers(\/.*)?$/, permission: butlerProviderReadPermission },
  { methods: WRITE, path: /^\/providers(\/.*)?$/, permission: butlerProviderManagePermission },

  // Platform: management cluster, Steward, images, admin pages
  { methods: READ, path: /^\/management(\/.*)?$/, permission: butlerAdminReadPermission },
  { methods: WRITE, path: /^\/management(\/.*)?$/, permission: butlerAdminManagePermission },
  { methods: READ, path: /^\/(image-syncs|image-factory)(\/.*)?$/, permission: butlerAdminReadPermission },
  { methods: WRITE, path: /^\/image-syncs(\/.*)?$/, permission: butlerAdminManagePermission },
  { methods: READ, path: /^\/admin(\/.*)?$/, permission: butlerAdminReadPermission },
  { methods: WRITE, path: /^\/admin(\/.*)?$/, permission: butlerAdminManagePermission },

  // WebSocket relays
  { methods: ['WS'], path: /^\/ws\/clusters$/, permission: butlerClusterReadPermission },
  { methods: ['WS'], path: /^\/ws\/terminal\/management$/, permission: butlerAdminManagePermission },
  { methods: ['WS'], path: /^\/ws\/terminal\/.+$/, permission: butlerClusterTerminalPermission },
];

/**
 * Resolves the permission that gates a proxied butler-server request.
 * Returns undefined for routes the table does not know, which the proxy
 * treats as denied unless explicitly configured otherwise.
 *
 * @param method - HTTP method, or "WS" for a WebSocket upgrade.
 * @param path - request path relative to the proxy mount, without query.
 */
export function resolveRoutePermission(
  method: string,
  path: string,
): BasicPermission | undefined {
  const m = method.toUpperCase() as Method;
  const p = path.split('?')[0].replace(/\/+$/, '') || '/';
  for (const rule of rules) {
    if (!rule.methods.includes(m)) continue;
    if (rule.path.test(p)) return rule.permission;
  }
  return undefined;
}

// Exported for tests that need to assert complete coverage of the
// butler-server route table.
export const routeRuleCount = rules.length;
