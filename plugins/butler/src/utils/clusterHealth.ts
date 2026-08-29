// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { Cluster } from '../api/types/clusters';
import type { TenantControlPlaneSummary } from '../api/types/steward';

/**
 * Derivations for the cluster detail page, all from what butler-server
 * returns on the TenantCluster and the TenantControlPlane projection.
 * Nothing here is computed from the browser clock alone: durations are
 * measured from the condition's lastTransitionTime the controller wrote,
 * and "requested" versus "observed" is spec against status.
 */

export const OWNER_ANNOTATIONS = [
  'butler.butlerlabs.dev/owner',
  'butler.butlerlabs.dev/creator-email',
] as const;

export function clusterOwner(cluster: Cluster): string | undefined {
  const a = cluster.metadata.annotations ?? {};
  for (const key of OWNER_ANNOTATIONS) {
    if (a[key]) return a[key];
  }
  return undefined;
}

export function condition(cluster: Cluster, type: string) {
  return cluster.status?.conditions?.find(c => c.type === type);
}

export type Tone = 'green' | 'yellow' | 'red' | 'neutral';

export interface StateWord {
  headline: string;
  detail?: string;
  tone: Tone;
}

/**
 * The control plane as the controller and Steward report it, never as
 * an inference from the cluster phase. A Ready cluster with a control
 * plane that stopped answering would read Ready by phase; the
 * ControlPlaneReady condition and the TenantControlPlane replicas are
 * the facts.
 */
export function controlPlaneState(
  cluster: Cluster,
  tcp?: TenantControlPlaneSummary | null,
): StateWord {
  const cond = condition(cluster, 'ControlPlaneReady');
  const replicas =
    tcp?.status?.replicas != null
      ? `${tcp.status.readyReplicas ?? 0}/${tcp.status.replicas} replicas ready`
      : undefined;
  if (cond?.status === 'True') {
    return {
      headline: 'Ready',
      detail: replicas ?? cond.message,
      tone: 'green',
    };
  }
  if (cond?.status === 'False') {
    return {
      headline: cond.reason || 'Not ready',
      detail: [cond.message, replicas].filter(Boolean).join('. '),
      tone: 'red',
    };
  }
  return {
    headline: 'Unknown',
    detail:
      replicas ?? 'The controller has not reported the control plane yet.',
    tone: 'neutral',
  };
}

export interface WorkersState {
  /** spec.workers.replicas: what has been asked for. */
  requested?: number;
  /** status.workerNodesDesired: what the controller is working toward. */
  desired?: number;
  /** status.workerNodesReady: what is actually Ready. */
  ready?: number;
  /** A scale has been accepted but the controller has not picked it up. */
  scalePending: boolean;
  /** Ready differs from desired. */
  converging: boolean;
  /** Ready exceeds desired while the cluster is Ready: nodes to clean up. */
  stale: boolean;
  /** WorkersReady condition, when present. */
  conditionStatus?: string;
  conditionReason?: string;
  conditionMessage?: string;
  /** When the WorkersReady condition last changed, from the controller. */
  since?: string;
  word: StateWord;
}

export function workersState(cluster: Cluster): WorkersState {
  const requested = cluster.spec.workers?.replicas;
  const desired = cluster.status?.workerNodesDesired;
  const ready = cluster.status?.workerNodesReady;
  const phase = cluster.status?.phase;
  const cond = condition(cluster, 'WorkersReady');
  const scalePending =
    requested != null && desired != null && requested !== desired;
  const converging = ready != null && desired != null && ready !== desired;
  const stale =
    phase === 'Ready' && ready != null && desired != null && ready > desired;

  let word: StateWord;
  if (scalePending) {
    word = {
      headline: `Scaling to ${requested}`,
      detail: `Requested ${requested}, controller still targeting ${desired}.`,
      tone: 'yellow',
    };
  } else if (stale) {
    word = {
      headline: `${ready}/${desired} ready`,
      detail: 'More nodes are reporting than are desired.',
      tone: 'yellow',
    };
  } else if (converging) {
    word = {
      headline: `${ready}/${desired} ready`,
      detail: cond?.message,
      tone: 'yellow',
    };
  } else if (cond?.status === 'True' || (ready != null && desired != null)) {
    word = {
      headline:
        ready != null && desired != null
          ? `${ready}/${desired} ready`
          : 'Ready',
      tone: 'green',
    };
  } else if (cond?.status === 'False') {
    word = {
      headline: cond.reason || 'Not ready',
      detail: cond.message,
      tone: 'red',
    };
  } else {
    word = {
      headline: requested != null ? String(requested) : 'Unknown',
      tone: 'neutral',
    };
  }

  return {
    requested,
    desired,
    ready,
    scalePending,
    converging,
    stale,
    conditionStatus: cond?.status,
    conditionReason: cond?.reason,
    conditionMessage: cond?.message,
    since: cond?.lastTransitionTime,
    word,
  };
}

