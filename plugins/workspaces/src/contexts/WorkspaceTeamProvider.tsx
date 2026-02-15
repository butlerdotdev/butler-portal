// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { Progress } from '@backstage/core-components';
import { butlerApiRef } from '@internal/plugin-butler';
import { WorkspaceTeamContext } from './WorkspaceTeamContext';
import type { WorkspaceTeamContextValue } from './WorkspaceTeamContext';

const TEAM_STORAGE_KEY = 'butler-workspace-team';
const ADMIN_VIEW_KEY = 'butler-workspace-admin-view';

export const WorkspaceTeamProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const api = useApi(butlerApiRef);

  const [teams, setTeams] = useState<
    Array<{ name: string; displayName?: string; role: string }>
  >([]);
  const [activeTeam, setActiveTeam] = useState<string | null>(
    () => localStorage.getItem(TEAM_STORAGE_KEY),
  );
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminView, setAdminView] = useState(
    () => localStorage.getItem(ADMIN_VIEW_KEY) === 'true',
  );

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const identity = await api.getIdentity();
        if (cancelled) return;

        setUserEmail(identity.email);
        setIsAdmin(identity.isPlatformAdmin);

        const fetchedTeams = (identity.teams ?? []).map(t => ({
          name: t.name,
          displayName: t.displayName,
          role: t.role,
        }));
        setTeams(fetchedTeams);

        const stored = localStorage.getItem(TEAM_STORAGE_KEY);
        const validStored =
          stored && fetchedTeams.some(t => t.name === stored);

        if (validStored) {
          api.setTeamContext(stored);
          setActiveTeam(stored);
        } else if (fetchedTeams.length > 0) {
          const defaultTeam = fetchedTeams[0].name;
          api.setTeamContext(defaultTeam);
          setActiveTeam(defaultTeam);
          localStorage.setItem(TEAM_STORAGE_KEY, defaultTeam);
        } else {
          localStorage.removeItem(TEAM_STORAGE_KEY);
          setActiveTeam(null);
        }
      } catch {
        if (!cancelled) {
          setTeams([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [api]);

  const switchTeam = useCallback(
    (teamName: string) => {
      api.setTeamContext(teamName);
      setActiveTeam(teamName);
      localStorage.setItem(TEAM_STORAGE_KEY, teamName);
      // Switching teams exits admin view
      setAdminView(false);
      localStorage.setItem(ADMIN_VIEW_KEY, 'false');
    },
    [api],
  );

  const toggleAdminView = useCallback(() => {
    setAdminView(prev => {
      const next = !prev;
      localStorage.setItem(ADMIN_VIEW_KEY, String(next));
      return next;
    });
  }, []);

  const value: WorkspaceTeamContextValue = useMemo(
    () => ({
      teams,
      activeTeam,
      switchTeam,
      loading,
      userEmail,
      isAdmin,
      adminView: isAdmin && adminView,
      toggleAdminView,
    }),
    [teams, activeTeam, switchTeam, loading, userEmail, isAdmin, adminView, toggleAdminView],
  );

  if (loading) {
    return <Progress />;
  }

  return (
    <WorkspaceTeamContext.Provider value={value}>
      {children}
    </WorkspaceTeamContext.Provider>
  );
};
