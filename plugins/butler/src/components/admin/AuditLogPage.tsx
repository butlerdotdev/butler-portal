// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useCallback } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { butlerApiRef } from '../../api/ButlerApi';
import type { AuditQuery } from '../../api/types/audit';
import { ButlerPageHeader, ButlerStack } from '../ui';
import { AuditLogTable } from './AuditLogTable';

/**
 * The platform's administrative history: every mutation the server
 * recorded, across teams, newest first. Served to platform admins and
 * viewers; the server decides. Team-scoped views live on each team's
 * Activity page.
 */
export const AuditLogPage = () => {
  const api = useApi(butlerApiRef);
  const load = useCallback((q: AuditQuery) => api.listAuditLog(q), [api]);
  return (
    <ButlerStack>
      <ButlerPageHeader
        title="Audit Log"
        subtitle="What changed across the platform, who changed it, and how the server answered. Sign-ins are recorded too. History is held in memory by the server and starts over when it restarts."
      />
      <AuditLogTable
        load={load}
        showTeam
        refusedMessage="The server serves the platform audit log to platform admins and platform viewers."
        aria-label="Platform audit log"
      />
    </ButlerStack>
  );
};
