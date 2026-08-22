// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { createPermission } from '@backstage/plugin-permission-common';

// Permissions the Butler plugin enforces in its backend proxy before a
// request is forwarded to butler-server. The set is coarse on purpose:
// butler-server still applies team roles (admin, operator, viewer) and
// environment roles to every call, so a portal role only decides which
// surfaces a Backstage user may reach at all. See PERMISSIONS.md.

export const butlerClusterReadPermission = createPermission({
  name: 'butler.cluster.read',
  attributes: { action: 'read' },
});

export const butlerClusterCreatePermission = createPermission({
  name: 'butler.cluster.create',
  attributes: { action: 'create' },
});

export const butlerClusterUpdatePermission = createPermission({
  name: 'butler.cluster.update',
  attributes: { action: 'update' },
});

export const butlerClusterDeletePermission = createPermission({
  name: 'butler.cluster.delete',
  attributes: { action: 'delete' },
});

// Downloading a kubeconfig hands out tenant cluster-admin credentials,
// so it is separate from butler.cluster.read and can be withheld.
export const butlerClusterKubeconfigPermission = createPermission({
  name: 'butler.cluster.kubeconfig',
  attributes: { action: 'read' },
});

// Interactive shells into tenant or management clusters.
export const butlerClusterTerminalPermission = createPermission({
  name: 'butler.cluster.terminal',
  attributes: { action: 'update' },
});

export const butlerTeamReadPermission = createPermission({
  name: 'butler.team.read',
  attributes: { action: 'read' },
});

// Team settings, members, group syncs, environments, team providers.
export const butlerTeamManagePermission = createPermission({
  name: 'butler.team.manage',
  attributes: { action: 'update' },
});

export const butlerProviderReadPermission = createPermission({
  name: 'butler.provider.read',
  attributes: { action: 'read' },
});

export const butlerProviderManagePermission = createPermission({
  name: 'butler.provider.manage',
  attributes: { action: 'update' },
});

// Platform-level reads: management cluster, users, admin pages.
export const butlerAdminReadPermission = createPermission({
  name: 'butler.admin.read',
  attributes: { action: 'read' },
});

// Platform-level writes: users, identity providers, policies, network
// pools, addon catalog, platform config, observability, images,
// management addons and GitOps, Git provider config.
export const butlerAdminManagePermission = createPermission({
  name: 'butler.admin.manage',
  attributes: { action: 'update' },
});

export const butlerWorkspaceReadPermission = createPermission({
  name: 'butler.workspace.read',
  attributes: { action: 'read' },
});

export const butlerWorkspaceManagePermission = createPermission({
  name: 'butler.workspace.manage',
  attributes: { action: 'update' },
});

export const butlerPermissions = [
  butlerClusterReadPermission,
  butlerClusterCreatePermission,
  butlerClusterUpdatePermission,
  butlerClusterDeletePermission,
  butlerClusterKubeconfigPermission,
  butlerClusterTerminalPermission,
  butlerTeamReadPermission,
  butlerTeamManagePermission,
  butlerProviderReadPermission,
  butlerProviderManagePermission,
  butlerAdminReadPermission,
  butlerAdminManagePermission,
  butlerWorkspaceReadPermission,
  butlerWorkspaceManagePermission,
];

// Read-tier permissions granted to every authenticated portal user by the
// chart's default policy. Writes are bound to roles through the CSV.
export const butlerDefaultReadPermissions = [
  butlerClusterReadPermission,
  butlerTeamReadPermission,
  butlerProviderReadPermission,
  butlerWorkspaceReadPermission,
];
