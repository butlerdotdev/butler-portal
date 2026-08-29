// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { MachineRequest } from '../../api/types/machines';
import { ButlerCard, ButlerStatusBadge } from '../ui';
import { makeStyles } from '@material-ui/core/styles';
import { butlerTokens } from '../../theme';

const useNoteStyles = makeStyles(theme => ({
  note: { margin: 0, fontSize: 13, color: butlerTokens(theme).text.subtle },
}));
import { RequestRow, useRequestRowStyles } from './RequestRow';

interface MachineRequestsCardProps {
  machineRequests: MachineRequest[];
  /**
   * Why there are none, when that is the normal case for this cluster.
   * Without it an empty list renders nothing, as the console does.
   */
  absenceNote?: string;
}

/**
 * Console "Provisioning" card: one inset row per MachineRequest with the
 * VM name, its address and phase. Hidden when there are no requests.
 */
export const MachineRequestsCard = ({
  machineRequests,
  absenceNote,
}: MachineRequestsCardProps) => {
  const classes = useRequestRowStyles();
  const noteClasses = useNoteStyles();
  if (machineRequests.length === 0) {
    if (!absenceNote) return null;
    return (
      <ButlerCard title="Machine Requests">
        <p className={noteClasses.note}>{absenceNote}</p>
      </ButlerCard>
    );
  }
  const ready = machineRequests.filter(
    m => m.status?.phase === 'Running',
  ).length;
  return (
    <ButlerCard
      title={`Provisioning (${ready}/${machineRequests.length} VMs ready)`}
    >
      <div className={classes.list}>
        {machineRequests.map(m => {
          const ip = m.status?.ipAddress || m.status?.ipAddresses?.[0];
          const role = m.spec?.role;
          return (
            <RequestRow
              key={m.metadata.name}
              name={m.spec?.machineName || m.metadata.name}
              detail={[ip && `IP: ${ip}`, role && `Role: ${role}`]
                .filter(Boolean)
                .join('  ')}
              trailing={
                <ButlerStatusBadge status={m.status?.phase || 'Pending'} />
              }
            />
          );
        })}
      </div>
    </ButlerCard>
  );
};
