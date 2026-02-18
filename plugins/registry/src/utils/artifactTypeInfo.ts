// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { ArtifactType } from '../api/types/artifacts';

interface ArtifactTypeInfo {
  label: string;
  shortLabel: string;
  color: string;
}

const TYPE_INFO: Record<ArtifactType, ArtifactTypeInfo> = {
  'terraform-module': {
    label: 'Terraform Module',
    shortLabel: 'Terraform',
    color: '#7B42BC',
  },
  'terraform-provider': {
    label: 'Terraform Provider',
    shortLabel: 'Provider',
    color: '#5C4EE5',
  },
  'helm-chart': {
    label: 'Helm Chart',
    shortLabel: 'Helm',
    color: '#0F1689',
  },
  'opa-bundle': {
    label: 'OPA Policy Bundle',
    shortLabel: 'OPA',
    color: '#566366',
  },
  'oci-artifact': {
    label: 'OCI Artifact',
    shortLabel: 'OCI',
    color: '#2496ED',
  },
};

export function getArtifactTypeInfo(type: ArtifactType): ArtifactTypeInfo {
  return TYPE_INFO[type] ?? { label: type, shortLabel: type, color: '#999' };
}
