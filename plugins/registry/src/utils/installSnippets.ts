// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { ArtifactType } from '../api/types/artifacts';

interface InstallSnippet {
  label: string;
  language: string;
  code: string;
}

export function getInstallSnippets(
  type: ArtifactType,
  namespace: string,
  name: string,
  version: string,
  baseUrl: string,
  provider?: string | null,
): InstallSnippet[] {
  switch (type) {
    case 'terraform-module':
      return [
        {
          label: 'Terraform',
          language: 'hcl',
          code: `module "${name}" {
  source  = "${baseUrl}/${namespace}/${name}/${provider || 'generic'}"
  version = "${version}"
}`,
        },
        {
          label: 'OpenTofu',
          language: 'hcl',
          code: `module "${name}" {
  source  = "${baseUrl}/${namespace}/${name}/${provider || 'generic'}"
  version = "${version}"
}`,
        },
      ];

    case 'terraform-provider':
      return [
        {
          label: 'Terraform',
          language: 'hcl',
          code: `terraform {
  required_providers {
    ${name} = {
      source  = "${namespace}/${name}"
      version = "${version}"
    }
  }
}`,
        },
        {
          label: 'OpenTofu',
          language: 'hcl',
          code: `terraform {
  required_providers {
    ${name} = {
      source  = "${namespace}/${name}"
      version = "${version}"
    }
  }
}`,
        },
      ];

    case 'helm-chart':
      return [
        {
          label: 'Helm',
          language: 'bash',
          code: `helm repo add ${namespace} ${baseUrl}/helm/${namespace}
helm install ${name} ${namespace}/${name} --version ${version}`,
        },
        {
          label: 'Flux HelmRelease',
          language: 'yaml',
          code: `apiVersion: source.toolkit.fluxcd.io/v1
kind: HelmRepository
metadata:
  name: ${namespace}
spec:
  url: ${baseUrl}/helm/${namespace}
---
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: ${name}
spec:
  chart:
    spec:
      chart: ${name}
      version: "${version}"
      sourceRef:
        kind: HelmRepository
        name: ${namespace}`,
        },
      ];

    case 'oci-artifact':
      return [
        {
          label: 'ORAS',
          language: 'bash',
          code: `oras pull ${baseUrl}/oci/v2/${namespace}/${name}:${version}`,
        },
        {
          label: 'Flux OCIRepository',
          language: 'yaml',
          code: `apiVersion: source.toolkit.fluxcd.io/v1beta2
kind: OCIRepository
metadata:
  name: ${name}
spec:
  url: oci://${baseUrl}/oci/v2/${namespace}/${name}
  ref:
    tag: "${version}"`,
        },
      ];

    case 'opa-bundle':
      return [
        {
          label: 'OPA',
          language: 'bash',
          code: `opa run --bundle ${baseUrl}/oci/v2/${namespace}/${name}:${version}`,
        },
      ];

    default:
      return [];
  }
}
