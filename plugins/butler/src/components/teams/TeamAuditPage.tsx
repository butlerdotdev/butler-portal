// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import { butlerApiRef } from '../../api/ButlerApi';
import type { AuditQuery } from '../../api/types/audit';
import { useButlerRoutes } from '../../hooks/useButlerRoutes';
import {
  ButlerCallout,
  ButlerEmptyState,
  ButlerPageHeader,
  ButlerStack,
} from '../ui';
import { AuditLogTable } from '../admin/AuditLogTable';

/**
 * A team's activity: the events the server recorded while the caller
 * was acting as this team. That is the server's scope (the request's
 * team context), so a platform admin's change made from the admin pages
 * appears in the platform log, not here. Served to admins of the team
 * and to platform roles.
 */
export const TeamAuditPage = () => {
  const api = useApi(butlerApiRef);
  const routes = useButlerRoutes();
  const navigate = useNavigate();
  const { team } = useParams<{ team: string }>();
  const load = useCallback(
    (q: AuditQuery) => api.listTeamAuditLog(team ?? '', q),
    [api, team],
  );
  if (!team) {
    return (
      <ButlerEmptyState
        title="No team selected"
        description="Open a team to see its activity."
      />
    );
  }
  return (
    <ButlerStack>
      <ButlerPageHeader
        title="Activity"
        subtitle={`Changes made while acting as ${team}, newest first`}
        onBack={() => navigate(routes.team({ team }))}
      />
      <ButlerCallout tone="neutral" compact>
        This is the history of actions taken in this team's context. Changes a
        platform admin makes from the platform pages are recorded in the
        platform audit log instead.
      </ButlerCallout>
      <AuditLogTable
        load={load}
        refusedMessage="The server serves a team's activity to that team's admins and to platform roles."
        aria-label={`${team} activity`}
      />
    </ButlerStack>
  );
};
