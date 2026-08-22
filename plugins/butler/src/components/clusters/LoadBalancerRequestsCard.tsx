// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { InfoCard, Table, TableColumn } from '@backstage/core-components';
import type { LoadBalancerRequest } from '../../api/types/machines';
import { StatusBadge } from '../StatusBadge/StatusBadge';

interface LoadBalancerRequestsCardProps {
  loadBalancerRequests: LoadBalancerRequest[];
}

type LoadBalancerRow = {
  id: string;
  name: string;
  vip: string;
  phase: string;
};

const columns: TableColumn<LoadBalancerRow>[] = [
  { title: 'Name', field: 'name' },
  { title: 'VIP', field: 'vip' },
  {
    title: 'Phase',
    field: 'phase',
    render: (row: LoadBalancerRow) => <StatusBadge status={row.phase} />,
  },
];

export const LoadBalancerRequestsCard = ({
  loadBalancerRequests,
}: LoadBalancerRequestsCardProps) => {
  if (loadBalancerRequests.length === 0) {
    return null;
  }

  // The CR exposes the VIP as status.endpoint.
  const rows: LoadBalancerRow[] = loadBalancerRequests.map(lb => ({
    id: lb.metadata.name,
    name: lb.metadata.name,
    vip: lb.status?.endpoint || '',
    phase: lb.status?.phase || 'Unknown',
  }));

  return (
    <InfoCard title="Load Balancer Requests">
      <Table<LoadBalancerRow>
        options={{
          search: false,
          paging: false,
          padding: 'dense',
          toolbar: false,
        }}
        columns={columns}
        data={rows}
      />
    </InfoCard>
  );
};
