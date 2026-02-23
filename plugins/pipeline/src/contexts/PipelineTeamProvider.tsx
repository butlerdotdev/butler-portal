// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useApi, identityApiRef } from '@backstage/core-plugin-api';
import { Progress } from '@backstage/core-components';
import { butlerApiRef } from '@internal/plugin-butler';
import { resolveTeamRole, isPlatformAdminRef } from '@internal/plugin-pipeline-common';
import { pipelineApiRef } from '../api/PipelineApi';
import {
  PipelineTeamContext,
  PipelineTeamContextValue,
} from './PipelineTeamContext';

const STORAGE_KEY = 'butler-pipeline-team';

export function PipelineTeamProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const identityApi = useApi(identityApiRef);
  const butlerApi = useApi(butlerApiRef);
  const pipelineApi = useApi(pipelineApiRef);

  const [teams, setTeams] = useState<string[]>([]);
  const [activeTeam, setActiveTeam] = useState<string | null>(
    localStorage.getItem(STORAGE_KEY),
  );
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  const ownershipRefsRef = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const backstageIdentity =
          await identityApi.getBackstageIdentity();
        if (cancelled) return;

        const profile = await identityApi.getProfileInfo();
        if (cancelled) return;

        const email = profile.email ?? backstageIdentity.userEntityRef;
        setUserEmail(email);

        const ownershipRefs = backstageIdentity.ownershipEntityRefs ?? [];
        ownershipRefsRef.current = ownershipRefs;
        setIsPlatformAdmin(isPlatformAdminRef(ownershipRefs));

        const backstageTeams = ownershipRefs
          .filter(ref => ref.startsWith('group:default/'))
          .map(ref => ref.replace('group:default/', ''))
          .filter(name =>
            !name.endsWith('-admins') &&
            !name.endsWith('-operators') &&
            name !== 'platform-admins',
          );

        let butlerServerTeams: string[] = [];
        try {
          const identity = await butlerApi.getIdentity();
          if (cancelled) return;
          butlerServerTeams = identity.teams.map((t: any) => t.name);
        } catch {
          // butler-server not available
        }

        const allTeams = [...new Set([...backstageTeams, ...butlerServerTeams])];
        setTeams(allTeams);

        if (allTeams.length > 0) {
          const stored = localStorage.getItem(STORAGE_KEY);
          if (stored && allTeams.includes(stored)) {
            setActiveTeam(stored);
            pipelineApi.setTeamContext(stored);
          } else {
            setActiveTeam(allTeams[0]);
            pipelineApi.setTeamContext(allTeams[0]);
          }
        }
      } catch {
        // Not signed in
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [identityApi, butlerApi, pipelineApi]);

  const switchTeam = useCallback(
    (team: string | null) => {
      setActiveTeam(team);
      pipelineApi.setTeamContext(team);
      if (team) {
        localStorage.setItem(STORAGE_KEY, team);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    },
    [pipelineApi],
  );

  const activeRole = useMemo(
    () => resolveTeamRole(activeTeam, ownershipRefsRef.current),
    [activeTeam],
  );

  const ownershipRefs = ownershipRefsRef.current;

  const value: PipelineTeamContextValue = useMemo(
    () => ({
      teams,
      activeTeam,
      activeRole,
      userEmail,
      isPlatformAdmin,
      ownershipRefs,
      loading,
      switchTeam,
    }),
    [teams, activeTeam, activeRole, userEmail, isPlatformAdmin, ownershipRefs, loading, switchTeam],
  );

  if (loading) {
    return <Progress />;
  }

  return (
    <PipelineTeamContext.Provider value={value}>
      {children}
    </PipelineTeamContext.Provider>
  );
}
