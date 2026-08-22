// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import { butlerApiRef } from '../../api/ButlerApi';
import type { Cluster } from '../../api/types/clusters';
import { useButlerResource } from '../../hooks/useButlerResource';
import { useClusterWatch } from '../../hooks/useClusterWatch';
import { useButlerRoutes } from '../../hooks/useButlerRoutes';
import { formatAge } from '../../utils/formatAge';
import {
  ButlerButton,
  ButlerEmptyState,
  ButlerErrorState,
  ButlerLoading,
  ButlerPageHeader,
  ButlerStack,
  PlusIcon,
} from '../ui';
import { ClusterListRow } from './ClusterListRow';
import { ClusterListToolbar } from './ClusterListToolbar';

const PHASE_ORDER = [
  'Ready',
  'Provisioning',
  'Pending',
  'Updating',
  'Degraded',
  'Failed',
  'Deleting',
  'Unknown',
];

function getProviderName(cluster: Cluster): string {
  return cluster.spec.providerConfigRef?.name || 'Default';
}

function getWorkerCount(cluster: Cluster): number {
  return cluster.spec.workers?.replicas ?? 0;
}

function applyOverlay(
  base: Cluster[],
  updated: Map<string, Cluster>,
  deleted: Set<string>,
): Cluster[] {
  const key = (c: Cluster) => `${c.metadata.namespace}/${c.metadata.name}`;
  const seen = new Set<string>();
  const merged: Cluster[] = [];
  for (const c of base) {
    const k = key(c);
    if (deleted.has(k)) continue;
    seen.add(k);
    merged.push(updated.get(k) ?? c);
  }
  for (const [k, c] of updated) {
    if (!seen.has(k) && !deleted.has(k)) merged.push(c);
  }
  return merged;
}

export const ClustersPage = () => {
  const api = useApi(butlerApiRef);
  const routes = useButlerRoutes();
  const { team } = useParams<{ team: string }>();
  const state = useButlerResource<Cluster[]>(
    async () => {
      const response = await api.listClusters({ team: team || undefined });
      return response.clusters || [];
    },
    { deps: [api, team] },
  );

  const [search, setSearch] = useState('');
  const [phaseFilter, setPhaseFilter] = useState<Set<string>>(new Set());

  const { subscribe } = useClusterWatch();
  // Live events are layered over the fetched list: updates replace or
  // append (only for this team, since the server may broadcast every
  // cluster) and deletes hide. A refresh replaces the base list and the
  // overlay is rebuilt from later events.
  const [overlay, setOverlay] = useState<{
    updated: Map<string, Cluster>;
    deleted: Set<string>;
  }>({ updated: new Map(), deleted: new Set() });
  useEffect(
    () =>
      subscribe(event => {
        setOverlay(prev => {
          const updated = new Map(prev.updated);
          const deleted = new Set(prev.deleted);
          if (event.type === 'update') {
            const clusterTeam = event.cluster.spec?.teamRef?.name;
            if (team && clusterTeam && clusterTeam !== team) return prev;
            const key = `${event.cluster.metadata.namespace}/${event.cluster.metadata.name}`;
            updated.set(key, event.cluster);
            deleted.delete(key);
          } else {
            const key = `${event.namespace}/${event.name}`;
            deleted.add(key);
            updated.delete(key);
          }
          return { updated, deleted };
        });
      }),
    [subscribe, team],
  );

  const base = state.status === 'loading' ? undefined : state.data;
  const clusters = useMemo(
    () => applyOverlay(base ?? [], overlay.updated, overlay.deleted),
    [base, overlay],
  );

  const availablePhases = useMemo(() => {
    const present = new Set(clusters.map(c => c.status?.phase || 'Unknown'));
    return [
      ...PHASE_ORDER.filter(p => present.has(p)),
      ...[...present].filter(p => !PHASE_ORDER.includes(p)).sort(),
    ];
  }, [clusters]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clusters.filter(c => {
      const phase = c.status?.phase || 'Unknown';
      if (phaseFilter.size > 0 && !phaseFilter.has(phase)) return false;
      if (!q) return true;
      return (
        c.metadata.name.toLowerCase().includes(q) ||
        c.metadata.namespace.toLowerCase().includes(q)
      );
    });
  }, [clusters, search, phaseFilter]);

  const createPath = routes.createCluster({ team: team ?? '' });
  const createButton = (
    <ButlerButton
      component={RouterLink}
      to={createPath}
      startIcon={<PlusIcon />}
    >
      Create Cluster
    </ButlerButton>
  );

  let body: React.ReactNode;
  if (state.status === 'loading') {
    body = <ButlerLoading />;
  } else if (state.status === 'error' && !state.data) {
    body = (
      <ButlerErrorState
        message="Failed to load clusters"
        detail={state.error.message}
        onRetry={() => state.refresh()}
      />
    );
  } else if (clusters.length === 0) {
    body = (
      <ButlerEmptyState
        title="No clusters yet"
        description="Create your first tenant cluster to get started."
        action={createButton}
      />
    );
  } else {
    const filtered = visible.length !== clusters.length;
    body = (
      <ButlerStack>
        <ClusterListToolbar
          search={search}
          onSearchChange={setSearch}
          phaseFilter={phaseFilter}
          onPhaseFilterChange={setPhaseFilter}
          availablePhases={availablePhases}
          resultsLabel={
            filtered ? `${visible.length} of ${clusters.length} clusters` : null
          }
        />
        {visible.length === 0 ? (
          <ButlerEmptyState
            title="No clusters match the current filters."
            action={
              <ButlerButton
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setPhaseFilter(new Set());
                }}
              >
                Clear filters
              </ButlerButton>
            }
          />
        ) : (
          <ButlerStack gap={16} role="list" aria-label="Clusters">
            {visible.map(cluster => (
              <div
                key={
                  cluster.metadata.uid ||
                  `${cluster.metadata.namespace}/${cluster.metadata.name}`
                }
                role="listitem"
              >
                <ClusterListRow
                  to={routes.clusterDetail({
                    team: team ?? '',
                    namespace: cluster.metadata.namespace,
                    name: cluster.metadata.name,
                  })}
                  name={cluster.metadata.name}
                  namespace={cluster.metadata.namespace}
                  phase={cluster.status?.phase || 'Unknown'}
                  stats={[
                    { label: 'Provider', value: getProviderName(cluster) },
                    {
                      label: 'Version',
                      value: cluster.spec.kubernetesVersion || 'Unknown',
                    },
                    {
                      label: 'Workers',
                      value: String(getWorkerCount(cluster)),
                    },
                    {
                      label: 'Age',
                      value: formatAge(cluster.metadata.creationTimestamp),
                    },
                  ]}
                />
              </div>
            ))}
          </ButlerStack>
        )}
      </ButlerStack>
    );
  }

  return (
    <ButlerStack>
      <ButlerPageHeader
        title="Clusters"
        subtitle="Manage your Kubernetes clusters"
        actions={createButton}
      />
      {body}
    </ButlerStack>
  );
};
