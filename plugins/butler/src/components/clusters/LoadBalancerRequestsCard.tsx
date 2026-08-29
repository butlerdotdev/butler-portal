// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { LoadBalancerRequest } from '../../api/types/machines';
import { ButlerCard, ButlerStatusBadge } from '../ui';
import { makeStyles } from '@material-ui/core/styles';
import { butlerTokens } from '../../theme';

const useNoteStyles = makeStyles(theme => ({
  note: { margin: 0, fontSize: 13, color: butlerTokens(theme).text.subtle },
}));
import { RequestRow, useRequestRowStyles } from './RequestRow';

interface LoadBalancerRequestsCardProps {
  loadBalancerRequests: LoadBalancerRequest[];
  /**
   * Why there are none, when that is the normal case for this cluster.
   * Without it an empty list renders nothing, as the console does.
   */
  absenceNote?: string;
}

/**
 * Console "Load Balancer Requests" card: one inset row per request with
 * its VIP and phase. Hidden when there are no requests.
 */
export const LoadBalancerRequestsCard = ({
  loadBalancerRequests,
  absenceNote,
}: LoadBalancerRequestsCardProps) => {
  const classes = useRequestRowStyles();
  const noteClasses = useNoteStyles();
  if (loadBalancerRequests.length === 0) {
    if (!absenceNote) return null;
    return (
      <ButlerCard title="Load Balancer Requests">
        <p className={noteClasses.note}>{absenceNote}</p>
      </ButlerCard>
    );
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
