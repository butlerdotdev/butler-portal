// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { butlerApiRef } from '../api/ButlerApi';
import type {
  EnvironmentClusterDefaults,
  TeamEnvironment,
} from '../api/types/environments';

export interface TeamEnvironmentsState {
  environments: TeamEnvironment[];
  /** Defaults the team applies to new clusters, from the same read. */
  teamClusterDefaults?: EnvironmentClusterDefaults;
  loading: boolean;
  error: Error | null;
  /** Re-read from the server. Callers use this after a mutation. */
  refresh: () => Promise<void>;
}

/**
 * The team's environments, read from the server on every call.
 *
 * This is the single source of environments in the plugin. The management
 * page, the cluster environment change and the create form all read
 * through it, so a newly created environment is offered everywhere and a
 * deleted one disappears everywhere without a second contract to keep in
 * step.
 */
export function useTeamEnvironments(
  team: string | null | undefined,
): TeamEnvironmentsState {
  const api = useApi(butlerApiRef);
  const [environments, setEnvironments] = useState<TeamEnvironment[]>([]);
  const [teamClusterDefaults, setTeamClusterDefaults] = useState<
    EnvironmentClusterDefaults | undefined
  >(undefined);
  const [loading, setLoading] = useState<boolean>(Boolean(team));
  const [error, setError] = useState<Error | null>(null);
  // A slow read for a team the user has already navigated away from must
  // not overwrite the current one.
  const currentTeam = useRef(team);

  const load = useCallback(async () => {
    if (!team) {
      setEnvironments([]);
      setTeamClusterDefaults(undefined);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    try {
      const context = await api.getTeamClusterContext(team);
      if (currentTeam.current !== team) return;
      setEnvironments(context.environments);
      setTeamClusterDefaults(context.clusterDefaults);
      setError(null);
    } catch (err) {
      if (currentTeam.current !== team) return;
      setEnvironments([]);
      setTeamClusterDefaults(undefined);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (currentTeam.current === team) setLoading(false);
    }
  }, [api, team]);

  useEffect(() => {
    currentTeam.current = team;
    void load();
  }, [load, team]);

  return { environments, teamClusterDefaults, loading, error, refresh: load };
}
