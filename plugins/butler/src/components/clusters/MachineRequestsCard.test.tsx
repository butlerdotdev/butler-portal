// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/test-utils';
import { MachineRequestsCard } from './MachineRequestsCard';
import type { MachineRequest } from '../../api/types/machines';

const machines: MachineRequest[] = [
  {
    metadata: { name: 'c1-cp-0' },
    spec: {
      providerRef: { name: 'harvester' },
      machineName: 'c1-cp-0',
      role: 'control-plane',
      cpu: 2,
      memoryMB: 4096,
      diskGB: 40,
    },
    status: { phase: 'Running', ipAddress: '10.0.0.11' },
  },
  {
    metadata: { name: 'c1-worker-0' },
    spec: {
      providerRef: { name: 'harvester' },
      machineName: 'c1-worker-0',
      role: 'worker',
      cpu: 4,
      memoryMB: 8192,
      diskGB: 80,
    },
    status: { phase: 'Creating' },
  },
];

describe('MachineRequestsCard', () => {
  it('renders ready count, names, IPs and phases', async () => {
    await renderInTestApp(<MachineRequestsCard machineRequests={machines} />);
    expect(
      screen.getByText('Provisioning (1/2 VMs ready)'),
    ).toBeInTheDocument();
    expect(screen.getByText('c1-cp-0')).toBeInTheDocument();
    expect(screen.getByText('c1-worker-0')).toBeInTheDocument();
    expect(screen.getByText(/IP: 10\.0\.0\.11/)).toBeInTheDocument();
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('Creating')).toBeInTheDocument();
  });

  it('renders nothing when there are no machine requests', async () => {
    const { container } = await renderInTestApp(
      <MachineRequestsCard machineRequests={[]} />,
    );
    expect(container.querySelector('h3')).toBeNull();
  });
});
