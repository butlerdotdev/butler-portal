// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useApi, identityApiRef } from '@backstage/core-plugin-api';
import { Progress } from '@backstage/core-components';
import { butlerApiRef } from '@internal/plugin-butler';
import { resolveTeamRole, isPlatformAdminRef } from '@internal/plugin-registry-common';
import { registryApiRef } from '../api/RegistryApi';
import {
  RegistryTeamContext,
  RegistryTeamContextValue,
} from './RegistryTeamContext';

const STORAGE_KEY = 'butler-registry-team';

export function RegistryTeamProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const identityApi = useApi(identityApiRef);
  const butlerApi = useApi(butlerApiRef);
  const registryApi = useApi(registryApiRef);

  const [teams, setTeams] = useState<string[]>([]);
  const [activeTeam, setActiveTeam] = useState<string | null>(
    localStorage.getItem(STORAGE_KEY),
  );
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  // Store ownership refs for role resolution across team switches
  const ownershipRefsRef = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        // Use Backstage identityApi directly — works with Google auth,
        // doesn't depend on butler-server being available.
        const backstageIdentity =
          await identityApi.getBackstageIdentity();
        if (cancelled) return;

        // Extract email from entity ref (user:default/founder → founder)
        // or from the profile if available
        const profile = await identityApi.getProfileInfo();
        if (cancelled) return;

        const email = profile.email ?? backstageIdentity.userEntityRef;
        setUserEmail(email);

        // Store ownership refs for role resolution
        const ownershipRefs = backstageIdentity.ownershipEntityRefs ?? [];
        ownershipRefsRef.current = ownershipRefs;
        setIsPlatformAdmin(isPlatformAdminRef(ownershipRefs));

        // Primary: derive teams from Backstage ownership entity refs.
        // Filter to team groups (exclude role groups like *-admins, *-operators).
        const backstageTeams = ownershipRefs
          .filter(ref => ref.startsWith('group:default/'))
          .map(ref => ref.replace('group:default/', ''))
          .filter(name =>
            !name.endsWith('-admins') &&
            !name.endsWith('-operators') &&
            name !== 'platform-admins',
          );

        // Secondary: augment with butler-server teams if available.
        let butlerServerTeams: string[] = [];
        try {
          const identity = await butlerApi.getIdentity();
          if (cancelled) return;
          butlerServerTeams = identity.teams.map(t => t.name);
        } catch {
          // butler-server not available — use Backstage groups only
        }

        // Merge Backstage groups + butler-server teams (deduplicated)
        const allTeams = [...new Set([...backstageTeams, ...butlerServerTeams])];
        setTeams(allTeams);

        if (allTeams.length > 0) {
          const stored = localStorage.getItem(STORAGE_KEY);
          if (stored && allTeams.includes(stored)) {
            setActiveTeam(stored);
            registryApi.setTeamContext(stored);
          } else {
            setActiveTeam(allTeams[0]);
            registryApi.setTeamContext(allTeams[0]);
          }
        }
      } catch {
        // Backstage identity unavailable — likely not signed in
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [identityApi, butlerApi, registryApi]);

  const switchTeam = useCallback(
    (team: string | null) => {
      setActiveTeam(team);
      registryApi.setTeamContext(team);
      if (team) {
        localStorage.setItem(STORAGE_KEY, team);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    },
    [registryApi],
  );

  // Resolve role whenever activeTeam changes
  const activeRole = useMemo(
    () => resolveTeamRole(activeTeam, ownershipRefsRef.current),
    [activeTeam],
  );

  const value: RegistryTeamContextValue = useMemo(
    () => ({
      teams,
      activeTeam,
      activeRole,
      userEmail,
      isPlatformAdmin,
      loading,
      switchTeam,
    }),
    [teams, activeTeam, activeRole, userEmail, isPlatformAdmin, loading, switchTeam],
  );

  if (loading) {
    return <Progress />;
  }

  return (
    <RegistryTeamContext.Provider value={value}>
      {children}
    </RegistryTeamContext.Provider>
  );
}
