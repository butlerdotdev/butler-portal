/*
 * Copyright 2026 The Butler Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { createPermission } from '@backstage/plugin-permission-common';

// ── Pipeline Permissions ────────────────────────────────────────────

export const pipelineCreatePermission = createPermission({
  name: 'pipeline.create',
  attributes: { action: 'create' },
});

export const pipelineUpdatePermission = createPermission({
  name: 'pipeline.update',
  attributes: { action: 'update' },
});

export const pipelineDeletePermission = createPermission({
  name: 'pipeline.delete',
  attributes: { action: 'delete' },
});

// ── Version Permissions ─────────────────────────────────────────────

export const pipelineVersionCreatePermission = createPermission({
  name: 'pipeline.version.create',
  attributes: { action: 'create' },
});

// ── VRL Permissions ─────────────────────────────────────────────────

export const pipelineVrlExecutePermission = createPermission({
  name: 'pipeline.vrl.execute',
  attributes: { action: 'create' },
});

// ── Fleet Permissions ──────────────────────────────────────────────

export const pipelineDeployPermission = createPermission({
  name: 'pipeline.deploy',
  attributes: { action: 'create' },
});

export const pipelineFleetManagePermission = createPermission({
  name: 'pipeline.fleet.manage',
  attributes: { action: 'create' },
});

/** All pipeline permissions — used by permission policy modules */
export const pipelinePermissions = [
  pipelineCreatePermission,
  pipelineUpdatePermission,
  pipelineDeletePermission,
  pipelineVersionCreatePermission,
  pipelineVrlExecutePermission,
  pipelineDeployPermission,
  pipelineFleetManagePermission,
];
