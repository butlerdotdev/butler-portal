// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { butlerApiRef } from '../api/ButlerApi';
import type { Provider } from '../api/types/providers';

export interface TeamProvidersState {
  providers: Provider[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

/**
 * The providers a team may create clusters against.
 *
 * This reads the team-scoped list, not the global one. The global list
 * carries every provider in the estate including ones scoped to other
 * teams, and a cluster that references one of those is refused at
 * admission. Offering it would be offering a choice that always fails.
 * The create form and the team's providers page both read through here
 * so they cannot disagree about what the team can use.
 */
export function useTeamProviders(
  team: string | null | undefined,
): TeamProvidersState {
  const api = useApi(butlerApiRef);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState<boolean>(Boolean(team));
  const [error, setError] = useState<Error | null>(null);
  const currentTeam = useRef(team);

  const load = useCallback(async () => {
    if (!team) {
      setProviders([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    try {
      const res = await api.listTeamProviders(team);
      if (currentTeam.current !== team) return;
      setProviders(res.providers ?? []);
      setError(null);
    } catch (err) {
      if (currentTeam.current !== team) return;
      setProviders([]);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (currentTeam.current === team) setLoading(false);
    }
  }, [api, team]);

  useEffect(() => {
    currentTeam.current = team;
    void load();
  }, [load, team]);

  return { providers, loading, error, refresh: load };
}
