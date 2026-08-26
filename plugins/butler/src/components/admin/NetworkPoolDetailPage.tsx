// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import { butlerApiRef } from '../../api/ButlerApi';
import type { IPAllocation, NetworkPool } from '../../api/types/networks';
import { useButlerResource } from '../../hooks/useButlerResource';
import { useButlerRoutes } from '../../hooks/useButlerRoutes';
import { useTeamContext } from '../../hooks/useTeamContext';
import {
  ButlerCard,
  ButlerChip,
  ButlerEmptyState,
  ButlerErrorState,
  ButlerGrid,
  ButlerKeyValueList,
  ButlerKeyValueRow,
  ButlerLoading,
  ButlerPageHeader,
  ButlerStack,
  ButlerStatusBadge,
  ButlerTable,
} from '../ui';
import type { ButlerColumn } from '../ui';
import { PoolUsageBar } from './PoolUsageBar';

/**
 * A pool and everything allocated from it, so an address seen on a cluster
 * can be traced back to where it came from and what else shares it.
 */
export const NetworkPoolDetailPage = () => {
  const api = useApi(butlerApiRef);
  const routes = useButlerRoutes();
  const navigate = useNavigate();
  const { canAccessAdmin } = useTeamContext();
  const { namespace, name } = useParams<{ namespace: string; name: string }>();

  const poolState = useButlerResource<NetworkPool>(
    () => {
      if (!namespace || !name) {
        return Promise.reject(new Error('pool is not addressable'));
      }
      return api.getNetworkPool(namespace, name);
    },
    { deps: [api, namespace, name], enabled: canAccessAdmin },
  );

  const allocationsState = useButlerResource<IPAllocation[]>(
    async () => {
      if (!namespace || !name) return [];
      return (await api.listPoolAllocations(namespace, name)).allocations ?? [];
    },
    { deps: [api, namespace, name], enabled: canAccessAdmin },
  );

  const columns: ButlerColumn<IPAllocation>[] = [
    {
      id: 'cluster',
      header: 'Cluster',
      primary: true,
      render: a => a.spec.tenantClusterRef?.name ?? 'unclaimed',
    },
    {
      id: 'team',
      header: 'Namespace',
      render: a => a.spec.tenantClusterRef?.namespace ?? '-',
    },
    {
      id: 'type',
      header: 'Type',
      render: a => (
        <ButlerChip tone="violet">{a.spec.type ?? 'nodes'}</ButlerChip>
      ),
    },
    {
      id: 'range',
      header: 'Addresses',
      mono: true,
      render: a =>
        a.status?.startAddress && a.status?.endAddress
          ? `${a.status.startAddress} to ${a.status.endAddress}`
          : '-',
    },
    {
      id: 'phase',
      header: 'Phase',
      render: a => <ButlerStatusBadge status={a.status?.phase ?? 'Pending'} />,
    },
  ];

  if (poolState.status === 'loading') return <ButlerLoading />;
  if (!poolState.data) {
    return (
      <ButlerEmptyState
        title="Network pool not found"
        description={
          poolState.status === 'error'
            ? poolState.error.message
            : `${namespace}/${name} could not be loaded.`
        }
      />
    );
  }

  const pool = poolState.data;
  const status = pool.status ?? {};
  const allocations =
    allocationsState.status === 'loading' ? [] : allocationsState.data ?? [];

  return (
    <ButlerStack>
      <ButlerPageHeader
        title={pool.metadata.name}
        subtitle={pool.metadata.namespace}
        onBack={() => navigate(routes.adminNetworks())}
      />

      <ButlerGrid>
        <ButlerCard title="Pool">
          <ButlerKeyValueList>
            <ButlerKeyValueRow label="CIDR" mono>
              {pool.spec.cidr}
            </ButlerKeyValueRow>
            <ButlerKeyValueRow label="Tenant range" mono>
              {pool.spec.tenantAllocation?.start &&
              pool.spec.tenantAllocation?.end
                ? `${pool.spec.tenantAllocation.start} to ${pool.spec.tenantAllocation.end}`
                : 'Whole pool'}
            </ButlerKeyValueRow>
            <ButlerKeyValueRow label="Reserved">
              {pool.spec.reserved?.length
                ? pool.spec.reserved.map(r => r.cidr).join(', ')
                : 'None'}
            </ButlerKeyValueRow>
          </ButlerKeyValueList>
        </ButlerCard>

        <ButlerCard title="Usage">
          <ButlerKeyValueList>
            <ButlerKeyValueRow label="Allocated">
              <PoolUsageBar
                allocated={status.allocatedIPs}
                total={status.totalIPs}
              />
            </ButlerKeyValueRow>
            <ButlerKeyValueRow label="Available">
              {status.availableIPs ?? '-'}
            </ButlerKeyValueRow>
            <ButlerKeyValueRow label="Total addresses">
              {status.totalIPs ?? '-'}
            </ButlerKeyValueRow>
            <ButlerKeyValueRow label="Allocations">
              {status.allocationCount ?? allocations.length}
            </ButlerKeyValueRow>
          </ButlerKeyValueList>
        </ButlerCard>
      </ButlerGrid>

      {allocationsState.status === 'error' && !allocationsState.data ? (
        <ButlerErrorState
          message="Failed to load allocations for this pool"
          detail={allocationsState.error.message}
          onRetry={() => allocationsState.refresh()}
        />
      ) : allocations.length === 0 ? (
        <ButlerEmptyState
          title="Nothing allocated from this pool"
          description="Addresses appear here as clusters take them."
        />
      ) : (
        <ButlerTable
          columns={columns}
          rows={allocations}
          rowKey={a => `${a.metadata.namespace}/${a.metadata.name}`}
          aria-label="Allocations from this pool"
        />
      )}
    </ButlerStack>
  );
};
