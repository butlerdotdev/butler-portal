// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useApi } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';
import { butlerApiRef } from '../../api/ButlerApi';
import type { NetworkPool } from '../../api/types/networks';
import { useButlerResource } from '../../hooks/useButlerResource';
import { useButlerRoutes } from '../../hooks/useButlerRoutes';
import { useTeamContext } from '../../hooks/useTeamContext';
import { butlerTokens, rgb } from '../../theme';
import {
  ButlerCard,
  ButlerEmptyState,
  ButlerErrorState,
  ButlerLoading,
  ButlerPageHeader,
  ButlerStack,
  ButlerTable,
} from '../ui';
import type { ButlerColumn } from '../ui';
import { PoolUsageBar } from './PoolUsageBar';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  return {
    link: {
      color: rgb(t.palette.blue[400]),
      textDecoration: 'none',
      '&:hover': { textDecoration: 'underline' },
    },
    note: { margin: 0, fontSize: 12, color: t.text.subtle },
  };
});

/**
 * The address pools the platform allocates from. Reading needs a platform
 * role, which butler-server enforces; creating and editing pools is not
 * offered here yet and remains a recorded gap.
 */
export const NetworkPoolsPage = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const routes = useButlerRoutes();
  const { canAccessAdmin } = useTeamContext();

  const state = useButlerResource<NetworkPool[]>(
    async () => (await api.listNetworkPools()).pools ?? [],
    { deps: [api], enabled: canAccessAdmin },
  );

  const columns: ButlerColumn<NetworkPool>[] = [
    {
      id: 'name',
      header: 'Pool',
      primary: true,
      render: pool => (
        <a
          className={classes.link}
          href={routes.adminNetworkPool({
            namespace: pool.metadata.namespace,
            name: pool.metadata.name,
          })}
        >
          {pool.metadata.name}
        </a>
      ),
    },
    {
      id: 'namespace',
      header: 'Namespace',
      render: pool => pool.metadata.namespace,
    },
    { id: 'cidr', header: 'CIDR', mono: true, render: pool => pool.spec.cidr },
    {
      id: 'usage',
      header: 'Usage',
      render: pool => (
        <PoolUsageBar
          allocated={pool.status?.allocatedIPs}
          total={pool.status?.totalIPs}
        />
      ),
    },
    {
      id: 'available',
      header: 'Available',
      align: 'right',
      render: pool => pool.status?.availableIPs ?? '-',
    },
    {
      id: 'allocations',
      header: 'Allocations',
      align: 'right',
      render: pool => pool.status?.allocationCount ?? 0,
    },
  ];

  if (state.status === 'loading') return <ButlerLoading />;
  if (state.status === 'error' && !state.data) {
    return (
      <ButlerStack>
        <ButlerPageHeader
          title="Network Pools"
          subtitle="Address space the platform allocates from"
        />
        <ButlerErrorState
          message="Failed to load network pools"
          detail={state.error.message}
          onRetry={() => state.refresh()}
        />
      </ButlerStack>
    );
  }

  const pools = state.data ?? [];

  return (
    <ButlerStack>
      <ButlerPageHeader
        title="Network Pools"
        subtitle="Address space the platform allocates from"
      />
      {pools.length === 0 ? (
        <ButlerEmptyState
          title="No network pools"
          description="Clusters take their addresses from a pool. None is configured."
        />
      ) : (
        <>
          <ButlerTable
            columns={columns}
            rows={pools}
            rowKey={pool => `${pool.metadata.namespace}/${pool.metadata.name}`}
            aria-label="Network pools"
          />
          <ButlerCard title="Managing pools">
            <p className={classes.note}>
              Creating, editing and deleting pools is done through the platform
              tooling. This view is read only.
            </p>
          </ButlerCard>
        </>
      )}
    </ButlerStack>
  );
};
