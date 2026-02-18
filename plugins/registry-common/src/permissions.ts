// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { createPermission } from '@backstage/plugin-permission-common';

// ── Artifact Permissions ──────────────────────────────────────────────

export const registryArtifactCreatePermission = createPermission({
  name: 'registry.artifact.create',
  attributes: { action: 'create' },
});

export const registryArtifactUpdatePermission = createPermission({
  name: 'registry.artifact.update',
  attributes: { action: 'update' },
});

// ── Version Permissions ───────────────────────────────────────────────

export const registryVersionPublishPermission = createPermission({
  name: 'registry.version.publish',
  attributes: { action: 'create' },
});

export const registryVersionApprovePermission = createPermission({
  name: 'registry.version.approve',
  attributes: { action: 'update' },
});

export const registryVersionYankPermission = createPermission({
  name: 'registry.version.yank',
  attributes: { action: 'update' },
});

// ── Environment Permissions ───────────────────────────────────────────

export const registryEnvironmentCreatePermission = createPermission({
  name: 'registry.environment.create',
  attributes: { action: 'create' },
});

export const registryEnvironmentUpdatePermission = createPermission({
  name: 'registry.environment.update',
  attributes: { action: 'update' },
});

export const registryEnvironmentDeletePermission = createPermission({
  name: 'registry.environment.delete',
  attributes: { action: 'delete' },
});

export const registryEnvironmentLockPermission = createPermission({
  name: 'registry.environment.lock',
  attributes: { action: 'update' },
});

// ── Run Permissions ───────────────────────────────────────────────────

export const registryRunCreatePermission = createPermission({
  name: 'registry.run.create',
  attributes: { action: 'create' },
});

export const registryRunCancelPermission = createPermission({
  name: 'registry.run.cancel',
  attributes: { action: 'update' },
});

export const registryRunConfirmPermission = createPermission({
  name: 'registry.run.confirm',
  attributes: { action: 'update' },
});

// ── Cloud Integration Permissions ─────────────────────────────────────

export const registryCloudIntegrationCreatePermission = createPermission({
  name: 'registry.cloud-integration.create',
  attributes: { action: 'create' },
});

export const registryCloudIntegrationUpdatePermission = createPermission({
  name: 'registry.cloud-integration.update',
  attributes: { action: 'update' },
});

export const registryCloudIntegrationDeletePermission = createPermission({
  name: 'registry.cloud-integration.delete',
  attributes: { action: 'delete' },
});

// ── Variable Set Permissions ──────────────────────────────────────────

export const registryVariableSetCreatePermission = createPermission({
  name: 'registry.variable-set.create',
  attributes: { action: 'create' },
});

export const registryVariableSetUpdatePermission = createPermission({
  name: 'registry.variable-set.update',
  attributes: { action: 'update' },
});

export const registryVariableSetDeletePermission = createPermission({
  name: 'registry.variable-set.delete',
  attributes: { action: 'delete' },
});

// ── Token Permissions ─────────────────────────────────────────────────

export const registryTokenCreatePermission = createPermission({
  name: 'registry.token.create',
  attributes: { action: 'create' },
});

export const registryTokenRevokePermission = createPermission({
  name: 'registry.token.revoke',
  attributes: { action: 'delete' },
});

/** All registry permissions — used by permission policy modules */
export const registryPermissions = [
  registryArtifactCreatePermission,
  registryArtifactUpdatePermission,
  registryVersionPublishPermission,
  registryVersionApprovePermission,
  registryVersionYankPermission,
  registryEnvironmentCreatePermission,
  registryEnvironmentUpdatePermission,
  registryEnvironmentDeletePermission,
  registryEnvironmentLockPermission,
  registryRunCreatePermission,
  registryRunCancelPermission,
  registryRunConfirmPermission,
  registryCloudIntegrationCreatePermission,
  registryCloudIntegrationUpdatePermission,
  registryCloudIntegrationDeletePermission,
  registryVariableSetCreatePermission,
  registryVariableSetUpdatePermission,
  registryVariableSetDeletePermission,
  registryTokenCreatePermission,
  registryTokenRevokePermission,
];
