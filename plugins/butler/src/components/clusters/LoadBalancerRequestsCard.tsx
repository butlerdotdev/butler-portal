// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { LoadBalancerRequest } from '../../api/types/machines';
import { ButlerCard, ButlerStatusBadge } from '../ui';
import { RequestRow, useRequestRowStyles } from './RequestRow';

interface LoadBalancerRequestsCardProps {
  loadBalancerRequests: LoadBalancerRequest[];
}

/**
 * Console "Load Balancer Requests" card: one inset row per request with
 * its VIP and phase. Hidden when there are no requests.
 */
export const LoadBalancerRequestsCard = ({
  loadBalancerRequests,
}: LoadBalancerRequestsCardProps) => {
  const classes = useRequestRowStyles();
  if (loadBalancerRequests.length === 0) {
    return null;
  }
  return (
    <ButlerCard title="Load Balancer Requests">
      <div className={classes.list}>
        {loadBalancerRequests.map(lb => (
          <RequestRow
            key={lb.metadata.name}
            name={lb.metadata.name}
            // The CR exposes the VIP as status.endpoint.
            detail={
              lb.status?.endpoint ? `VIP: ${lb.status.endpoint}` : undefined
            }
            trailing={
              <ButlerStatusBadge status={lb.status?.phase || 'Pending'} />
            }
          />
        ))}
      </div>
    </ButlerCard>
  );
};
