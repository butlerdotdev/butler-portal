// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { InfoCard, Table, TableColumn } from '@backstage/core-components';
import type { MachineRequest } from '../../api/types/machines';
import { StatusBadge } from '../StatusBadge/StatusBadge';

interface MachineRequestsCardProps {
  machineRequests: MachineRequest[];
}

type MachineRow = {
  id: string;
  name: string;
  role: string;
  ip: string;
  phase: string;
};

const columns: TableColumn<MachineRow>[] = [
  { title: 'Name', field: 'name' },
  { title: 'Role', field: 'role' },
  { title: 'IP', field: 'ip' },
  {
    title: 'Phase',
    field: 'phase',
    render: (row: MachineRow) => <StatusBadge status={row.phase} />,
  },
];

export const MachineRequestsCard = ({
  machineRequests,
}: MachineRequestsCardProps) => {
  if (machineRequests.length === 0) {
    return null;
  }

  const ready = machineRequests.filter(
    m => m.status?.phase === 'Running',
  ).length;

  const rows: MachineRow[] = machineRequests.map(m => ({
    id: m.metadata.name,
    name: m.spec?.machineName || m.metadata.name,
    role: m.spec?.role || 'worker',
    ip: m.status?.ipAddress || m.status?.ipAddresses?.[0] || '',
    phase: m.status?.phase || 'Unknown',
  }));

  return (
    <InfoCard
      title="Provisioning"
      subheader={`${ready}/${machineRequests.length} VMs ready`}
    >
      <Table<MachineRow>
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
