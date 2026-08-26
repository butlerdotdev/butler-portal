// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { EnvironmentClusterDefaults } from '../api/types/environments';

/**
 * Kubernetes versions a Butler cluster may be created at.
 *
 * butler-server exposes no list of supported versions, so this is the
 * shared client-side list. Every version carries the `v` prefix because
 * that is what the CRD stores and what every existing cluster has; a
 * bare `1.31.4` is not the same string to the server.
 */
export const SUPPORTED_KUBERNETES_VERSIONS = [
  'v1.35.0',
  'v1.34.2',
  'v1.34.1',
  'v1.34.0',
  'v1.33.2',
  'v1.33.1',
  'v1.33.0',
  'v1.32.2',
  'v1.32.1',
  'v1.32.0',
  'v1.31.2',
  'v1.31.1',
  'v1.31.0',
  'v1.30.2',
  'v1.30.1',
  'v1.30.0',
] as const;

/** What the server falls back to when the request omits a version. */
export const SERVER_DEFAULT_KUBERNETES_VERSION = 'v1.32.2';

/** Where a prefilled value came from, so the form can say so. */
export type DefaultSource = 'team' | 'environment';

export interface ClusterDefaults {
  kubernetesVersion?: string;
  workerReplicas?: number;
  workerCPU?: number;
  workerMemory?: string;
  workerDiskSize?: string;
}

export interface ResolvedClusterDefaults {
  values: ClusterDefaults;
  /** Which layer supplied each value that is set. */
  sources: Partial<Record<keyof ClusterDefaults, DefaultSource>>;
}

function isSet(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

/**
 * The defaults a new cluster starts from.
 *
 * A team sets defaults for all of its clusters and an environment may
 * narrow them for the clusters inside it, so the environment wins where
 * both speak. Each resolved value records which layer it came from,
 * because a number the user did not type is only trustworthy if the form
 * can say where it came from.
 *
 * Memory and disk are held as plain numbers of gibibytes on both layers
 * and become the `<N>Gi` quantities the server expects.
 */
export function resolveClusterDefaults(
  teamDefaults: EnvironmentClusterDefaults | undefined,
  environmentDefaults: EnvironmentClusterDefaults | undefined,
): ResolvedClusterDefaults {
  const values: ClusterDefaults = {};
  const sources: ResolvedClusterDefaults['sources'] = {};

  const layers: Array<[DefaultSource, EnvironmentClusterDefaults | undefined]> =
    [
      ['team', teamDefaults],
      ['environment', environmentDefaults],
    ];

  for (const [source, layer] of layers) {
    if (!layer) continue;
    if (isSet(layer.kubernetesVersion)) {
      values.kubernetesVersion = layer.kubernetesVersion;
      sources.kubernetesVersion = source;
    }
    if (isSet(layer.workerCount)) {
      values.workerReplicas = Number(layer.workerCount);
      sources.workerReplicas = source;
    }
    if (isSet(layer.workerCPU)) {
      values.workerCPU = Number(layer.workerCPU);
      sources.workerCPU = source;
    }
    if (isSet(layer.workerMemoryGi)) {
      values.workerMemory = `${layer.workerMemoryGi}Gi`;
      sources.workerMemory = source;
    }
    if (isSet(layer.workerDiskGi)) {
      values.workerDiskSize = `${layer.workerDiskGi}Gi`;
      sources.workerDiskSize = source;
    }
  }

  return { values, sources };
}

/**
 * Whether a provider hands out load balancer addresses itself.
 *
 * In `ipam` mode the platform allocates from a pool, so asking for a
 * range is asking the user to do work the platform already does. In
 * `cloud` mode the cloud owns addressing entirely and a range is
 * meaningless. Only the remaining case genuinely needs one.
 */
export type NetworkMode = 'ipam' | 'cloud' | 'manual';

export function providerNetworkMode(mode: string | undefined): NetworkMode {
  if (mode === 'ipam') return 'ipam';
  if (mode === 'cloud') return 'cloud';
  return 'manual';
}

/** Whether the caller must supply a load balancer range themselves. */
export function requiresManualAddresses(
  mode: NetworkMode,
  overrideAllocation: boolean,
): boolean {
  if (mode === 'cloud') return false;
  if (mode === 'ipam') return overrideAllocation;
  return true;
}