/** Human duration between two instants, coarse on purpose. */
export function describeDuration(fromIso: string, now: Date): string {
  const ms = now.getTime() - new Date(fromIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 2) return 'about a minute';
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.floor(hours / 24);
  return `${days} days`;
}

/** Converging longer than this is called out; a normal join takes minutes. */
export const WORKERS_SLOW_AFTER_MS = 30 * 60 * 1000;

export interface ClusterBanner {
  kind: 'failed' | 'degraded' | 'stale' | 'workers-stuck' | 'deleting';
  severity: 'danger' | 'warning' | 'info';
  title: string;
  message?: string;
}

/**
 * Banners only for states an operator should act on or wait out with
 * understanding. Ordinary provisioning gets no banner; a Ready cluster
 * whose workers have not converged for a long time does, because the
 * phase alone hides it.
 */
export function clusterBanners(cluster: Cluster, now: Date): ClusterBanner[] {
  const out: ClusterBanner[] = [];
  const phase = cluster.status?.phase;
  const ready = condition(cluster, 'Ready');
  const workers = workersState(cluster);

  if (phase === 'Deleting') {
    out.push({
      kind: 'deleting',
      severity: 'info',
      title: 'Cluster is being deleted',
      message: 'Workloads, nodes and the control plane are being removed.',
    });
  }
  if (phase === 'Failed' && ready?.message) {
    out.push({
      kind: 'failed',
      severity: 'danger',
      title: 'Cluster Failed',
      message: ready.message,
    });
  }
  if (ready?.reason === 'ReconcileDegraded') {
    out.push({
      kind: 'degraded',
      severity: 'warning',
      title: 'Cluster Degraded',
      message: ready.message,
    });
  }
  if (workers.stale) {
    out.push({
      kind: 'stale',
      severity: 'warning',
      title: 'Stale Nodes Detected',
      message: `${workers.ready} nodes reporting but only ${workers.desired} desired. Check the Nodes tab for NotReady nodes that may need manual cleanup.`,
    });
  }
  if (
    phase === 'Ready' &&
    workers.converging &&
    !workers.stale &&
    workers.since &&
    now.getTime() - new Date(workers.since).getTime() > WORKERS_SLOW_AFTER_MS
  ) {
    out.push({
      kind: 'workers-stuck',
      severity: 'warning',
      title: 'Workers have not converged',
      message: `${workers.ready}/${
        workers.desired
      } workers ready for ${describeDuration(
        workers.since,
        now,
      )}. The cluster phase stays Ready while a worker is missing; check the Nodes tab and the provider for a machine that never joined.`,
    });
  }
  return out;
}

/**
 * Why a cluster shows no machine or load balancer requests. Those
 * records exist only when Butler provisions machines itself; a cluster
 * whose workers come from Cluster API through the provider never has
 * them, which is the normal case, not a failure.
 */
export function requestsAbsenceNote(
  kind: 'machine' | 'loadBalancer',
  cluster: Cluster,
): string {
  const phase = cluster.status?.phase;
  if (kind === 'machine') {
    return phase === 'Ready'
      ? 'No machine requests are recorded. Workers on this cluster are Cluster API machines managed through the provider; see the Nodes tab.'
      : 'No machine requests are recorded yet. Workers arrive as Cluster API machines through the provider; see the Nodes tab as they join.';
  }
  const net = condition(cluster, 'NetworkReady');
  if (cluster.status?.lbAllocationRef || net?.message?.includes('allocated')) {
    return `Load balancer addresses come from the platform pool${
      net?.message ? ` (${net.message})` : ''
    }; no provider load balancer request is needed.`;
  }
  return 'No load balancer requests are recorded for this cluster.';
}
