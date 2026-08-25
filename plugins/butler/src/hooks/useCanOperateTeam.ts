// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useTeamContext } from './useTeamContext';

/**
 * Whether the caller may mutate clusters in a team, mirroring the server's
 * checkOperatePermission: a platform admin may, a team admin or operator
 * may, and a viewer of either kind may not.
 *
 * The role is resolved from the team being acted on rather than the stored
 * selection, so a stale selection cannot answer for the wrong team. This
 * only decides what the product offers; the server still refuses.
 */
export function useCanOperateTeam(team: string | undefined): boolean {
  const { isAdmin, teams } = useTeamContext();
  if (isAdmin) return true;
  const role = teams.find(t => t.name === team)?.role;
  return role === 'admin' || role === 'operator';
}
