// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';
import { butlerApiRef } from '../../api/ButlerApi';
import type { IPAllocation } from '../../api/types/networks';
import { ButlerApiError } from '../../api/ButlerApiError';
import { allocationBelongsToCluster } from '../../utils/environment';
import { useButlerRoutes } from '../../hooks/useButlerRoutes';
import { useTeamContext } from '../../hooks/useTeamContext';
import { butlerTokens, rgb } from '../../theme';
import {
  ButlerButton,
  ButlerCard,
  ButlerChip,
  ButlerSpinner,
  ButlerStatusBadge,
} from '../ui';
import { ReleaseAllocationDialog } from './ReleaseAllocationDialog';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  return {
    list: { display: 'flex', flexDirection: 'column' },
    row: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      padding: '10px 0',
      borderBottom: `1px solid ${t.border}`,
      '&:last-child': { borderBottom: 'none' },
    },
    left: { display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 },
    right: { display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 },
    range: {
      fontFamily: t.fontMono,
      fontSize: 14,
      color: t.text.secondary,
      whiteSpace: 'nowrap',
    },
    pool: {
      fontSize: 12,
      color: rgb(t.palette.blue[400]),
      textDecoration: 'none',
      '&:hover': { textDecoration: 'underline' },
    },
    count: { fontSize: 12, color: t.text.subtle, whiteSpace: 'nowrap' },
    loading: { display: 'flex', justifyContent: 'center', padding: 12 },
  };
});

export interface NetworkAllocationsCardProps {
  clusterName: string;
  clusterNamespace: string;
}

/**
 * The address ranges this cluster holds, and which pool they came from.
 *
 * butler-server only serves allocations to a platform role, so a team role
 * gets nothing here and the card stays out of the way rather than showing
 * a refusal on a page that is otherwise theirs. The gap is recorded: a
 * team cannot currently see its own cluster's allocations.
 *
 * Allocations are claimed by `spec.tenantClusterRef`, which is a namespace
 * and a name, not a displayed string.
 */
export const NetworkAllocationsCard = ({
  clusterName,
  clusterNamespace,
}: NetworkAllocationsCardProps) => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const routes = useButlerRoutes();
  const { isAdmin, canAccessAdmin } = useTeamContext();

  const [allocations, setAllocations] = useState<IPAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [readable, setReadable] = useState(true);
  const [releasing, setReleasing] = useState<IPAllocation | null>(null);

  const load = useCallback(async () => {
    if (!canAccessAdmin) {
      setReadable(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await api.listAllIPAllocations();
      setAllocations(
        (response.allocations ?? []).filter(a =>
          allocationBelongsToCluster(a.spec.tenantClusterRef, {
            name: clusterName,
            namespace: clusterNamespace,
          }),
        ),
      );
      setReadable(true);
    } catch (e) {
      // A refusal means this caller is not entitled to allocations at all,
      // which is a scope answer rather than a failure worth shouting about.
      if (e instanceof ButlerApiError && e.isForbidden) setReadable(false);
      setAllocations([]);
    } finally {
      setLoading(false);
    }
  }, [api, canAccessAdmin, clusterName, clusterNamespace]);

  useEffect(() => {
    load();
  }, [load]);

  if (!readable) return null;
  if (loading) {
    return (
      <ButlerCard title="Network Allocations">
        <div className={classes.loading}>
          <ButlerSpinner />
        </div>
      </ButlerCard>
    );
  }
  if (allocations.length === 0) return null;

  return (
    <>
      <ButlerCard title="Network Allocations">
        <div className={classes.list}>
          {allocations.map(allocation => {
            const status = allocation.status ?? {};
            const poolName = allocation.spec.poolRef.name;
            const poolNamespace =
              allocation.spec.poolRef.namespace ??
              allocation.metadata.namespace;
            const addresses =
              status.addresses?.length ??
              (status.startAddress && status.endAddress ? undefined : 0);
            return (
              <div
                key={allocation.metadata.uid ?? allocation.metadata.name}
                className={classes.row}
              >
                <div className={classes.left}>
                  <ButlerChip tone="violet">
                    {allocation.spec.type ?? 'nodes'}
                  </ButlerChip>
                  <span className={classes.range}>
                    {status.startAddress ?? '-'} to {status.endAddress ?? '-'}
                  </span>
                  {addresses !== undefined && addresses > 0 && (
                    <span className={classes.count}>
                      {addresses} address{addresses === 1 ? '' : 'es'}
                    </span>
                  )}
                </div>
                <div className={classes.right}>
                  <RouterLink
                    className={classes.pool}
                    to={routes.adminNetworkPool({
                      namespace: poolNamespace,
                      name: poolName,
                    })}
                  >
                    {poolName}
                  </RouterLink>
                  <ButlerStatusBadge status={status.phase ?? 'Pending'} />
                  {isAdmin && (
                    <ButlerButton
                      variant="ghost"
                      size="sm"
                      onClick={() => setReleasing(allocation)}
                    >
                      Release
                    </ButlerButton>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ButlerCard>

      {releasing && (
        <ReleaseAllocationDialog
          open
          allocation={releasing}
          clusterName={clusterName}
          onClose={() => setReleasing(null)}
          onReleased={load}
          onRelease={(namespace, name) =>
            api.releaseIPAllocation(namespace, name)
          }
        />
      )}
    </>
  );
};
