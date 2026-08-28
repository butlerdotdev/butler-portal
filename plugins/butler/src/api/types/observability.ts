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
