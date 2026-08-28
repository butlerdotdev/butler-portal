// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * The platform observability configuration as `GET /observability/config`
 * returns it to any authenticated caller.
 *
 * This is the platform's half of cluster observability: where the
 * central pipeline lives and what a cluster's collectors should send to.
 * The cluster's half is three ordinary addons (`vector-agent`,
 * `prometheus-operator`, `otel-collector`) installed with values that
 * point at these endpoints. Butler manages the collectors; the pipeline
 * itself is a separate cluster this config names.
 */
export interface PipelineConfigInfo {
  clusterName?: string;
  clusterNamespace?: string;
  logEndpoint?: string;
  metricEndpoint?: string;
  traceEndpoint?: string;
}

export interface AutoEnrollConfig {
  vectorAgent?: boolean;
  prometheus?: boolean;
  otelCollector?: boolean;
}

export interface LogCollectionInfo {
  podLogs?: boolean;
  journald?: boolean;
  kubernetesEvents?: boolean;
}

export interface MetricCollectionInfo {
  enabled?: boolean;
  retention?: string;
}

export interface CollectionConfigInfo {
  autoEnroll?: AutoEnrollConfig;
  logs?: LogCollectionInfo;
  metrics?: MetricCollectionInfo;
}

export interface ObservabilityConfig {
  configured: boolean;
  pipeline?: PipelineConfigInfo;
  collection?: CollectionConfigInfo;
}

/**
 * Fleet status as `GET /admin/observability/status` returns it to a
 * platform admin. The server builds it from the ButlerConfig pipeline
 * reference plus one TenantAddon list per cluster; it is a read of the
 * same collector addons the cluster observability tab manages, seen
 * across the estate, not a second lifecycle for them.
 */
export interface PipelineStatusInfo {
  clusterName: string;
  clusterNamespace: string;
  /** TenantCluster phase of the pipeline cluster; "Unknown" when it cannot be read. */
  clusterPhase: string;
  logEndpoint: string;
  /**
   * Aggregator addon phase when a vector-aggregator TenantAddon exists on
   * the pipeline cluster; otherwise the result of probing the log
   * endpoint host's Vector API (Healthy, Degraded, Unreachable, Unknown).
   */
  aggregatorStatus?: string;
}

export interface AddonStatusInfo {
  status: string;
  version?: string;
}

export interface ClusterObsInfo {
  name: string;
  namespace: string;
  team: string;
  phase: string;
  vectorAgent?: AddonStatusInfo;
  prometheus?: AddonStatusInfo;
  otelCollector?: AddonStatusInfo;
}

export interface ObservabilitySummary {
  totalClusters: number;
  enrolledClusters: number;
  vectorAgentCount: number;
  prometheusCount: number;
  otelCollectorCount: number;
}

export interface ObservabilityStatus {
  pipeline?: PipelineStatusInfo;
  clusters: ClusterObsInfo[];
  summary: ObservabilitySummary;
}

/** `PUT /admin/observability/config`: only the sections given change, and only non-empty endpoint strings. */
export interface UpdateObservabilityConfigRequest {
  pipeline?: PipelineConfigInfo;
  collection?: CollectionConfigInfo;
}

/** `POST /admin/observability/pipeline/setup`: registers a Ready cluster as the pipeline. */
export interface SetupPipelineRequest {
  clusterName: string;
  clusterNamespace: string;
  logEndpoint: string;
  metricEndpoint?: string;
  traceEndpoint?: string;
}
